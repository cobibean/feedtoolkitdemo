'use client';

/**
 * Feed Verification Page
 * 
 * This page provides a reviewer-friendly verification surface that:
 * 1. Lists all configured feeds with their provenance metadata
 * 2. Shows sourceKind (FLARE_NATIVE vs FDC_EXTERNAL)
 * 3. Allows live testing of direct state reads for Flare-native feeds
 * 4. Demonstrates that FDC is only used for external chains
 */

import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useFeeds } from '@/context/feeds-context';
import { ProvenanceBadge } from '@/components/ui/provenance-badge';
import { getSourceKind, type SourceKind, type PriceMethod, type DirectStateResult } from '@/lib/types';
import { readFlareNativePrice } from '@/lib/priceSources/flareNative';
import { 
  CheckCircle2, 
  XCircle, 
  Zap, 
  Shield, 
  RefreshCw,
  Clock,
  Hash,
  Activity,
  Loader2,
  Info
} from 'lucide-react';

interface VerificationResult {
  feedId: string;
  status: 'pending' | 'loading' | 'success' | 'error';
  result?: DirectStateResult;
  error?: string;
  elapsedMs?: number;
}

function formatPrice(value: bigint | undefined, decimals: number = 6): string {
  if (!value) return '—';
  const num = Number(value) / Math.pow(10, decimals);
  if (num >= 1000) return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (num >= 1) return num.toLocaleString('en-US', { maximumFractionDigits: 4 });
  return num.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

export default function VerifyPage() {
  const { feeds, isLoading, getNormalizedFeed } = useFeeds();
  const [verificationResults, setVerificationResults] = useState<Record<string, VerificationResult>>({});
  const [isVerifyingAll, setIsVerifyingAll] = useState(false);

  const activeFeeds = feeds.filter(f => !f.archivedAt);

  // Group feeds by source kind
  const flareNativeFeeds = activeFeeds.filter(f => {
    const normalized = getNormalizedFeed(f);
    return getSourceKind(normalized.sourceChain.id) === 'FLARE_NATIVE';
  });

  const fdcExternalFeeds = activeFeeds.filter(f => {
    const normalized = getNormalizedFeed(f);
    return getSourceKind(normalized.sourceChain.id) === 'FDC_EXTERNAL';
  });

  // Verify a single Flare-native feed
  const verifyNativeFeed = async (feedId: string) => {
    const feed = activeFeeds.find(f => f.id === feedId);
    if (!feed) return;

    const normalized = getNormalizedFeed(feed);
    const poolAddress = normalized.sourcePoolAddress;

    setVerificationResults(prev => ({
      ...prev,
      [feedId]: { feedId, status: 'loading' }
    }));

    const startTime = Date.now();

    try {
      const result = await readFlareNativePrice(
        poolAddress,
        feed.token0.decimals,
        feed.token1.decimals,
        feed.invertPrice,
        6,  // outputDecimals
        normalized.sourceChain.id  // originChainId (14 for Flare, 114 for Coston2)
      );

      const elapsedMs = Date.now() - startTime;

      setVerificationResults(prev => ({
        ...prev,
        [feedId]: {
          feedId,
          status: 'success',
          result,
          elapsedMs,
        }
      }));
    } catch (error) {
      const elapsedMs = Date.now() - startTime;
      setVerificationResults(prev => ({
        ...prev,
        [feedId]: {
          feedId,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
          elapsedMs,
        }
      }));
    }
  };

  // Verify all Flare-native feeds
  const verifyAllNativeFeeds = async () => {
    setIsVerifyingAll(true);
    for (const feed of flareNativeFeeds) {
      await verifyNativeFeed(feed.id);
    }
    setIsVerifyingAll(false);
  };

  return (
    <div className="min-h-screen">
      <Header 
        title="Feed Verification" 
        description="Verify price computation methods for all configured feeds"
      />

      <div className="p-6 space-y-8">
        {/* Summary Cards */}
        <div className="grid md:grid-cols-3 gap-4">
          <Card className="border-emerald-200 dark:border-emerald-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="w-4 h-4 text-emerald-500" />
                Flare-Native Feeds
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-emerald-600">{flareNativeFeeds.length}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Direct on-chain state reads (no FDC)
              </p>
            </CardContent>
          </Card>

          <Card className="border-blue-200 dark:border-blue-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-500" />
                FDC External Feeds
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">{fdcExternalFeeds.length}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Cross-chain FDC attestation
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Total Feeds
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{activeFeeds.length}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Across all source chains
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Explanation Box */}
        <Card className="bg-secondary/50">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
              <div className="space-y-2 text-sm">
                <p className="font-semibold">How price computation works:</p>
                <ul className="space-y-1 text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <Zap className="w-3 h-3 text-emerald-500" />
                    <strong>Flare-Native:</strong> Prices are read directly from pool storage via <code className="text-xs bg-black/20 px-1 rounded">slot0().sqrtPriceX96</code> — fast, cheap, no FDC needed.
                  </li>
                  <li className="flex items-center gap-2">
                    <Shield className="w-3 h-3 text-blue-500" />
                    <strong>FDC External:</strong> Prices from other chains require FDC attestation to verify cross-chain data.
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Flare-Native Feeds Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Zap className="w-5 h-5 text-emerald-500" />
                Flare-Native Feeds
              </h2>
              <p className="text-sm text-muted-foreground">
                Direct on-chain state reads — click to verify
              </p>
            </div>
            <Button 
              onClick={verifyAllNativeFeeds}
              disabled={isVerifyingAll || flareNativeFeeds.length === 0}
              variant="outline"
            >
              {isVerifyingAll ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Verify All
                </>
              )}
            </Button>
          </div>

          {flareNativeFeeds.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center text-muted-foreground">
                No Flare-native feeds configured
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {flareNativeFeeds.map(feed => {
                const normalized = getNormalizedFeed(feed);
                const verification = verificationResults[feed.id];
                const sourceKind: SourceKind = feed.sourceKind || 'FLARE_NATIVE';
                const method: PriceMethod = feed.method || 'SLOT0_SPOT';

                return (
                  <Card key={feed.id} className="overflow-hidden">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-base">{feed.alias}</CardTitle>
                          <CardDescription className="font-mono text-xs">
                            {feed.token0.symbol}/{feed.token1.symbol}
                          </CardDescription>
                        </div>
                        <ProvenanceBadge 
                          sourceKind={sourceKind}
                          method={method}
                          originChain={normalized.sourceChain.name}
                        />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Feed Details */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-muted-foreground">Pool:</span>
                          <span className="font-mono ml-1">{normalized.sourcePoolAddress.slice(0, 10)}...</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Method:</span>
                          <span className="font-mono ml-1">{method}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Origin:</span>
                          <span className="ml-1">{normalized.sourceChain.name}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Decimals:</span>
                          <span className="font-mono ml-1">{feed.token0.decimals}/{feed.token1.decimals}</span>
                        </div>
                      </div>

                      {/* Verification Result */}
                      {verification && (
                        <div className={`p-3 rounded-lg text-xs ${
                          verification.status === 'success' 
                            ? 'bg-emerald-50 dark:bg-emerald-900/20' 
                            : verification.status === 'error'
                            ? 'bg-red-50 dark:bg-red-900/20'
                            : 'bg-secondary/50'
                        }`}>
                          {verification.status === 'loading' && (
                            <div className="flex items-center gap-2">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Reading from slot0()...
                            </div>
                          )}
                          {verification.status === 'success' && verification.result && (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 className="w-4 h-4" />
                                <span className="font-medium">Direct State Read Successful</span>
                                <span className="text-muted-foreground ml-auto">
                                  {verification.elapsedMs}ms
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-emerald-200 dark:border-emerald-800">
                                <div className="flex items-center gap-1">
                                  <Activity className="w-3 h-3 text-muted-foreground" />
                                  <span className="text-muted-foreground">Price:</span>
                                  <span className="font-mono font-semibold">
                                    {formatPrice(verification.result.value, verification.result.decimals)}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Hash className="w-3 h-3 text-muted-foreground" />
                                  <span className="text-muted-foreground">Block:</span>
                                  <span className="font-mono">{verification.result.blockNumber.toString()}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-muted-foreground" />
                                  <span className="text-muted-foreground">Timestamp:</span>
                                  <span className="font-mono">
                                    {new Date(verification.result.timestamp * 1000).toLocaleTimeString()}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="text-muted-foreground">Tick:</span>
                                  <span className="font-mono">{verification.result.tick}</span>
                                </div>
                              </div>
                              <div className="pt-2 text-[10px] text-muted-foreground">
                                sqrtPriceX96: <code className="font-mono">{verification.result.sqrtPriceX96.toString()}</code>
                              </div>
                            </div>
                          )}
                          {verification.status === 'error' && (
                            <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                              <XCircle className="w-4 h-4" />
                              <span>{verification.error}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Verify Button */}
                      <Button 
                        onClick={() => verifyNativeFeed(feed.id)}
                        disabled={verification?.status === 'loading'}
                        variant="outline"
                        size="sm"
                        className="w-full"
                      >
                        {verification?.status === 'loading' ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Zap className="w-4 h-4 mr-2" />
                        )}
                        {verification?.status === 'success' ? 'Re-verify' : 'Verify (Direct State Read)'}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* FDC External Feeds Section */}
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-500" />
              FDC External Feeds
            </h2>
            <p className="text-sm text-muted-foreground">
              Cross-chain feeds requiring FDC attestation
            </p>
          </div>

          {fdcExternalFeeds.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center text-muted-foreground">
                No FDC external feeds configured
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {fdcExternalFeeds.map(feed => {
                const normalized = getNormalizedFeed(feed);
                const sourceKind: SourceKind = feed.sourceKind || 'FDC_EXTERNAL';
                const method: PriceMethod = feed.method || 'FDC_ATTESTATION';

                return (
                  <Card key={feed.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-base">{feed.alias}</CardTitle>
                          <CardDescription className="font-mono text-xs">
                            {feed.token0.symbol}/{feed.token1.symbol}
                          </CardDescription>
                        </div>
                        <ProvenanceBadge 
                          sourceKind={sourceKind}
                          method={method}
                          originChain={normalized.sourceChain.name}
                        />
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-muted-foreground">Source Pool:</span>
                          <span className="font-mono ml-1">{normalized.sourcePoolAddress.slice(0, 10)}...</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Origin Chain:</span>
                          <span className="ml-1">{normalized.sourceChain.name}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Method:</span>
                          <span className="font-mono ml-1">{method}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Category:</span>
                          <span className="ml-1 capitalize">{normalized.sourceChain.category}</span>
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-3 italic">
                        🔒 This feed requires FDC attestation to verify cross-chain data from {normalized.sourceChain.name}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Summary */}
        <Card className="bg-gradient-to-r from-emerald-50 to-blue-50 dark:from-emerald-900/20 dark:to-blue-900/20">
          <CardContent className="py-4">
            <h3 className="font-semibold mb-2">Verification Summary</h3>
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div className="flex items-start gap-2">
                <Zap className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Flare-native pools</p>
                  <p className="text-muted-foreground text-xs">
                    Use direct <code className="bg-black/10 px-1 rounded">slot0()</code> state reads. 
                    No FDC attestation, no event logs, no indexers.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Shield className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">External-chain pools</p>
                  <p className="text-muted-foreground text-xs">
                    Require FDC attestation to bring verified price data cross-chain.
                    Uses PriceRecorder events or PriceRelay.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

