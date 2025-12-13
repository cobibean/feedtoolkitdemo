/**
 * Flare-Native Direct State Reader
 * 
 * Reads V3 pool prices directly from on-chain state (slot0) without FDC.
 * This is the "golden" implementation for Flare-native pools.
 * 
 * Key points:
 * - Uses slot0().sqrtPriceX96 for spot price
 * - Correctly handles token ordering (token0/token1)
 * - Uses BigInt math throughout (no floats) for spot price
 * - Returns provenance metadata for reviewers
 * 
 * Supported chains:
 * - Flare Mainnet (chainId: 14)
 * - Coston2 Testnet (chainId: 114)
 * 
 * @module priceSources/flareNative
 */

import { createPublicClient, http, type PublicClient, type Chain } from 'viem';
import { flare, coston2 } from '@/lib/wagmi-config';
import type { DirectStateResult, PriceProvenance } from '@/lib/types';

// ============================================================
// Chain Constants
// ============================================================

/** Flare Mainnet chain ID */
export const FLARE_CHAIN_ID = 14;

/** Coston2 Testnet chain ID */
export const COSTON2_CHAIN_ID = 114;

/** Default output decimals for price values */
export const DEFAULT_OUTPUT_DECIMALS = 6;

/**
 * Get the viem Chain definition for a Flare-native chain ID.
 * 
 * @param chainId - Chain ID (14 for Flare, 114 for Coston2)
 * @returns Chain definition for viem client
 * @throws Error if chain ID is not a supported Flare-native chain
 */
export function getFlareNativeChain(chainId: number): Chain {
  switch (chainId) {
    case FLARE_CHAIN_ID:
      return flare;
    case COSTON2_CHAIN_ID:
      return coston2;
    default:
      throw new Error(
        `Chain ID ${chainId} is not a Flare-native chain. ` +
        `Supported: ${FLARE_CHAIN_ID} (Flare), ${COSTON2_CHAIN_ID} (Coston2)`
      );
  }
}

/**
 * Get the human-readable name for a Flare-native chain.
 */
export function getFlareNativeChainName(chainId: number): string {
  switch (chainId) {
    case FLARE_CHAIN_ID:
      return 'Flare';
    case COSTON2_CHAIN_ID:
      return 'Coston2';
    default:
      return `Unknown (${chainId})`;
  }
}

// Uniswap V3 Pool ABI (minimal for price reading)
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
  {
    inputs: [],
    name: 'liquidity',
    outputs: [{ type: 'uint128' }],
    stateMutability: 'view',
    type: 'function',
  },
  // For TWAP support (optional)
  {
    inputs: [{ name: 'secondsAgos', type: 'uint32[]' }],
    name: 'observe',
    outputs: [
      { name: 'tickCumulatives', type: 'int56[]' },
      { name: 'secondsPerLiquidityCumulativeX128s', type: 'uint160[]' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// Constants for sqrtPriceX96 conversion
const Q96 = 2n ** 96n;
const Q192 = 2n ** 192n;

/**
 * Convert sqrtPriceX96 to a price with the specified output decimals.
 * 
 * Formula: price = (sqrtPriceX96 / 2^96)^2
 *        = sqrtPriceX96^2 / 2^192
 * 
 * For token1/token0 price (normal case):
 *   price = sqrtPriceX96^2 / 2^192
 * 
 * For token0/token1 price (inverted):
 *   price = 2^192 / sqrtPriceX96^2
 * 
 * We scale by 10^outputDecimals to get integer output.
 * We also adjust for token decimal differences.
 */
export function sqrtPriceX96ToPrice(
  sqrtPriceX96: bigint,
  token0Decimals: number,
  token1Decimals: number,
  invertPrice: boolean,
  outputDecimals: number = 6
): bigint {
  // Prevent division by zero
  if (sqrtPriceX96 === 0n) {
    return 0n;
  }

  const sqrtPriceX96Squared = sqrtPriceX96 * sqrtPriceX96;
  const outputScale = 10n ** BigInt(outputDecimals);
  
  // Decimal adjustment: token0 has token0Decimals, token1 has token1Decimals
  // Raw price = token1_amount / token0_amount
  // Adjusted for decimals: price * 10^(token0Decimals - token1Decimals)
  const decimalDiff = token0Decimals - token1Decimals;
  const decimalScale = decimalDiff >= 0 
    ? 10n ** BigInt(decimalDiff) 
    : 1n;
  const decimalDivisor = decimalDiff < 0 
    ? 10n ** BigInt(-decimalDiff) 
    : 1n;

  let price: bigint;

  if (invertPrice) {
    // token0/token1 price (inverted)
    // price = 2^192 / sqrtPriceX96^2
    // Scale: (2^192 * outputScale * decimalScale) / (sqrtPriceX96^2 * decimalDivisor)
    price = (Q192 * outputScale * decimalDivisor) / (sqrtPriceX96Squared * decimalScale);
  } else {
    // token1/token0 price (normal)
    // price = sqrtPriceX96^2 / 2^192
    // Scale: (sqrtPriceX96^2 * outputScale * decimalScale) / (2^192 * decimalDivisor)
    price = (sqrtPriceX96Squared * outputScale * decimalScale) / (Q192 * decimalDivisor);
  }

  return price;
}

/**
 * Read price directly from a Flare-native V3 pool using slot0()
 * 
 * This is the core function for FLARE_NATIVE feeds - no FDC involved.
 * Uses pure BigInt arithmetic for price calculation (no floating point).
 * 
 * @param poolAddress - V3 pool contract address on Flare or Coston2
 * @param token0Decimals - Decimals for token0
 * @param token1Decimals - Decimals for token1
 * @param invertPrice - Whether to invert the price (token0/token1 vs token1/token0)
 * @param outputDecimals - Output decimal precision (default: 6)
 * @param originChainId - Chain ID (14 = Flare, 114 = Coston2)
 * @param client - Optional viem PublicClient (will create one if not provided)
 * @returns DirectStateResult with price, provenance, and raw slot0 data
 * @throws Error if pool is locked or chain is not supported
 */
export async function readFlareNativePrice(
  poolAddress: `0x${string}`,
  token0Decimals: number,
  token1Decimals: number,
  invertPrice: boolean,
  outputDecimals: number = DEFAULT_OUTPUT_DECIMALS,
  originChainId: number = FLARE_CHAIN_ID,
  client?: PublicClient
): Promise<DirectStateResult> {
  // Get the correct chain definition for the origin chain
  const chain = getFlareNativeChain(originChainId);
  
  // Create client with correct chain if not provided
  const publicClient = client ?? createPublicClient({
    chain,
    transport: http(),
  });

  // Read slot0 and block info in parallel
  const [slot0Result, blockNumber] = await Promise.all([
    publicClient.readContract({
      address: poolAddress,
      abi: UNISWAP_V3_POOL_ABI,
      functionName: 'slot0',
    }),
    publicClient.getBlockNumber(),
  ]);

  const [sqrtPriceX96, tick, , , , , unlocked] = slot0Result;

  if (!unlocked) {
    throw new Error('Pool is locked (in the middle of a swap)');
  }

  // Get block timestamp
  const block = await publicClient.getBlock({ blockNumber });

  // Calculate price
  const price = sqrtPriceX96ToPrice(
    sqrtPriceX96,
    token0Decimals,
    token1Decimals,
    invertPrice,
    outputDecimals
  );

  const provenance: PriceProvenance = {
    sourceKind: 'FLARE_NATIVE',
    method: 'SLOT0_SPOT',
    originChain: getFlareNativeChainName(originChainId),
    originChainId,
    timestamp: Number(block.timestamp),
    blockNumber: Number(blockNumber),
    sqrtPriceX96: sqrtPriceX96.toString(),
    tick,
  };

  return {
    value: price,
    decimals: outputDecimals,
    timestamp: Number(block.timestamp),
    blockNumber,
    sqrtPriceX96,
    tick,
    provenance,
  };
}

// ============================================================
// TWAP Implementation (Experimental)
// ============================================================

/**
 * ⚠️ EXPERIMENTAL: Read TWAP price using pool.observe()
 * 
 * This function provides Time-Weighted Average Price which is more resistant
 * to single-block manipulation than spot price. However, it uses a floating-point
 * approximation for tick-to-price conversion which may have minor precision loss.
 * 
 * **Precision Warning**: The `tickToSqrtPriceX96Approximate` helper uses
 * `Math.pow()` which introduces floating-point error. For production use cases
 * requiring exact precision, implement a proper BigInt-based tick conversion
 * using Uniswap V3's TickMath library logic.
 * 
 * For most display/UI purposes, this approximation is sufficient (< 0.01% error).
 * 
 * @param poolAddress - V3 pool contract address on Flare or Coston2
 * @param token0Decimals - Decimals for token0
 * @param token1Decimals - Decimals for token1
 * @param invertPrice - Whether to invert the price
 * @param secondsAgo - TWAP window in seconds (default: 300 = 5 minutes)
 * @param outputDecimals - Output decimal precision (default: 6)
 * @param originChainId - Chain ID (14 = Flare, 114 = Coston2)
 * @param client - Optional viem PublicClient
 * @returns DirectStateResult with TWAP price and provenance
 * 
 * @experimental This function uses floating-point approximation for tick conversion
 */
export async function readFlareNativeTWAP(
  poolAddress: `0x${string}`,
  token0Decimals: number,
  token1Decimals: number,
  invertPrice: boolean,
  secondsAgo: number = 300,
  outputDecimals: number = DEFAULT_OUTPUT_DECIMALS,
  originChainId: number = FLARE_CHAIN_ID,
  client?: PublicClient
): Promise<DirectStateResult> {
  // Get the correct chain definition
  const chain = getFlareNativeChain(originChainId);
  
  const publicClient = client ?? createPublicClient({
    chain,
    transport: http(),
  });

  // Read observe() with [secondsAgo, 0] to get tick cumulative difference
  const [observeResult, blockNumber] = await Promise.all([
    publicClient.readContract({
      address: poolAddress,
      abi: UNISWAP_V3_POOL_ABI,
      functionName: 'observe',
      args: [[secondsAgo, 0]],
    }),
    publicClient.getBlockNumber(),
  ]);

  const [tickCumulatives] = observeResult;
  
  // Calculate arithmetic mean tick over the TWAP window
  // tickCumulatives[0] = cumulative tick at (now - secondsAgo)
  // tickCumulatives[1] = cumulative tick at now
  const tickCumulativeDiff = tickCumulatives[1] - tickCumulatives[0];
  const averageTick = Number(tickCumulativeDiff) / secondsAgo;
  const roundedTick = Math.round(averageTick);
  
  // Convert tick to sqrtPriceX96 using approximate method
  // ⚠️ This uses floating point - see function docs for precision notes
  const sqrtPriceX96 = tickToSqrtPriceX96Approximate(roundedTick);

  // Get block timestamp
  const block = await publicClient.getBlock({ blockNumber });

  // Calculate price using the (exact) BigInt conversion
  const price = sqrtPriceX96ToPrice(
    sqrtPriceX96,
    token0Decimals,
    token1Decimals,
    invertPrice,
    outputDecimals
  );

  const provenance: PriceProvenance = {
    sourceKind: 'FLARE_NATIVE',
    method: 'TWAP_OBSERVE',
    originChain: getFlareNativeChainName(originChainId),
    originChainId,
    timestamp: Number(block.timestamp),
    blockNumber: Number(blockNumber),
    sqrtPriceX96: sqrtPriceX96.toString(),
    tick: roundedTick,
  };

  return {
    value: price,
    decimals: outputDecimals,
    timestamp: Number(block.timestamp),
    blockNumber,
    sqrtPriceX96,
    tick: roundedTick,
    provenance,
  };
}

/**
 * ⚠️ APPROXIMATE: Convert a tick to sqrtPriceX96 using floating-point math
 * 
 * This is an approximation suitable for display purposes. For exact calculations,
 * a proper BigInt implementation of Uniswap V3's TickMath is required.
 * 
 * Formula: sqrtPriceX96 = sqrt(1.0001^tick) * 2^96
 *                       = 1.0001^(tick/2) * 2^96
 * 
 * Precision: ~0.01% error for typical tick ranges (-887272 to 887272)
 * 
 * @param tick - The tick value (integer)
 * @returns Approximate sqrtPriceX96 as BigInt
 * 
 * @internal This function is intentionally named to indicate it's approximate
 */
function tickToSqrtPriceX96Approximate(tick: number): bigint {
  // Validate tick is within Uniswap V3 bounds
  const MIN_TICK = -887272;
  const MAX_TICK = 887272;
  
  if (tick < MIN_TICK || tick > MAX_TICK) {
    throw new Error(`Tick ${tick} out of bounds [${MIN_TICK}, ${MAX_TICK}]`);
  }
  
  // sqrt(1.0001^tick) = 1.0001^(tick/2)
  // Using JavaScript's Math.pow (IEEE 754 double precision)
  const sqrtPrice = Math.pow(1.0001, tick / 2);
  
  // Scale by 2^96
  const sqrtPriceX96Float = sqrtPrice * Number(Q96);
  
  // Convert to BigInt
  // Note: This loses precision for very large/small ticks
  // For production, implement proper fixed-point arithmetic
  return BigInt(Math.floor(sqrtPriceX96Float));
}

/**
 * Validate that a pool can be read from a Flare-native chain.
 * Useful for UI pre-checks before attempting price reads.
 * 
 * @param poolAddress - V3 pool contract address
 * @param originChainId - Chain ID (14 = Flare, 114 = Coston2)
 * @param client - Optional viem PublicClient
 * @returns Validation result with pool info if valid
 */
export async function validateFlarePool(
  poolAddress: `0x${string}`,
  originChainId: number = FLARE_CHAIN_ID,
  client?: PublicClient
): Promise<{
  valid: boolean;
  token0?: `0x${string}`;
  token1?: `0x${string}`;
  liquidity?: bigint;
  error?: string;
}> {
  try {
    const chain = getFlareNativeChain(originChainId);
    
    const publicClient = client ?? createPublicClient({
      chain,
      transport: http(),
    });

    const [token0, token1, liquidity, slot0] = await Promise.all([
      publicClient.readContract({
        address: poolAddress,
        abi: UNISWAP_V3_POOL_ABI,
        functionName: 'token0',
      }),
      publicClient.readContract({
        address: poolAddress,
        abi: UNISWAP_V3_POOL_ABI,
        functionName: 'token1',
      }),
      publicClient.readContract({
        address: poolAddress,
        abi: UNISWAP_V3_POOL_ABI,
        functionName: 'liquidity',
      }),
      publicClient.readContract({
        address: poolAddress,
        abi: UNISWAP_V3_POOL_ABI,
        functionName: 'slot0',
      }),
    ]);

    const [, , , , , , unlocked] = slot0;

    if (!unlocked) {
      return { valid: false, error: 'Pool is locked' };
    }

    return {
      valid: true,
      token0: token0 as `0x${string}`,
      token1: token1 as `0x${string}`,
      liquidity,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Invalid pool address',
    };
  }
}

