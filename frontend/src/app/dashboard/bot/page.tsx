'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useBot } from '@/hooks/use-bot';
import { useFeeds } from '@/context/feeds-context';
import { 
  Play, 
  Square, 
  RefreshCw, 
  Activity,
  Clock,
  CheckCircle2,
  XCircle,
  Terminal,
  Zap,
  AlertTriangle,
  Settings,
  Maximize2,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import type { BotLogEntry } from '@/lib/bot-service';

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

function LogEntry({ entry }: { entry: BotLogEntry }) {
  const levelColors = {
    debug: 'text-gray-400',
    info: 'text-blue-400',
    warn: 'text-yellow-400',
    error: 'text-red-400',
  };

  const levelIcons = {
    debug: '🔍',
    info: '📝',
    warn: '⚠️',
    error: '❌',
  };

  const time = new Date(entry.timestamp).toLocaleTimeString();

  return (
    <div className={`font-mono text-xs ${levelColors[entry.level]} py-0.5`}>
      <span className="text-muted-foreground">[{time}]</span>{' '}
      <span>{levelIcons[entry.level]}</span>{' '}
      <span>{entry.message}</span>
    </div>
  );
}

export default function BotPage() {
  const { 
    status, 
    stats, 
    logs, 
    config,
    isLoading, 
    error, 
    start, 
    stop, 
    refresh 
  } = useBot();
  
  const { feeds } = useFeeds();
  const [showPrivateKeyInput, setShowPrivateKeyInput] = useState(false);
  const [privateKey, setPrivateKey] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [selectedFeedIds, setSelectedFeedIds] = useState<string[]>([]);
  const didInitSelectionRef = useRef(false);
  const [isTerminalFullscreenOpen, setIsTerminalFullscreenOpen] = useState(false);

  // Initialize selection from server config (or default to none).
  // NOTE: We only do this once to avoid clobbering user selections during refreshes.
  useEffect(() => {
    if (didInitSelectionRef.current) return;

    const configured = Array.isArray(config?.selectedFeedIds) ? config!.selectedFeedIds : [];
    const valid = configured.filter((id) => feeds.some((f) => f.id === id));
    setSelectedFeedIds(valid);
    didInitSelectionRef.current = true;
  }, [config, feeds]);

  const selectedFeeds = useMemo(() => {
    const byId = new Map(feeds.map(f => [f.id, f]));
    return selectedFeedIds.map(id => byId.get(id)).filter(Boolean);
  }, [feeds, selectedFeedIds]);

  const hasEthSelected = useMemo(() => {
    return selectedFeeds.some(f => (f?.sourceChain?.id ?? 14) === 1);
  }, [selectedFeeds]);

  const hasNonEthSelected = useMemo(() => {
    return selectedFeeds.some(f => (f?.sourceChain?.id ?? 14) !== 1);
  }, [selectedFeeds]);

  const handleStart = async () => {
    if (selectedFeedIds.length === 0) {
      toast.error('Select at least one feed to run');
      return;
    }
    if (hasEthSelected && hasNonEthSelected) {
      toast.error('ETH feeds must run solo. Deselect non-ETH feeds to continue.');
      return;
    }

    setIsStarting(true);
    const success = await start({
      privateKey: privateKey || undefined,
      feedIds: selectedFeedIds,
    });
    setIsStarting(false);
    
    if (success) {
      toast.success('Bot started successfully!');
      setPrivateKey('');
      setShowPrivateKeyInput(false);
    } else {
      toast.error('Failed to start bot');
    }
  };

  const handleStop = async () => {
    setIsStopping(true);
    const success = await stop();
    setIsStopping(false);
    
    if (success) {
      toast.success('Bot stopped');
    } else {
      toast.error('Failed to stop bot');
    }
  };

  const statusConfig = {
    stopped: { color: 'bg-gray-500', text: 'Stopped', icon: Square },
    starting: { color: 'bg-yellow-500 animate-pulse', text: 'Starting...', icon: Loader2 },
    running: { color: 'bg-green-500 animate-pulse', text: 'Running', icon: Activity },
    stopping: { color: 'bg-yellow-500', text: 'Stopping...', icon: Loader2 },
    error: { color: 'bg-red-500', text: 'Error', icon: XCircle },
  };

  const currentStatus = statusConfig[status];
  const StatusIcon = currentStatus.icon;

  const startDisabledReason =
    selectedFeedIds.length === 0
      ? 'Select at least one feed above to enable Start.'
      : hasEthSelected && hasNonEthSelected
        ? 'ETH mainnet feeds must run solo. Deselect non-ETH feeds.'
        : null;

  const terminalInner = logs.length === 0 ? (
    <div className="text-gray-500 text-center py-8">
      No logs yet. Start the bot to see activity.
    </div>
  ) : (
    <div className="space-y-0.5">
      {logs.map((entry, i) => (
        <LogEntry key={`${entry.timestamp}-${i}`} entry={entry} />
      ))}
    </div>
  );

  return (
    <div className="min-h-screen">
      <Header 
        title="Bot Control" 
        description="Run and monitor the Custom Feeds Bot"
      />

      <div className="p-6 space-y-6">
        {/* Bot Configuration (1st) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Bot Configuration
            </CardTitle>
            <CardDescription>
              Choose which feeds the bot should run for before starting. (None selected by default.)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground space-y-1">
              <div>
                - The bot will process the selected feeds in a round-robin loop at the configured interval.
              </div>
              <div>
                - <strong>ETH mainnet rule:</strong> if you select an Ethereum feed, it must run solo (attestation/indexing can take much longer).
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSelectedFeedIds(feeds.map(f => f.id))}
                disabled={feeds.length === 0}
              >
                Select all
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSelectedFeedIds([])}
                disabled={feeds.length === 0}
              >
                Select none
              </Button>
              <div className="text-sm text-muted-foreground flex items-center">
                Selected: {selectedFeedIds.length}/{feeds.length}
              </div>
            </div>

            {feeds.length === 0 ? (
              <Alert>
                <AlertTriangle className="w-4 h-4" />
                <AlertDescription>
                  No feeds found. Deploy a feed first, then come back here to configure the bot.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-3">
                <div className="grid md:grid-cols-2 gap-3">
                  {feeds.map((feed) => {
                    const sourceChainId = feed.sourceChain?.id ?? 14;
                    const isEth = sourceChainId === 1;
                    const checked = selectedFeedIds.includes(feed.id);
                    const disabled = !checked && hasEthSelected && !isEth;

                    return (
                      <label
                        key={feed.id}
                        className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-secondary/50 transition-colors ${
                          disabled ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      >
                        <Checkbox
                          checked={checked}
                          disabled={disabled}
                          onCheckedChange={(next) => {
                            const isChecked = next === true;
                            setSelectedFeedIds((prev) => {
                              if (isChecked) {
                                // Selecting ETH forces ETH-only selection
                                if (isEth) return [feed.id];
                                // If ETH already selected, block selecting non-ETH (also covered by disabled)
                                if (hasEthSelected) return prev;
                                return Array.from(new Set([...prev, feed.id]));
                              }
                              return prev.filter((id) => id !== feed.id);
                            });
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-semibold truncate">{feed.alias}</div>
                            <Badge variant="outline">
                              {feed.sourceChain?.name ?? 'Flare'}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {isEth ? 'Ethereum feeds can take longer to attest — run solo.' : 'OK to run alongside other non-ETH feeds.'}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Status and Control */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Start/Status Card (2nd) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Play className="w-5 h-5" />
                Start Bot
              </CardTitle>
              <CardDescription>
                Start/stop the bot and monitor its current status.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-4 h-4 rounded-full ${currentStatus.color}`} />
                  <div>
                    <p className="font-semibold text-lg flex items-center gap-2">
                      <StatusIcon className={`w-4 h-4 ${status === 'running' ? 'animate-spin' : ''}`} />
                      {currentStatus.text}
                    </p>
                    {stats?.startTime && status === 'running' && (
                      <p className="text-sm text-muted-foreground">
                        Uptime: {formatUptime(stats.uptimeSeconds)}
                      </p>
                    )}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={refresh}>
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>

              {error && (
                <Alert variant="destructive">
                  <XCircle className="w-4 h-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {/* Control Buttons */}
              <div className="flex gap-3 pt-2">
                {status === 'stopped' || status === 'error' ? (
                  <>
                    <Button 
                      className="flex-1 bg-green-600 hover:bg-green-700"
                      onClick={handleStart}
                      disabled={isStarting || isLoading || !!startDisabledReason}
                    >
                      {isStarting ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4 mr-2" />
                      )}
                      Start Bot
                    </Button>
                    <Button 
                      variant="outline"
                      onClick={() => setShowPrivateKeyInput(!showPrivateKeyInput)}
                    >
                      <Settings className="w-4 h-4" />
                    </Button>
                  </>
                ) : (
                  <Button 
                    className="flex-1"
                    variant="destructive"
                    onClick={handleStop}
                    disabled={isStopping || status === 'stopping'}
                  >
                    {isStopping ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Square className="w-4 h-4 mr-2" />
                    )}
                    Stop Bot
                  </Button>
                )}
              </div>

              {startDisabledReason && (status === 'stopped' || status === 'error') && (
                <Alert>
                  <AlertTriangle className="w-4 h-4" />
                  <AlertDescription>{startDisabledReason}</AlertDescription>
                </Alert>
              )}

              {/* Private Key Input (Optional) */}
              {showPrivateKeyInput && status === 'stopped' && (
                <div className="pt-4 border-t space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="privateKey">Private Key (optional)</Label>
                    <Input
                      id="privateKey"
                      type="password"
                      value={privateKey}
                      onChange={(e) => setPrivateKey(e.target.value)}
                      placeholder="0x... or leave blank to use env var"
                    />
                    <p className="text-xs text-muted-foreground">
                      If not provided, uses DEPLOYER_PRIVATE_KEY from environment
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Stats Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5" />
                Statistics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-lg bg-secondary/50">
                  <div className="text-2xl font-bold">
                    {stats?.totalUpdates || 0}
                  </div>
                  <div className="text-xs text-muted-foreground">Total Updates</div>
                </div>
                <div className="p-3 rounded-lg bg-secondary/50">
                  <div className="text-2xl font-bold text-green-500">
                    {stats?.successfulUpdates || 0}
                  </div>
                  <div className="text-xs text-muted-foreground">Successful</div>
                </div>
                <div className="p-3 rounded-lg bg-secondary/50">
                  <div className="text-2xl font-bold text-red-500">
                    {stats?.failedUpdates || 0}
                  </div>
                  <div className="text-xs text-muted-foreground">Failed</div>
                </div>
                <div className="p-3 rounded-lg bg-secondary/50">
                  <div className="text-2xl font-bold">
                    {feeds.length}
                  </div>
                  <div className="text-xs text-muted-foreground">Configured Feeds</div>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Loop interval</span>
                  <span className="font-mono">
                    {config?.checkIntervalSeconds ?? 60}s
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Last check</span>
                  <span className="font-mono">
                    {stats?.lastCheckTime ? new Date(stats.lastCheckTime).toLocaleTimeString() : '—'}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {stats?.lastCheckNote
                    ? stats.lastCheckNote
                    : 'Checks are skipped while an update is in progress (FDC can take minutes).'}
                </div>
              </div>

              {stats?.lastUpdateTime && (
                <div className="mt-4 pt-4 border-t">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    Last update: {new Date(stats.lastUpdateTime).toLocaleString()}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Flare Forward Terminal (3rd) */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2">
                  <Terminal className="w-5 h-5" />
                  Flare Forward Terminal
                </CardTitle>
                <CardDescription>
                  Real-time bot activity log
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsTerminalFullscreenOpen(true)}
              >
                <Maximize2 className="w-4 h-4 mr-2" />
                Full screen
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="bg-black/90 rounded-lg p-4 h-80 overflow-y-auto font-mono text-sm">
              {terminalInner}
            </div>
          </CardContent>
        </Card>

        <Dialog open={isTerminalFullscreenOpen} onOpenChange={setIsTerminalFullscreenOpen}>
          <DialogContent
            className="sm:max-w-[calc(100%-2rem)] max-w-[calc(100%-2rem)] h-[calc(100%-2rem)] p-4 flex flex-col"
          >
            <DialogHeader className="shrink-0">
              <DialogTitle className="flex items-center gap-2">
                <Terminal className="w-5 h-5" />
                Flare Forward Terminal
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 min-h-0">
              <div className="bg-black/90 rounded-lg p-4 h-full overflow-y-auto font-mono text-sm">
                {terminalInner}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Feed Status Grid */}
        {feeds.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Feed Status</CardTitle>
              <CardDescription>
                Per-feed update statistics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {feeds.map((feed) => {
                  const feedStats = stats?.feedStats[feed.id];
                  return (
                    <div 
                      key={feed.id}
                      className="p-4 rounded-lg border bg-card hover:bg-secondary/50 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold truncate">{feed.alias}</span>
                        {feedStats?.lastUpdate ? (
                          <Badge variant="outline" className="bg-green-500/10 text-green-500">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline">
                            <Clock className="w-3 h-3 mr-1" />
                            Pending
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground space-y-1">
                        <div>Updates: {feedStats?.updates || 0}</div>
                        <div>Failures: {feedStats?.failures || 0}</div>
                        {feedStats?.lastPrice && (
                          <div>Last Price: {feedStats.lastPrice}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* CLI Alternative */}
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Terminal className="w-4 h-4" />
              CLI Alternative
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              You can also run the bot from the terminal for standalone operation:
            </p>
            <pre className="p-3 rounded-lg bg-black/90 text-green-400 text-sm overflow-x-auto">
              <code>node src/custom-feeds-bot.js</code>
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
