'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useFeeds } from '@/context/feeds-context';
import { useChainId, useReadContracts, useAccount } from 'wagmi';
import { CUSTOM_FEED_ABI } from '@/lib/contracts';
import { getExplorerUrl } from '@/lib/wagmi-config';
import { useFeedUpdater, type UpdateStep } from '@/hooks/use-feed-updater';
import { ChainBadge } from '@/components/chain';
import { getChainById } from '@/lib/chains';
import { 
  Activity, 
  ExternalLink, 
  Copy, 
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  Play,
  X,
  Loader2,
  ArrowRight,
  Zap,
  Archive,
  Undo2
} from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import type { StoredFeed, SourceChain, SourceKind, PriceMethod } from '@/lib/types';
import { getSourceKind } from '@/lib/types';
import { ProvenanceBadge } from '@/components/ui/provenance-badge';

type FeedFreshness = 'fresh' | 'aging' | 'old' | 'never';

function getFeedFreshness(lastUpdateTimestamp: number, expectedIntervalSeconds: number = 300): FeedFreshness {
  if (!lastUpdateTimestamp) return 'never';
  
  const now = Math.floor(Date.now() / 1000);
  const timeSinceUpdate = now - lastUpdateTimestamp;
  
  if (timeSinceUpdate < expectedIntervalSeconds * 1.5) return 'fresh';
  if (timeSinceUpdate < expectedIntervalSeconds * 5) return 'aging';
  return 'old';
}

function formatTimeAgo(timestamp: number): string {
  if (!timestamp) return 'Never';
  
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatPrice(value: bigint | undefined): string {
  if (!value) return '—';
  const num = Number(value) / 1e6;
  if (num >= 1000) return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (num >= 1) return num.toLocaleString('en-US', { maximumFractionDigits: 4 });
  return num.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

const STEP_PROGRESS: Record<UpdateStep, number> = {
  idle: 0,
  checking: 5,
  'switching-to-source': 8,
  'enabling-pool': 10,
  recording: 15,
  'switching-to-flare': 25,
  // Relay-specific steps
  'fetching-price': 10,
  'relaying-price': 20,
  // Flare-native steps (no FDC)
  'reading-native-state': 50,
  'writing-native-update': 70,
  'native-success': 100,
  // FDC steps
  'requesting-attestation': 30,
  'waiting-finalization': 50,
  'retrieving-proof': 80,
  'submitting-proof': 90,
  success: 100,
  error: 0,
};

interface FeedCardProps {
  feed: StoredFeed;
  chainId: number;
  onUpdateClick: () => void;
  onArchiveClick: () => void;
  onRestoreClick: () => void;
  isUpdating: boolean;
  normalizedFeed: StoredFeed & { sourceChain: SourceChain; sourcePoolAddress: `0x${string}` };
  refreshKey: number;
  nativeRead?: {
    value: bigint;
    decimals: number;
    timestamp: number;
    blockNumber: bigint;
    sqrtPriceX96: bigint;
    tick: number;
  };
  nativeReadCount?: number;
}

function FeedCard({
  feed,
  chainId,
  onUpdateClick,
  onArchiveClick,
  onRestoreClick,
  isUpdating,
  normalizedFeed,
  refreshKey,
  nativeRead,
  nativeReadCount,
}: FeedCardProps) {
  const { data, isLoading, refetch } = useReadContracts({
    contracts: [
      {
        address: feed.customFeedAddress,
        abi: CUSTOM_FEED_ABI,
        functionName: 'latestValue',
      },
      {
        address: feed.customFeedAddress,
        abi: CUSTOM_FEED_ABI,
        functionName: 'lastUpdateTimestamp',
      },
      {
        address: feed.customFeedAddress,
        abi: CUSTOM_FEED_ABI,
        functionName: 'updateCount',
      },
      {
        address: feed.customFeedAddress,
        abi: CUSTOM_FEED_ABI,
        functionName: 'feedId',
      },
    ],
  });

  const latestValue = data?.[0]?.result as bigint | undefined;
  const lastUpdateTimestamp = Number(data?.[1]?.result || 0);
  const updateCount = Number(data?.[2]?.result || 0);
  const feedId = data?.[3]?.result as string | undefined;

  const sourceChain = normalizedFeed.sourceChain;
  const isFlareSource = sourceChain.id === 14 || sourceChain.id === 114;
  const isRelayFeed = sourceChain.category === 'relay';
  
  // Derive sourceKind and method for badges
  const feedSourceKind: SourceKind = feed.sourceKind || getSourceKind(sourceChain.id);
  const feedMethod: PriceMethod = feed.method || (feedSourceKind === 'FLARE_NATIVE' ? 'SLOT0_SPOT' : 'FDC_ATTESTATION');

  const hasOnchainUpdate = lastUpdateTimestamp > 0;
  const shouldUseNativeReadCache = feedSourceKind === 'FLARE_NATIVE' && !hasOnchainUpdate;

  const effectiveLastUpdateTimestamp = shouldUseNativeReadCache
    ? (nativeRead?.timestamp ?? 0)
    : lastUpdateTimestamp;

  const effectiveValue = shouldUseNativeReadCache
    ? (nativeRead?.value ?? latestValue)
    : latestValue;

  const effectiveCountLabel =
    shouldUseNativeReadCache ? 'Reads' : 'Updates';
  const effectiveCountValue =
    shouldUseNativeReadCache ? nativeReadCount ?? 0 : updateCount;

  const freshness = getFeedFreshness(effectiveLastUpdateTimestamp);

  const statusConfig = {
    fresh: { color: 'bg-green-500', text: 'Fresh', icon: CheckCircle2 },
    aging: { color: 'bg-yellow-500', text: 'Aging', icon: Clock },
    old: { color: 'bg-red-500', text: 'Old', icon: AlertCircle },
    never: {
      color: 'bg-gray-500',
      text: shouldUseNativeReadCache ? 'Not read yet' : 'Never updated',
      icon: Activity,
    },
  };

  const status = statusConfig[freshness];
  const StatusIcon = status.icon;
  const isArchived = Boolean(feed.archivedAt);

  // Ensure cards update immediately after a successful update flow
  useEffect(() => {
    if (refreshKey > 0) {
      refetch();
    }
  }, [refreshKey, refetch]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  return (
    <Card
      className={`hover:border-brand-500/50 transition-colors overflow-hidden ${
        isArchived ? 'opacity-60' : ''
      }`}
    >
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-lg truncate">{feed.alias}</CardTitle>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-mono text-xs">
                {feed.token0.symbol}/{feed.token1.symbol}
              </Badge>
              {isArchived && (
                <Badge variant="secondary" className="text-xs">
                  Archived
                </Badge>
              )}
              {/* Provenance Badge - key for reviewer clarity */}
              <ProvenanceBadge 
                sourceKind={feedSourceKind}
                method={feedMethod}
                originChain={sourceChain.name}
              />
            </div>
            {/* Source chain indicator for external feeds */}
            {!isFlareSource && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <ChainBadge chainId={sourceChain.id} className="text-[10px] px-1.5" />
                  <ArrowRight className="w-3 h-3 opacity-60" />
                  <ChainBadge chainId={14} chainName="Flare" className="text-[10px] px-1.5" />
                </div>
                {/* Relay trust indicator */}
                {isRelayFeed && (
                  <Badge
                    variant="outline"
                    className="text-[10px] bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                  >
                    Relay
                  </Badge>
                )}
              </div>
            )}
          </div>
          <div className="shrink-0">
            <Badge variant="outline" className="gap-1.5">
              <span className={`w-2 h-2 rounded-full ${status.color}`} />
              <StatusIcon className="w-3 h-3" />
              <span className="text-sm text-muted-foreground">{status.text}</span>
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Price Display */}
        <div className="p-4 rounded-lg bg-secondary/40 border border-border/50">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">Current Price</div>
            <div className="text-xs text-muted-foreground">
              {shouldUseNativeReadCache ? 'Last read' : 'Last update'}:{' '}
              {formatTimeAgo(effectiveLastUpdateTimestamp)}
            </div>
          </div>
          <div className="mt-2 text-3xl font-display tracking-tight truncate">
            {isLoading ? '...' : formatPrice(effectiveValue)}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">{effectiveCountLabel}</div>
            <div className="mt-1 text-lg font-semibold leading-none">{effectiveCountValue}</div>
          </div>
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">Source</div>
            <div className="mt-1">
              <ChainBadge chainId={sourceChain.id} chainName={sourceChain.name} />
            </div>
          </div>
        </div>

        {/* Update Button */}
        <Button 
          className="w-full bg-brand-500 hover:bg-brand-600"
          onClick={onUpdateClick}
          disabled={isUpdating || isArchived}
        >
          {isUpdating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {feedSourceKind === 'FLARE_NATIVE' ? 'Updating...' : 'Updating...'}
            </>
          ) : isArchived ? (
            <>
              <Archive className="w-4 h-4 mr-2" />
              Archived
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" />
              {feedSourceKind === 'FLARE_NATIVE' ? (
                <>
                  Update Feed
                  <span className="ml-1 text-xs opacity-75">(Native)</span>
                </>
              ) : (
                <>
                  Update Feed
                  {!isFlareSource && (
                    <span className="ml-1 text-xs opacity-75">
                      ({sourceChain.name} → Flare)
                    </span>
                  )}
                </>
              )}
            </>
          )}
        </Button>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyToClipboard(feed.customFeedAddress, 'Feed address')}
            >
              <Copy className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4" />
            </Button>
            {isArchived ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" title="Restore feed">
                    <Undo2 className="w-4 h-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Restore this feed?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will move the feed back into your active list.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onRestoreClick}>Restore</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" title="Archive feed">
                    <Archive className="w-4 h-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Archive this feed?</AlertDialogTitle>
                    <AlertDialogDescription>
                      The feed contract stays on-chain forever. Archiving only hides it from your UI. It will be retained
                      for 30 days, then deleted from storage.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onArchiveClick}>Archive</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
          <a
            href={getExplorerUrl(14, 'address', feed.customFeedAddress)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="ghost" size="sm">
              <ExternalLink className="w-4 h-4 mr-1" />
              Explorer
            </Button>
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

// Integration code snippets
function IntegrationSnippets({ feedAddress }: { feedAddress: string }) {
  const [copied, setCopied] = useState<string | null>(null);

  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const solidityCode = `// Solidity - Read the latest price on-chain (view calls)
interface ICustomFeed {
    function latestValue() external view returns (uint256);
    function lastUpdateTimestamp() external view returns (uint64);
    function decimals() external pure returns (int8);
}

ICustomFeed feed = ICustomFeed(${feedAddress});
uint256 value = feed.latestValue();              // Price scaled by decimals()
uint64 timestamp = feed.lastUpdateTimestamp();   // Unix timestamp (seconds)
int8 decimals = feed.decimals();                 // Always 6 for this feed`;

  const jsCode = `// JavaScript/TypeScript - Read with viem
import { createPublicClient, http, formatUnits } from 'viem';
import { flare } from 'viem/chains';

const FEED_ADDRESS = '${feedAddress}';

const client = createPublicClient({
  chain: flare,
  transport: http('https://flare-api.flare.network/ext/bc/C/rpc'),
});

const abi = [
  { name: 'latestValue', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'decimals', type: 'function', stateMutability: 'pure', inputs: [], outputs: [{ type: 'int8' }] },
  { name: 'lastUpdateTimestamp', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint64' }] },
];

const [value, decimals, timestamp] = await Promise.all([
  client.readContract({ address: FEED_ADDRESS, abi, functionName: 'latestValue' }),
  client.readContract({ address: FEED_ADDRESS, abi, functionName: 'decimals' }),
  client.readContract({ address: FEED_ADDRESS, abi, functionName: 'lastUpdateTimestamp' }),
]);

console.log('Price:', formatUnits(value, Number(decimals)));
console.log('Last updated:', new Date(Number(timestamp) * 1000).toISOString());`;

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Integrate in your app:</p>
      
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Solidity</span>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-6 text-xs"
            onClick={() => copyCode(solidityCode, 'solidity')}
          >
            {copied === 'solidity' ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
            {copied === 'solidity' ? 'Copied!' : 'Copy'}
          </Button>
        </div>
        <pre className="p-2 rounded bg-black/50 text-xs overflow-x-auto max-h-24 text-green-400">
          <code>{solidityCode}</code>
        </pre>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">JavaScript</span>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-6 text-xs"
            onClick={() => copyCode(jsCode, 'js')}
          >
            {copied === 'js' ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
            {copied === 'js' ? 'Copied!' : 'Copy'}
          </Button>
        </div>
        <pre className="p-2 rounded bg-black/50 text-xs overflow-x-auto max-h-24 text-green-400">
          <code>{jsCode}</code>
        </pre>
      </div>
    </div>
  );
}

// Update Progress Modal
function UpdateProgressModal({
  isOpen,
  progress,
  onCancel,
  onRetryAttestation,
  feedAddress,
  sourceChainName,
}: {
  isOpen: boolean;
  progress: {
    step: UpdateStep;
    message: string;
    elapsed?: number;
    error?: string;
    txHash?: string;
    relayTxHash?: string;
    attestationTxHash?: string;
    updateTxHash?: string;
    nativeResult?: {
      value: bigint;
      decimals: number;
      timestamp: number;
      blockNumber: bigint;
      sqrtPriceX96: bigint;
      tick: number;
    };
    provenance?: {
      sourceKind: string;
      method: string;
      originChain: string;
      originChainId: number;
      timestamp: number;
      blockNumber?: number;
    };
  };
  onCancel: () => void;
  onRetryAttestation?: () => void;
  feedAddress?: string;
  sourceChainName?: string;
}) {
  if (!isOpen) return null;

  const progressValue = STEP_PROGRESS[progress.step];
  const isError = progress.step === 'error';
  const isSuccess = progress.step === 'success' || progress.step === 'native-success';
  const isNativeSuccess = progress.step === 'native-success';
  const canRetryAttestation =
    isError &&
    !!progress.txHash &&
    /verifier returned status/i.test(progress.message) &&
    /INVALID/i.test(progress.message);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className={`w-full ${isSuccess ? 'max-w-2xl' : 'max-w-md'}`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              {isSuccess ? (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              ) : isError ? (
                <AlertCircle className="w-5 h-5 text-red-500" />
              ) : (
                <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
              )}
              {isNativeSuccess
                ? 'Native Feed Updated!'
                : isSuccess
                  ? 'Feed Updated!'
                  : isError
                    ? 'Update Failed'
                    : 'Updating Feed'}
            </CardTitle>
            {!isSuccess && !isError && (
              <Button variant="ghost" size="icon" onClick={onCancel}>
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isError && !isSuccess && (
            <Progress value={progressValue} className="h-2" />
          )}
          
          <p className={`text-sm ${isError ? 'text-red-400' : 'text-muted-foreground'}`}>
            {progress.message}
          </p>

          {progress.elapsed !== undefined && !isSuccess && !isError && (
            <p className="text-xs text-muted-foreground">
              Elapsed: {progress.elapsed}s
            </p>
          )}

          {progress.step === 'switching-to-source' && sourceChainName && (
            <div className="p-3 rounded-lg bg-secondary/50 text-xs text-muted-foreground">
              <p className="font-medium mb-1">🔄 Network Switch Required</p>
              <p>Please approve switching to {sourceChainName} in your wallet to proceed.</p>
            </div>
          )}

          {progress.step === 'writing-native-update' && (
            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-xs text-muted-foreground">
              <p className="font-medium mb-1">⚡ Native Update</p>
              <p>
                Please confirm the transaction in your wallet. This writes the computed <code>slot0()</code> price into
                the feed contract.
              </p>
            </div>
          )}

          {progress.step === 'switching-to-flare' && (
            <div className="p-3 rounded-lg bg-secondary/50 text-xs text-muted-foreground">
              <p className="font-medium mb-1">🔄 Switching Back to Flare</p>
              <p>Please approve switching back to Flare for the attestation step.</p>
            </div>
          )}

          {progress.step === 'fetching-price' && (
            <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950 text-xs text-muted-foreground">
              <p className="font-medium mb-1">📡 Relay Mode</p>
              <p>Fetching price data from {sourceChainName} via relay. No wallet action needed for this step.</p>
            </div>
          )}

          {progress.step === 'relaying-price' && (
            <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950 text-xs text-muted-foreground">
              <p className="font-medium mb-1">📤 Relaying Price to Flare</p>
              <p>Please confirm the relay transaction in your wallet. This submits the price to the PriceRelay contract on Flare.</p>
            </div>
          )}

          {progress.step === 'waiting-finalization' && (
            <div className="p-3 rounded-lg bg-secondary/50 text-xs text-muted-foreground">
              <p className="font-medium mb-1">⏱️ FDC Finalization</p>
              <p>This typically takes 2-5 minutes. The transaction is being verified by Flare&apos;s decentralized attestation network.</p>
            </div>
          )}

          {/* Native Success - show price details */}
          {isNativeSuccess && progress.nativeResult && (
            <div className="border-t pt-4 mt-4 space-y-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-emerald-500" />
                  <p className="text-sm font-medium">Direct State Read Complete</p>
                </div>
                <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-xs space-y-2">
                  {progress.updateTxHash && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Update tx:</span>
                      <a
                        href={getExplorerUrl(progress.provenance?.originChainId ?? 14, 'tx', progress.updateTxHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono underline underline-offset-2"
                      >
                        {progress.updateTxHash.slice(0, 10)}…{progress.updateTxHash.slice(-8)}
                      </a>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Price:</span>
                    <span className="font-mono font-semibold">
                      {formatPrice(progress.nativeResult.value)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Block:</span>
                    <span className="font-mono">{progress.nativeResult.blockNumber.toString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Timestamp:</span>
                    <span className="font-mono">
                      {new Date(progress.nativeResult.timestamp * 1000).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">sqrtPriceX96:</span>
                    <span className="font-mono text-[10px] break-all">
                      {progress.nativeResult.sqrtPriceX96.toString().slice(0, 20)}...
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tick:</span>
                    <span className="font-mono">{progress.nativeResult.tick}</span>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground italic">
                  ⚡ No FDC attestation used — price read from pool state via <code>slot0()</code> and written on-chain
                </p>
              </div>
            </div>
          )}

          {/* Success - show verification evidence (FDC flows) + integration snippet (all flows) */}
          {isSuccess && feedAddress && (
            <div className="border-t pt-4 mt-4">
              {!isNativeSuccess && (
                <div className="space-y-3 mb-4">
                  <p className="text-sm font-medium">Verification evidence</p>
                  <div className="grid gap-2">
                    {progress.attestationTxHash && (
                      <a
                        href={getExplorerUrl(14, 'tx', progress.attestationTxHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full"
                      >
                        <Button variant="outline" className="w-full justify-between">
                          View attestation request tx
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      </a>
                    )}
                    {progress.updateTxHash && (
                      <a
                        href={getExplorerUrl(14, 'tx', progress.updateTxHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full"
                      >
                        <Button variant="outline" className="w-full justify-between">
                          View feed update tx (proof submitted)
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      </a>
                    )}
                    {progress.relayTxHash && (
                      <a
                        href={getExplorerUrl(14, 'tx', progress.relayTxHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full"
                      >
                        <Button variant="outline" className="w-full justify-between">
                          View relay tx
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      </a>
                    )}
                  </div>
                </div>
              )}

              <IntegrationSnippets feedAddress={feedAddress} />
            </div>
          )}

          {(isSuccess || isError) && (
            <div className="grid gap-2">
              {canRetryAttestation && onRetryAttestation && (
                <Button
                  className="w-full"
                  onClick={onRetryAttestation}
                  variant="secondary"
                >
                  Retry attestation (no new record tx)
                </Button>
              )}
              <Button 
                className="w-full" 
                onClick={onCancel}
                variant={isError ? 'destructive' : 'default'}
              >
                {isError ? 'Close' : 'Done'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function MonitorPage() {
  const {
    feeds,
    recorders,
    isLoading,
    refresh,
    getNormalizedFeed,
    includeArchived,
    setIncludeArchived,
    archiveFeed,
    restoreFeed,
  } = useFeeds();
  const chainId = useChainId();
  const { isConnected } = useAccount();
  const { updateFeed, progress, isUpdating, cancel } = useFeedUpdater();
  
  const [updatingFeedId, setUpdatingFeedId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const [nativeReadsByFeedId, setNativeReadsByFeedId] = useState<
    Record<
      string,
      {
        value: bigint;
        decimals: number;
        timestamp: number;
        blockNumber: bigint;
        sqrtPriceX96: bigint;
        tick: number;
      }
    >
  >({});
  const [nativeReadCountByFeedId, setNativeReadCountByFeedId] = useState<Record<string, number>>({});

  // Get all feeds (no longer filtered by network since feeds are always on Flare)
  const allFeeds = feeds;
  const visibleFeeds = includeArchived ? allFeeds : allFeeds.filter(f => !f.archivedAt);
  
  // Get the currently updating feed for source chain name display
  const updatingFeed = updatingFeedId ? allFeeds.find(f => f.id === updatingFeedId) : null;
  const updatingNormalized = updatingFeed ? getNormalizedFeed(updatingFeed) : null;

  const handleUpdateFeed = async (feed: StoredFeed) => {
    if (!isConnected) {
      toast.error('Please connect your wallet');
      return;
    }

    const normalized = getNormalizedFeed(feed);
    const sourceChainId = normalized.sourceChain.id;
    const isRelayFeed = normalized.sourceChain.category === 'relay';

    // Determine source kind for routing
    const feedSourceKind = feed.sourceKind || getSourceKind(sourceChainId);
    
    // Only validate recorder/relay for FDC_EXTERNAL feeds
    // FLARE_NATIVE feeds use direct state reads and don't need a recorder
    if (feedSourceKind === 'FDC_EXTERNAL') {
      if (isRelayFeed) {
        if (!feed.priceRelayAddress) {
          toast.error('Price relay address not found');
          return;
        }
      } else {
        const recorder = recorders.find(r => r.address === feed.priceRecorderAddress);
        if (!recorder) {
          toast.error('Price recorder not found');
          return;
        }
      }
    }

    setUpdatingFeedId(feed.id);

    try {
      await updateFeed(
        feed.priceRecorderAddress,
        normalized.sourcePoolAddress,
        feed.customFeedAddress,
        sourceChainId,
        feed.priceRelayAddress,  // Pass relay address for relay feeds
        undefined, // existingRecordTxHash
        feed.token0.decimals,
        feed.token1.decimals,
        feed.invertPrice
      );
      // Always refetch on-chain state after the update flow completes.
      // (updateFeed updates contracts, not feeds.json)
      setRefreshKey((k) => k + 1);
    } catch (error) {
      console.error('Update failed:', error);
    }
  };

  const handleArchive = async (feedId: string) => {
    try {
      await archiveFeed(feedId);
      toast.success('Feed archived');
    } catch (e) {
      toast.error((e as Error).message || 'Failed to archive feed');
    }
  };

  const handleRestore = async (feedId: string) => {
    try {
      await restoreFeed(feedId);
      toast.success('Feed restored');
    } catch (e) {
      toast.error((e as Error).message || 'Failed to restore feed');
    }
  };

  const handleCloseModal = () => {
    // For FLARE_NATIVE direct reads, cache the last read so the card can reflect it.
    // (Avoids using an effect just to update local state.)
    if (progress.step === 'native-success' && updatingFeedId && progress.nativeResult) {
      setNativeReadsByFeedId(prev => ({ ...prev, [updatingFeedId]: progress.nativeResult! }));
      setNativeReadCountByFeedId(prev => ({ ...prev, [updatingFeedId]: (prev[updatingFeedId] ?? 0) + 1 }));
    }

    if (isUpdating) {
      cancel();
    }
    setUpdatingFeedId(null);
  };

  const handleRetryAttestation = async () => {
    if (!updatingFeedId) return;
    if (!progress.txHash) {
      toast.error('No transaction hash to retry');
      return;
    }

    const feed = allFeeds.find(f => f.id === updatingFeedId);
    if (!feed) return;

    const normalized = getNormalizedFeed(feed);
    const sourceChainId = normalized.sourceChain.id;

    try {
      await updateFeed(
        feed.priceRecorderAddress,
        normalized.sourcePoolAddress,
        feed.customFeedAddress,
        sourceChainId,
        feed.priceRelayAddress,
        progress.txHash as `0x${string}`
      );
    } catch (error) {
      console.error('Retry attestation failed:', error);
    }
  };

  return (
    <div className="min-h-screen">
      <Header 
        title="Monitor" 
        description="View your deployed custom feeds"
      />

      <div className="p-6 space-y-6">
        {/* Actions Bar */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">
              {visibleFeeds.length} Feed{visibleFeeds.length !== 1 ? 's' : ''} on Flare
            </h2>
            <p className="text-sm text-muted-foreground">
              Feeds can source prices from Flare, Ethereum, and 17 additional EVM chains.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={includeArchived ? 'secondary' : 'outline'}
              onClick={() => setIncludeArchived(!includeArchived)}
            >
              {includeArchived ? 'Hide Archived' : 'Show Archived'}
            </Button>
            <Button variant="outline" onClick={refresh}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Feeds Grid */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">
            Loading feeds...
          </div>
        ) : visibleFeeds.length > 0 ? (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
            {visibleFeeds.map((feed) => {
              const normalized = getNormalizedFeed(feed);
              return (
                <FeedCard 
                  key={feed.id} 
                  feed={feed}
                  normalizedFeed={normalized}
                  chainId={chainId}
                  onUpdateClick={() => handleUpdateFeed(feed)}
                  onArchiveClick={() => handleArchive(feed.id)}
                  onRestoreClick={() => handleRestore(feed.id)}
                  isUpdating={isUpdating && updatingFeedId === feed.id}
                  refreshKey={refreshKey}
                  nativeRead={nativeReadsByFeedId[feed.id]}
                  nativeReadCount={nativeReadCountByFeedId[feed.id]}
                />
              );
            })}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <Activity className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No feeds yet</h3>
              <p className="text-muted-foreground mb-6">
                Deploy your first custom feed to start monitoring prices.
              </p>
              <Link href="/dashboard/deploy">
                <Button className="bg-brand-500 hover:bg-brand-600">
                  Deploy Feed
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Update Progress Modal */}
      <UpdateProgressModal
        isOpen={updatingFeedId !== null}
        progress={progress}
        onCancel={handleCloseModal}
        onRetryAttestation={handleRetryAttestation}
        feedAddress={updatingFeed?.customFeedAddress}
        sourceChainName={updatingNormalized?.sourceChain.name}
      />
    </div>
  );
}
