'use client';

import { useAccount } from 'wagmi';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { FeedsProvider } from '@/context/feeds-context';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isConnected, isConnecting } = useAccount();
  const router = useRouter();

  // Redirect to landing if not connected
  useEffect(() => {
    if (!isConnecting && !isConnected) {
      router.push('/');
    }
  }, [isConnected, isConnecting, router]);

  // Show nothing while checking connection
  if (isConnecting || !isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <FeedsProvider>
      <div className="flex h-screen">
        <Sidebar />
        <main className="flex-1 overflow-auto bg-background">
          {children}
        </main>
      </div>
    </FeedsProvider>
  );
}

