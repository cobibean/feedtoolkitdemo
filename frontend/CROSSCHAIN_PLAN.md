# Cross-Chain Custom Feeds: Architecture & Implementation Plan

> AI-optimized reference for extending the Flare Custom Feeds Toolkit to support cross-chain pools.
> For existing architecture, see `CODEBASE_CONTEXT.md`. For UI patterns, see `UIPLAN.md`.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Research Findings](#research-findings)
3. [Architecture Overview](#architecture-overview)
4. [Chain Categories & Flows](#chain-categories--flows)
5. [Security Requirements](#security-requirements)
6. [Contract Changes](#contract-changes)
7. [Frontend Changes](#frontend-changes)
8. [API & Backend Changes](#api--backend-changes)
9. [Data Schema Updates](#data-schema-updates)
10. [Implementation Phases](#implementation-phases)
11. [Testing Strategy](#testing-strategy)
12. [Open Questions & Future Work](#open-questions--future-work)

---

## Executive Summary

### Goal

Enable users to create FDC-verified custom price feeds from Uniswap V3 pools on **any EVM chain**, with verified prices stored on Flare.

### Two-Tier Architecture

| Source Chain | Flow Type | FDC Attestation | Trust Model |
|--------------|-----------|-----------------|-------------|
| **Flare, Ethereum** | Direct | Attests source chain tx | Trustless (FDC only) |
| **Arbitrum, Base, Optimism, Polygon, etc.** | Relay | Attests Flare relay tx | Trust bot + FDC |

### Key Insight

FDC's `EVMTransaction` attestation only supports **Flare, Ethereum, and Songbird**. For other chains, we use a relay pattern where a bot reads prices off-chain and posts them to a relay contract on Flare, which FDC then attests.

### UX Principle

**Same simple flow regardless of chain.** The complexity is hidden from users:
- User selects source chain + pool
- User clicks "Update Feed"
- System handles everything based on chain type
- User signs only Flare transactions (for relay chains) or source chain + Flare (for direct chains)

---

## Key Decisions (Confirmed)

> These decisions were finalized before implementation began.

### 1. Schema Migration: Backward Compatible

No explicit migration needed. Make `sourceChain` optional in the code:

```typescript
// Normalize legacy feeds (v1.0.0 → v2.0.0)
const inferredChain = feed.network === 'coston2' 
  ? { id: 114, name: 'Coston2', category: 'direct' }
  : { id: 14, name: 'Flare', category: 'direct' };

const sourceChain = feed.sourceChain ?? inferredChain;
const sourcePoolAddress = feed.sourcePoolAddress ?? feed.poolAddress;
```

**Legacy v1.0.0 fields:**
- `network: "flare" | "coston2"` → Infer chain ID
- `poolAddress` → Fallback for `sourcePoolAddress`

- Old feeds keep working (treated as Flare/Coston2 source based on `network`)
- New feeds use full v2.0.0 schema
- Zero migration step for users
- Apply this pattern anywhere feeds are read; for writes, always use new schema

### 2. Relay Authentication: Use Existing Bot Wallet

The `PriceRelay` constructor auto-authorizes `msg.sender`, so whoever deploys becomes the first authorized relayer. Use the same `DEPLOYER_PRIVATE_KEY` the current bot uses. No new infrastructure needed.

**Future-proofing:** Design so frontend users can later call `relayPrice()` directly if authorized.

### 3. Ethereum Gas: Users Must Have ETH

No gas abstraction for v1. Document requirement clearly in UI with messaging like "You need ETH to record prices on Ethereum."

### 4. Testing Strategy

```
Ethereum Mainnet → Flare Mainnet
```

Flare mainnet is already validated. Focus on proving multi-sourceId FDC attestation works.

### 5. Implementation Order: Phase 1 First

Start with Ethereum Direct — lowest risk, validates multi-sourceId before investing in relay infrastructure.

---

## Research Findings

### FDC EVMTransaction Support

Verified via FDC verifier API endpoints (December 2024):

```
Mainnet Verifiers:
  /verifier/flr/EVMTransaction  ← Flare ✅
  /verifier/eth/EVMTransaction  ← Ethereum ✅
  /verifier/sgb/EVMTransaction  ← Songbird ✅
  
NOT Available:
  /verifier/arb/EVMTransaction  ← Arbitrum ❌
  /verifier/base/EVMTransaction ← Base ❌
  /verifier/op/EVMTransaction   ← Optimism ❌
```

### Source IDs for Attestation

```typescript
// Mainnet
const SOURCE_IDS = {
  FLR: '0x464c520000000000000000000000000000000000000000000000000000000000',
  ETH: '0x4554480000000000000000000000000000000000000000000000000000000000',
  SGB: '0x5347420000000000000000000000000000000000000000000000000000000000',
};

// Testnet
const TEST_SOURCE_IDS = {
  testFLR: '0x7465737446...',
  testETH: '0x7465737445...',
  testSGB: '0x7465737453...',
};
```

### Verifier URLs

```typescript
const VERIFIER_URLS = {
  // Mainnet
  14: {
    FLR: 'https://fdc-verifiers-mainnet.flare.network/verifier/flr/EVMTransaction/prepareRequest',
    ETH: 'https://fdc-verifiers-mainnet.flare.network/verifier/eth/EVMTransaction/prepareRequest',
  },
};
```

### Alternative Approaches Considered

| Approach | Verdict | Reason |
|----------|---------|--------|
| Web2Json with RPC endpoint | ❌ | Requires governance approval per endpoint |
| Web2Json with The Graph | ❌ | No approved subgraph endpoints yet |
| Governance proposal for new chains | ⏳ | Viable long-term, months timeline |
| Relay pattern | ✅ | Works today, acceptable trust tradeoff |

---

## Architecture Overview

### Direct Flow (Flare & Ethereum)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           DIRECT FLOW                                    │
│                     (Flare & Ethereum pools)                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   [Source Chain: Flare or Ethereum]                                      │
│                                                                          │
│   1. User calls PriceRecorder.recordPrice(pool)                          │
│      └── Emits PriceRecorded event on source chain                       │
│                                                                          │
│   [Flare Network]                                                        │
│                                                                          │
│   2. FdcHub.requestAttestation(sourceId: FLR or ETH)                     │
│      └── Pays ~1 FLR fee                                                 │
│                                                                          │
│   3. Wait for finalization (~90-180s)                                    │
│                                                                          │
│   4. Retrieve proof from DA Layer                                        │
│                                                                          │
│   5. CustomFeed.updateFromProof(proof)                                   │
│      └── Verifies proof, stores price                                    │
│                                                                          │
│   Trust: FDC consensus only (trustless)                                  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Relay Flow (Arbitrum, Base, Optimism, Polygon, etc.)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           RELAY FLOW                                     │
│              (Arbitrum, Base, Optimism, Polygon, etc.)                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   [Source Chain: e.g., Arbitrum]                                         │
│                                                                          │
│   1. Bot reads pool.slot0() via RPC (off-chain)                          │
│      └── No transaction on source chain                                  │
│                                                                          │
│   [Flare Network]                                                        │
│                                                                          │
│   2. Bot calls PriceRelay.relayPrice(sourceChain, pool, sqrtPriceX96)    │
│      └── Emits PriceRelayed event on Flare                               │
│                                                                          │
│   3. FdcHub.requestAttestation(sourceId: FLR)                            │
│      └── Attests the Flare relay transaction                             │
│                                                                          │
│   4. Wait for finalization (~90-180s)                                    │
│                                                                          │
│   5. Retrieve proof from DA Layer                                        │
│                                                                          │
│   6. CustomFeed.updateFromProof(proof)                                   │
│      └── Verifies proof came from trusted relay                          │
│                                                                          │
│   Trust: Bot (relayer) + FDC consensus                                   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Chain Categories & Flows

### Chain Classification

```typescript
// frontend/src/lib/chains.ts

export type ChainCategory = 'direct' | 'relay';

export interface SupportedChain {
  id: number;
  name: string;
  category: ChainCategory;
  sourceId?: string;           // For direct chains
  verifierPath?: string;       // For direct chains
  rpcUrl: string;
  explorerUrl: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  v3FactoryAddress?: string;   // Uniswap V3 factory for pool validation
}

export const SUPPORTED_CHAINS: SupportedChain[] = [
  // === DIRECT CHAINS (FDC EVMTransaction supported) ===
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
    v3FactoryAddress: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  },

  // === RELAY CHAINS (Bot-relayed to Flare) ===
  {
    id: 42161,
    name: 'Arbitrum',
    category: 'relay',
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    explorerUrl: 'https://arbiscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    v3FactoryAddress: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  },
  {
    id: 8453,
    name: 'Base',
    category: 'relay',
    rpcUrl: 'https://mainnet.base.org',
    explorerUrl: 'https://basescan.org',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    v3FactoryAddress: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
  },
  {
    id: 10,
    name: 'Optimism',
    category: 'relay',
    rpcUrl: 'https://mainnet.optimism.io',
    explorerUrl: 'https://optimistic.etherscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    v3FactoryAddress: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  },
  {
    id: 137,
    name: 'Polygon',
    category: 'relay',
    rpcUrl: 'https://polygon-rpc.com',
    explorerUrl: 'https://polygonscan.com',
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    v3FactoryAddress: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  },
];

// Helper functions
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

### UI Chain Selector

```tsx
// Chain selection with visual grouping

<ChainSelector value={selectedChain} onChange={setSelectedChain}>
  <ChainGroup label="Direct (Trustless)">
    <ChainOption chain={flare} badge="Current" />
    <ChainOption chain={ethereum} badge="FDC Verified" />
  </ChainGroup>
  
  <Separator />
  
  <ChainGroup label="Relay (Bot-Assisted)">
    <ChainOption chain={arbitrum} />
    <ChainOption chain={base} />
    <ChainOption chain={optimism} />
    <ChainOption chain={polygon} />
  </ChainGroup>
  
  <InfoBanner>
    <InfoIcon />
    <Text>
      Relay chains use a bot to fetch prices. 
      <Link href="/docs/trust-model">Learn about trust assumptions</Link>
    </Text>
  </InfoBanner>
</ChainSelector>
```

---

## Security Requirements

### Extended Security Layers (from UIPLAN.md)

```
Layer 1: Client-Side (Extended)
├── Input sanitization (addresses, numbers only where expected)
├── Address validation (checksum, length)
├── Chain ID validation (must be in SUPPORTED_CHAINS)
├── Pool address validation per chain (V3 factory check)
├── Cross-origin RPC validation (only trusted RPCs)
└── XSS prevention (no dangerouslySetInnerHTML with user data)

Layer 2: Wallet Actions (Extended)
├── Authenticated actions only (require connected wallet)
├── Chain ID verification before transactions
├── Multi-network signing flow (for Ethereum direct)
├── Network switch confirmation dialogs
├── Transaction simulation where possible
└── Clear user confirmation for all on-chain actions

Layer 3: API/Backend Validation (Extended)
├── Zod schemas for all form data including sourceChain
├── RPC response validation (slot0 return data structure)
├── Pool existence verification on source chain
├── Rate limiting on relay endpoints
├── Relayer authentication (for relay flow)
└── Sanitize before writing to feeds.json

Layer 4: Contract Guardrails (Extended)
├── Owner-only admin functions (existing)
├── PriceRelay: authorized relayers whitelist
├── PriceRelay: source chain validation
├── PriceRelay: timestamp freshness checks
├── CustomFeed: source address validation (recorder OR relay)
└── FDC proof verification (existing)

Layer 5: Relay-Specific Security
├── Relayer address whitelisting
├── Price deviation checks (reject >50% swings)
├── Minimum update interval enforcement
├── Source chain RPC redundancy (multiple providers)
├── Heartbeat monitoring for relay health
└── Alert on prolonged relay inactivity
```

### Validation Schemas (Extended)

```typescript
// frontend/src/lib/validation.ts

import { z } from 'zod';
import { getAddress, isAddress } from 'viem';
import { SUPPORTED_CHAINS, isDirectChain, isRelayChain } from './chains';

// Chain ID schema
export const chainIdSchema = z.number().refine(
  (id) => SUPPORTED_CHAINS.some(c => c.id === id),
  { message: 'Unsupported chain' }
);

// Source chain schema (for feed creation)
export const sourceChainSchema = z.object({
  chainId: chainIdSchema,
  category: z.enum(['direct', 'relay']),
});

// Extended pool config schema
export const crossChainPoolConfigSchema = z.object({
  sourceChainId: chainIdSchema,
  poolAddress: addressSchema,
  feedAlias: z.string()
    .min(1, 'Alias required')
    .max(20, 'Max 20 characters')
    .regex(/^[A-Z0-9_]+$/, 'Uppercase letters, numbers, underscores only'),
  token0Decimals: z.number().int().min(0).max(18),
  token1Decimals: z.number().int().min(0).max(18),
  invertPrice: z.boolean().default(false),
});

// Extended feed storage schema
export const crossChainFeedSchema = z.object({
  id: z.string().uuid(),
  alias: z.string(),
  
  // Source chain info
  sourceChainId: chainIdSchema,
  sourceChainName: z.string(),
  sourcePoolAddress: addressSchema,
  
  // Flare deployment info
  customFeedAddress: addressSchema,
  priceRecorderAddress: addressSchema.optional(),  // Only for direct chains
  priceRelayAddress: addressSchema.optional(),     // Only for relay chains
  
  // Token info
  token0: z.object({
    address: addressSchema,
    symbol: z.string(),
    decimals: z.number(),
  }),
  token1: z.object({
    address: addressSchema,
    symbol: z.string(),
    decimals: z.number(),
  }),
  invertPrice: z.boolean(),
  
  // Metadata
  deployedAt: z.string().datetime(),
  deployedBy: addressSchema,
});

// Relay price data (for backend validation)
export const relayPriceDataSchema = z.object({
  sourceChainId: chainIdSchema,
  poolAddress: addressSchema,
  sqrtPriceX96: z.string().regex(/^\d+$/, 'Must be numeric string'),
  tick: z.number().int(),
  liquidity: z.string().regex(/^\d+$/, 'Must be numeric string'),
  token0: addressSchema,
  token1: addressSchema,
  sourceTimestamp: z.number().int().positive(),
  sourceBlockNumber: z.number().int().positive(),
});
```

### Relay Security Contract Pattern

```solidity
// PriceRelay.sol security features

contract PriceRelay {
    // === Access Control ===
    mapping(address => bool) public authorizedRelayers;
    
    modifier onlyAuthorizedRelayer() {
        require(authorizedRelayers[msg.sender], "Not authorized relayer");
        _;
    }
    
    // === Freshness Checks ===
    uint256 public constant MAX_PRICE_AGE = 5 minutes;
    
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
    ) external onlyAuthorizedRelayer {
        // Freshness check
        require(
            block.timestamp - sourceTimestamp <= MAX_PRICE_AGE,
            "Price data too old"
        );
        
        // ... rest of implementation
    }
    
    // === Deviation Protection ===
    mapping(bytes32 => uint256) public lastPrices;  // poolKey => last sqrtPriceX96
    uint256 public constant MAX_DEVIATION_BPS = 5000;  // 50%
    
    function _checkDeviation(bytes32 poolKey, uint256 newPrice) internal view {
        uint256 lastPrice = lastPrices[poolKey];
        if (lastPrice > 0) {
            uint256 deviation = newPrice > lastPrice 
                ? ((newPrice - lastPrice) * 10000) / lastPrice
                : ((lastPrice - newPrice) * 10000) / lastPrice;
            require(deviation <= MAX_DEVIATION_BPS, "Price deviation too high");
        }
    }
}
```

---

## Contract Changes

### Overview

| Contract | Action | Deployed On | Purpose |
|----------|--------|-------------|---------|
| `PriceRecorder.sol` | Unchanged | Flare, Ethereum | Record prices on direct chains |
| `PriceRelay.sol` | **NEW** | Flare | Receive relayed prices, emit events |
| `PoolPriceCustomFeed.sol` | Modified | Flare | Accept proofs from recorder OR relay |
| `CrossChainCustomFeed.sol` | **NEW** (optional) | Flare | Dedicated relay-aware feed |

### New Contract: PriceRelay.sol

> **Security-hardened** with token binding, monotonicity guards, deviation checks, and future timestamp rejection.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title PriceRelay
 * @notice Receives price data from authorized relayers and emits attestable events
 * @dev Security-hardened for production use
 */
contract PriceRelay {
    // ==================== State Variables ====================
    
    address public owner;
    bool public isActive;
    
    /// @notice Authorized relayer addresses
    mapping(address => bool) public authorizedRelayers;
    
    /// @notice Supported source chains
    mapping(uint256 => bool) public supportedChains;
    
    /// @notice Enabled pools per chain: chainId => poolAddress => enabled
    mapping(uint256 => mapping(address => bool)) public enabledPools;
    
    /// @notice Last relay timestamp per pool
    mapping(uint256 => mapping(address => uint256)) public lastRelayTime;
    
    /// @notice Minimum time between relays (prevents spam)
    uint256 public minRelayInterval;
    
    /// @notice Maximum age of source data accepted
    uint256 public maxPriceAge;
    
    /// @notice Maximum price deviation allowed (basis points)
    uint256 public constant MAX_DEVIATION_BPS = 5000; // 50%
    
    // SECURITY: Token binding and monotonicity tracking per pool
    struct PoolConfig {
        address token0;           // Bound on enablePool
        address token1;           // Bound on enablePool
        uint256 lastBlockNumber;  // For monotonicity check
        uint256 lastSqrtPriceX96; // For deviation check
        uint256 relayCount;
    }
    mapping(uint256 => mapping(address => PoolConfig)) public poolConfig;
    
    // ==================== Events ====================
    
    /// @notice Emitted when price is relayed - this is what FDC attests
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
    event ChainDisabled(uint256 indexed chainId);
    event PoolEnabled(uint256 indexed chainId, address indexed pool, address token0, address token1);
    event PoolDisabled(uint256 indexed chainId, address indexed pool);
    
    // ==================== Modifiers ====================
    
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
    
    // ==================== Constructor ====================
    
    constructor(uint256 _minRelayInterval, uint256 _maxPriceAge) {
        owner = msg.sender;
        isActive = true;
        minRelayInterval = _minRelayInterval;
        maxPriceAge = _maxPriceAge;
        
        // Owner is initially an authorized relayer
        authorizedRelayers[msg.sender] = true;
        emit RelayerAuthorized(msg.sender);
    }
    
    // ==================== Core Relay Function ====================
    
    /**
     * @notice Relay price data from an external chain
     * @dev Only callable by authorized relayers. Includes all security guards.
     */
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
        config.relayCount++;
        lastRelayTime[sourceChainId][poolAddress] = block.timestamp;
        
        // Emit event - THIS IS WHAT FDC WILL ATTEST
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
    
    /// @notice Calculate price deviation in basis points
    function _calculateDeviation(uint256 oldPrice, uint256 newPrice) internal pure returns (uint256) {
        if (oldPrice == 0) return 0;
        uint256 diff = oldPrice > newPrice ? oldPrice - newPrice : newPrice - oldPrice;
        return (diff * 10000) / oldPrice;
    }
    
    // ==================== Admin Functions ====================
    
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
    
    function disableChain(uint256 chainId) external onlyOwner {
        supportedChains[chainId] = false;
        emit ChainDisabled(chainId);
    }
    
    // SECURITY: Token binding on pool enable
    function enablePool(
        uint256 chainId, 
        address pool, 
        address token0, 
        address token1
    ) external onlyOwner {
        require(supportedChains[chainId], "Chain not supported");
        require(pool != address(0), "Invalid pool");
        require(token0 != address(0) && token1 != address(0), "Invalid tokens");
        enabledPools[chainId][pool] = true;
        poolConfig[chainId][pool] = PoolConfig(token0, token1, 0, 0, 0);
        emit PoolEnabled(chainId, pool, token0, token1);
    }
    
    function disablePool(uint256 chainId, address pool) external onlyOwner {
        enabledPools[chainId][pool] = false;
        emit PoolDisabled(chainId, pool);
    }
    
    function setMinRelayInterval(uint256 interval) external onlyOwner {
        require(interval > 0, "Invalid interval");
        minRelayInterval = interval;
    }
    
    function setMaxPriceAge(uint256 age) external onlyOwner {
        require(age > 0, "Invalid age");
        maxPriceAge = age;
    }
    
    function pause() external onlyOwner {
        isActive = false;
    }
    
    function unpause() external onlyOwner {
        isActive = true;
    }
    
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        owner = newOwner;
    }
    
    // ==================== View Functions ====================
    
    function canRelay(uint256 chainId, address pool) external view returns (bool) {
        if (!isActive) return false;
        if (!supportedChains[chainId]) return false;
        if (!enabledPools[chainId][pool]) return false;
        if (block.timestamp < lastRelayTime[chainId][pool] + minRelayInterval) return false;
        return true;
    }
    
    function getPoolConfig(uint256 chainId, address pool) external view returns (PoolConfig memory) {
        return poolConfig[chainId][pool];
    }
}
```

### Modified: PoolPriceCustomFeed.sol

Key changes to accept proofs from both `PriceRecorder` and `PriceRelay`:

```solidity
// Add to existing contract

/// @notice Optional: PriceRelay contract (for relay chain feeds)
address public immutable priceRelayAddress;

/// @notice Source chain ID (14 for Flare, 1 for Ethereum, etc.)
uint256 public immutable sourceChainId;

/// @notice Whether this feed uses relay flow
bool public immutable isRelayFeed;

/// @notice keccak256("PriceRelayed(uint256,address,uint160,int24,uint128,address,address,uint256,uint256,uint256,address)")
bytes32 private constant PRICE_RELAYED_TOPIC = keccak256(
    "PriceRelayed(uint256,address,uint160,int24,uint128,address,address,uint256,uint256,uint256,address)"
);

// Modified constructor
constructor(
    address _priceRecorder,      // Address on source chain (or address(0) for relay)
    address _priceRelay,         // Address on Flare (or address(0) for direct)
    address _poolAddress,        // Pool address on source chain
    uint256 _sourceChainId,      // Source chain ID
    string memory _feedName,
    address _fdcVerificationAddress,
    uint8 _token0Decimals,
    uint8 _token1Decimals,
    bool _invertPrice
) {
    // ... existing validation ...
    
    // Determine flow type
    isRelayFeed = _priceRelay != address(0);
    priceRecorderAddress = _priceRecorder;
    priceRelayAddress = _priceRelay;
    sourceChainId = _sourceChainId;
}

// Modified event parsing
function _parseEvents(
    IEVMTransaction.Event[] memory events
) private view returns (uint256 price, uint64 timestamp) {
    bool found = false;
    
    for (uint256 i = 0; i < events.length; i++) {
        IEVMTransaction.Event memory evt = events[i];
        
        if (isRelayFeed) {
            // Parse PriceRelayed event from PriceRelay
            if (evt.emitterAddress != priceRelayAddress) continue;
            if (evt.topics.length > 0 && evt.topics[0] == PRICE_RELAYED_TOPIC) {
                // topics[1] = sourceChainId, topics[2] = poolAddress
                uint256 eventChainId = uint256(evt.topics[1]);
                address eventPool = address(uint160(uint256(evt.topics[2])));
                
                require(eventChainId == sourceChainId, "Wrong source chain");
                require(eventPool == poolAddress, "Wrong pool");
                
                // Decode non-indexed parameters
                (
                    uint160 sqrtPriceX96,
                    , // tick
                    , // liquidity
                    , // token0
                    , // token1
                    uint256 sourceTimestamp,
                    , // sourceBlockNumber
                    , // relayTimestamp
                    // relayer
                ) = abi.decode(evt.data, (uint160, int24, uint128, address, address, uint256, uint256, uint256, address));
                
                price = _calculatePrice(sqrtPriceX96);
                timestamp = uint64(sourceTimestamp);
                found = true;
                break;
            }
        } else {
            // Parse PriceRecorded event from PriceRecorder (existing logic)
            if (evt.emitterAddress != priceRecorderAddress) continue;
            if (evt.topics.length > 0 && evt.topics[0] == PRICE_RECORDED_TOPIC) {
                // ... existing parsing logic ...
            }
        }
    }
    
    require(found, "Price event not found");
}
```

---

## Frontend Changes

### New Components

```
frontend/src/components/
├── chain/
│   ├── ChainSelector.tsx         # Chain dropdown with grouping
│   ├── ChainBadge.tsx            # Visual chain indicator
│   ├── ChainIcon.tsx             # Chain logo/icon
│   └── TrustModelBanner.tsx      # Explains trust for relay chains
├── deploy/
│   ├── CrossChainDeployModal.tsx # Extended deploy flow
│   ├── DirectChainConfig.tsx     # Config for Flare/ETH
│   └── RelayChainConfig.tsx      # Config for relay chains
└── monitor/
    └── CrossChainFeedCard.tsx    # Feed card with source chain info
```

### ChainSelector Component

```tsx
// frontend/src/components/chain/ChainSelector.tsx

'use client';

import { useState } from 'react';
import { Check, ChevronDown, Info, AlertTriangle } from 'lucide-react';
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
import { 
  SUPPORTED_CHAINS, 
  getDirectChains, 
  getRelayChains,
  type SupportedChain 
} from '@/lib/chains';

interface ChainSelectorProps {
  value: number | undefined;
  onChange: (chainId: number) => void;
  disabled?: boolean;
}

export function ChainSelector({ value, onChange, disabled }: ChainSelectorProps) {
  const selectedChain = value ? SUPPORTED_CHAINS.find(c => c.id === value) : undefined;
  const directChains = getDirectChains();
  const relayChains = getRelayChains();
  
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
              <div className="flex items-center gap-2">
                <ChainIcon chainId={selectedChain.id} className="h-5 w-5" />
                <span>{selectedChain.name}</span>
                {selectedChain.category === 'relay' && (
                  <span className="text-xs bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded">
                    Relay
                  </span>
                )}
              </div>
            )}
          </SelectValue>
        </SelectTrigger>
        
        <SelectContent>
          <SelectGroup>
            <SelectLabel className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-500" />
              Direct (Trustless)
            </SelectLabel>
            {directChains.map(chain => (
              <SelectItem key={chain.id} value={chain.id.toString()}>
                <div className="flex items-center gap-2">
                  <ChainIcon chainId={chain.id} className="h-4 w-4" />
                  <span>{chain.name}</span>
                  {chain.id === 14 && (
                    <span className="text-xs text-muted-foreground">(Current)</span>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectGroup>
          
          <SelectGroup>
            <SelectLabel className="flex items-center gap-2 mt-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              Relay (Bot-Assisted)
            </SelectLabel>
            {relayChains.map(chain => (
              <SelectItem key={chain.id} value={chain.id.toString()}>
                <div className="flex items-center gap-2">
                  <ChainIcon chainId={chain.id} className="h-4 w-4" />
                  <span>{chain.name}</span>
                </div>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      
      {/* Trust model explanation for relay chains */}
      {selectedChain?.category === 'relay' && (
        <Alert variant="warning" className="bg-yellow-50 border-yellow-200 dark:bg-yellow-950 dark:border-yellow-900">
          <Info className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-sm">
            <strong>{selectedChain.name}</strong> uses a relay bot to fetch prices. 
            The bot is trusted to report accurate data. 
            <a href="/docs/trust-model" className="underline ml-1">
              Learn more
            </a>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
```

### CrossChainDeployModal Flow

```tsx
// Different config steps based on chain category

function CrossChainDeployModal({ open, onClose }) {
  const [sourceChain, setSourceChain] = useState<SupportedChain | null>(null);
  const [step, setStep] = useState<DeployStep>('select-chain');
  
  // Determine flow based on chain category
  const isDirectFlow = sourceChain?.category === 'direct';
  const isRelayFlow = sourceChain?.category === 'relay';
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        {step === 'select-chain' && (
          <SelectChainStep 
            onSelect={(chain) => {
              setSourceChain(chain);
              setStep('configure-pool');
            }} 
          />
        )}
        
        {step === 'configure-pool' && (
          <ConfigurePoolStep
            sourceChain={sourceChain!}
            onNext={() => setStep(isDirectFlow ? 'deploy-recorder' : 'review')}
            onBack={() => setStep('select-chain')}
          />
        )}
        
        {/* Direct flow: need to deploy PriceRecorder on source chain */}
        {step === 'deploy-recorder' && isDirectFlow && (
          <DeployRecorderStep
            sourceChain={sourceChain!}
            onNext={() => setStep('deploy-feed')}
            onBack={() => setStep('configure-pool')}
          />
        )}
        
        {/* Relay flow: skip to feed deployment, uses shared PriceRelay */}
        {step === 'review' && isRelayFlow && (
          <RelayReviewStep
            sourceChain={sourceChain!}
            poolConfig={poolConfig}
            onNext={() => setStep('deploy-feed')}
            onBack={() => setStep('configure-pool')}
          />
        )}
        
        {step === 'deploy-feed' && (
          <DeployFeedStep
            sourceChain={sourceChain!}
            isRelayFeed={isRelayFlow}
            onSuccess={() => setStep('success')}
          />
        )}
        
        {step === 'success' && (
          <SuccessStep 
            feedAddress={deployedFeedAddress}
            sourceChain={sourceChain!}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
```

### Update Flow Adaptation

```typescript
// frontend/src/hooks/use-crosschain-feed-updater.ts

export function useCrossChainFeedUpdater() {
  // ... existing state ...
  
  const updateFeed = useCallback(async (feed: CrossChainFeed) => {
    const sourceChain = getChainById(feed.sourceChainId);
    
    if (sourceChain?.category === 'direct') {
      // DIRECT FLOW: Same as current, but with dynamic sourceId
      await updateDirectFeed(feed, sourceChain);
    } else {
      // RELAY FLOW: Fetch price, relay to Flare, attest relay tx
      await updateRelayFeed(feed, sourceChain);
    }
  }, []);
  
  const updateDirectFeed = async (feed: CrossChainFeed, chain: SupportedChain) => {
    // 1. Switch to source chain if needed (for Ethereum)
    if (chain.id !== 14) {
      updateProgress('switching-network', `Switch to ${chain.name} to record price...`);
      await switchNetwork(chain.id);
    }
    
    // 2. Record price on source chain
    updateProgress('recording', `Recording price on ${chain.name}...`);
    const recordTx = await recordPrice(feed.priceRecorderAddress!, feed.sourcePoolAddress);
    
    // 3. Switch back to Flare for attestation
    if (chain.id !== 14) {
      updateProgress('switching-network', 'Switching back to Flare...');
      await switchNetwork(14);
    }
    
    // 4. Request attestation with correct sourceId
    updateProgress('requesting-attestation', 'Requesting FDC attestation...');
    const attestationResult = await requestAttestation(
      recordTx.hash,
      chain.sourceId!,
      chain.verifierPath!
    );
    
    // 5. Wait, retrieve proof, submit (same as current)
    // ...
  };
  
  const updateRelayFeed = async (feed: CrossChainFeed, chain: SupportedChain) => {
    // 1. Backend fetches price from source chain RPC
    updateProgress('fetching', `Fetching price from ${chain.name}...`);
    const priceData = await fetchPoolPrice(chain.id, feed.sourcePoolAddress);
    
    // 2. Backend relays to PriceRelay on Flare
    updateProgress('relaying', 'Relaying price to Flare...');
    const relayTx = await relayPrice(priceData);
    
    // 3. Request attestation (sourceId is always FLR for relay)
    updateProgress('requesting-attestation', 'Requesting FDC attestation...');
    const attestationResult = await requestAttestation(
      relayTx.hash,
      SOURCE_IDS.FLR,
      'flr'
    );
    
    // 4. Wait, retrieve proof, submit (same flow)
    // ...
  };
  
  return { updateFeed, progress, isUpdating, cancel };
}
```

---

## API & Backend Changes

### New API Routes

```
frontend/src/app/api/
├── fdc/
│   ├── prepare-request/route.ts  # Extended for multi-chain
│   └── get-proof/route.ts        # Unchanged
├── relay/
│   ├── fetch-price/route.ts      # NEW: Fetch price from source chain
│   └── submit-relay/route.ts     # NEW: Submit to PriceRelay
└── feeds/route.ts                # Extended schema
```

### Fetch Price API

```typescript
// frontend/src/app/api/relay/fetch-price/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { z } from 'zod';
import { SUPPORTED_CHAINS, isRelayChain } from '@/lib/chains';

const requestSchema = z.object({
  chainId: z.number(),
  poolAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});

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
    const { chainId, poolAddress } = requestSchema.parse(body);
    
    // Validate chain is a relay chain
    if (!isRelayChain(chainId)) {
      return NextResponse.json(
        { error: 'Not a relay chain. Use direct flow for this chain.' },
        { status: 400 }
      );
    }
    
    const chain = SUPPORTED_CHAINS.find(c => c.id === chainId);
    if (!chain) {
      return NextResponse.json({ error: 'Unsupported chain' }, { status: 400 });
    }
    
    // Create client for source chain
    const client = createPublicClient({
      transport: http(chain.rpcUrl),
    });
    
    // Fetch pool data
    const [slot0, liquidity, token0, token1] = await Promise.all([
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
    ]);
    
    // SECURITY: Fetch actual block timestamp from chain, not server clock
    const blockNumber = await client.getBlockNumber();
    const block = await client.getBlock({ blockNumber });
    
    return NextResponse.json({
      chainId,
      poolAddress,
      sqrtPriceX96: slot0[0].toString(),
      tick: slot0[1],
      liquidity: liquidity.toString(),
      token0,
      token1,
      // CRITICAL: Use chain block timestamp, not Date.now()
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

### Extended FDC Prepare Request

```typescript
// frontend/src/app/api/fdc/prepare-request/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { SUPPORTED_CHAINS, isDirectChain } from '@/lib/chains';

// Verifier URLs by chain
const VERIFIER_URLS: Record<number, Record<string, string>> = {
  // Mainnet
  14: {
    flr: 'https://fdc-verifiers-mainnet.flare.network/verifier/flr/EVMTransaction/prepareRequest',
    eth: 'https://fdc-verifiers-mainnet.flare.network/verifier/eth/EVMTransaction/prepareRequest',
  },
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      flareChainId,      // 14 or 114 (where FDC runs)
      sourceChainId,     // Chain where tx happened (14, 1, etc.)
      ...requestBody 
    } = body;
    
    // Get source chain config
    const sourceChain = SUPPORTED_CHAINS.find(c => c.id === sourceChainId);
    if (!sourceChain || !isDirectChain(sourceChainId)) {
      return NextResponse.json(
        { error: 'Invalid or unsupported source chain for direct attestation' },
        { status: 400 }
      );
    }
    
    // Get verifier URL
    const verifierUrls = VERIFIER_URLS[flareChainId as keyof typeof VERIFIER_URLS];
    if (!verifierUrls) {
      return NextResponse.json(
        { error: `Unsupported Flare chain ID: ${flareChainId}` },
        { status: 400 }
      );
    }
    
    const verifierUrl = verifierUrls[sourceChain.verifierPath!];
    if (!verifierUrl) {
      return NextResponse.json(
        { error: `No verifier for chain: ${sourceChain.name}` },
        { status: 400 }
      );
    }
    
    // Call verifier
    const response = await fetch(verifierUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': '00000000-0000-0000-0000-000000000000', // Flare's public FDC verifier key
      },
      body: JSON.stringify({
        ...requestBody,
        sourceId: sourceChain.sourceId,
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

## Data Schema Updates

### Extended feeds.json Schema

```json
{
  "version": "2.0.0",
  "feeds": [
    {
      "id": "uuid-v4",
      "alias": "WETH_USDC",
      
      "sourceChain": {
        "id": 42161,
        "name": "Arbitrum",
        "category": "relay"
      },
      "sourcePoolAddress": "0x...",
      
      "flareContracts": {
        "customFeedAddress": "0x...",
        "priceRecorderAddress": null,
        "priceRelayAddress": "0x..."
      },
      
      "token0": {
        "address": "0x...",
        "symbol": "WETH",
        "decimals": 18
      },
      "token1": {
        "address": "0x...",
        "symbol": "USDC",
        "decimals": 6
      },
      "invertPrice": false,
      
      "deployedAt": "2025-12-10T12:00:00.000Z",
      "deployedBy": "0x..."
    }
  ],
  "recorders": [
    {
      "id": "uuid-v4",
      "chainId": 1,
      "chainName": "Ethereum",
      "address": "0x...",
      "updateInterval": 300,
      "deployedAt": "...",
      "deployedBy": "0x..."
    }
  ],
  "relays": [
    {
      "id": "uuid-v4",
      "address": "0x...",
      "minRelayInterval": 60,
      "maxPriceAge": 300,
      "supportedChains": [42161, 8453, 10, 137],
      "deployedAt": "...",
      "deployedBy": "0x..."
    }
  ]
}
```

---

## Implementation Phases

### Phase 1: Ethereum Direct Support (Week 1-2) ✅ COMPLETE

**Goal:** Add Ethereum as a direct source chain using existing architecture.

**Testing Path:** Ethereum Mainnet → Flare Mainnet

**Tasks:**
1. [x] Create `lib/chains.ts` with Flare, Ethereum
2. [x] Update wagmi config to include Ethereum
3. [x] Update `lib/types.ts` with backward-compatible sourceChain
4. [x] Extend FDC API routes for multi-sourceId (including Sepolia)
5. [x] Add network switching flow to update hook
6. [x] Add chain selection to deploy page (Flare/Ethereum only for Phase 1)
7. [x] Normalize legacy feeds in feeds-context
8. [x] Update monitor UI to show source chain
9. [ ] Test: ETH Mainnet pool → Flare attestation

**UX Requirements:** ✅ Implemented
- Clear message: "You need ETH to record prices on Ethereum"
- Network switch prompts with toast feedback
- Handle user rejection gracefully

**Deliverables:**
- Users can create feeds from Ethereum Uniswap V3 pools
- Same trust model as Flare (FDC-verified)
- Legacy feeds continue to work (backward compatible)

### Phase 2: PriceRelay Contract (Week 2-3) ✅ COMPLETE

**Goal:** Deploy shared relay infrastructure on Flare.

**Tasks:**
1. [x] Implement `PriceRelay.sol` with full security features
2. [ ] Write comprehensive tests (Hardhat)
3. [ ] Deploy to Flare mainnet (deployer = first authorized relayer)
4. [x] Add relay contract ABI to frontend artifacts
5. [x] Create `/api/relay/fetch-price` endpoint (with block timestamp)
6. [ ] Document relay architecture

**Note:** Deploy directly to mainnet since relay is lower risk (just emits events).

**Security Checklist (Phase 2):** ✅ All Implemented
- [x] PriceRelay stores token0/token1 per pool on `enablePool()`
- [x] `relayPrice()` verifies token binding
- [x] `relayPrice()` rejects future timestamps (`sourceTimestamp <= block.timestamp`)
- [x] `relayPrice()` enforces monotonic `sourceBlockNumber`
- [x] `relayPrice()` includes deviation check (`MAX_DEVIATION_BPS = 5000`)
- [x] `/api/relay/fetch-price` returns `block.timestamp`, not `Date.now()`

**Deliverables:**
- PriceRelay contract live on Flare with all security guards
- Deployer wallet is authorized relayer (uses existing DEPLOYER_PRIVATE_KEY)

### Phase 3: Relay Flow Integration (Week 3-4) ✅ COMPLETE

**Goal:** Implement frontend + backend for relay chain feeds.

**Tasks:**
1. [x] Add relay chains to `lib/chains.ts` - Already done in Phase 1
2. [x] Implement `/api/relay/fetch-price` endpoint - Already done in Phase 2
3. [x] Implement relay price submission flow - `/api/relay/submit-relay/route.ts` + frontend integration
4. [x] Create `useCrossChainFeedUpdater` hook - Extended `use-feed-updater.ts` with relay flow support
5. [x] Update deploy modal for relay chain flow - PriceRelay deploy + relay feed creation
6. [x] Update monitor page for relay feeds - Trust model indicators + relay-specific progress steps
7. [x] Add trust model UI components - ChainSelector with relay warnings, relay badges
8. [ ] Full E2E testing - Pending (requires deployed PriceRelay)

**Deliverables:**
- ✅ Users can create feeds from Arbitrum, Base, Optimism, Polygon
- ✅ Clear UX indicating trust model difference

### Phase 4: Bot Integration + Frontend Control (Week 4-5) ✅ COMPLETE

**Goal:** Extend bot for cross-chain operation AND add optional frontend control.

**Architecture Options:**
1. **Terminal Mode (existing)** - Run `node src/custom-feeds-bot.js` from command line
2. **Frontend Mode (new)** - Control and monitor bot from the web UI

**Tasks:**
1. [x] Create bot service class (`BotService`) for programmatic control - `frontend/src/lib/bot-service.ts`
2. [x] Add multi-chain support (direct + relay flows) - Integrated in BotService
3. [x] Create API routes for bot control (`/api/bot/*`) - start, stop, status, logs, update-single, logs/stream
4. [x] Create bot control UI in dashboard (start/stop/monitor) - `/dashboard/bot`
5. [x] Add real-time log streaming (SSE) - `/api/bot/logs/stream`
6. [x] Update settings page with bot configuration - Added Frontend Bot tab
7. [x] Support both automatic (continuous) and manual (on-demand) modes - BotService supports both
8. [ ] Documentation for both modes - Pending

**API Routes:**
- ✅ `POST /api/bot/start` - Start the bot service
- ✅ `POST /api/bot/stop` - Stop the bot service
- ✅ `GET /api/bot/status` - Get current status + stats
- ✅ `GET /api/bot/logs` - Get recent log entries
- ✅ `POST /api/bot/update-single` - Trigger single feed update
- ✅ `GET /api/bot/logs/stream` - SSE for real-time updates

**Frontend Features:**
- ✅ Bot control panel with start/stop buttons
- ✅ Live status indicator (running/stopped/error)
- ✅ Real-time log viewer
- ✅ Statistics dashboard
- ✅ Feed-by-feed status display

**Deliverables:**
- ✅ Bot supports all chain types (Flare, Ethereum, relay chains)
- ✅ Can run as standalone CLI OR controlled from frontend
- ✅ Single configuration works for both modes

### Phase 5: Polish & Documentation (Week 5-6)

**Tasks:**
1. [ ] Error handling improvements
2. [ ] Loading states and progress indicators
3. [ ] Mobile responsiveness
4. [ ] Comprehensive testing (unit, integration, E2E)
5. [ ] User documentation
6. [ ] Developer documentation

---

## Testing Strategy

### Confirmed Testing Path

```
Phase 1: Ethereum Mainnet → Flare Mainnet
Phase 2+: Relay chains on Flare Mainnet
```

Flare mainnet FDC is already validated with existing Flare pools.

### Unit Tests

```typescript
// Contract tests
describe('PriceRelay', () => {
  it('should only accept authorized relayers');
  it('should reject stale price data');
  it('should enforce relay interval');
  it('should emit correct event structure');
  it('should enable/disable chains correctly');
});

describe('CrossChainCustomFeed', () => {
  it('should parse PriceRecorded events (direct)');
  it('should parse PriceRelayed events (relay)');
  it('should validate source chain in proof');
});
```

### Integration Tests

```typescript
// API route tests
describe('/api/relay/fetch-price', () => {
  it('should fetch price from Arbitrum pool');
  it('should reject invalid pool address');
  it('should handle RPC failures gracefully');
});

describe('/api/fdc/prepare-request', () => {
  it('should use correct verifier URL for each chain');
  it('should include correct sourceId');
});
```

### E2E Test Scenarios

| Scenario | Chains | Expected Flow |
|----------|--------|---------------|
| Flare pool (existing) | Flare → Flare | Direct, no network switch |
| Ethereum pool | ETH → Flare | Direct, network switch required |
| Arbitrum pool | Arb → Flare | Relay, stays on Flare |
| Mixed update | Multiple | Correct flow per feed type |

---

## Open Questions & Future Work

### Resolved Questions

1. ~~**Relayer Decentralization:**~~ → Single trusted relayer for v1 (deployer). Future-proof for frontend relay option.

2. ~~**Relay Fee Model:**~~ → Deferred to Phase 2+. Bot operator pays gas initially.

3. ~~**Ethereum Gas Strategy:**~~ → **Require user to have ETH.** Document requirement in UI.

4. ~~**Testnet Strategy:**~~ → Flare mainnet is already validated.

### Remaining Open Questions

1. **Frontend Relay Authorization:** When adding frontend relay option, should PriceRelay authorize any caller, or require per-user whitelisting?

2. **Relay Fee Model (Future):** When productionizing relay, who pays? User per-update, subscription, or subsidized?

---

## Security Amendments (Post-Validation)

> These security hardening measures were identified during plan validation.

### 1. Relay Timestamp Source (CRITICAL)

**Problem:** Original code used `Date.now()` (server clock) instead of actual block timestamp.

**Fix:** Fetch the block and return its actual timestamp:
```typescript
// WRONG - vulnerable to server clock manipulation
timestamp: Math.floor(Date.now() / 1000),

// CORRECT - uses chain block timestamp
const block = await client.getBlock({ blockNumber });
sourceTimestamp: Number(block.timestamp),
```

### 2. Token Binding

Store and verify `token0`/`token1` per pool on `enablePool()`. The `relayPrice()` function verifies tokens match what was registered.

### 3. Monotonicity Guards

`sourceBlockNumber` must strictly increase. Prevents replay of old prices.

### 4. Future Timestamp Rejection

`sourceTimestamp <= block.timestamp` — rejects any timestamp claiming to be in the future.

### 5. Deviation Bounds

`MAX_DEVIATION_BPS = 5000` (50%) — rejects price updates that deviate more than 50% from the previous price.

---

### Future Work

1. **Governance Proposal:** Submit proposal to add Arbitrum/Base to FDC EVMTransaction support, eliminating need for relay pattern.

2. **Web2Json Integration:** If Uniswap subgraph endpoints get approved, could offer more decentralized option than relay.

3. **Price Aggregation:** Support multiple sources per feed with median/average calculation.

4. **Historical Data:** Subgraph for indexing price history and charting.

5. **Alerting:** Webhook/email alerts for price deviations, relay failures, bot issues.

6. **V3 Factory Validation:** Validate pool addresses against known Uniswap V3 factory contracts per chain before accepting relay requests.

7. **Rate Limiting:** Add rate limiting to `/api/relay/fetch-price` to prevent RPC amplification attacks.

8. **Multi-Relayer Threshold:** Support N-of-M relayer consensus for higher-value feeds.

---

*End of Cross-Chain Plan*

