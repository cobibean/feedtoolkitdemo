'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAccount, useBalance, useChainId } from 'wagmi';
import { formatEther } from 'viem';
import { 
  Home, 
  Rocket, 
  Activity, 
  Settings, 
  AlertTriangle,
  ArrowLeft,
  Bot,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getChainById } from '@/lib/chains';

const navItems = [
  { href: '/dashboard', label: 'Overview', icon: Home },
  { href: '/dashboard/deploy', label: 'Deploy', icon: Rocket },
  { href: '/dashboard/monitor', label: 'Monitor', icon: Activity },
  { href: '/dashboard/bot', label: 'Bot', icon: Bot },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { data: balance } = useBalance({ address });

  const activeChain = getChainById(chainId);
  const nativeSymbol = activeChain?.nativeCurrency.symbol || balance?.symbol || 'FLR';
  const chainLabel = activeChain
    ? `${activeChain.name}${activeChain.category === 'relay' ? ' (Relay)' : ''}`
    : `Unsupported chain (${chainId})`;

  const formattedBalance = balance 
    ? parseFloat(formatEther(balance.value)).toFixed(4)
    : '0.0000';

  const isLowBalance = balance && parseFloat(formatEther(balance.value)) < 1;
  const isCriticalBalance = balance && parseFloat(formatEther(balance.value)) < 0.1;

  return (
    <div className="flex flex-col h-full w-64 bg-card border-r border-border">
      {/* Logo */}
      <div className="p-4 border-b border-border flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          asChild
          className="text-muted-foreground hover:text-foreground"
        >
          <Link href="/?stay=1" aria-label="Back to landing">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <Link href="/dashboard">
          <Image
            src="/brand/logo.png"
            alt="Flare Forward"
            width={160}
            height={36}
            className="h-9 w-auto"
            priority
          />
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href || 
              (item.href !== '/dashboard' && pathname.startsWith(item.href));
            const Icon = item.icon;
            
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-brand-500/10 text-brand-500'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                  )}
                >
                  <Icon className="w-5 h-5" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Wallet Info */}
      {isConnected && (
        <div className="p-4 border-t border-border space-y-3">
          {/* Balance */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Balance</span>
            <span className={cn(
              "font-mono text-sm",
              isCriticalBalance && "text-destructive",
              isLowBalance && !isCriticalBalance && "text-warning"
            )}>
              {formattedBalance} {nativeSymbol}
            </span>
          </div>

          {/* Low balance warning */}
          {isLowBalance && (
            <div className={cn(
              "flex items-center gap-2 text-xs p-2 rounded-md",
              isCriticalBalance 
                ? "bg-destructive/10 text-destructive"
                : "bg-warning/10 text-warning"
            )}>
              <AlertTriangle className="w-3 h-3 shrink-0" />
              <span>
                {isCriticalBalance 
                  ? `Critical: Add ${nativeSymbol} to continue`
                  : "Low balance warning"
                }
              </span>
            </div>
          )}

          {/* Address */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Address</span>
            <span className="font-mono text-xs text-foreground">
              {address?.slice(0, 6)}...{address?.slice(-4)}
            </span>
          </div>

          {/* Network Badge */}
          <Badge variant="outline" className="w-full justify-center">
            {chainLabel}
          </Badge>
        </div>
      )}
    </div>
  );
}

