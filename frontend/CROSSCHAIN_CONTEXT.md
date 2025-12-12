# Cross-Chain Implementation Context

> AI-optimized execution guide. Self-contained - no other docs needed.
> Read this before implementing cross-chain support.

---

## Key Decisions (Confirmed)

### 1. Backward Compatible Schema (No Migration)

Make `sourceChain` optional. Legacy feeds are inferred as Flare:

```typescript
// Pattern for reading feeds - use everywhere feeds are consumed
const sourceChain = feed.sourceChain ?? { id: 14, name: 'Flare', category: 'direct' as const };
const sourcePoolAddress = feed.sourcePoolAddress ?? feed.poolAddress; // Legacy field fallback

// Legacy feeds also have 'network' field (string like "flare") - ignore for new logic
// New feeds use sourceChain.id and sourceChain.name instead

// For writes: ALWAYS use new schema with explicit sourceChain
```

**Legacy v1.0.0 fields to handle:**
- `network: "flare"` → Ignore, use `sourceChain.name` instead
- `poolAddress: "0x..."` → Fallback if `sourcePoolAddress` missing

This means:
- Old feeds keep working (treated as Flare source)
- New feeds use full v2.0.0 schema
- Zero migration step for users

### 2. Relay Authentication

Use existing bot wallet (`DEPLOYER_PRIVATE_KEY`). The `PriceRelay` constructor auto-authorizes `msg.sender`, so the deployer becomes the first authorized relayer. No new infrastructure needed.

**Future-proofing:** Design relay flow so it can later be triggered from frontend (user signs relay tx directly) without major refactoring.

### 3. Ethereum Gas Requirement

Users must have ETH on Ethereum to call `recordPrice()`. Document this requirement clearly in the UI. No gas abstraction for v1.

### 4. Testing Strategy

```
ETH Sepolia → Flare Mainnet → ETH Mainnet
```

Skip Coston2 (Flare mainnet already validated). Focus on proving multi-sourceId FDC attestation works.

### 5. Implementation Order

**Phase 1 first (Ethereum Direct)** — lowest risk, validates multi-sourceId before investing in relay infrastructure.

---

## Overview

**Goal:** Enable custom price feeds from Uniswap V3 pools on ANY EVM chain, verified on Flare.

**Two flows based on FDC support:**

| Source Chain | Flow | Trust Model |
|--------------|------|-------------|
| **Flare** (chainId: 14) | Direct | Trustless |
| **Ethereum** (chainId: 1) | Direct | Trustless |
| **Arbitrum, Base, OP, Polygon** | Relay | Trust bot + FDC |

**Why two flows?** FDC's EVMTransaction only supports Flare, Ethereum, Songbird. Other chains need relay pattern.

---

## File Structure (What to Create/Modify)

```
flare-custom-feeds-toolkit/
├── contracts/
│   ├── PriceRecorder.sol           # UNCHANGED
│   ├── PoolPriceCustomFeed.sol     # MODIFY (accept relay proofs)
│   └── PriceRelay.sol              # CREATE NEW
├── frontend/src/
│   ├── lib/
│   │   ├── chains.ts               # CREATE NEW (chain configs)
│   │   ├── types.ts                # MODIFY (add sourceChain)
│   │   ├── wagmi-config.ts         # MODIFY (add Ethereum)
│   │   └── contracts.ts            # MODIFY (add relay ABI)
│   ├── hooks/
│   │   ├── use-pool-info.ts        # MODIFY (multi-chain RPC)
│   │   └── use-feed-updater.ts     # MODIFY (direct vs relay)
│   ├── components/
│   │   └── chain/
│   │       └── ChainSelector.tsx   # CREATE NEW
│   ├── app/
│   │   ├── dashboard/deploy/page.tsx  # MODIFY (chain selection)
│   │   └── api/
│   │       ├── fdc/prepare-request/route.ts  # MODIFY (multi-sourceId)
│   │       └── relay/
│   │           └── fetch-price/route.ts      # CREATE NEW
│   └── context/
│       └── feeds-context.tsx       # MODIFY (new schema)
└── data/
    └── feeds.json                  # SCHEMA CHANGE to v2.0.0
```

---

## Current Architecture (Reference)

### Data Flow (Flare-only, current)

```
V3Pool.slot0() → PriceRecorder.recordPrice() → FDC attestation (FLR) → CustomFeed.updateFromProof()
```

### FDC Configuration (Current)

```typescript
// Source IDs
FLR: '0x464c520000000000000000000000000000000000000000000000000000000000'
ETH: '0x4554480000000000000000000000000000000000000000000000000000000000'

// Verifier URLs (Mainnet)
FLR: 'https://fdc-verifiers-mainnet.flare.network/verifier/flr/EVMTransaction/prepareRequest'
ETH: 'https://fdc-verifiers-mainnet.flare.network/verifier/eth/EVMTransaction/prepareRequest'

// FDC Contract Addresses (Flare Mainnet)
FDC_HUB: '0xc25c749DC27Efb1864Cb3DADa8845B7687eB2d44'
RELAY: '0x57a4c3676d08Aa5d15410b5A6A80fBcEF72f3F45'
```

---

## New Files to Create

### 1. `frontend/src/lib/chains.ts`

```typescript
// Chain configuration for cross-chain support

export type ChainCategory = 'direct' | 'relay';

export interface SupportedChain {
  id: number;
  name: string;
  category: ChainCategory;
  sourceId?: `0x${string}`;
  verifierPath?: string;
  rpcUrl: string;
  explorerUrl: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  testnet?: boolean;  // For Sepolia, etc.
}

export const SUPPORTED_CHAINS: SupportedChain[] = [
  // === DIRECT CHAINS (Mainnet) ===
  {
    id: 14,
    name: 'Flare',
    category: 'direct',
    sourceId: '0x464c520000000000000000000000000000000000000000000000000000000000',
    verifierPath: 'flr',
    rpcUrl: 'https://flare-api.flare.network/ext/bc/C/rpc',
    explorerUrl: 'https://flare-explorer.flare.network',
    nativeCurrency: { name: 'Flare', symbol: 'FLR', decimals: 18 },
  },
  {
    id: 1,
    name: 'Ethereum',
    category: 'direct',
    sourceId: '0x4554480000000000000000000000000000000000000000000000000000000000',
    verifierPath: 'eth',
    rpcUrl: 'https://eth.llamarpc.com',
    explorerUrl: 'https://etherscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  // === DIRECT CHAINS (Testnet) ===
  {
    id: 11155111,
    name: 'Sepolia',
    category: 'direct',
    sourceId: '0x7465737445544800000000000000000000000000000000000000000000000000', // testETH
    verifierPath: 'sepolia',
    rpcUrl: 'https://rpc.sepolia.org',
    explorerUrl: 'https://sepolia.etherscan.io',
    nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },
    testnet: true,
  },
  // === RELAY CHAINS ===
  {
    id: 42161,
    name: 'Arbitrum',
    category: 'relay',
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    explorerUrl: 'https://arbiscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  {
    id: 8453,
    name: 'Base',
    category: 'relay',
    rpcUrl: 'https://mainnet.base.org',
    explorerUrl: 'https://basescan.org',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  {
    id: 10,
    name: 'Optimism',
    category: 'relay',
    rpcUrl: 'https://mainnet.optimism.io',
    explorerUrl: 'https://optimistic.etherscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  {
    id: 137,
    name: 'Polygon',
    category: 'relay',
    rpcUrl: 'https://polygon-rpc.com',
    explorerUrl: 'https://polygonscan.com',
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
  },
];

export function getChainById(chainId: number): SupportedChain | undefined {
  return SUPPORTED_CHAINS.find(c => c.id === chainId);
}

export function isDirectChain(chainId: number): boolean {
  return getChainById(chainId)?.category === 'direct';
}

export function isRelayChain(chainId: number): boolean {
  return getChainById(chainId)?.category === 'relay';
}

export function getDirectChains(): SupportedChain[] {
  return SUPPORTED_CHAINS.filter(c => c.category === 'direct');
}

export function getRelayChains(): SupportedChain[] {
  return SUPPORTED_CHAINS.filter(c => c.category === 'relay');
}
```

### 2. `contracts/PriceRelay.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title PriceRelay
 * @notice Receives relayed prices from external chains and emits attestable events
 * @dev Security-hardened with token binding, monotonicity guards, and deviation checks
 */
contract PriceRelay {
    address public owner;
    bool public isActive;
    
    mapping(address => bool) public authorizedRelayers;
    mapping(uint256 => bool) public supportedChains;
    mapping(uint256 => mapping(address => bool)) public enabledPools;
    mapping(uint256 => mapping(address => uint256)) public lastRelayTime;
    
    // SECURITY: Token binding per pool (set on enablePool)
    struct PoolConfig {
        address token0;
        address token1;
        uint256 lastBlockNumber;     // For monotonicity check
        uint256 lastSqrtPriceX96;    // For deviation check
    }
    mapping(uint256 => mapping(address => PoolConfig)) public poolConfig;
    
    uint256 public minRelayInterval;
    uint256 public maxPriceAge;
    uint256 public constant MAX_DEVIATION_BPS = 5000; // 50% max deviation
    
    event PriceRelayed(
        uint256 indexed sourceChainId,
        address indexed poolAddress,
        uint160 sqrtPriceX96,
        int24 tick,
        uint128 liquidity,
        address token0,
        address token1,
        uint256 sourceTimestamp,
        uint256 sourceBlockNumber,
        uint256 relayTimestamp,
        address relayer
    );
    
    event RelayerAuthorized(address indexed relayer);
    event RelayerRevoked(address indexed relayer);
    event ChainEnabled(uint256 indexed chainId);
    event PoolEnabled(uint256 indexed chainId, address indexed pool, address token0, address token1);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    modifier onlyAuthorizedRelayer() {
        require(authorizedRelayers[msg.sender], "Not authorized relayer");
        _;
    }
    
    modifier whenActive() {
        require(isActive, "Relay paused");
        _;
    }
    
    constructor(uint256 _minRelayInterval, uint256 _maxPriceAge) {
        owner = msg.sender;
        isActive = true;
        minRelayInterval = _minRelayInterval;
        maxPriceAge = _maxPriceAge;
        authorizedRelayers[msg.sender] = true;
        emit RelayerAuthorized(msg.sender);
    }
    
    function relayPrice(
        uint256 sourceChainId,
        address poolAddress,
        uint160 sqrtPriceX96,
        int24 tick,
        uint128 liquidity,
        address token0,
        address token1,
        uint256 sourceTimestamp,
        uint256 sourceBlockNumber
    ) external onlyAuthorizedRelayer whenActive {
        require(supportedChains[sourceChainId], "Chain not supported");
        require(enabledPools[sourceChainId][poolAddress], "Pool not enabled");
        
        PoolConfig storage config = poolConfig[sourceChainId][poolAddress];
        
        // SECURITY: Token binding check
        require(token0 == config.token0 && token1 == config.token1, "Token mismatch");
        
        // SECURITY: Future timestamp rejection
        require(sourceTimestamp <= block.timestamp, "Future timestamp");
        
        // SECURITY: Freshness check
        require(block.timestamp - sourceTimestamp <= maxPriceAge, "Price data too old");
        
        // SECURITY: Monotonicity - block numbers must increase
        require(sourceBlockNumber > config.lastBlockNumber, "Stale block number");
        
        // SECURITY: Rate limiting
        require(
            block.timestamp >= lastRelayTime[sourceChainId][poolAddress] + minRelayInterval,
            "Relay interval not elapsed"
        );
        
        // SECURITY: Deviation check (skip on first relay)
        if (config.lastSqrtPriceX96 > 0) {
            uint256 deviation = _calculateDeviation(config.lastSqrtPriceX96, sqrtPriceX96);
            require(deviation <= MAX_DEVIATION_BPS, "Price deviation too high");
        }
        
        // Update state
        config.lastBlockNumber = sourceBlockNumber;
        config.lastSqrtPriceX96 = sqrtPriceX96;
        lastRelayTime[sourceChainId][poolAddress] = block.timestamp;
        
        emit PriceRelayed(
            sourceChainId,
            poolAddress,
            sqrtPriceX96,
            tick,
            liquidity,
            token0,
            token1,
            sourceTimestamp,
            sourceBlockNumber,
            block.timestamp,
            msg.sender
        );
    }
    
    function _calculateDeviation(uint256 oldPrice, uint256 newPrice) internal pure returns (uint256) {
        if (oldPrice == 0) return 0;
        uint256 diff = oldPrice > newPrice ? oldPrice - newPrice : newPrice - oldPrice;
        return (diff * 10000) / oldPrice;
    }
    
    function authorizeRelayer(address relayer) external onlyOwner {
        require(relayer != address(0), "Invalid address");
        authorizedRelayers[relayer] = true;
        emit RelayerAuthorized(relayer);
    }
    
    function revokeRelayer(address relayer) external onlyOwner {
        authorizedRelayers[relayer] = false;
        emit RelayerRevoked(relayer);
    }
    
    function enableChain(uint256 chainId) external onlyOwner {
        supportedChains[chainId] = true;
        emit ChainEnabled(chainId);
    }
    
    // SECURITY: Token binding on pool enable
    function enablePool(uint256 chainId, address pool, address token0, address token1) external onlyOwner {
        require(supportedChains[chainId], "Chain not supported");
        require(pool != address(0), "Invalid pool");
        require(token0 != address(0) && token1 != address(0), "Invalid tokens");
        enabledPools[chainId][pool] = true;
        poolConfig[chainId][pool] = PoolConfig(token0, token1, 0, 0);
        emit PoolEnabled(chainId, pool, token0, token1);
    }
    
    function canRelay(uint256 chainId, address pool) external view returns (bool) {
        if (!isActive) return false;
        if (!supportedChains[chainId]) return false;
        if (!enabledPools[chainId][pool]) return false;
        if (block.timestamp < lastRelayTime[chainId][pool] + minRelayInterval) return false;
        return true;
    }
    
    function pause() external onlyOwner { isActive = false; }
    function unpause() external onlyOwner { isActive = true; }
    function transferOwnership(address newOwner) external onlyOwner { 
        require(newOwner != address(0), "Invalid address");
        owner = newOwner; 
    }
}
```

### 3. `frontend/src/app/api/relay/fetch-price/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { SUPPORTED_CHAINS, isRelayChain } from '@/lib/chains';

const UNISWAP_V3_POOL_ABI = [
  {
    inputs: [],
    name: 'slot0',
    outputs: [
      { name: 'sqrtPriceX96', type: 'uint160' },
      { name: 'tick', type: 'int24' },
      { name: 'observationIndex', type: 'uint16' },
      { name: 'observationCardinality', type: 'uint16' },
      { name: 'observationCardinalityNext', type: 'uint16' },
      { name: 'feeProtocol', type: 'uint8' },
      { name: 'unlocked', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'liquidity',
    outputs: [{ type: 'uint128' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'token0',
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'token1',
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { chainId, poolAddress } = body;
    
    if (!isRelayChain(chainId)) {
      return NextResponse.json(
        { error: 'Not a relay chain' },
        { status: 400 }
      );
    }
    
    const chain = SUPPORTED_CHAINS.find(c => c.id === chainId);
    if (!chain) {
      return NextResponse.json({ error: 'Unsupported chain' }, { status: 400 });
    }
    
    const client = createPublicClient({
      transport: http(chain.rpcUrl),
    });
    
    // Fetch pool data and block info
    const blockNumber = await client.getBlockNumber();
    const [slot0, liquidity, token0, token1, block] = await Promise.all([
      client.readContract({
        address: poolAddress as `0x${string}`,
        abi: UNISWAP_V3_POOL_ABI,
        functionName: 'slot0',
      }),
      client.readContract({
        address: poolAddress as `0x${string}`,
        abi: UNISWAP_V3_POOL_ABI,
        functionName: 'liquidity',
      }),
      client.readContract({
        address: poolAddress as `0x${string}`,
        abi: UNISWAP_V3_POOL_ABI,
        functionName: 'token0',
      }),
      client.readContract({
        address: poolAddress as `0x${string}`,
        abi: UNISWAP_V3_POOL_ABI,
        functionName: 'token1',
      }),
      // CRITICAL: Use actual block timestamp, not server clock
      client.getBlock({ blockNumber }),
    ]);
    
    return NextResponse.json({
      chainId,
      poolAddress,
      sqrtPriceX96: slot0[0].toString(),
      tick: slot0[1],
      liquidity: liquidity.toString(),
      token0,
      token1,
      // SECURITY: Use chain block timestamp, not Date.now()
      sourceTimestamp: Number(block.timestamp),
      sourceBlockNumber: Number(blockNumber),
    });
    
  } catch (error) {
    console.error('Fetch price error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch price' },
      { status: 500 }
    );
  }
}
```

### 4. `frontend/src/components/chain/ChainSelector.tsx`

```tsx
'use client';

import { Check, AlertTriangle, Info } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SUPPORTED_CHAINS, getDirectChains, getRelayChains } from '@/lib/chains';

interface ChainSelectorProps {
  value: number | undefined;
  onChange: (chainId: number) => void;
  disabled?: boolean;
}

export function ChainSelector({ value, onChange, disabled }: ChainSelectorProps) {
  const selectedChain = value ? SUPPORTED_CHAINS.find(c => c.id === value) : undefined;
  
  return (
    <div className="space-y-3">
      <Select
        value={value?.toString()}
        onValueChange={(v) => onChange(parseInt(v))}
        disabled={disabled}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select source chain">
            {selectedChain && (
              <span className="flex items-center gap-2">
                {selectedChain.name}
                {selectedChain.category === 'relay' && (
                  <span className="text-xs bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded">
                    Relay
                  </span>
                )}
              </span>
            )}
          </SelectValue>
        </SelectTrigger>
        
        <SelectContent>
          <SelectGroup>
            <SelectLabel className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-500" />
              Direct (Trustless)
            </SelectLabel>
            {getDirectChains().map(chain => (
              <SelectItem key={chain.id} value={chain.id.toString()}>
                {chain.name} {chain.id === 14 && '(Current)'}
              </SelectItem>
            ))}
          </SelectGroup>
          
          <SelectGroup>
            <SelectLabel className="flex items-center gap-2 mt-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              Relay (Bot-Assisted)
            </SelectLabel>
            {getRelayChains().map(chain => (
              <SelectItem key={chain.id} value={chain.id.toString()}>
                {chain.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      
      {selectedChain?.category === 'relay' && (
        <Alert className="bg-yellow-50 border-yellow-200 dark:bg-yellow-950 dark:border-yellow-900">
          <Info className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-sm">
            <strong>{selectedChain.name}</strong> uses a relay bot. Prices are fetched 
            off-chain and relayed to Flare for FDC attestation.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
```

---

## Files to Modify

### 1. `frontend/src/lib/types.ts`

**Add these types (backward compatible):**

```typescript
// Add to existing types

export type SourceChainCategory = 'direct' | 'relay';

export interface SourceChain {
  id: number;
  name: string;
  category: SourceChainCategory;
}

// EXTEND StoredFeed (don't replace - keep backward compatible):
export interface StoredFeed {
  id: string;
  alias: string;
  
  // Source chain info (NEW - optional for backward compatibility)
  sourceChain?: SourceChain;           // Optional: if missing, infer Flare
  sourcePoolAddress?: `0x${string}`;   // Optional: falls back to poolAddress
  
  // Legacy fields (keep for backward compatibility)
  network?: string;                    // Deprecated: "flare" | "coston2"
  poolAddress?: `0x${string}`;         // Deprecated: use sourcePoolAddress
  
  // Flare deployment
  customFeedAddress: `0x${string}`;
  priceRecorderAddress?: `0x${string}`;  // Only for direct chains
  priceRelayAddress?: `0x${string}`;     // Only for relay chains
  
  // Token info (unchanged)
  token0: { address: `0x${string}`; symbol: string; decimals: number };
  token1: { address: `0x${string}`; symbol: string; decimals: number };
  invertPrice: boolean;
  
  // Metadata (unchanged)
  deployedAt: string;
  deployedBy: `0x${string}`;
}

// Helper to normalize legacy feeds
export function normalizeFeed(feed: StoredFeed): Required<Pick<StoredFeed, 'sourceChain' | 'sourcePoolAddress'>> & StoredFeed {
  // Infer chain from legacy 'network' field if sourceChain missing
  const inferredChain = feed.network === 'coston2' 
    ? { id: 114, name: 'Coston2', category: 'direct' as const }
    : { id: 14, name: 'Flare', category: 'direct' as const };
  
  return {
    ...feed,
    sourceChain: feed.sourceChain ?? inferredChain,
    sourcePoolAddress: feed.sourcePoolAddress ?? feed.poolAddress ?? '0x' as `0x${string}`,
  };
}

// Add StoredRelay type
export interface StoredRelay {
  id: string;
  address: `0x${string}`;
  minRelayInterval: number;
  maxPriceAge: number;
  supportedChainIds: number[];
  deployedAt: string;
  deployedBy: `0x${string}`;
}

// Update FeedsData
export interface FeedsData {
  version: string;  // Update to "2.0.0"
  feeds: StoredFeed[];
  recorders: StoredRecorder[];
  relays: StoredRelay[];  // NEW
}
```

### 2. `frontend/src/lib/wagmi-config.ts`

**Add Ethereum + Sepolia chains:**

```typescript
import { http, createConfig } from 'wagmi';
import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import {
  injectedWallet,
  rabbyWallet,
  metaMaskWallet,
  coinbaseWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { type Chain } from 'viem';

// Flare (existing)
export const flare = {
  id: 14,
  name: 'Flare',
  nativeCurrency: { name: 'Flare', symbol: 'FLR', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://flare-api.flare.network/ext/bc/C/rpc'] },
  },
  blockExplorers: {
    default: { name: 'Flare Explorer', url: 'https://flare-explorer.flare.network' },
  },
} as const satisfies Chain;

// Ethereum (NEW)
export const ethereum = {
  id: 1,
  name: 'Ethereum',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://eth.llamarpc.com'] },
  },
  blockExplorers: {
    default: { name: 'Etherscan', url: 'https://etherscan.io' },
  },
} as const satisfies Chain;

// Sepolia (NEW - for testing)
export const sepolia = {
  id: 11155111,
  name: 'Sepolia',
  nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.sepolia.org'] },
  },
  blockExplorers: {
    default: { name: 'Sepolia Etherscan', url: 'https://sepolia.etherscan.io' },
  },
  testnet: true,
} as const satisfies Chain;

// Coston2 (existing - keep for reference but not in active chains)
export const coston2 = {
  id: 114,
  name: 'Coston2',
  nativeCurrency: { name: 'Coston2 Flare', symbol: 'C2FLR', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://coston2-api.flare.network/ext/bc/C/rpc'] },
  },
  blockExplorers: {
    default: { name: 'Coston2 Explorer', url: 'https://coston2-explorer.flare.network' },
  },
  testnet: true,
} as const satisfies Chain;

// Include Ethereum + Sepolia in chains array
const chains = [flare, ethereum, sepolia] as const;

const connectors = connectorsForWallets(
  [
    {
      groupName: 'Wallets',
      wallets: [injectedWallet, rabbyWallet, metaMaskWallet, coinbaseWallet],
    },
  ],
  {
    appName: 'Flare Custom Feeds',
    projectId: 'flare-custom-feeds',
  }
);

export const config = createConfig({
  chains,
  connectors,
  transports: {
    [flare.id]: http(),
    [ethereum.id]: http(),
    [sepolia.id]: http(),
  },
  ssr: true,
});

export const supportedChains = chains;
export type SupportedChainId = typeof flare.id | typeof ethereum.id | typeof sepolia.id;

export function getChainById(chainId: number): Chain | undefined {
  return supportedChains.find(chain => chain.id === chainId);
}

export function getExplorerUrl(chainId: number, type: 'address' | 'tx', hash: string): string {
  const chain = getChainById(chainId);
  if (!chain?.blockExplorers?.default) return '#';
  return `${chain.blockExplorers.default.url}/${type === 'address' ? 'address' : 'tx'}/${hash}`;
}
```

### 3. `frontend/src/app/api/fdc/prepare-request/route.ts`

**Support multiple source chains:**

```typescript
import { NextRequest, NextResponse } from 'next/server';

// Verifier URLs by source chain
const VERIFIER_CONFIG: Record<number, { path: string; sourceId: string }> = {
  // Flare Mainnet
  14: {
    path: 'flr',
    sourceId: '0x464c520000000000000000000000000000000000000000000000000000000000',
  },
  // Ethereum Mainnet
  1: {
    path: 'eth',
    sourceId: '0x4554480000000000000000000000000000000000000000000000000000000000',
  },
  // Sepolia Testnet (uses testnet verifiers)
  11155111: {
    path: 'sepolia',
    sourceId: '0x7465737445544800000000000000000000000000000000000000000000000000',
  },
};

const VERIFIER_BASE_URLS: Record<number, string> = {
  14: 'https://fdc-verifiers-mainnet.flare.network/verifier',
  114: 'https://fdc-verifiers-testnet.flare.network/verifier',
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { flareChainId, sourceChainId, ...requestBody } = body;
    
    const baseUrl = VERIFIER_BASE_URLS[flareChainId as keyof typeof VERIFIER_BASE_URLS];
    if (!baseUrl) {
      return NextResponse.json(
        { error: `Unsupported Flare chain ID: ${flareChainId}` },
        { status: 400 }
      );
    }
    
    const sourceConfig = VERIFIER_CONFIG[sourceChainId as keyof typeof VERIFIER_CONFIG];
    if (!sourceConfig) {
      return NextResponse.json(
        { error: `Unsupported source chain ID: ${sourceChainId}` },
        { status: 400 }
      );
    }
    
    const verifierUrl = `${baseUrl}/${sourceConfig.path}/EVMTransaction/prepareRequest`;
    
    const response = await fetch(verifierUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': '00000000-0000-0000-0000-000000000000', // Flare's public FDC verifier key
      },
      body: JSON.stringify({
        ...requestBody,
        sourceId: sourceConfig.sourceId,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Verifier error: ${response.status} - ${errorText}` },
        { status: response.status }
      );
    }
    
    const data = await response.json();
    return NextResponse.json(data);
    
  } catch (error) {
    console.error('FDC prepare request error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
```

---

## Update Flow Logic

### Direct Flow (Flare & Ethereum)

```typescript
// In use-feed-updater.ts - Direct chain update

async function updateDirectFeed(feed: StoredFeed) {
  // Normalize for backward compatibility with legacy feeds
  const sourceChain = feed.sourceChain ?? { id: 14, name: 'Flare', category: 'direct' as const };
  const sourcePoolAddress = feed.sourcePoolAddress ?? feed.poolAddress!;
  
  // 1. If Ethereum/Sepolia, prompt network switch
  if (sourceChain.id !== 14) {
    toast.info(`Switching to ${sourceChain.name}...`, { id: 'network-switch' });
    await switchNetwork(sourceChain.id);
    toast.success(`Switched to ${sourceChain.name}`, { id: 'network-switch' });
  }
  
  // 2. Record price on source chain (requires ETH for gas on Ethereum)
  const recordTx = await recordPrice(
    feed.priceRecorderAddress!,
    sourcePoolAddress
  );
  
  // 3. Switch back to Flare
  if (sourceChain.id !== 14) {
    toast.info('Switching back to Flare...', { id: 'network-switch' });
    await switchNetwork(14);
    toast.success('Switched to Flare', { id: 'network-switch' });
  }
  
  // 4. Request attestation with correct sourceId
  const attestation = await requestAttestation({
    flareChainId: 14,
    sourceChainId: sourceChain.id,
    transactionHash: recordTx.hash,
  });
  
  // 5. Wait, get proof, submit (same as current)
}
```

### Relay Flow (Arbitrum, Base, etc.)

```typescript
// In use-feed-updater.ts - Relay chain update

async function updateRelayFeed(feed: StoredFeed) {
  // Normalize for consistency
  const sourceChain = feed.sourceChain!; // Relay feeds always have sourceChain (new schema only)
  const sourcePoolAddress = feed.sourcePoolAddress!;
  
  // 1. Fetch price from source chain (backend - no wallet needed)
  const priceData = await fetch('/api/relay/fetch-price', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chainId: sourceChain.id,
      poolAddress: sourcePoolAddress,
    }),
  }).then(r => r.json());
  
  // 2. Call PriceRelay on Flare (user signs this OR bot handles it)
  // Future: Allow frontend users to call relayPrice directly if authorized
  const relayTx = await relayPrice(feed.priceRelayAddress!, priceData);
  
  // 3. Request attestation (sourceId is ALWAYS FLR for relay - tx is on Flare)
  const attestation = await requestAttestation({
    flareChainId: 14,
    sourceChainId: 14,  // Relay tx is on Flare!
    transactionHash: relayTx.hash,
  });
  
  // 4. Wait, get proof, submit
}
```

---

## Deploy Page Changes

**Key modifications to `deploy/page.tsx`:**

1. Add ChainSelector at the top of feed configuration
2. Store `sourceChainId` in state
3. When `sourceChainId` is a relay chain:
   - Skip PriceRecorder deployment
   - Use shared PriceRelay address
4. When `sourceChainId` is Ethereum:
   - Prompt user to deploy PriceRecorder on Ethereum
   - Requires network switch
5. Save `sourceChain` object to feed data

---

## Implementation Order

### Phase 1: Ethereum Direct (Week 1-2)

**Testing Path:** ETH Sepolia → Flare Mainnet → ETH Mainnet

1. Create `lib/chains.ts` (include Sepolia for testing)
2. Modify `lib/wagmi-config.ts` (add Ethereum + Sepolia)
3. Modify `lib/types.ts` (add sourceChain, backward compatible)
4. Modify `api/fdc/prepare-request/route.ts` (multi-sourceId)
5. Modify `use-feed-updater.ts` (handle network switching)
6. Modify deploy page (add chain selection for Ethereum)
7. Modify feeds-context (normalize legacy feeds)
8. Test: Sepolia pool → Flare attestation
9. Test: ETH Mainnet pool → Flare attestation

**Ethereum UX Requirements:**
- Clear message: "You need ETH to record prices on Ethereum"
- Network switch prompts with toast feedback
- Handle user rejection gracefully

### Phase 2: Relay Infrastructure (Week 2-3)
1. Create `PriceRelay.sol`
2. Deploy to Flare mainnet (deployer = first relayer)
3. Create relay ABI in artifacts
4. Create `/api/relay/fetch-price` route

### Phase 3: Relay Flow (Week 3-4)
1. Create `ChainSelector.tsx`
2. Modify deploy page for relay chains
3. Modify `use-feed-updater.ts` for relay flow
4. Update feeds context for new schema
5. Test full Arbitrum → Flare flow

**Future: Frontend Relay Option**
- Design so user can sign relay tx directly (no bot needed)
- Requires: user has FLR, PriceRelay authorizes any caller (or specific users)

---

## Bot Changes (Phase 4)

The standalone bot (`src/custom-feeds-bot.js` and `src/fdc-client.js`) needs updates for cross-chain:

### FDC Client Updates

Current `fdc-client.js` has hardcoded FLR sourceId:
```javascript
// CURRENT (hardcoded)
sourceId: "0x464c52..."  // FLR only
```

Needs multi-chain support:
```javascript
// UPDATED
const SOURCE_IDS = {
  14: '0x464c520000000000000000000000000000000000000000000000000000000000',
  1: '0x4554480000000000000000000000000000000000000000000000000000000000',
  11155111: '0x7465737445544800000000000000000000000000000000000000000000000000',
};

const VERIFIER_PATHS = {
  14: 'flr',
  1: 'eth',
  11155111: 'sepolia',
};

function getVerifierUrl(sourceChainId) {
  const path = VERIFIER_PATHS[sourceChainId];
  return `https://fdc-verifiers-mainnet.flare.network/verifier/${path}/EVMTransaction/prepareRequest`;
}
```

### Bot Multi-Chain Config

Current env var pattern:
```bash
POOL_ADDRESS_<ALIAS>=0x...
CUSTOM_FEED_ADDRESS_<ALIAS>=0x...
```

Extended for cross-chain:
```bash
POOL_ADDRESS_<ALIAS>=0x...
CUSTOM_FEED_ADDRESS_<ALIAS>=0x...
SOURCE_CHAIN_<ALIAS>=1              # NEW: Ethereum chain ID
PRICE_RECORDER_<ALIAS>=0x...        # NEW: Recorder on source chain
```

Bot logic:
1. For Flare feeds (sourceChain=14): Use shared `PRICE_RECORDER_ADDRESS`
2. For Ethereum feeds (sourceChain=1): Use per-feed `PRICE_RECORDER_<ALIAS>`
3. For relay feeds: Call `relayPrice()` instead of `recordPrice()`

---

## Key Patterns to Follow

### Security (from UIPLAN.md)

```typescript
// Always validate addresses
import { isAddress, getAddress } from 'viem';

const addressSchema = z.string()
  .refine(isAddress, 'Invalid address')
  .transform(getAddress);

// Validate chain IDs
const chainIdSchema = z.number()
  .refine(id => SUPPORTED_CHAINS.some(c => c.id === id), 'Unsupported chain');
```

### Toast Pattern

```typescript
toast.info('Switching to Ethereum...', { id: 'network-switch' });
// ... switch ...
toast.success('Switched to Ethereum', { id: 'network-switch' });
```

### Network Switching

```typescript
import { useSwitchChain } from 'wagmi';

const { switchChain } = useSwitchChain();
await switchChain({ chainId: 1 }); // Ethereum
```

---

## Validation Checklist

### Phase 1 Completion (Ethereum Direct)

- [ ] `lib/chains.ts` created with Flare, Ethereum, Sepolia
- [ ] `lib/types.ts` updated with backward-compatible sourceChain
- [ ] `wagmi-config.ts` includes Ethereum + Sepolia
- [ ] `prepare-request/route.ts` handles multi-sourceId
- [ ] `use-feed-updater.ts` handles network switching
- [ ] Deploy page has chain selector (Flare/Ethereum only for Phase 1)
- [ ] Feeds context normalizes legacy feeds
- [ ] Legacy feeds (no sourceChain) display correctly
- [ ] New Ethereum feeds save with full v2.0.0 schema
- [ ] Sepolia pool → Flare attestation works
- [ ] ETH Mainnet pool → Flare attestation works
- [ ] "Requires ETH" messaging clear in UI
- [ ] Network switch rejection handled gracefully

### Phase 2 Completion (Relay Infrastructure)

- [ ] PriceRelay stores token0/token1 per pool on enable
- [ ] relayPrice verifies token binding
- [ ] relayPrice rejects future timestamps (sourceTimestamp <= block.timestamp)
- [ ] relayPrice enforces monotonic sourceBlockNumber
- [ ] relayPrice includes deviation check (MAX_DEVIATION_BPS = 5000)
- [ ] sourceTimestamp comes from chain block, not server clock
- [ ] `/api/relay/fetch-price` fetches actual block.timestamp

### Full Implementation (All Phases)

- [ ] Relay chains show trust warning
- [ ] Update flow works for both direct and relay
- [ ] Error handling covers network failures
- [ ] Mobile responsive

---

*End of Cross-Chain Context*

