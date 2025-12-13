// Core types for the application

// Legacy types (kept for backward compatibility)
export type NetworkId = 'flare' | 'coston2';
export type ChainId = 14 | 114;

// ============================================================
// Source Kind & Method Enums (for reviewer clarity)
// ============================================================

/**
 * Determines how a price feed gets its data:
 * - FLARE_NATIVE: Direct on-chain state reads from a Flare pool (slot0)
 * - FDC_EXTERNAL: Cross-chain attestation via FDC (external pools)
 */
export type SourceKind = 'FLARE_NATIVE' | 'FDC_EXTERNAL';

/**
 * The specific method used to compute the price:
 * - SLOT0_SPOT: Direct slot0().sqrtPriceX96 read (instant, on-chain)
 * - TWAP_OBSERVE: Time-weighted average via observe() (more resistant to manipulation)
 * - FDC_ATTESTATION: FDC-verified event from PriceRecorder/PriceRelay
 */
export type PriceMethod = 'SLOT0_SPOT' | 'TWAP_OBSERVE' | 'FDC_ATTESTATION';

/**
 * Provenance metadata for a price update - shown to reviewers
 */
export interface PriceProvenance {
  sourceKind: SourceKind;
  method: PriceMethod;
  originChain: string;
  originChainId: number;
  timestamp: number;
  blockNumber?: number;
  sqrtPriceX96?: string;  // Raw value for verification
  tick?: number;
}

/**
 * Result from a direct state read (Flare-native pools)
 */
export interface DirectStateResult {
  value: bigint;           // Price with decimals applied
  decimals: number;        // Output decimals (typically 6)
  timestamp: number;       // Block timestamp
  blockNumber: bigint;     // Block number when read
  sqrtPriceX96: bigint;    // Raw sqrtPriceX96 from slot0
  tick: number;            // Tick from slot0
  provenance: PriceProvenance;
}

// ============================================================
// Helper to determine source kind from chain config
// ============================================================

export function getSourceKind(chainId: number): SourceKind {
  // Flare and Coston2 are native - use direct state reads
  if (chainId === 14 || chainId === 114) {
    return 'FLARE_NATIVE';
  }
  // All other chains require FDC attestation
  return 'FDC_EXTERNAL';
}

// New cross-chain types
export type SourceChainCategory = 'direct' | 'relay';

export interface SourceChain {
  id: number;
  name: string;
  category: SourceChainCategory;
}

// Extended StoredFeed with cross-chain support (backward compatible)
export interface StoredFeed {
  id: string;
  alias: string;
  
  // ============================================================
  // Source Kind & Method (v2.1.0+) - for reviewer clarity
  // ============================================================
  sourceKind?: SourceKind;    // 'FLARE_NATIVE' | 'FDC_EXTERNAL'
  method?: PriceMethod;       // 'SLOT0_SPOT' | 'TWAP_OBSERVE' | 'FDC_ATTESTATION'
  
  // Source chain info (NEW - optional for backward compatibility)
  sourceChain?: SourceChain;           // Optional: if missing, infer from network
  sourcePoolAddress?: `0x${string}`;   // Optional: falls back to poolAddress
  
  // Legacy fields (kept for backward compatibility)
  network?: NetworkId;                  // Deprecated: use sourceChain instead
  poolAddress?: `0x${string}`;          // Deprecated: use sourcePoolAddress
  
  // Flare deployment
  customFeedAddress: `0x${string}`;
  priceRecorderAddress?: `0x${string}`; // Required for direct chains
  priceRelayAddress?: `0x${string}`;    // Only for relay chains (Phase 2+)
  
  // Token info
  token0: {
    address: `0x${string}`;
    symbol: string;
    decimals: number;
  };
  token1: {
    address: `0x${string}`;
    symbol: string;
    decimals: number;
  };
  invertPrice: boolean;
  
  // Metadata
  deployedAt: string;
  deployedBy: `0x${string}`;

  // Archive metadata (soft-delete in UI)
  archivedAt?: string; // ISO timestamp; undefined/null => active
}

// Helper to normalize legacy feeds (v1.0.0) to new format (v2.0.0)
export function normalizeFeed(feed: StoredFeed): StoredFeed & { 
  sourceChain: SourceChain; 
  sourcePoolAddress: `0x${string}`;
} {
  // Infer chain from legacy 'network' field if sourceChain missing
  const inferredChain: SourceChain = feed.network === 'coston2' 
    ? { id: 114, name: 'Coston2', category: 'direct' as const }
    : { id: 14, name: 'Flare', category: 'direct' as const };
  
  return {
    ...feed,
    sourceChain: feed.sourceChain ?? inferredChain,
    sourcePoolAddress: feed.sourcePoolAddress ?? feed.poolAddress ?? '0x' as `0x${string}`,
  };
}

export interface StoredRecorder {
  id: string;
  address: `0x${string}`;
  network?: NetworkId;       // Legacy field
  chainId?: number;          // NEW: source chain ID where recorder is deployed
  chainName?: string;        // NEW: source chain name
  updateInterval: number;
  deployedAt: string;
  deployedBy: `0x${string}`;

  // Archive metadata (soft-delete in UI)
  archivedAt?: string; // ISO timestamp; undefined/null => active
}

// Helper to normalize legacy recorders
export function normalizeRecorder(recorder: StoredRecorder): StoredRecorder & {
  chainId: number;
  chainName: string;
} {
  // Infer chain from legacy 'network' field if chainId missing
  const inferredChainId = recorder.network === 'coston2' ? 114 : 14;
  const inferredChainName = recorder.network === 'coston2' ? 'Coston2' : 'Flare';
  
  return {
    ...recorder,
    chainId: recorder.chainId ?? inferredChainId,
    chainName: recorder.chainName ?? inferredChainName,
  };
}

// Stored relay (Phase 2+)
export interface StoredRelay {
  id: string;
  address: `0x${string}`;
  minRelayInterval: number;
  maxPriceAge: number;
  supportedChainIds: number[];
  deployedAt: string;
  deployedBy: `0x${string}`;

  // Archive metadata (soft-delete in UI)
  archivedAt?: string; // ISO timestamp; undefined/null => active
}

export interface FeedsData {
  version: string;  // "1.0.0" or "2.0.0"
  feeds: StoredFeed[];
  recorders: StoredRecorder[];
  relays?: StoredRelay[];  // NEW (optional for backward compatibility)
}

// On-chain feed data (read from contracts)
export interface FeedOnChainData {
  latestValue: bigint;
  lastUpdateTimestamp: number;
  updateCount: number;
  feedId: string;
}

// Bot status types
export type BotStatus = 'active' | 'stale' | 'inactive' | 'unknown';

export interface PoolInfo {
  token0: `0x${string}`;
  token1: `0x${string}`;
  token0Symbol: string;
  token1Symbol: string;
  token0Decimals: number;
  token1Decimals: number;
  sqrtPriceX96: bigint;
  tick: number;
}

// Deploy form types
export interface RecorderDeployConfig {
  updateInterval: number;
  sourceChainId?: number;  // NEW: which chain to deploy on
}

export interface FeedDeployConfig {
  priceRecorderAddress: `0x${string}`;
  poolAddress: `0x${string}`;
  feedAlias: string;
  token0Decimals: number;
  token1Decimals: number;
  invertPrice: boolean;
  sourceChainId?: number;  // NEW: source chain for the pool
}
