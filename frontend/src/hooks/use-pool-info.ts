'use client';

import { useReadContracts } from 'wagmi';
import { createPublicClient, http, isAddress } from 'viem';
import { useState, useEffect } from 'react';
import { UNISWAP_V3_POOL_ABI, ERC20_ABI } from '@/lib/contracts';
import { getChainById } from '@/lib/chains';
import type { PoolInfo } from '@/lib/types';

// Hook for fetching pool info from any supported chain
export function usePoolInfo(poolAddress: string | undefined, chainId: number = 14) {
  const isValidAddress = poolAddress && isAddress(poolAddress);
  const chain = getChainById(chainId);
  
  // For Flare (connected chain), use wagmi hooks directly
  const isFlare = chainId === 14 || chainId === 114;

  // State for cross-chain fetching
  const [crossChainData, setCrossChainData] = useState<{
    data: PoolInfo | undefined;
    isLoading: boolean;
    error: Error | null;
  }>({
    data: undefined,
    isLoading: false,
    error: null,
  });

  // For Flare: use wagmi hooks (connected network)
  const { data: poolData, isLoading: poolLoading, error: poolError } = useReadContracts({
    contracts: [
      {
        address: poolAddress as `0x${string}`,
        abi: UNISWAP_V3_POOL_ABI,
        functionName: 'token0',
      },
      {
        address: poolAddress as `0x${string}`,
        abi: UNISWAP_V3_POOL_ABI,
        functionName: 'token1',
      },
      {
        address: poolAddress as `0x${string}`,
        abi: UNISWAP_V3_POOL_ABI,
        functionName: 'slot0',
      },
    ],
    query: {
      enabled: !!isValidAddress && isFlare,
    },
  });

  const token0 = isFlare ? (poolData?.[0]?.result as `0x${string}` | undefined) : undefined;
  const token1 = isFlare ? (poolData?.[1]?.result as `0x${string}` | undefined) : undefined;
  const slot0 = isFlare ? (poolData?.[2]?.result as [bigint, number, ...unknown[]] | undefined) : undefined;

  // For Flare: get token info
  const { data: tokenData, isLoading: tokenLoading } = useReadContracts({
    contracts: [
      {
        address: token0,
        abi: ERC20_ABI,
        functionName: 'symbol',
      },
      {
        address: token0,
        abi: ERC20_ABI,
        functionName: 'decimals',
      },
      {
        address: token1,
        abi: ERC20_ABI,
        functionName: 'symbol',
      },
      {
        address: token1,
        abi: ERC20_ABI,
        functionName: 'decimals',
      },
    ],
    query: {
      enabled: !!token0 && !!token1 && isFlare,
    },
  });

  // For cross-chain: fetch directly via RPC
  useEffect(() => {
    if (!isValidAddress || isFlare || !chain) {
      setCrossChainData({ data: undefined, isLoading: false, error: null });
      return;
    }

    // Capture needed chain fields after the guard so TypeScript doesn't treat `chain` as possibly undefined
    const rpcUrl = chain.rpcUrl;

    let cancelled = false;
    
    async function fetchCrossChainPoolInfo() {
      setCrossChainData(prev => ({ ...prev, isLoading: true, error: null }));
      
      try {
        // Create a client for the source chain
        const client = createPublicClient({
          transport: http(rpcUrl),
        });

        // Fetch pool data
        const [poolToken0, poolToken1, slot0Result] = await Promise.all([
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
          client.readContract({
            address: poolAddress as `0x${string}`,
            abi: UNISWAP_V3_POOL_ABI,
            functionName: 'slot0',
          }),
        ]);

        if (cancelled) return;

        // Fetch token info
        const [token0Symbol, token0Decimals, token1Symbol, token1Decimals] = await Promise.all([
          client.readContract({
            address: poolToken0 as `0x${string}`,
            abi: ERC20_ABI,
            functionName: 'symbol',
          }).catch(() => 'Unknown'),
          client.readContract({
            address: poolToken0 as `0x${string}`,
            abi: ERC20_ABI,
            functionName: 'decimals',
          }).catch(() => 18),
          client.readContract({
            address: poolToken1 as `0x${string}`,
            abi: ERC20_ABI,
            functionName: 'symbol',
          }).catch(() => 'Unknown'),
          client.readContract({
            address: poolToken1 as `0x${string}`,
            abi: ERC20_ABI,
            functionName: 'decimals',
          }).catch(() => 18),
        ]);

        if (cancelled) return;

        const slot0Data = slot0Result as unknown as readonly [bigint, number, ...unknown[]];

        const poolInfo: PoolInfo = {
          token0: poolToken0 as `0x${string}`,
          token1: poolToken1 as `0x${string}`,
          token0Symbol: token0Symbol as string,
          token0Decimals: token0Decimals as number,
          token1Symbol: token1Symbol as string,
          token1Decimals: token1Decimals as number,
          sqrtPriceX96: slot0Data[0],
          tick: slot0Data[1],
        };

        setCrossChainData({ data: poolInfo, isLoading: false, error: null });
      } catch (err) {
        if (cancelled) return;
        setCrossChainData({ 
          data: undefined, 
          isLoading: false, 
          error: err instanceof Error ? err : new Error('Failed to fetch pool info') 
        });
      }
    }

    fetchCrossChainPoolInfo();

    return () => {
      cancelled = true;
    };
  }, [poolAddress, isValidAddress, isFlare, chain]);

  // Return based on chain type
  if (isFlare) {
    const isLoading = poolLoading || tokenLoading;

    if (!isValidAddress || poolError) {
      return { data: undefined, isLoading: false, error: poolError || null };
    }

    if (isLoading || !poolData || !token0 || !token1) {
      return { data: undefined, isLoading, error: null };
    }

    if (!tokenData) {
      return { data: undefined, isLoading, error: null };
    }

    const poolInfo: PoolInfo = {
      token0: token0,
      token1: token1,
      token0Symbol: (tokenData[0]?.result as string) || 'Unknown',
      token0Decimals: (tokenData[1]?.result as number) || 18,
      token1Symbol: (tokenData[2]?.result as string) || 'Unknown',
      token1Decimals: (tokenData[3]?.result as number) || 18,
      sqrtPriceX96: slot0?.[0] || 0n,
      tick: slot0?.[1] || 0,
    };

    return { data: poolInfo, isLoading: false, error: null };
  }

  // For cross-chain
  return crossChainData;
}
