'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { flare } from '@/lib/wagmi-config';
import { getChainById } from '@/lib/chains';
import { ArrowRightLeft } from 'lucide-react';

const DISMISS_UNTIL_KEY = 'ff_home_chain_prompt_dismiss_until_ms';

function readDismissUntil(): number {
  if (typeof window === 'undefined') return 0;
  const raw = window.sessionStorage.getItem(DISMISS_UNTIL_KEY);
  const value = raw ? Number(raw) : 0;
  return Number.isFinite(value) ? value : 0;
}

function writeDismissUntil(untilMs: number) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(DISMISS_UNTIL_KEY, String(untilMs));
}

export function HomeChainPrompt() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync, isPending } = useSwitchChain();

  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const dismissed = useMemo(() => {
    const until = readDismissUntil();
    return until > nowMs;
  }, [nowMs]);

  const chainName = useMemo(() => {
    const chain = getChainById(chainId);
    return chain?.name ?? `Chain ${chainId}`;
  }, [chainId]);

  const show = isConnected && chainId !== flare.id && !dismissed;

  const handleSwitch = useCallback(async () => {
    try {
      await switchChainAsync({ chainId: flare.id });
    } catch (e) {
      const message = (e as Error)?.message || 'Network switch failed';
      toast.error(message);
    }
  }, [switchChainAsync]);

  const handleNotNow = useCallback(() => {
    // Hide for a bit to avoid fighting users during source-chain transactions.
    writeDismissUntil(Date.now() + 10 * 60_000);
    setNowMs(Date.now());
  }, []);

  if (!show) return null;

  return (
    <Alert className="rounded-none border-x-0 border-t-0 bg-brand-500/10">
      <ArrowRightLeft className="h-4 w-4 text-brand-500" />
      <AlertTitle className="flex items-center justify-between gap-3">
        <span>Switch back to Flare</span>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleSwitch}
            disabled={isPending}
            className="h-8"
          >
            Switch to Flare
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleNotNow}
            className="h-8"
          >
            Not now
          </Button>
        </div>
      </AlertTitle>
      <AlertDescription>
        Your wallet is currently connected to {chainName}. This app uses Flare as the home chain
        for deployments and attestations.
      </AlertDescription>
    </Alert>
  );
}

