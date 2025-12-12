import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { PRICE_RELAY_ABI } from '@/lib/artifacts/PriceRelay';

/**
 * API Route: /api/relay/submit-relay
 * 
 * Submits a relay transaction to the PriceRelay contract on Flare.
 * This is called after fetching price data from a relay chain.
 * 
 * The relay transaction is signed by the server's relay wallet (configured via env).
 * In production, this wallet should be authorized in the PriceRelay contract.
 * 
 * NOTE: For frontend relay (user signs directly), see use-feed-updater.ts
 */

// Flare mainnet configuration
const FLARE_RPC = 'https://flare-api.flare.network/ext/bc/C/rpc';
const FLARE_CHAIN_ID = 14;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      priceRelayAddress,
      priceData,
    } = body;
    
    // Validate required fields
    if (!priceRelayAddress || !priceData) {
      return NextResponse.json(
        { error: 'Missing required fields: priceRelayAddress and priceData' },
        { status: 400 }
      );
    }
    
    // Validate priceData structure
    const {
      chainId,
      poolAddress,
      sqrtPriceX96,
      tick,
      liquidity,
      token0,
      token1,
      sourceTimestamp,
      sourceBlockNumber,
    } = priceData;
    
    if (!chainId || !poolAddress || !sqrtPriceX96 || !token0 || !token1) {
      return NextResponse.json(
        { error: 'Invalid priceData structure' },
        { status: 400 }
      );
    }
    
    // Get relay private key from environment
    const relayPrivateKey = process.env.RELAY_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
    
    if (!relayPrivateKey) {
      // If no server-side relay key, return data for frontend signing
      return NextResponse.json({
        requiresUserSignature: true,
        relayCallData: {
          address: priceRelayAddress,
          functionName: 'relayPrice',
          args: [
            BigInt(chainId),
            poolAddress,
            BigInt(sqrtPriceX96),
            tick,
            BigInt(liquidity),
            token0,
            token1,
            BigInt(sourceTimestamp),
            BigInt(sourceBlockNumber),
          ],
        },
      });
    }
    
    // Create wallet client with relay private key
    const account = privateKeyToAccount(relayPrivateKey as `0x${string}`);
    
    const publicClient = createPublicClient({
      transport: http(FLARE_RPC),
    });
    
    const walletClient = createWalletClient({
      account,
      transport: http(FLARE_RPC),
    });
    
    // Check if relay is possible (contract validation)
    const canRelay = await publicClient.readContract({
      address: priceRelayAddress as `0x${string}`,
      abi: PRICE_RELAY_ABI,
      functionName: 'canRelay',
      args: [BigInt(chainId), poolAddress as `0x${string}`],
    });
    
    if (!canRelay) {
      return NextResponse.json(
        { error: 'Cannot relay: chain/pool not enabled or interval not elapsed' },
        { status: 400 }
      );
    }
    
    // Submit relay transaction
    const hash = await walletClient.writeContract({
      address: priceRelayAddress as `0x${string}`,
      abi: PRICE_RELAY_ABI,
      functionName: 'relayPrice',
      args: [
        BigInt(chainId),
        poolAddress as `0x${string}`,
        BigInt(sqrtPriceX96),
        tick,
        BigInt(liquidity),
        token0 as `0x${string}`,
        token1 as `0x${string}`,
        BigInt(sourceTimestamp),
        BigInt(sourceBlockNumber),
      ],
    });
    
    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    
    if (receipt.status === 'reverted') {
      return NextResponse.json(
        { error: 'Relay transaction reverted' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      transactionHash: hash,
      blockNumber: Number(receipt.blockNumber),
    });
    
  } catch (error) {
    console.error('Submit relay error:', error);
    
    if (error instanceof Error) {
      // Handle specific error types
      if (error.message.includes('Not authorized')) {
        return NextResponse.json(
          { error: 'Relayer not authorized on PriceRelay contract' },
          { status: 403 }
        );
      }
      if (error.message.includes('Chain not supported')) {
        return NextResponse.json(
          { error: 'Chain not enabled on PriceRelay' },
          { status: 400 }
        );
      }
      if (error.message.includes('Pool not enabled')) {
        return NextResponse.json(
          { error: 'Pool not enabled on PriceRelay' },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to submit relay transaction' },
      { status: 500 }
    );
  }
}
