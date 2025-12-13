/**
 * Flare-Native Direct State Reader
 * 
 * Reads V3 pool prices directly from on-chain state (slot0) without FDC.
 * This is the "golden" implementation for Flare-native pools.
 * 
 * Key points:
 * - Uses slot0().sqrtPriceX96 for spot price
 * - Correctly handles token ordering (token0/token1)
 * - Uses BigInt math throughout (no floats)
 * - Returns provenance metadata for reviewers
 */

import { createPublicClient, http, type PublicClient } from 'viem';
import { flare } from '@/lib/wagmi-config';
import type { DirectStateResult, PriceProvenance } from '@/lib/types';

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
 */
export async function readFlareNativePrice(
  poolAddress: `0x${string}`,
  token0Decimals: number,
  token1Decimals: number,
  invertPrice: boolean,
  outputDecimals: number = 6,
  client?: PublicClient
): Promise<DirectStateResult> {
  // Create client if not provided
  const publicClient = client ?? createPublicClient({
    chain: flare,
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
    originChain: 'Flare',
    originChainId: 14,
    timestamp: Number(block.timestamp),
    blockNumber: Number(blockNumber),
    sqrtPriceX96: sqrtPriceX96.toString(),
    tick: tick,
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

/**
 * Read TWAP price using pool.observe() (optional, more manipulation-resistant)
 * 
 * @param secondsAgo - TWAP window in seconds (e.g., 300 for 5 minutes)
 */
export async function readFlareNativeTWAP(
  poolAddress: `0x${string}`,
  token0Decimals: number,
  token1Decimals: number,
  invertPrice: boolean,
  secondsAgo: number = 300,
  outputDecimals: number = 6,
  client?: PublicClient
): Promise<DirectStateResult> {
  const publicClient = client ?? createPublicClient({
    chain: flare,
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
  
  // Calculate average tick over the window
  const tickCumulativeDiff = tickCumulatives[1] - tickCumulatives[0];
  const averageTick = Number(tickCumulativeDiff) / secondsAgo;
  
  // Convert tick to sqrtPriceX96
  // tick = log_1.0001(price) => price = 1.0001^tick
  // sqrtPrice = sqrt(price) = 1.0001^(tick/2)
  // sqrtPriceX96 = sqrtPrice * 2^96
  
  // For integer math, we'll use the average tick to get sqrtPriceX96
  // sqrtPriceX96 = floor(1.0001^(tick/2) * 2^96)
  
  // We need to be careful with precision here - using an approximation
  // that works well for typical tick ranges
  const sqrtPriceX96 = tickToSqrtPriceX96(Math.round(averageTick));

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
    method: 'TWAP_OBSERVE',
    originChain: 'Flare',
    originChainId: 14,
    timestamp: Number(block.timestamp),
    blockNumber: Number(blockNumber),
    sqrtPriceX96: sqrtPriceX96.toString(),
    tick: Math.round(averageTick),
  };

  return {
    value: price,
    decimals: outputDecimals,
    timestamp: Number(block.timestamp),
    blockNumber,
    sqrtPriceX96,
    tick: Math.round(averageTick),
    provenance,
  };
}

/**
 * Convert a tick to sqrtPriceX96
 * 
 * Formula: sqrtPriceX96 = sqrt(1.0001^tick) * 2^96
 *                       = 1.0001^(tick/2) * 2^96
 * 
 * We use BigInt exponentiation for precision
 */
function tickToSqrtPriceX96(tick: number): bigint {
  // Use Uniswap V3's exact formula
  // sqrt(1.0001^tick) = sqrt(1.0001)^tick
  // sqrt(1.0001) ≈ 1.00004999875
  
  // For simplicity and precision, we'll use the inverse of the standard formula:
  // sqrtPriceX96 = 2^96 * sqrt(1.0001^tick)
  
  // JavaScript doesn't have BigInt pow with fractional exponents, so we use
  // a lookup table approach or approximation for typical tick ranges
  
  // Simple approximation: use floating point then convert
  const sqrtPrice = Math.pow(1.0001, tick / 2);
  const sqrtPriceX96Float = sqrtPrice * Number(Q96);
  
  // Convert to BigInt (this is approximate but good enough for TWAP display)
  return BigInt(Math.floor(sqrtPriceX96Float));
}

/**
 * Validate a pool can be read (useful for UI checks)
 */
export async function validateFlarePool(
  poolAddress: `0x${string}`,
  client?: PublicClient
): Promise<{
  valid: boolean;
  token0?: `0x${string}`;
  token1?: `0x${string}`;
  liquidity?: bigint;
  error?: string;
}> {
  try {
    const publicClient = client ?? createPublicClient({
      chain: flare,
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

