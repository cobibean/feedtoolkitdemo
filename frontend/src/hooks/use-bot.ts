'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { BotStatus, BotStats, BotLogEntry, BotConfig } from '@/lib/bot-service';

interface UseBotResult {
  status: BotStatus;
  stats: BotStats | null;
  logs: BotLogEntry[];
  config: BotConfig | null;
  isLoading: boolean;
  error: string | null;
  start: (options?: { privateKey?: string; config?: Partial<BotConfig>; feedIds?: string[] }) => Promise<boolean>;
  stop: () => Promise<boolean>;
  refresh: () => Promise<void>;
  updateSingleFeed: (feedId: string) => Promise<boolean>;
}

export function useBot(): UseBotResult {
  const [status, setStatus] = useState<BotStatus>('stopped');
  const [stats, setStats] = useState<BotStats | null>(null);
  const [logs, setLogs] = useState<BotLogEntry[]>([]);
  const [config, setConfig] = useState<BotConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Fetch initial status
  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/bot/status');
      if (response.ok) {
        const data = await response.json();
        setStatus(data.status);
        setStats(data.stats);
        setConfig(data.config);
        if (data.logs) {
          setLogs(data.logs);
        }
        setError(null);
      }
    } catch (err) {
      setError('Failed to fetch bot status');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Connect to SSE stream for real-time updates
  const connectStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource('/api/bot/logs/stream');
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('log', (event) => {
      try {
        const logEntry: BotLogEntry = JSON.parse(event.data);
        setLogs(prev => [...prev.slice(-99), logEntry]);
      } catch {
        // Ignore parse errors
      }
    });

    eventSource.addEventListener('status', (event) => {
      try {
        const data = JSON.parse(event.data);
        setStatus(data.status);
        if (data.stats) {
          setStats(data.stats);
        }
      } catch {
        // Ignore parse errors
      }
    });

    eventSource.onerror = () => {
      // Reconnect on error
      setTimeout(() => {
        if (eventSourceRef.current === eventSource) {
          connectStream();
        }
      }, 5000);
    };

    return () => {
      eventSource.close();
    };
  }, []);

  useEffect(() => {
    refresh();
    const cleanup = connectStream();

    // Defensive polling: ensures UI updates even if SSE is buffered/blocked in dev.
    const poll = setInterval(() => {
      refresh();
    }, 3000);
    
    return () => {
      cleanup();
      clearInterval(poll);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [refresh, connectStream]);

  // Start bot
  const start = useCallback(async (options?: { privateKey?: string; config?: Partial<BotConfig>; feedIds?: string[] }): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const privateKey = options?.privateKey;
      const config = options?.config;
      const feedIds = options?.feedIds;

      const response = await fetch('/api/bot/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privateKey, config, feedIds }),
      });

      const data = await response.json();

      if (data.success) {
        setStatus(data.status);
        // Pull latest logs/status immediately (helps even if SSE isn't connected yet)
        await refresh();
        return true;
      } else {
        setError(data.error || 'Failed to start bot');
        await refresh();
        return false;
      }
    } catch (err) {
      setError('Failed to start bot');
      await refresh();
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [refresh]);

  // Stop bot
  const stop = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/bot/stop', { method: 'POST' });
      const data = await response.json();

      if (data.success) {
        setStatus(data.status);
        if (data.stats) {
          setStats(data.stats);
        }
        return true;
      } else {
        setError(data.error || 'Failed to stop bot');
        return false;
      }
    } catch (err) {
      setError('Failed to stop bot');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Update single feed
  const updateSingleFeed = useCallback(async (feedId: string): Promise<boolean> => {
    try {
      const response = await fetch('/api/bot/update-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedId }),
      });

      const data = await response.json();
      return data.success;
    } catch {
      return false;
    }
  }, []);

  return {
    status,
    stats,
    logs,
    config,
    isLoading,
    error,
    start,
    stop,
    refresh,
    updateSingleFeed,
  };
}
