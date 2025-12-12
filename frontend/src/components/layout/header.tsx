'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';

import { ThemeToggle } from './theme-toggle';

interface HeaderProps {
  title: string;
  description?: string;
}

export function Header({ title, description }: HeaderProps) {
  return (
    <header className="flex items-center justify-between p-6 border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
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
  );
}

