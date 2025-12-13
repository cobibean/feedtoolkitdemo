'use client';

import { Header } from '@/components/layout/header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useFeeds } from '@/context/feeds-context';
import { useChainId } from 'wagmi';
import { Rocket, Activity, Database, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { getChainById as getWalletChainById, flare } from '@/lib/wagmi-config';

export default function DashboardPage() {
  const { feeds, recorders, isLoading } = useFeeds();
  const chainId = useChainId();
  const walletChain = getWalletChainById(chainId);
  const walletNetworkLabel = walletChain
    ? `${walletChain.name} ${walletChain.testnet ? 'Testnet' : 'Mainnet'}`
    : `Unsupported (Chain ID: ${chainId})`;

  const networkFeeds = feeds.filter(f => f.network === 'flare' && !f.archivedAt);
  const networkRecorders = recorders.filter(r => r.network === 'flare' && !r.archivedAt);

  return (
    <div className="min-h-screen">
      <Header 
        title="Dashboard" 
        description="Manage your custom price feeds on Flare"
      />

      <div className="p-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Price Recorders
              </CardTitle>
              <Database className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-display">{networkRecorders.length}</div>
              <p className="text-xs text-muted-foreground mt-1">On Mainnet</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Custom Feeds
              </CardTitle>
              <Activity className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-display">{networkFeeds.length}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Active feeds deployed
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Wallet Network
              </CardTitle>
              <div className="w-2 h-2 rounded-full bg-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-display">{walletNetworkLabel}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Home chain: {flare.name} Mainnet (Chain ID: {flare.id})
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>
              Get started with deploying your custom price feeds
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4">
              {networkRecorders.length === 0 ? (
                <Link href="/dashboard/deploy" className="block">
                  <div className="p-4 rounded-lg border border-dashed border-brand-500/50 bg-brand-500/5 hover:bg-brand-500/10 transition-colors cursor-pointer group">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-lg bg-brand-500/20 flex items-center justify-center">
                        <Rocket className="w-5 h-5 text-brand-500" />
                      </div>
                      <div>
                        <h3 className="font-semibold">Deploy Price Recorder</h3>
                        <p className="text-sm text-muted-foreground">
                          First step: deploy a recorder contract
                        </p>
                      </div>
                      <ArrowRight className="w-5 h-5 ml-auto text-brand-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                </Link>
              ) : (
                <Link href="/dashboard/deploy" className="block">
                  <div className="p-4 rounded-lg border border-border hover:border-brand-500/50 transition-colors cursor-pointer group">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                        <Rocket className="w-5 h-5 text-brand-500" />
                      </div>
                      <div>
                        <h3 className="font-semibold">Deploy New Feed</h3>
                        <p className="text-sm text-muted-foreground">
                          Create a feed for a V3 pool
                        </p>
                      </div>
                      <ArrowRight className="w-5 h-5 ml-auto text-brand-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                </Link>
              )}

              <Link href="/dashboard/monitor" className="block">
                <div className="p-4 rounded-lg border border-border hover:border-brand-500/50 transition-colors cursor-pointer group">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                      <Activity className="w-5 h-5 text-brand-500" />
                    </div>
                    <div>
                      <h3 className="font-semibold">Monitor Feeds</h3>
                      <p className="text-sm text-muted-foreground">
                        View feed status and prices
                      </p>
                    </div>
                    <ArrowRight className="w-5 h-5 ml-auto text-brand-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Recent Feeds */}
        {networkFeeds.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Recent Feeds</CardTitle>
              <CardDescription>
                Your deployed custom feeds on Mainnet
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {networkFeeds.slice(0, 5).map((feed) => (
                  <div
                    key={feed.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-secondary/50"
                  >
                    <div>
                      <h4 className="font-semibold">{feed.alias}</h4>
                      <p className="text-sm text-muted-foreground font-mono">
                        {feed.token0.symbol}/{feed.token1.symbol}
                      </p>
                    </div>
                    <Link href="/dashboard/monitor">
                      <Button variant="ghost" size="sm">
                        View <ArrowRight className="w-4 h-4 ml-1" />
                      </Button>
                    </Link>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {!isLoading && networkFeeds.length === 0 && networkRecorders.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-brand-500/10 flex items-center justify-center mx-auto mb-4">
                <Rocket className="w-8 h-8 text-brand-500" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No feeds yet</h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                Get started by deploying a Price Recorder contract, then create your first custom feed.
              </p>
              <Link href="/dashboard/deploy">
                <Button className="bg-brand-500 hover:bg-brand-600">
                  <Rocket className="w-4 h-4 mr-2" />
                  Deploy Your First Feed
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
