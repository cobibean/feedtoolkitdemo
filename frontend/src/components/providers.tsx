'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { RainbowKitProvider, darkTheme, lightTheme } from '@rainbow-me/rainbowkit';
import { ThemeProvider } from 'next-themes';
import { useState, type ReactNode } from 'react';
import { config } from '@/lib/wagmi-config';
import { Toaster } from '@/components/ui/sonner';

import '@rainbow-me/rainbowkit/styles.css';

// Custom RainbowKit theme matching Flare Forward brand
const flareTheme = {
  light: lightTheme({
    accentColor: '#E8195D',
    accentColorForeground: 'white',
    borderRadius: 'medium',
    fontStack: 'system',
  }),
  dark: darkTheme({
    accentColor: '#E8195D',
    accentColorForeground: 'white',
    borderRadius: 'medium',
    fontStack: 'system',
  }),
};

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 1000,
        refetchOnWindowFocus: false,
      },
    },
  }));

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider
            theme={{
              lightMode: flareTheme.light,
              darkMode: flareTheme.dark,
            }}
            modalSize="compact"
          >
            {children}
            <Toaster 
              position="bottom-right"
              toastOptions={{
                style: {
                  background: 'var(--card)',
                  color: 'var(--card-foreground)',
                  border: '1px solid var(--border)',
                },
              }}
            />
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  );
}

