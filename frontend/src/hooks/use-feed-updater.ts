'use client';

import { useState, useCallback } from 'react';
import { usePublicClient, useWalletClient, useChainId, useSwitchChain, useConfig } from 'wagmi';
import { getWalletClient } from 'wagmi/actions';
import { decodeAbiParameters, parseAbiParameters, createPublicClient, http } from 'viem';
import { getChainById as getSourceChainById, isRelayChain, type SupportedChain } from '@/lib/chains';
import { flare, ethereum, sepolia } from '@/lib/wagmi-config';
import { PRICE_RELAY_ABI } from '@/lib/artifacts/PriceRelay';
import { readFlareNativePrice } from '@/lib/priceSources/flareNative';
import { getSourceKind, type PriceProvenance, type DirectStateResult } from '@/lib/types';

// FDC Contract Addresses (on Flare)
const FDC_CONFIG = {
  // Flare Mainnet
  14: {
    FDC_HUB: '0xc25c749DC27Efb1864Cb3DADa8845B7687eB2d44' as `0x${string}`,
    RELAY: '0x57a4c3676d08Aa5d15410b5A6A80fBcEF72f3F45' as `0x${string}`,
  },
  // Coston2 Testnet
  114: {
    FDC_HUB: '0x48aC463d7975828989331836548F74Cf28Fc1e60' as `0x${string}`,
    RELAY: '0x5CdF9eAF3EB8b44fB696984a1420B56A7575D250' as `0x${string}`,
  },
} as const;

// Source chain configurations for FDC attestation
const SOURCE_CONFIG: Record<number, { sourceId: `0x${string}` }> = {
  14: { sourceId: '0x464c520000000000000000000000000000000000000000000000000000000000' }, // FLR
  1: { sourceId: '0x4554480000000000000000000000000000000000000000000000000000000000' },  // ETH
  11155111: { sourceId: '0x7465737445544800000000000000000000000000000000000000000000000000' }, // testETH (Sepolia)
  114: { sourceId: '0x7465737443324652000000000000000000000000000000000000000000000000' }, // testC2FR
};

// ABIs
const FDC_HUB_ABI = [
  {
    inputs: [{ name: '_data', type: 'bytes' }],
    name: 'requestAttestation',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'fdcRequestFeeConfigurations',
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const RELAY_ABI = [
  {
    inputs: [
      { name: '_attestationType', type: 'uint256' },
      { name: '_votingRound', type: 'uint256' },
    ],
    name: 'isFinalized',
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: '_timestamp', type: 'uint256' }],
    name: 'getVotingRoundId',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const FEE_CONFIG_ABI = [
  {
    inputs: [{ name: '_data', type: 'bytes' }],
    name: 'getRequestFee',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const PRICE_RECORDER_ABI = [
  {
    inputs: [{ name: 'pool', type: 'address' }],
    name: 'recordPrice',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'pool', type: 'address' }],
    name: 'canUpdate',
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'pool', type: 'address' }],
    name: 'enabledPools',
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'pool', type: 'address' }],
    name: 'enablePool',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'pool', type: 'address' },
      { indexed: false, name: 'sqrtPriceX96', type: 'uint160' },
      { indexed: false, name: 'tick', type: 'int24' },
      { indexed: false, name: 'liquidity', type: 'uint128' },
      { indexed: false, name: 'token0', type: 'address' },
      { indexed: false, name: 'token1', type: 'address' },
      { indexed: false, name: 'timestamp', type: 'uint256' },
      { indexed: false, name: 'blockNumber', type: 'uint256' },
    ],
    name: 'PriceRecorded',
    type: 'event',
  },
] as const;

const CUSTOM_FEED_ABI = [
  {
    inputs: [
      {
        components: [
          { name: 'merkleProof', type: 'bytes32[]' },
          {
            components: [
              { name: 'attestationType', type: 'bytes32' },
              { name: 'sourceId', type: 'bytes32' },
              { name: 'votingRound', type: 'uint64' },
              { name: 'lowestUsedTimestamp', type: 'uint64' },
              {
                components: [
                  { name: 'transactionHash', type: 'bytes32' },
                  { name: 'requiredConfirmations', type: 'uint16' },
                  { name: 'provideInput', type: 'bool' },
                  { name: 'listEvents', type: 'bool' },
                  { name: 'logIndices', type: 'uint32[]' },
                ],
                name: 'requestBody',
                type: 'tuple',
              },
              {
                components: [
                  { name: 'blockNumber', type: 'uint64' },
                  { name: 'timestamp', type: 'uint64' },
                  { name: 'sourceAddress', type: 'address' },
                  { name: 'isDeployment', type: 'bool' },
                  { name: 'receivingAddress', type: 'address' },
                  { name: 'value', type: 'uint256' },
                  { name: 'input', type: 'bytes' },
                  { name: 'status', type: 'uint8' },
                  {
                    components: [
                      { name: 'logIndex', type: 'uint32' },
                      { name: 'emitterAddress', type: 'address' },
                      { name: 'topics', type: 'bytes32[]' },
                      { name: 'data', type: 'bytes' },
                      { name: 'removed', type: 'bool' },
                    ],
                    name: 'events',
                    type: 'tuple[]',
                  },
                ],
                name: 'responseBody',
                type: 'tuple',
              },
            ],
            name: 'data',
            type: 'tuple',
          },
        ],
        name: '_proof',
        type: 'tuple',
      },
    ],
    name: 'updateFromProof',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'latestValue',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'lastUpdateTimestamp',
    outputs: [{ type: 'uint64' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'updateCount',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export type UpdateStep = 
  | 'idle'
  | 'checking'
  | 'switching-to-source'
  | 'enabling-pool'
  | 'recording'
  | 'switching-to-flare'
  // Relay-specific steps
  | 'fetching-price'
  | 'relaying-price'
  // Flare-native steps (no FDC)
  | 'reading-native-state'
  | 'native-success'
  // FDC steps
  | 'requesting-attestation'
  | 'waiting-finalization'
  | 'retrieving-proof'
  | 'submitting-proof'
  | 'success'
  | 'error';

interface UpdateProgress {
  step: UpdateStep;
  message: string;
  elapsed?: number;
  txHash?: string;
  // Useful tx hashes for UX/debugging
  relayTxHash?: string;
  attestationTxHash?: string;
  updateTxHash?: string;
  error?: string;
  // Provenance data (for reviewer clarity)
  provenance?: PriceProvenance;
  // Native state result (for FLARE_NATIVE path)
  nativeResult?: DirectStateResult;
}

interface UseFeedUpdaterResult {
  updateFeed: (
    priceRecorderAddress: `0x${string}` | undefined,
    poolAddress: `0x${string}`,
    feedAddress: `0x${string}`,
    sourceChainId?: number,  // Source chain ID
    priceRelayAddress?: `0x${string}`,  // For relay chains
    existingRecordTxHash?: `0x${string}`, // Optional: retry attestation without re-recording
    // Token info for native price computation
    token0Decimals?: number,
    token1Decimals?: number,
    invertPrice?: boolean
  ) => Promise<void>;
  // Native-only update (skips FDC entirely)
  updateNativeFeed: (
    poolAddress: `0x${string}`,
    token0Decimals: number,
    token1Decimals: number,
    invertPrice: boolean
  ) => Promise<DirectStateResult | null>;
  progress: UpdateProgress;
  isUpdating: boolean;
  cancel: () => void;
}

// Get chain definition for viem client
function getChainDefinition(chainId: number) {
  switch (chainId) {
    case 1: return ethereum;
    case 11155111: return sepolia;
    case 14: return flare;
    default: return flare;
  }
}

export function useFeedUpdater(): UseFeedUpdaterResult {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const wagmiConfig = useConfig();

  const [progress, setProgress] = useState<UpdateProgress>({
    step: 'idle',
    message: '',
  });
  const [isUpdating, setIsUpdating] = useState(false);
  const [cancelled, setCancelled] = useState(false);

  const cancel = useCallback(() => {
    setCancelled(true);
  }, []);

  /**
   * FLARE_NATIVE PATH: Read price directly from on-chain state
   * 
   * This is the clean path for Flare-native pools:
   * - Uses slot0().sqrtPriceX96 directly
   * - NO FDC attestation involved
   * - NO PriceRecorder events
   * - Returns instantly (single RPC call)
   */
  const updateNativeFeed = useCallback(async (
    poolAddress: `0x${string}`,
    token0Decimals: number,
    token1Decimals: number,
    invertPrice: boolean
  ): Promise<DirectStateResult | null> => {
    setIsUpdating(true);
    setCancelled(false);
    const startTime = Date.now();

    const updateProgress = (step: UpdateStep, message: string, extra?: Partial<UpdateProgress>) => {
      setProgress({
        step,
        message,
        elapsed: Math.floor((Date.now() - startTime) / 1000),
        ...extra,
      });
    };

    try {
      updateProgress('reading-native-state', 'Reading price from Flare pool (direct state read)...');

      // Direct on-chain state read - no FDC involved
      const result = await readFlareNativePrice(
        poolAddress,
        token0Decimals,
        token1Decimals,
        invertPrice
      );

      console.log('[FeedUpdater] FLARE_NATIVE direct state result:', {
        value: result.value.toString(),
        decimals: result.decimals,
        timestamp: result.timestamp,
        blockNumber: result.blockNumber.toString(),
        sqrtPriceX96: result.sqrtPriceX96.toString(),
        tick: result.tick,
      });

      updateProgress('native-success', 'Price read successfully from on-chain state!', {
        nativeResult: result,
        provenance: result.provenance,
      });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setProgress({
        step: 'error',
        message: `Failed to read native price: ${errorMessage}`,
        elapsed: Math.floor((Date.now() - startTime) / 1000),
        error: errorMessage,
      });
      return null;
    } finally {
      setIsUpdating(false);
    }
  }, []);

  const updateFeed = useCallback(async (
    priceRecorderAddress: `0x${string}` | undefined,
    poolAddress: `0x${string}`,
    feedAddress: `0x${string}`,
    sourceChainId: number = 14,  // Default to Flare if not specified
    priceRelayAddress?: `0x${string}`,  // For relay chains
    existingRecordTxHash?: `0x${string}`, // Optional: skip recordPrice and just attest this tx
    // Token info for native price computation
    token0Decimals: number = 18,
    token1Decimals: number = 18,
    invertPrice: boolean = false
  ) => {
    console.log('[FeedUpdater] ===== UPDATE FEED CALLED =====');
    console.log('[FeedUpdater] priceRecorderAddress:', priceRecorderAddress);
    console.log('[FeedUpdater] poolAddress:', poolAddress);
    console.log('[FeedUpdater] feedAddress:', feedAddress);
    console.log('[FeedUpdater] sourceChainId param:', sourceChainId);
    
    // ============================================================
    // ROUTING DECISION: FLARE_NATIVE vs FDC_EXTERNAL
    // ============================================================
    const sourceKind = getSourceKind(sourceChainId);
    console.log('[FeedUpdater] sourceKind:', sourceKind);

    // FLARE_NATIVE PATH: Direct on-chain state read (no FDC)
    if (sourceKind === 'FLARE_NATIVE') {
      console.log('[FeedUpdater] Using FLARE_NATIVE path - direct state read, no FDC');
      await updateNativeFeed(poolAddress, token0Decimals, token1Decimals, invertPrice);
      return;
    }

    // FDC_EXTERNAL PATH: Continue with existing FDC attestation flow
    console.log('[FeedUpdater] Using FDC_EXTERNAL path - FDC attestation required');
    
    if (!publicClient || !walletClient) {
      throw new Error('Wallet not connected');
    }

    // Determine if this is a relay chain
    const isRelay = isRelayChain(sourceChainId);
    const sourceChain = getSourceChainById(sourceChainId);
    
    // Validate inputs based on flow type
    if (isRelay && !priceRelayAddress) {
      throw new Error('PriceRelay address required for relay chains');
    }
    if (!isRelay && !priceRecorderAddress) {
      throw new Error('PriceRecorder address required for direct chains');
    }

    // Get FDC config for Flare (where attestation happens)
    const fdcConfig = FDC_CONFIG[14]; // Always use Flare mainnet for FDC
    if (!fdcConfig) {
      throw new Error('FDC not available on this network');
    }

    // For relay chains, attestation is always for Flare (where relay tx happens)
    // For direct chains, attestation is for the source chain
    const attestationSourceChainId = isRelay ? 14 : sourceChainId;
    console.log('[FeedUpdater] sourceChainId:', sourceChainId, 'isRelay:', isRelay, 'attestationSourceChainId:', attestationSourceChainId);
    const sourceConfig = SOURCE_CONFIG[attestationSourceChainId];
    if (!sourceConfig) {
      throw new Error(`Unsupported attestation source chain ID: ${attestationSourceChainId}`);
    }

    const isFlareSource = sourceChainId === 14 || sourceChainId === 114;

    setIsUpdating(true);
    setCancelled(false);
    const startTime = Date.now();

    const updateProgress = (step: UpdateStep, message: string, extra?: Partial<UpdateProgress>) => {
      setProgress({
        step,
        message,
        elapsed: Math.floor((Date.now() - startTime) / 1000),
        ...extra,
      });
    };

    // The tx hash we ultimately want to attest (so we can retry without re-recording)
    let attestationTxHashForRetry: `0x${string}` | undefined;

    try {
      let recordTxHash: `0x${string}`;
      let lastVerifierRequestId: string | undefined;

      if (isRelay) {
        // ===== RELAY FLOW =====
        // 1. Fetch price from source chain via API (no wallet needed on source)
        updateProgress('fetching-price', `Fetching price from ${sourceChain?.name || 'source chain'}...`);
        
        const priceResponse = await fetch('/api/relay/fetch-price', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chainId: sourceChainId,
            poolAddress: poolAddress,
          }),
        });

        if (!priceResponse.ok) {
          const errorData = await priceResponse.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to fetch price from source chain');
        }

        const priceData = await priceResponse.json();

        if (cancelled) throw new Error('Cancelled by user');

        // 2. Ensure we're on Flare for relay transaction
        if (chainId !== 14) {
          updateProgress('switching-to-flare', 'Switching to Flare for relay...');
          try {
            await switchChainAsync({ chainId: 14 });
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (switchError) {
            if ((switchError as Error).message?.includes('rejected')) {
              throw new Error('Network switch to Flare rejected.');
            }
            throw switchError;
          }
        }

        // Get a FRESH wallet client for Flare (after potential chain switches)
        const flareWalletClient = await getWalletClient(wagmiConfig, { chainId: 14 });
        if (!flareWalletClient) {
          throw new Error('Failed to get Flare wallet client. Please ensure your wallet is connected to Flare.');
        }

        // Create Flare client
        const flareClient = createPublicClient({
          chain: flare,
          transport: http(),
        });

        // 3. Relay preflight + one-time enable (owner-only)
        // This avoids confusing relayPrice reverts when chain/pool isn't enabled yet.
        updateProgress('checking', 'Checking PriceRelay configuration on Flare...');

        const [isActive, isChainEnabled, isPoolEnabled, secondsUntilNext] = await Promise.all([
          flareClient.readContract({
            address: priceRelayAddress!,
            abi: PRICE_RELAY_ABI,
            functionName: 'isActive',
          }),
          flareClient.readContract({
            address: priceRelayAddress!,
            abi: PRICE_RELAY_ABI,
            functionName: 'supportedChains',
            args: [BigInt(priceData.chainId)],
          }),
          flareClient.readContract({
            address: priceRelayAddress!,
            abi: PRICE_RELAY_ABI,
            functionName: 'enabledPools',
            args: [BigInt(priceData.chainId), priceData.poolAddress as `0x${string}`],
          }),
          flareClient.readContract({
            address: priceRelayAddress!,
            abi: PRICE_RELAY_ABI,
            functionName: 'timeUntilNextRelay',
            args: [BigInt(priceData.chainId), priceData.poolAddress as `0x${string}`],
          }),
        ]);

        if (!isActive) {
          throw new Error('PriceRelay is paused on Flare. The relay owner must unpause it.');
        }

        // Enable chain if needed (owner-only)
        if (!isChainEnabled) {
          updateProgress('enabling-pool', `Enabling source chain ${priceData.chainId} on PriceRelay...`);
          try {
            const enableChainHash = await flareWalletClient.writeContract({
              chain: flare,
              address: priceRelayAddress!,
              abi: PRICE_RELAY_ABI,
              functionName: 'enableChain',
              args: [BigInt(priceData.chainId)],
            });
            await flareClient.waitForTransactionReceipt({ hash: enableChainHash });
          } catch (e) {
            throw new Error(
              `PriceRelay chain ${priceData.chainId} is not enabled and this wallet cannot enable it (owner-only). ` +
              `Deployer/owner must call enableChain(${priceData.chainId}).`
            );
          }
        }

        // Enable pool if needed (owner-only)
        if (!isPoolEnabled) {
          updateProgress('enabling-pool', `Enabling pool on PriceRelay (token binding)...`);
          try {
            const enablePoolHash = await flareWalletClient.writeContract({
              chain: flare,
              address: priceRelayAddress!,
              abi: PRICE_RELAY_ABI,
              functionName: 'enablePool',
              args: [
                BigInt(priceData.chainId),
                priceData.poolAddress as `0x${string}`,
                priceData.token0 as `0x${string}`,
                priceData.token1 as `0x${string}`,
              ],
            });
            await flareClient.waitForTransactionReceipt({ hash: enablePoolHash });
          } catch (e) {
            throw new Error(
              `Pool is not enabled on PriceRelay and this wallet cannot enable it (owner-only). ` +
              `Owner must call enablePool(chainId, pool, token0, token1).`
            );
          }
        }

        if (Number(secondsUntilNext) > 0) {
          throw new Error(`Relay interval not elapsed yet. Try again in ${Number(secondsUntilNext)}s.`);
        }

        // 4. Call PriceRelay contract on Flare
        updateProgress('relaying-price', `Relaying price to Flare (from ${sourceChain?.name})...`);

        const relayHash = await flareWalletClient.writeContract({
          chain: flare,
          address: priceRelayAddress!,
          abi: PRICE_RELAY_ABI,
          functionName: 'relayPrice',
          args: [
            BigInt(priceData.chainId),
            priceData.poolAddress as `0x${string}`,
            BigInt(priceData.sqrtPriceX96),
            priceData.tick,
            BigInt(priceData.liquidity),
            priceData.token0 as `0x${string}`,
            priceData.token1 as `0x${string}`,
            BigInt(priceData.sourceTimestamp),
            BigInt(priceData.sourceBlockNumber),
          ],
        });

        updateProgress('relaying-price', 'Waiting for relay confirmation...', { txHash: relayHash, relayTxHash: relayHash });

        const relayReceipt = await flareClient.waitForTransactionReceipt({ hash: relayHash });
        
        if (relayReceipt.status === 'reverted') {
          throw new Error(
            'Relay transaction reverted. Common causes: relayer not authorized, chain/pool not enabled, ' +
            'token mismatch (token binding), relay interval not elapsed, stale/future timestamp, or deviation check.'
          );
        }

        recordTxHash = relayHash;
        attestationTxHashForRetry = recordTxHash;

      } else {
        // ===== DIRECT FLOW =====
        if (existingRecordTxHash) {
          // Skip recording a new price; only attest an existing tx hash.
          recordTxHash = existingRecordTxHash;
          attestationTxHashForRetry = recordTxHash;
          
          // Ensure we're on Flare for the attestation workflow
          if (chainId !== 14) {
            updateProgress('switching-to-flare', 'Switching to Flare for attestation...');
            try {
              await switchChainAsync({ chainId: 14 });
              await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (switchError) {
              if ((switchError as Error).message?.includes('rejected')) {
                throw new Error('Network switch to Flare rejected. Please switch manually and try again.');
              }
              throw switchError;
            }
          }
        } else {
        // Step 1: If source chain is not Flare, switch to it
        let currentChainId = chainId;
        
        if (!isFlareSource && currentChainId !== sourceChainId) {
          updateProgress('switching-to-source', `Switching to ${sourceChain?.name || 'source chain'}...`);
          
          try {
            await switchChainAsync({ chainId: sourceChainId });
            currentChainId = sourceChainId;
            // Small delay to let wallet client update
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (switchError) {
            if ((switchError as Error).message?.includes('rejected')) {
              throw new Error('Network switch rejected. Please switch manually and try again.');
            }
            throw switchError;
          }
        }

        // Get a FRESH wallet client for the source chain after switching
        const sourceWalletClient = await getWalletClient(wagmiConfig, { chainId: sourceChainId });
        if (!sourceWalletClient) {
          throw new Error(`Failed to get wallet client for ${sourceChain?.name || 'source chain'}. Please ensure your wallet is connected.`);
        }

        // Create a client for the source chain
        const sourceChainDef = getChainDefinition(sourceChainId);
        const sourceClient = createPublicClient({
          chain: sourceChainDef,
          transport: http(sourceChain?.rpcUrl),
        });

        // Step 2: Check if pool is enabled on recorder
        updateProgress('checking', 'Checking pool status...');
        
        const isEnabled = await sourceClient.readContract({
          address: priceRecorderAddress!,
          abi: PRICE_RECORDER_ABI,
          functionName: 'enabledPools',
          args: [poolAddress],
        });

        // If pool is not enabled, enable it first
        if (!isEnabled) {
          updateProgress('enabling-pool', 'Pool not enabled on recorder. Please confirm transaction to enable...');
          
          const enableHash = await sourceWalletClient.writeContract({
            chain: sourceChainDef,
            address: priceRecorderAddress!,
            abi: PRICE_RECORDER_ABI,
            functionName: 'enablePool',
            args: [poolAddress],
          });

          updateProgress('enabling-pool', 'Waiting for pool enable confirmation...');
          const enableReceipt = await sourceClient.waitForTransactionReceipt({ 
            hash: enableHash,
            timeout: 120_000,
            pollingInterval: 2_000,
          });
          
          if (enableReceipt.status === 'reverted') {
            throw new Error('Failed to enable pool on recorder');
          }

          updateProgress('enabling-pool', 'Pool enabled successfully! Continuing...');
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Check if can update (interval check)
        const canUpdate = await sourceClient.readContract({
          address: priceRecorderAddress!,
          abi: PRICE_RECORDER_ABI,
          functionName: 'canUpdate',
          args: [poolAddress],
        });

        if (!canUpdate) {
          throw new Error('Pool cannot be updated yet (interval not elapsed). Please wait a few minutes.');
        }

        if (cancelled) throw new Error('Cancelled by user');

        // Step 3: Record price on source chain
        const gasWarning = !isFlareSource 
          ? ` (requires ${sourceChain?.nativeCurrency.symbol || 'gas'} for gas)` 
          : '';
        updateProgress('recording', `Recording price on ${sourceChain?.name || 'source chain'}${gasWarning}...`);

        const recordHash = await sourceWalletClient.writeContract({
          chain: sourceChainDef,
          address: priceRecorderAddress!,
          abi: PRICE_RECORDER_ABI,
          functionName: 'recordPrice',
          args: [poolAddress],
        });

        updateProgress('recording', 'Waiting for confirmation...', { txHash: recordHash });

        const recordReceipt = await sourceClient.waitForTransactionReceipt({ 
          hash: recordHash,
          timeout: 120_000,
          pollingInterval: 2_000,
        });
        
        if (recordReceipt.status === 'reverted') {
          throw new Error('Record transaction reverted');
        }

        if (cancelled) throw new Error('Cancelled by user');

        // Step 4: Switch back to Flare for attestation (if on different chain)
        if (!isFlareSource && currentChainId !== 14) {
          updateProgress('switching-to-flare', 'Switching back to Flare for attestation...');
          
          try {
            await switchChainAsync({ chainId: 14 });
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (switchError) {
            if ((switchError as Error).message?.includes('rejected')) {
              throw new Error('Network switch to Flare rejected. Please switch manually and try again.');
            }
            throw switchError;
          }
        }

        recordTxHash = recordHash;
        attestationTxHashForRetry = recordTxHash;
        }
      }

      // ===== COMMON ATTESTATION FLOW (both direct and relay) =====
      
      // Create Flare client for attestation
      const flareClient = createPublicClient({
        chain: flare,
        transport: http(),
      });

      // Get a FRESH wallet client for Flare (after potential chain switches)
      const flareWalletClient = await getWalletClient(wagmiConfig, { chainId: 14 });
      if (!flareWalletClient) {
        throw new Error('Failed to get Flare wallet client. Please ensure your wallet is connected to Flare.');
      }

      // Request FDC attestation
      // Ethereum needs 12+ confirmations, Flare needs only 1
      const requiredConfirmations = attestationSourceChainId === 1 ? '12' : '1';
      
      // For ETH, actively poll for confirmations instead of fixed wait
      if (attestationSourceChainId === 1) {
        updateProgress('requesting-attestation', 'Waiting for Ethereum confirmations...');
        console.log('[FeedUpdater] Polling for ETH confirmations on tx:', recordTxHash);
        
        // Create ETH client to check confirmations
        const ethClient = createPublicClient({
          chain: ethereum,
          transport: http('https://ethereum-rpc.publicnode.com'),
        });
        
        const REQUIRED_CONFIRMATIONS = 12;
        const MAX_WAIT_TIME = 300000; // 5 minutes max
        const POLL_INTERVAL = 12000; // Check every 12 seconds (1 ETH block)
        const startTime = Date.now();
        
        while (Date.now() - startTime < MAX_WAIT_TIME) {
          if (cancelled) throw new Error('Cancelled by user');
          
          try {
            const receipt = await ethClient.getTransactionReceipt({ hash: recordTxHash });
            const currentBlock = await ethClient.getBlockNumber();
            const confirmations = Number(currentBlock) - Number(receipt.blockNumber);
            
            console.log('[FeedUpdater] Confirmations:', confirmations, '/', REQUIRED_CONFIRMATIONS);
            updateProgress('requesting-attestation', `Waiting for confirmations: ${confirmations}/${REQUIRED_CONFIRMATIONS}...`);
            
            if (confirmations >= REQUIRED_CONFIRMATIONS) {
              console.log('[FeedUpdater] ✅ Got', confirmations, 'confirmations, proceeding...');
              break;
            }
          } catch (e) {
            console.log('[FeedUpdater] Error checking confirmations:', e);
          }
          
          await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
        }
        
        // Extra buffer for FDC indexer to catch up (can be minutes on ETH mainnet)
        console.log('[FeedUpdater] Adding 120s buffer for FDC indexer...');
        updateProgress('requesting-attestation', 'Waiting for FDC indexer (can take a few minutes on Ethereum)...');
        await new Promise(resolve => setTimeout(resolve, 120000));
      }
      
      updateProgress('requesting-attestation', 'Preparing attestation request...');

      // Call verifier API via our proxy - aggressive retry for ETH due to flaky verifier
      console.log('[FeedUpdater] Requesting attestation for tx:', recordTxHash, 'with', requiredConfirmations, 'confirmations');
      let verifierData: { abiEncodedRequest?: string; status?: string } | null = null;
      
      // ETH verifier/indexer can lag significantly; retry for a time window, not a fixed small count
      const retryDelay = attestationSourceChainId === 1 ? 30000 : 0; // 30s for ETH, 0 for others
      const maxVerifierWaitMs = attestationSourceChainId === 1 ? 15 * 60_000 : 0; // up to 15 minutes on ETH
      const verifierStart = Date.now();
      let attempt = 0;
      
      while (true) {
        attempt += 1;
        if (cancelled) throw new Error('Cancelled by user');
        
        const verifierResponse = await fetch('/api/fdc/prepare-request', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          cache: 'no-store',
          body: JSON.stringify({
            flareChainId: 14,
            sourceChainId: attestationSourceChainId,
            attestationType: '0x45564d5472616e73616374696f6e000000000000000000000000000000000000',
            sourceId: sourceConfig.sourceId,
            requestBody: {
              transactionHash: recordTxHash,
              requiredConfirmations,
              provideInput: false,
              listEvents: true,
              logIndices: [],
            },
          }),
        });

        if (!verifierResponse.ok) {
          const errorData = await verifierResponse.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to prepare attestation request');
        }

        verifierData = await verifierResponse.json();
        lastVerifierRequestId = (verifierData as any)?.requestId;
        
        if (verifierData?.abiEncodedRequest) {
          console.log('[FeedUpdater] ✅ Got valid response on attempt', attempt);
          break; // Success
        }
        
        if (attestationSourceChainId !== 1) break; // no retries for non-ETH (current behavior)
        
        const waitedMs = Date.now() - verifierStart;
        const waitedMin = Math.floor(waitedMs / 60000);
        console.log('[FeedUpdater] Attempt', attempt, 'returned', verifierData?.status, '(requestId:', lastVerifierRequestId, ') waited:', waitedMin, 'min');
        
        if (waitedMs >= maxVerifierWaitMs) break;
        
        updateProgress(
          'requesting-attestation',
          `Verifier still indexing ETH tx (attempt ${attempt}, waited ${waitedMin}m). Retrying in ${retryDelay / 1000}s...`
        );
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
      
      if (!verifierData?.abiEncodedRequest) {
        const waitedMs = Date.now() - verifierStart;
        const waitedMin = Math.floor(waitedMs / 60000);
        throw new Error(
          `FDC verifier returned status: ${verifierData?.status || 'unknown'} after ${attempt} attempts (~${waitedMin}m). ` +
          `This usually means the verifier/indexer hasn't ingested the ETH transaction yet. Try "Retry attestation" in a few minutes (no need to record again).` +
          (lastVerifierRequestId ? ` (requestId: ${lastVerifierRequestId})` : '')
        );
      }
      
      const requestBytes = verifierData.abiEncodedRequest as `0x${string}`;

      if (cancelled) throw new Error('Cancelled by user');

      // Get attestation fee
      updateProgress('requesting-attestation', 'Getting attestation fee...');

      let fee: bigint;
      try {
        const feeConfigAddress = await flareClient.readContract({
          address: fdcConfig.FDC_HUB,
          abi: FDC_HUB_ABI,
          functionName: 'fdcRequestFeeConfigurations',
        });

        fee = await flareClient.readContract({
          address: feeConfigAddress,
          abi: FEE_CONFIG_ABI,
          functionName: 'getRequestFee',
          args: [requestBytes],
        });
      } catch {
        // Fallback fee: 1 FLR
        fee = 1000000000000000000n;
      }

      // Submit attestation request
      updateProgress('requesting-attestation', `Submitting attestation request (fee: ${(Number(fee) / 1e18).toFixed(2)} FLR)...`);

      const attestHash = await flareWalletClient.writeContract({
        chain: flare,
        address: fdcConfig.FDC_HUB,
        abi: FDC_HUB_ABI,
        functionName: 'requestAttestation',
        args: [requestBytes],
        value: fee,
      });
      
      updateProgress('requesting-attestation', 'Attestation request submitted. Waiting for confirmation...', {
        txHash: attestHash,
        attestationTxHash: attestHash,
      });

      const attestReceipt = await flareClient.waitForTransactionReceipt({ hash: attestHash });

      if (attestReceipt.status === 'reverted') {
        throw new Error('Attestation request reverted');
      }

      // Get voting round ID
      const block = await flareClient.getBlock({ blockNumber: attestReceipt.blockNumber });
      
      const votingRoundId = await flareClient.readContract({
        address: fdcConfig.RELAY,
        abi: RELAY_ABI,
        functionName: 'getVotingRoundId',
        args: [block.timestamp],
      });

      if (cancelled) throw new Error('Cancelled by user');

      // Wait for finalization
      updateProgress('waiting-finalization', `Waiting for FDC finalization (Round ${votingRoundId})...`);

      const maxWaitMs = 300000; // 5 minutes
      const pollInterval = 10000; // 10 seconds
      const waitStart = Date.now();

      while (Date.now() - waitStart < maxWaitMs) {
        if (cancelled) throw new Error('Cancelled by user');

        const isFinalized = await flareClient.readContract({
          address: fdcConfig.RELAY,
          abi: RELAY_ABI,
          functionName: 'isFinalized',
          args: [200n, votingRoundId], // 200 = EVMTransaction attestation type
        });

        if (isFinalized) {
          break;
        }

        const waitedSecs = Math.floor((Date.now() - waitStart) / 1000);
        updateProgress('waiting-finalization', `Waiting for finalization... (${waitedSecs}s)`);
        
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }

      // Additional wait for DA Layer sync
      updateProgress('waiting-finalization', 'Waiting for DA Layer sync...');
      await new Promise(resolve => setTimeout(resolve, 30000));

      if (cancelled) throw new Error('Cancelled by user');

      // Retrieve proof from DA Layer via our proxy
      updateProgress('retrieving-proof', 'Retrieving proof from DA Layer...');

      const proofResponse = await fetch('/api/fdc/get-proof', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chainId: 14, // Always Flare for proof retrieval
          votingRoundId: Number(votingRoundId),
          requestBytes: requestBytes,
        }),
      });

      if (!proofResponse.ok) {
        const errorData = await proofResponse.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to retrieve proof from DA Layer');
      }

      const proofData = await proofResponse.json();

      if (!proofData.response_hex) {
        throw new Error('Invalid proof response - attestation may not be ready yet');
      }

      if (cancelled) throw new Error('Cancelled by user');

      // Parse and submit proof to feed
      updateProgress('submitting-proof', 'Submitting proof to feed contract...');

      // Decode the response
      const RESPONSE_TUPLE_TYPE = `(bytes32 attestationType, bytes32 sourceId, uint64 votingRound, uint64 lowestUsedTimestamp, (bytes32 transactionHash, uint16 requiredConfirmations, bool provideInput, bool listEvents, uint32[] logIndices) requestBody, (uint64 blockNumber, uint64 timestamp, address sourceAddress, bool isDeployment, address receivingAddress, uint256 value, bytes input, uint8 status, (uint32 logIndex, address emitterAddress, bytes32[] topics, bytes data, bool removed)[] events) responseBody)`;
      
      const [decodedResponse] = decodeAbiParameters(
        parseAbiParameters(RESPONSE_TUPLE_TYPE),
        proofData.response_hex as `0x${string}`
      );

      // Format proof for contract with null safety
      type Hex = `0x${string}`;
      type Address = `0x${string}`;

      // Important: use readonly-typed fallbacks so we don't widen to mutable arrays
      const logIndices =
        decodedResponse.requestBody?.logIndices ?? ([] as readonly number[]);

      const events =
        decodedResponse.responseBody?.events ??
        ([] as readonly {
          logIndex: number | bigint;
          emitterAddress: Address;
          topics: readonly Hex[];
          data: Hex;
          removed: boolean;
        }[]);
      
      const proofStruct = {
        merkleProof: (proofData.proof ?? []) as readonly Hex[],
        data: {
          attestationType: decodedResponse.attestationType,
          sourceId: decodedResponse.sourceId,
          votingRound: decodedResponse.votingRound,
          lowestUsedTimestamp: decodedResponse.lowestUsedTimestamp,
          requestBody: {
            transactionHash: decodedResponse.requestBody.transactionHash,
            requiredConfirmations: decodedResponse.requestBody.requiredConfirmations,
            provideInput: decodedResponse.requestBody.provideInput,
            listEvents: decodedResponse.requestBody.listEvents,
            logIndices,
          },
          responseBody: {
            blockNumber: decodedResponse.responseBody.blockNumber,
            timestamp: decodedResponse.responseBody.timestamp,
            sourceAddress: decodedResponse.responseBody.sourceAddress,
            isDeployment: decodedResponse.responseBody.isDeployment,
            receivingAddress: decodedResponse.responseBody.receivingAddress,
            value: decodedResponse.responseBody.value,
            input: decodedResponse.responseBody.input,
            status: decodedResponse.responseBody.status,
            events: events.map((event) => ({
              logIndex: Number(event.logIndex),
              emitterAddress: event.emitterAddress as Address,
              topics: (event.topics ?? ([] as readonly Hex[])) as readonly Hex[],
              data: event.data as Hex,
              removed: event.removed,
            })) as readonly {
              logIndex: number;
              emitterAddress: Address;
              topics: readonly Hex[];
              data: Hex;
              removed: boolean;
            }[],
          },
        },
      };

      const updateHash = await flareWalletClient.writeContract({
        chain: flare,
        address: feedAddress,
        abi: CUSTOM_FEED_ABI,
        functionName: 'updateFromProof',
        args: [proofStruct],
      });

      const updateReceipt = await flareClient.waitForTransactionReceipt({ hash: updateHash });

      if (updateReceipt.status === 'reverted') {
        throw new Error('Update proof transaction reverted');
      }

      // Success!
      updateProgress('success', 'Feed updated successfully!', { txHash: updateHash, updateTxHash: updateHash });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setProgress({
        step: 'error',
        message: errorMessage,
        elapsed: Math.floor((Date.now() - startTime) / 1000),
        error: errorMessage,
        // Preserve the tx hash we were trying to attest so the UI can offer "retry attestation only"
        txHash: attestationTxHashForRetry,
      });
    } finally {
      setIsUpdating(false);
    }
  }, [publicClient, walletClient, chainId, cancelled, switchChainAsync, updateNativeFeed]);

  return {
    updateFeed,
    updateNativeFeed,
    progress,
    isUpdating,
    cancel,
  };
}
