# Codebase Context: Flare Custom Feeds Toolkit

> AI-optimized reference for understanding this codebase. Read this first.

## Purpose

Creates FDC-verified custom price feeds from Uniswap V3 pools on Flare. Implements `IICustomFeed` interface for FTSO compatibility. Includes both CLI tools and a web-based UI for deployment and management.

## Data Flow

```
V3Pool.slot0() → PriceRecorder.recordPrice() → FDC attestation → CustomFeed.updateFromProof()
```

1. User/Bot calls `recordPrice(pool)` → emits `PriceRecorded` event
2. FDC attestation requested via FdcHub (pays ~1 FLR fee)
3. After ~90-180s finalization, proof retrieved from DA Layer
4. Proof submitted to `CustomFeed.updateFromProof()` → stores verified price

## File Structure

```
flare-custom-feeds-toolkit/
├── contracts/
│   ├── PriceRecorder.sol              # Shared recorder (one per project)
│   ├── PoolPriceCustomFeed.sol        # Feed contract (one per pool)
│   └── CrossChainPoolPriceCustomFeed.sol # Cross-chain feed (Ethereum pools)
├── scripts/                            # CLI deployment scripts (hardhat)
│   ├── deploy-price-recorder.js
│   ├── deploy-custom-feed.js
│   ├── deploy-crosschain-eth-to-flare.js
│   ├── enable-pool.js
│   ├── test-record-price.js
│   └── test-feed-read.js
├── src/                                # Node.js bot (standalone)
│   ├── custom-feeds-bot.js            # Main bot (recording + attestation)
│   └── fdc-client.js                  # FDC API wrapper
├── frontend/                           # Next.js web UI
│   ├── data/feeds.json                # Local storage for deployed feeds
│   ├── public/brand/                  # Flare Forward brand assets
│   ├── src/
│   │   ├── app/                       # Next.js App Router pages
│   │   │   ├── page.tsx               # Landing page
│   │   │   ├── dashboard/             # Protected dashboard routes
│   │   │   │   ├── deploy/            # Deploy contracts via UI
│   │   │   │   ├── monitor/           # Monitor deployed feeds
│   │   │   │   ├── bot/               # In-browser bot control
│   │   │   │   └── settings/          # Bot config export
│   │   │   └── api/                   # API routes
│   │   │       ├── feeds/             # CRUD for feeds.json
│   │   │       ├── fdc/               # FDC API proxy (CORS bypass)
│   │   │       └── bot/               # In-browser bot endpoints
│   │   ├── components/                # React components
│   │   │   ├── chain/                 # Chain selector components
│   │   │   ├── layout/                # Header, sidebar, theme toggle
│   │   │   └── ui/                    # shadcn/ui components
│   │   ├── hooks/                     # Custom React hooks
│   │   │   ├── use-pool-info.ts       # Auto-detect V3 pool info
│   │   │   ├── use-feed-updater.ts    # FDC attestation workflow
│   │   │   └── use-bot.ts             # In-browser bot state
│   │   ├── lib/
│   │   │   ├── artifacts/             # Bundled contract ABIs + bytecode
│   │   │   ├── chains.ts              # Multi-chain configuration
│   │   │   ├── contracts.ts           # Contract interface definitions
│   │   │   ├── wagmi-config.ts        # Wallet configuration
│   │   │   └── types.ts               # TypeScript interfaces
│   │   └── context/                   # React Context providers
│   └── package.json
├── test/                               # Contract tests
├── CODEBASE_CONTEXT.md                # This file
├── hardhat.config.cjs                 # Hardhat configuration
└── README.md                          # User documentation
```

## Smart Contracts

### PriceRecorder.sol

Reads V3 pool prices and emits attestable events.

```solidity
// Key state
mapping(address => bool) public enabledPools;
mapping(address => PoolInfo) public poolInfo;
uint256 public updateInterval; // seconds between updates

// Key functions
function recordPrice(address pool) external;           // Main entry
function recordPriceBatch(address[] calldata) external; // Batch (max 50)
function enablePool(address pool) external onlyOwner;
function canUpdate(address pool) external view returns (bool);

// Key event (attested by FDC)
event PriceRecorded(
    address indexed pool,
    uint160 sqrtPriceX96,  // V3 price format
    int24 tick,
    uint128 liquidity,
    address token0,
    address token1,
    uint256 timestamp,
    uint256 blockNumber
);
```

### PoolPriceCustomFeed.sol

FDC-verified feed implementing `IICustomFeed`.

```solidity
// Immutable config (set at deploy)
address public immutable priceRecorderAddress;
address public immutable poolAddress;
uint8 public immutable token0Decimals;
uint8 public immutable token1Decimals;
bool public immutable invertPrice;
bytes21 private immutable _feedId; // 0x21 prefix = custom feed

// State
uint256 public latestValue;        // 6 decimals
uint64 public lastUpdateTimestamp;
uint256 public updateCount;

// IICustomFeed interface
function feedId() external view returns (bytes21);
function read() external view returns (uint256);
function decimals() external pure returns (int8);     // Always 6
function calculateFee() external pure returns (uint256); // Always 0
function getCurrentFeed() external payable returns (uint256, int8, uint64);

// Core update
function updateFromProof(IEVMTransaction.Proof calldata _proof) external;
```

**Price Calculation** (from sqrtPriceX96):
```solidity
// price = (sqrtPriceX96 / 2^96)^2 * 10^18
// Then adjust for token decimals: price *= 10^(decimals0 - decimals1)
// Scale to 6 decimals: price /= 10^12
// If invertPrice: price = 10^12 / price
```

### CrossChainPoolPriceCustomFeed.sol

Same as `PoolPriceCustomFeed` but configured for Ethereum pools. Uses FDC to attest transactions on Ethereum and store verified prices on Flare.

## Frontend Architecture

### Key Technologies
- **Next.js 16** (App Router) - React framework with SSR
- **RainbowKit + wagmi + viem** - Wallet connection (no API keys needed for injected wallets)
- **shadcn/ui + Tailwind CSS** - UI components
- **Local JSON storage** - `frontend/data/feeds.json` for persistence

### Contract Integration

The frontend bundles pre-compiled contract artifacts:

```typescript
// frontend/src/lib/artifacts/
├── PriceRecorder.ts              // ABI + bytecode
├── PoolPriceCustomFeed.ts        // ABI + bytecode
├── CrossChainPoolPriceCustomFeed.ts // ABI + bytecode
├── PriceRelay.ts                 // For relay chains (Phase 2)
└── index.ts                      // Exports
```

Users deploy contracts directly from the browser - no CLI or hardhat needed.

### FDC Integration

The frontend can trigger FDC attestations via:

```typescript
// frontend/src/hooks/use-feed-updater.ts

// Full workflow:
1. recordPrice(pool) - emit PriceRecorded event
2. POST /api/fdc/prepare-request - get attestation request (proxied)
3. fdcHub.requestAttestation() - pay fee, submit to FDC
4. Wait for finalization (~90-180s)
5. POST /api/fdc/get-proof - retrieve proof from DA Layer (proxied)
6. customFeed.updateFromProof(proof) - update feed with verified price
```

The API routes proxy FDC calls to bypass CORS restrictions.

### Data Storage Schema

```json
// frontend/data/feeds.json
{
  "version": "2.0.0",
  "feeds": [{
    "id": "uuid",
    "alias": "FXRP_USDTO",
    "network": "flare",
    "poolAddress": "0x...",
    "customFeedAddress": "0x...",
    "priceRecorderAddress": "0x...",
    "token0Decimals": 18,
    "token1Decimals": 6,
    "invertPrice": false,
    "sourceChain": { "id": 14, "name": "Flare", "category": "direct" },
    "sourcePoolAddress": "0x...",
    "deployedAt": "2025-12-09T12:00:00.000Z",
    "deployedBy": "0x..."
  }],
  "recorders": [{
    "id": "uuid",
    "address": "0x...",
    "network": "flare",
    "updateInterval": 300,
    "deployedAt": "...",
    "deployedBy": "0x..."
  }]
}
```

## Bot (custom-feeds-bot.js)

Standalone Node.js process for automated feed updates.

### Configuration Discovery

```javascript
// Auto-discovers pools from env vars matching pattern:
// POOL_ADDRESS_<ALIAS> + CUSTOM_FEED_ADDRESS_<ALIAS>
```

### Main Loop

```javascript
while (running) {
  pool = getNextPoolToProcess(); // round-robin
  if (pool && canUpdate(pool)) {
    result = await recordPrice(pool);
    if (result) await attestAndUpdate(result);
  }
  await sleep(CHECK_INTERVAL);
}
```

### Key Config

```javascript
CHECK_INTERVAL: 60s        // Main loop frequency
MAX_GAS_PRICE_GWEI: 100
MIN_BALANCE_FLR: 1.0
CRITICAL_BALANCE_FLR: 0.1  // Bot stops below this
```

## FDC Client (fdc-client.js)

Handles Flare Data Connector workflow.

### Addresses (Mainnet)

```javascript
FDC_HUB = "0xc25c749DC27Efb1864Cb3DADa8845B7687eB2d44";
RELAY = "0x57a4c3676d08Aa5d15410b5A6A80fBcEF72f3F45";
CONTRACT_REGISTRY = "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019";
DA_LAYER_API = "https://flr-data-availability.flare.network";
VERIFIER_URL = "https://fdc-verifiers-mainnet.flare.network/verifier/flr/EVMTransaction/prepareRequest";
```

### Attestation Request Format

```javascript
{
  attestationType: "0x45564d5472616e73616374696f6e...", // "EVMTransaction"
  sourceId: "0x464c52...",  // "FLR"
  requestBody: {
    transactionHash,
    requiredConfirmations: "1",
    provideInput: false,
    listEvents: true,
    logIndices: []
  }
}
```

## Environment Variables

```bash
# Required for bot/CLI
DEPLOYER_PRIVATE_KEY=0x...
PRICE_RECORDER_ADDRESS=0x...

# Per pool (use consistent ALIAS)
POOL_ADDRESS_<ALIAS>=0x...
CUSTOM_FEED_ADDRESS_<ALIAS>=0x...

# Optional
FLARE_RPC_URL=https://flare-api.flare.network/ext/bc/C/rpc
BOT_CHECK_INTERVAL_SECONDS=60
```

## Networks

| Network | Chain ID | RPC |
|---------|----------|-----|
| Flare Mainnet | 14 | flare-api.flare.network |
| Ethereum Mainnet | 1 | eth.llamarpc.com |

## Cost Per Update

- recordPrice(): ~0.002 FLR (gas)
- FDC attestation: ~1.0 FLR (fee)
- updateFromProof(): ~0.004 FLR (gas)
- **Total: ~1.01 FLR**

## Key Patterns

**Price with decimal adjustment:**
```javascript
const Q96 = 2n ** 96n;
let price = sqrtPriceX96 * sqrtPriceX96 * (10n ** 18n) / (Q96 * Q96);
const adj = token0Decimals - token1Decimals;
if (adj > 0) price *= 10n ** BigInt(adj);
else if (adj < 0) price /= 10n ** BigInt(-adj);
price /= 10n ** 12n; // scale to 6 decimals
if (invertPrice) price = (10n ** 12n) / price;
```

**Proof struct for contract:**
```javascript
{
  merkleProof: bytes32[],
  data: {
    attestationType, sourceId, votingRound, lowestUsedTimestamp,
    requestBody: { transactionHash, requiredConfirmations, provideInput, listEvents, logIndices },
    responseBody: { blockNumber, timestamp, sourceAddress, isDeployment, receivingAddress, value, input, status, events[] }
  }
}
```

## Commands

### Frontend (Web UI)
```bash
cd frontend
npm install
npm run dev      # Start development server at localhost:3000
```

### CLI (Hardhat scripts)
```bash
npm install
npm run compile
npm run deploy:recorder
npm run deploy:feed
npm run enable:pool
npm run bot:start
```

## Dependencies

### Root (Bot/CLI)
```json
{
  "axios": "^1.6.0",
  "dotenv": "^16.3.0",
  "ethers": "^6.9.0",
  "hardhat": "^2.19.0"
}
```

### Frontend
```json
{
  "next": "16.x",
  "@rainbow-me/rainbowkit": "^2.x",
  "wagmi": "^2.x",
  "viem": "^2.x",
  "@tanstack/react-query": "^5.x",
  "tailwindcss": "^4.x",
  "zod": "^4.x"
}
```

## Technical Notes

- Solidity 0.8.19, optimizer enabled (200 runs)
- Node.js ES modules (type: "module")
- Bot is single-threaded, round-robin pool processing
- Feed ID format: 0x21 + UTF-8 name bytes (max 20 chars)
- FDC attestation type ID: 200 (EVMTransaction)
- All contracts have owner-only admin functions
- Frontend uses Next.js App Router with React Server Components
- Contract artifacts are bundled - users don't need to compile
- FDC API calls are proxied through Next.js API routes to bypass CORS

## Cross-Chain Support

The toolkit supports pools from multiple EVM chains:

| Source Chain | Flow | Trust Model | Status |
|--------------|------|-------------|--------|
| Flare | Direct | Trustless (FDC) | ✅ Active |
| Ethereum | Direct | Trustless (FDC) | ✅ Phase 1 |
| Arbitrum, Base, OP, Polygon | Relay | Bot + FDC | ⏳ Phase 2+ |

### Network Switching Flow (Ethereum)

For Ethereum pools, the update flow handles network switching:

```
1. User clicks "Update Feed"
2. Switch to Ethereum → User confirms
3. Record price on Ethereum (requires ETH for gas)
4. Switch to Flare → User confirms
5. Request FDC attestation (requires FLR)
6. Wait for finalization (~2-5 min)
7. Submit proof to feed contract
```

### FDC Multi-Chain Support

The prepare-request API supports multiple source IDs:

```typescript
// frontend/src/app/api/fdc/prepare-request/route.ts
const VERIFIER_CONFIG = {
  14: { path: 'flr', sourceId: '0x464c52...' },    // Flare
  1: { path: 'eth', sourceId: '0x455448...' },     // Ethereum
  11155111: { path: 'sepolia', sourceId: '0x746573...' }, // Sepolia
};
```

## Related Files

- `frontend/CROSSCHAIN_CONTEXT.md` - Cross-chain implementation guide (Ethereum, relay chains)
- `frontend/CROSSCHAIN_PLAN.md` - Full cross-chain architecture and research findings
- `README.md` - User-facing documentation and setup guide

