'use client';

import { useChainId } from 'wagmi';
import { Badge } from '@/components/ui/badge';
import { flare } from '@/lib/wagmi-config';

export function NetworkSwitcher() {
  const chainId = useChainId();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Network</span>
        <Badge variant="outline">
          {chainId === flare.id ? 'Flare Mainnet' : `Unsupported (connect ${flare.id})`}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Mainnet only. Testnet toggle is hidden for now.
      </p>
    </div>
  );
}

