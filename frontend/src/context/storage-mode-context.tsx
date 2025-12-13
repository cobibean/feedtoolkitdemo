'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type StorageMode = 'local' | 'database';

const STORAGE_MODE_COOKIE = 'flare_feeds_storage_mode';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const parts = document.cookie.split(';').map(p => p.trim());
  for (const part of parts) {
    if (part.startsWith(`${name}=`)) {
      return decodeURIComponent(part.slice(name.length + 1));
    }
  }
  return null;
}

function writeCookie(name: string, value: string, maxAgeSeconds: number): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax`;
}

function normalizeStorageMode(value: string | null | undefined): StorageMode {
  return value === 'database' ? 'database' : 'local';
}

interface StorageModeContextValue {
  storageMode: StorageMode;
  setStorageMode: (mode: StorageMode) => void;
}

const StorageModeContext = createContext<StorageModeContextValue | null>(null);

export function StorageModeProvider({ children }: { children: ReactNode }) {
  const [storageMode, setStorageModeState] = useState<StorageMode>(() => {
    const cookieValue = typeof document !== 'undefined' ? readCookie(STORAGE_MODE_COOKIE) : null;
    return normalizeStorageMode(cookieValue);
  });

  const setStorageMode = useCallback((mode: StorageMode) => {
    const normalized = normalizeStorageMode(mode);
    writeCookie(STORAGE_MODE_COOKIE, normalized, ONE_YEAR_SECONDS);
    setStorageModeState(normalized);
  }, []);

  const value = useMemo(() => ({ storageMode, setStorageMode }), [storageMode, setStorageMode]);

  return <StorageModeContext.Provider value={value}>{children}</StorageModeContext.Provider>;
}

export function useStorageMode(): StorageModeContextValue {
  const ctx = useContext(StorageModeContext);
  if (!ctx) throw new Error('useStorageMode must be used within StorageModeProvider');
  return ctx;
}

export const STORAGE_MODE_COOKIE_NAME = STORAGE_MODE_COOKIE;


