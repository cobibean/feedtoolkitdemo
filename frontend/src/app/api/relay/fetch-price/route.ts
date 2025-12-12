import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { SUPPORTED_CHAINS, isRelayChain } from '@/lib/chains';

/**
 * API Route: /api/relay/fetch-price
 * 
 * Fetches current price data from a Uniswap V3 pool on a relay chain.
 * This is used by the relay flow for chains not directly supported by FDC's EVMTransaction
 * (e.g., Arbitrum, Base, Optimism, Polygon).
 * 
 * SECURITY NOTES:
 * - Uses actual block timestamp from the chain, not server clock (Date.now())
 * - Only works for relay chains (not direct chains like Flare/Ethereum)
 * - Returns all data needed for PriceRelay.relayPrice() call
 */

// Used to defensively clamp timestamps so PriceRelay won't revert due to cross-chain clock skew
const FLARE_RPC_URL = 'https://flare-api.flare.network/ext/bc/C/rpc';
const MAX_FUTURE_SKEW_SECONDS = 600; // must match PriceRelay.MAX_FUTURE_SKEW

const UNISWAP_V3_POOL_ABI = [
  {
    inputs: [],
    name: 'slot0',
    outputs: [
      { name: 'sqrtPriceX96', type: 'uint160' },
      { name: 'tick', type: 'int24' },
      { name: 'observationIndex', type: 'uint16' },
      { name: 'observationCardinality', type: 'uint16' },
      { name: 'observationCardinalityNext', type: 'uint16' },
      { name: 'feeProtocol', type: 'uint8' },
      { name: 'unlocked', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'liquidity',
    outputs: [{ type: 'uint128' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'token0',
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'token1',
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { chainId, poolAddress } = body;
    
    // Validate required fields
    if (!chainId || !poolAddress) {
      return NextResponse.json(
        { error: 'Missing required fields: chainId and poolAddress' },
        { status: 400 }
      );
    }
    
    // Validate pool address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(poolAddress)) {
      return NextResponse.json(
        { error: 'Invalid pool address format' },
        { status: 400 }
      );
    }
    
    // Validate this is a relay chain
    if (!isRelayChain(chainId)) {
      return NextResponse.json(
        { error: 'Not a relay chain. Use direct flow for Flare/Ethereum.' },
        { status: 400 }
      );
    }
    
    // Get chain configuration
    const chain = SUPPORTED_CHAINS.find(c => c.id === chainId);
    if (!chain) {
      return NextResponse.json(
        { error: `Unsupported chain: ${chainId}` },
        { status: 400 }
      );
    }
    
    // Create public client for the source chain
    const client = createPublicClient({
      transport: http(chain.rpcUrl),
    });
    
    // Fetch current block number first
    const blockNumber = await client.getBlockNumber();
    
    // Fetch all pool data and block info in parallel
    const [slot0, liquidity, token0, token1, block] = await Promise.all([
      client.readContract({
        address: poolAddress as `0x${string}`,
        abi: UNISWAP_V3_POOL_ABI,
        functionName: 'slot0',
      }),
      client.readContract({
        address: poolAddress as `0x${string}`,
        abi: UNISWAP_V3_POOL_ABI,
        functionName: 'liquidity',
      }),
      client.readContract({
        address: poolAddress as `0x${string}`,
        abi: UNISWAP_V3_POOL_ABI,
        functionName: 'token0',
      }),
      client.readContract({
        address: poolAddress as `0x${string}`,
        abi: UNISWAP_V3_POOL_ABI,
        functionName: 'token1',
      }),
      // CRITICAL: Use actual block timestamp from chain, not server clock
      // This prevents timestamp manipulation and ensures PriceRelay freshness checks work
      client.getBlock({ blockNumber }),
    ]);
    
    // Validate pool is active (unlocked)
    const [sqrtPriceX96, tick, , , , , unlocked] = slot0;
    if (!unlocked) {
      return NextResponse.json(
        { error: 'Pool is locked (reentrancy guard active)' },
        { status: 503 }
      );
    }
    
    // Return price data ready for PriceRelay.relayPrice()
    const sourceTimestampRaw = Number(block.timestamp);
    let sourceTimestamp = sourceTimestampRaw;
    let sourceTimestampClamped = false;

    // Defensive: some chains can run ahead of Flare by > MAX_FUTURE_SKEW.
    // PriceRelay will revert with "Future timestamp" in that case.
    try {
      const flareClient = createPublicClient({ transport: http(FLARE_RPC_URL) });
      const flareBlock = await flareClient.getBlock();
      const flareNow = Number(flareBlock.timestamp);
      const allowedMax = flareNow + MAX_FUTURE_SKEW_SECONDS;
      if (sourceTimestamp > allowedMax) {
        sourceTimestamp = allowedMax;
        sourceTimestampClamped = true;
      }
    } catch {
      // If Flare RPC fails, keep raw source timestamp; relay may revert but we avoid masking errors.
    }

    return NextResponse.json({
      chainId,
      poolAddress,
      sqrtPriceX96: sqrtPriceX96.toString(),
      tick,
      liquidity: liquidity.toString(),
      token0,
      token1,
      // SECURITY: Use chain block timestamp, NOT Date.now()
      // This is critical for the freshness check in PriceRelay contract
      sourceTimestamp,
      sourceBlockNumber: Number(blockNumber),
      // Include chain name for UX
      chainName: chain.name,
      // Debug: indicates if timestamp was clamped to avoid "Future timestamp" reverts
      sourceTimestampRaw,
      sourceTimestampClamped,
    });
    
  } catch (error) {
    console.error('Fetch price error:', error);
    
    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('contract') || error.message.includes('call')) {
        return NextResponse.json(
          { error: 'Invalid pool address or pool does not exist on this chain' },
          { status: 400 }
        );
      }
      if (error.message.includes('network') || error.message.includes('fetch')) {
        return NextResponse.json(
          { error: 'RPC connection failed. Please try again.' },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch price' },
      { status: 500 }
    );
  }
}
