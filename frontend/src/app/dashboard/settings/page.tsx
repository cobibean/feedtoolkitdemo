'use client';

import { useState, useMemo } from 'react';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFeeds } from '@/context/feeds-context';
import { useStorageMode, type StorageMode } from '@/context/storage-mode-context';
import { useChainId } from 'wagmi';
import { toast } from 'sonner';
import { 
  Copy, 
  Download, 
  Settings,
  Terminal,
  FileCode,
  AlertCircle,
  Bot,
  ExternalLink,
  Database,
  HardDrive
} from 'lucide-react';
import Link from 'next/link';
import type { NetworkId, StoredFeed, StoredRecorder } from '@/lib/types';

function generateBotEnvConfig(
  feeds: StoredFeed[],
  recorders: StoredRecorder[],
  privateKeyPlaceholder: boolean = true
): string {
  const lines: string[] = [
    '# ================================================',
    '# Flare Custom Feeds Bot Configuration',
    '# Network: Flare Mainnet',
    `# Generated: ${new Date().toISOString()}`,
    '# ================================================',
    '',
    '# Deployer wallet (KEEP SECRET - DO NOT COMMIT)',
    privateKeyPlaceholder 
      ? 'DEPLOYER_PRIVATE_KEY=0x_YOUR_PRIVATE_KEY_HERE'
      : '# DEPLOYER_PRIVATE_KEY already set',
    '',
    '# Network RPC',
    'FLARE_RPC_URL=https://flare-api.flare.network/ext/bc/C/rpc',
    '',
  ];
  
  // Group recorders by chain
  const flareRecorders = recorders.filter(r => (r.chainId ?? 14) === 14);
  if (flareRecorders.length > 0) {
    lines.push('# Price Recorder Contract (Flare)');
    lines.push(`PRICE_RECORDER_ADDRESS=${flareRecorders[0].address}`);
    lines.push('');
  }
  
  if (feeds.length > 0) {
    // Separate feeds by type
    const directFeeds = feeds.filter(f => f.sourceChain?.category !== 'relay');
    const relayFeeds = feeds.filter(f => f.sourceChain?.category === 'relay');
    
    if (directFeeds.length > 0) {
      lines.push('# Direct Feeds (Flare, Ethereum)');
      lines.push('# Format: POOL_ADDRESS_<ALIAS> and CUSTOM_FEED_ADDRESS_<ALIAS>');
      lines.push('');
      
      for (const feed of directFeeds) {
        const sourceChainName = feed.sourceChain?.name || 'Flare';
        lines.push(`# ${feed.alias} [${sourceChainName}]`);
        lines.push(`POOL_ADDRESS_${feed.alias}=${feed.sourcePoolAddress || feed.poolAddress}`);
        lines.push(`CUSTOM_FEED_ADDRESS_${feed.alias}=${feed.customFeedAddress}`);
        if (feed.sourceChain && feed.sourceChain.id !== 14) {
          lines.push(`SOURCE_CHAIN_ID_${feed.alias}=${feed.sourceChain.id}`);
        }
        lines.push('');
      }
    }
    
    if (relayFeeds.length > 0) {
      lines.push('# Relay Feeds (Arbitrum, Base, Optimism, Polygon)');
      lines.push('# These use PriceRelay contract instead of PriceRecorder');
      lines.push('');
      
      for (const feed of relayFeeds) {
        const sourceChainName = feed.sourceChain?.name || 'Unknown';
        lines.push(`# ${feed.alias} [${sourceChainName}] - RELAY`);
        lines.push(`POOL_ADDRESS_${feed.alias}=${feed.sourcePoolAddress || feed.poolAddress}`);
        lines.push(`CUSTOM_FEED_ADDRESS_${feed.alias}=${feed.customFeedAddress}`);
        lines.push(`SOURCE_CHAIN_ID_${feed.alias}=${feed.sourceChain?.id}`);
        if (feed.priceRelayAddress) {
          lines.push(`PRICE_RELAY_ADDRESS_${feed.alias}=${feed.priceRelayAddress}`);
        }
        lines.push('');
      }
    }
  }
  
  lines.push('# Bot Settings (optional)');
  lines.push('BOT_CHECK_INTERVAL_SECONDS=60');
  lines.push('BOT_LOG_LEVEL=compact');
  lines.push('BOT_LOG_FILE_ENABLED=true');
  lines.push('');
  lines.push('# Frontend Bot (for hosted deployments)');
  lines.push('# NEXT_PUBLIC_APP_URL=http://localhost:3000');
  
  return lines.join('\n');
}

function downloadEnvFile(content: string, filename: string = 'bot.env'): void {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function SettingsPage() {
  const { feeds, recorders, refresh } = useFeeds();
  const { storageMode, setStorageMode } = useStorageMode();
  const chainId = useChainId();

  // All feeds (no network filter since feeds are always on Flare)
  const allFeeds = feeds.filter(f => !f.archivedAt);

  const [selectedFeeds, setSelectedFeeds] = useState<Set<string>>(new Set());

  const toggleFeed = (feedId: string) => {
    setSelectedFeeds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(feedId)) {
        newSet.delete(feedId);
      } else {
        newSet.add(feedId);
      }
      return newSet;
    });
  };

  const selectAllFeeds = () => {
    setSelectedFeeds(new Set(allFeeds.map(f => f.id)));
  };

  const clearSelection = () => {
    setSelectedFeeds(new Set());
  };

  const selectedFeedsArray = useMemo(() => 
    allFeeds.filter(f => selectedFeeds.has(f.id)),
    [allFeeds, selectedFeeds]
  );

  const generatedConfig = useMemo(() => {
    return generateBotEnvConfig(selectedFeedsArray, recorders);
  }, [selectedFeedsArray, recorders]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedConfig);
    toast.success('Configuration copied to clipboard');
  };

  const handleDownload = () => {
    downloadEnvFile(generatedConfig, `bot-config.env`);
    toast.success('Configuration file downloaded');
  };

  const dbConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const handleStorageModeChange = async (mode: StorageMode) => {
    if (mode === storageMode) return;
    if (mode === 'database' && !dbConfigured) {
      toast.error('Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
      return;
    }

    setStorageMode(mode);
    toast.success(`Storage mode set to ${mode === 'database' ? 'Database' : 'Local JSON'}`);
    await refresh();
  };

  return (
    <div className="min-h-screen">
      <Header 
        title="Settings" 
        description="Configure bot settings and export configurations"
      />

      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <Tabs defaultValue="bot-config" className="space-y-6">
          <TabsList>
            <TabsTrigger value="bot-config">
              <Terminal className="w-4 h-4 mr-2" />
              Export Config
            </TabsTrigger>
            <TabsTrigger value="frontend-bot">
              <Bot className="w-4 h-4 mr-2" />
              Frontend Bot
            </TabsTrigger>
            <TabsTrigger value="storage">
              <Database className="w-4 h-4 mr-2" />
              Storage
            </TabsTrigger>
            <TabsTrigger value="about">
              <Settings className="w-4 h-4 mr-2" />
              About
            </TabsTrigger>
          </TabsList>

          <TabsContent value="bot-config" className="space-y-6">
            {/* Export Bot Config */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileCode className="w-5 h-5 text-brand-500" />
                  Export Bot Configuration
                </CardTitle>
                <CardDescription>
                  Generate environment variables for running the price update bot
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Feed Selection */}
                {allFeeds.length > 0 ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label>Select feeds to include</Label>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={selectAllFeeds}>
                          Select All
                        </Button>
                        <Button variant="ghost" size="sm" onClick={clearSelection}>
                          Clear
                        </Button>
                      </div>
                    </div>
                    
                    <div className="grid gap-2">
                      {allFeeds.map((feed) => (
                        <div
                          key={feed.id}
                          className="flex items-center space-x-3 p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
                        >
                          <Checkbox
                            id={feed.id}
                            checked={selectedFeeds.has(feed.id)}
                            onCheckedChange={() => toggleFeed(feed.id)}
                          />
                          <Label
                            htmlFor={feed.id}
                            className="flex-1 cursor-pointer font-normal"
                          >
                            <span className="font-semibold">{feed.alias}</span>
                            <span className="text-muted-foreground ml-2">
                              ({feed.token0.symbol}/{feed.token1.symbol})
                            </span>
                            {feed.sourceChain?.category === 'relay' && (
                              <span className="ml-2 text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 px-1.5 py-0.5 rounded">
                                Relay
                              </span>
                            )}
                            {feed.sourceChain && feed.sourceChain.id !== 14 && feed.sourceChain.category !== 'relay' && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                ({feed.sourceChain.name})
                              </span>
                            )}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No feeds deployed yet.</p>
                  </div>
                )}

                {/* Config Preview */}
                <div className="space-y-2">
                  <Label>Generated Configuration</Label>
                  <div className="relative">
                    <pre className="p-4 rounded-lg bg-black text-green-400 text-sm font-mono overflow-x-auto max-h-80">
                      {generatedConfig}
                    </pre>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <Button onClick={copyToClipboard} className="flex-1">
                    <Copy className="w-4 h-4 mr-2" />
                    Copy to Clipboard
                  </Button>
                  <Button variant="outline" onClick={handleDownload} className="flex-1">
                    <Download className="w-4 h-4 mr-2" />
                    Download .env
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Bot Instructions */}
            <Card>
              <CardHeader>
                <CardTitle>Running the Bot</CardTitle>
                <CardDescription>
                  Instructions for running the price update bot
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ol className="list-decimal list-inside space-y-3 text-sm">
                  <li>
                    Copy the generated configuration above to your <code className="px-1 py-0.5 rounded bg-secondary">.env</code> file in the project root
                  </li>
                  <li>
                    Add your wallet private key to the <code className="px-1 py-0.5 rounded bg-secondary">DEPLOYER_PRIVATE_KEY</code> field
                  </li>
                  <li>
                    Ensure your wallet has sufficient FLR for gas and FDC attestation fees (~1.01 FLR per update)
                  </li>
                  <li>
                    Start the bot with:
                    <pre className="mt-2 p-3 rounded-lg bg-black text-green-400 font-mono text-sm">
                      npm run bot:start
                    </pre>
                  </li>
                </ol>

                <div className="p-4 rounded-lg bg-brand-500/10 border border-brand-500/20">
                  <h4 className="font-semibold text-brand-500 mb-2">💡 Tip</h4>
                  <p className="text-sm text-muted-foreground">
                    The bot will automatically record prices, request FDC attestations, and submit proofs to update your custom feeds.
                    Monitor the console output for status updates.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="frontend-bot" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="w-5 h-5 text-brand-500" />
                  Frontend Bot Control
                </CardTitle>
                <CardDescription>
                  Run and monitor the bot directly from the web interface
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  For hosted deployments, you can control the bot from the frontend instead of running 
                  it in the terminal. This is useful when deploying to platforms like Vercel, Railway, 
                  or any cloud provider.
                </p>

                <div className="p-4 rounded-lg bg-brand-500/10 border border-brand-500/20">
                  <h4 className="font-semibold text-brand-500 mb-2">Features</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Start/stop bot from the dashboard</li>
                    <li>• Real-time log streaming</li>
                    <li>• Per-feed statistics</li>
                    <li>• Supports both direct and relay chains</li>
                  </ul>
                </div>

                <Link href="/dashboard/bot">
                  <Button className="w-full bg-brand-500 hover:bg-brand-600">
                    <Bot className="w-4 h-4 mr-2" />
                    Open Bot Dashboard
                    <ExternalLink className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Environment Setup</CardTitle>
                <CardDescription>
                  Required for frontend bot operation
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Add these environment variables to your deployment:
                </p>
                <pre className="p-4 rounded-lg bg-black text-green-400 text-sm font-mono overflow-x-auto">
{`# Required for bot operation
DEPLOYER_PRIVATE_KEY=0x_YOUR_PRIVATE_KEY

# Optional: For hosted deployments
NEXT_PUBLIC_APP_URL=https://your-domain.com`}
                </pre>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="storage" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="w-5 h-5 text-brand-500" />
                  Storage Mode
                </CardTitle>
                <CardDescription>
                  Choose where deployed feeds are stored and loaded from. This setting is saved in a cookie.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Current mode</Label>
                  <div className="flex items-center gap-3">
                    <Select value={storageMode} onValueChange={(v) => handleStorageModeChange(v as StorageMode)}>
                      <SelectTrigger className="w-[260px]">
                        <SelectValue placeholder="Select storage mode" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="local">
                          <span className="flex items-center gap-2">
                            <HardDrive className="w-4 h-4" />
                            Local JSON
                          </span>
                        </SelectItem>
                        <SelectItem value="database" disabled={!dbConfigured}>
                          <span className="flex items-center gap-2">
                            <Database className="w-4 h-4" />
                            Database (Supabase)
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {!dbConfigured && (
                      <span className="text-xs text-muted-foreground">
                        Database disabled (missing env vars)
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Switching storage mode will reload feeds from the selected backend.
                  </p>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg border bg-secondary/30">
                    <div className="flex items-center gap-2 font-semibold">
                      <HardDrive className="w-4 h-4 text-muted-foreground" />
                      Local JSON
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Stores feeds in <code className="px-1 py-0.5 rounded bg-secondary">frontend/data/feeds.json</code>.
                      Best for self-hosted demos and local dev.
                    </p>
                  </div>
                  <div className="p-4 rounded-lg border bg-secondary/30">
                    <div className="flex items-center gap-2 font-semibold">
                      <Database className="w-4 h-4 text-muted-foreground" />
                      Database (Supabase)
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Stores feeds in Supabase for shared/hosted deployments. Requires
                      <code className="px-1 py-0.5 rounded bg-secondary ml-1">NEXT_PUBLIC_SUPABASE_URL</code> and
                      <code className="px-1 py-0.5 rounded bg-secondary ml-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="about" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>About Flare Custom Feeds</CardTitle>
                <CardDescription>
                  An open-source toolkit for creating FDC-verified price feeds
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <h4 className="font-semibold">What are Custom Feeds?</h4>
                  <p className="text-sm text-muted-foreground">
                    Custom feeds allow you to create your own price feeds from Uniswap V3 pools on Flare Network.
                    Each price update is cryptographically attested through the Flare Data Connector (FDC),
                    ensuring trustworthy and verifiable price data.
                  </p>
                </div>

                <div className="space-y-2">
                  <h4 className="font-semibold">How It Works</h4>
                  <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1">
                    <li>Deploy a PriceRecorder contract to capture pool prices</li>
                    <li>Deploy a CustomFeed contract for each pool you want to track</li>
                    <li>Run the bot to record prices and submit FDC attestations</li>
                    <li>Your custom feed updates automatically with verified prices</li>
                  </ol>
                </div>

                <div className="space-y-2">
                  <h4 className="font-semibold">Cost per Update</h4>
                  <div className="text-sm text-muted-foreground">
                    <p>~0.002 FLR (record price gas)</p>
                    <p>~1.0 FLR (FDC attestation fee)</p>
                    <p>~0.004 FLR (submit proof gas)</p>
                    <p className="font-semibold mt-1">Total: ~1.01 FLR per update</p>
                  </div>
                </div>

                <div className="pt-4 border-t border-border">
                  <p className="text-sm text-muted-foreground">
                    Built by{' '}
                    <a href="https://flareforward.com" target="_blank" rel="noopener noreferrer" className="text-brand-500 hover:underline">
                      Flare Forward
                    </a>
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

