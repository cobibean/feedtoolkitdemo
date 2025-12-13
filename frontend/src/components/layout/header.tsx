'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';

import { ThemeToggle } from './theme-toggle';
import { HomeChainPrompt } from './home-chain-prompt';

interface HeaderProps {
  title: string;
  description?: string;
  showHomeChainPrompt?: boolean;
}

export function Header({ title, description, showHomeChainPrompt = true }: HeaderProps) {
  return (
    <div className="sticky top-0 z-10">
      <header className="flex items-center justify-between p-6 border-b border-border bg-card/50 backdrop-blur-sm">
        <div>
          <h1 className="text-2xl font-display">{title}</h1>
          {description && (
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <ConnectButton showBalance={false} accountStatus="address" />
        </div>
      </header>
      {showHomeChainPrompt && <HomeChainPrompt />}
    </div>
  );
}
