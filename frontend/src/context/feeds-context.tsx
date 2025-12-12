'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { 
  FeedsData, 
  StoredFeed, 
  StoredRecorder,
  StoredRelay,
  NetworkId,
  SourceChain,
} from '@/lib/types';

interface FeedsContextType {
  feeds: StoredFeed[];
  recorders: StoredRecorder[];
  relays: StoredRelay[];
  isLoading: boolean;
  error: Error | null;
  addFeed: (feed: StoredFeed) => Promise<void>;
  removeFeed: (id: string) => Promise<void>;
  addRecorder: (recorder: StoredRecorder) => Promise<void>;
  removeRecorder: (id: string) => Promise<void>;
  addRelay: (relay: StoredRelay) => Promise<void>;
  removeRelay: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
  // Legacy helpers (for backward compatibility)
  getFeedsByNetwork: (network: NetworkId) => StoredFeed[];
  getRecordersByNetwork: (network: NetworkId) => StoredRecorder[];
  // New cross-chain helpers
  getFeedsBySourceChain: (chainId: number) => StoredFeed[];
  getRecordersByChain: (chainId: number) => StoredRecorder[];
  getNormalizedFeed: (feed: StoredFeed) => StoredFeed & { sourceChain: SourceChain; sourcePoolAddress: `0x${string}` };
}

const FeedsContext = createContext<FeedsContextType | null>(null);

export function FeedsProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<FeedsData>({ version: '2.0.0', feeds: [], recorders: [], relays: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch('/api/feeds');
      if (!res.ok) throw new Error('Failed to fetch feeds');
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e as Error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addFeed = async (feed: StoredFeed) => {
    const res = await fetch('/api/feeds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'feed', ...feed }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to add feed');
    }
    await refresh();
  };

  const removeFeed = async (id: string) => {
    const res = await fetch(`/api/feeds?id=${id}&type=feed`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to remove feed');
    await refresh();
  };

  const addRecorder = async (recorder: StoredRecorder) => {
    const res = await fetch('/api/feeds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'recorder', ...recorder }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to add recorder');
    }
    await refresh();
  };

  const removeRecorder = async (id: string) => {
    const res = await fetch(`/api/feeds?id=${id}&type=recorder`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to remove recorder');
    await refresh();
  };

  const addRelay = async (relay: StoredRelay) => {
    const res = await fetch('/api/feeds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'relay', ...relay }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to add relay');
    }
    await refresh();
  };

  const removeRelay = async (id: string) => {
    const res = await fetch(`/api/feeds?id=${id}&type=relay`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to remove relay');
    await refresh();
  };

  // Legacy helper: filter feeds by network string
  const getFeedsByNetwork = (network: NetworkId) => {
    return data.feeds.filter(f => {
      // If feed has sourceChain, check its id
      if (f.sourceChain) {
        const networkChainId = network === 'flare' ? 14 : 114;
        return f.sourceChain.id === networkChainId;
      }
      // Fall back to legacy network field
      return f.network === network;
    });
  };

  // Legacy helper: filter recorders by network string
  const getRecordersByNetwork = (network: NetworkId) => {
    return data.recorders.filter(r => {
      // If recorder has chainId, check it
      if (r.chainId !== undefined) {
        const networkChainId = network === 'flare' ? 14 : 114;
        return r.chainId === networkChainId;
      }
      // Fall back to legacy network field
      return r.network === network;
    });
  };

  // New helper: filter feeds by source chain ID
  const getFeedsBySourceChain = (chainId: number) => {
    return data.feeds.filter(f => {
      // If feed has sourceChain, check its id
      if (f.sourceChain) {
        return f.sourceChain.id === chainId;
      }
      // Fall back to inferring from legacy network field
      const inferredChainId = f.network === 'coston2' ? 114 : 14;
      return inferredChainId === chainId;
    });
  };

  // New helper: filter recorders by chain ID
  const getRecordersByChain = (chainId: number) => {
    return data.recorders.filter(r => {
      // If recorder has chainId, check it
      if (r.chainId !== undefined) {
        return r.chainId === chainId;
      }
      // Fall back to inferring from legacy network field
      const inferredChainId = r.network === 'coston2' ? 114 : 14;
      return inferredChainId === chainId;
    });
  };

  // Normalize a feed to ensure it has sourceChain and sourcePoolAddress
  const getNormalizedFeed = (feed: StoredFeed): StoredFeed & { 
    sourceChain: SourceChain; 
    sourcePoolAddress: `0x${string}` 
  } => {
    // Infer chain from legacy 'network' field if sourceChain missing
    const inferredChain: SourceChain = feed.network === 'coston2' 
      ? { id: 114, name: 'Coston2', category: 'direct' as const }
      : { id: 14, name: 'Flare', category: 'direct' as const };
    
    return {
      ...feed,
      sourceChain: feed.sourceChain ?? inferredChain,
      sourcePoolAddress: feed.sourcePoolAddress ?? feed.poolAddress ?? '0x' as `0x${string}`,
    };
  };

  return (
    <FeedsContext.Provider
      value={{
        feeds: data.feeds,
        recorders: data.recorders,
        relays: data.relays || [],
        isLoading,
        error,
        addFeed,
        removeFeed,
        addRecorder,
        removeRecorder,
        addRelay,
        removeRelay,
        refresh,
        getFeedsByNetwork,
        getRecordersByNetwork,
        getFeedsBySourceChain,
        getRecordersByChain,
        getNormalizedFeed,
      }}
    >
      {children}
    </FeedsContext.Provider>
  );
}

export function useFeeds() {
  const ctx = useContext(FeedsContext);
  if (!ctx) {
    throw new Error('useFeeds must be used within FeedsProvider');
  }
  return ctx;
}
