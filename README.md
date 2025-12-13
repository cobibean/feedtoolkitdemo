# Flare Custom Feeds Toolkit

<p align="center">
  <strong>Built by <a href="https://flareforward.com">Flare Forward</a></strong>
</p>

> Create custom price feeds from Uniswap V3 pools — **Flare-native pools use direct on-chain state**, external pools use FDC verification!

---

## What is This?

This toolkit lets you create **custom price feeds** on the Flare Network. Think of it like making your own price oracle for any token pair that has a Uniswap V3 pool.

**Why would you want this?**
- You need a price feed for a token that isn't covered by Flare's built-in FTSO
- You're building a DeFi app and need reliable, verified price data
- You want to experiment with direct on-chain reads or the Flare Data Connector (FDC)

**What makes it special?**
- **Flare-native pools**: Direct on-chain state reads (`slot0()`) — fast and cheap
- **External pools**: Cryptographically verified by Flare's FDC — trustless cross-chain
- Works with the standard `IICustomFeed` interface, so it's compatible with FTSO tooling
- **No command line needed** — deploy everything from a web UI
- **Cross-chain support** — Create feeds from Ethereum, Arbitrum, Base, and more

## Two Price Computation Paths

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    FLARE-NATIVE POOLS (Direct State)                     │
├──────────────────────────────────────────────────────────────────────────┤
│   V3 Pool on Flare  ────────▶  slot0().sqrtPriceX96  ────────▶  Price    │
│                                   (single RPC call)                      │
│                                                                          │
│   ⚡ Fast  |  💰 Cheap  |  🚫 No FDC  |  📊 Direct state read            │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│                    FDC EXTERNAL POOLS (Cross-chain)                      │
├──────────────────────────────────────────────────────────────────────────┤
│   V3 Pool       ────▶  PriceRecorder  ────▶  FDC System  ────▶  CustomFeed│
│   (external)          (emit event)         (attest)          (verified)  │
│                                                                          │
│   🔒 Secure  |  ⏱️ 2-5 min  |  🌐 Cross-chain  |  📝 Event-based         │
└──────────────────────────────────────────────────────────────────────────┘
```

## 📚 Documentation

### Quick Links

| Guide | Description |
|-------|-------------|
| **[Environment Variables](Docs/configuration/environment-variables.md)** | Complete .env setup guide — **start here to avoid setup failures** |
| **[Directory Structure](Docs/configuration/directory-structure.md)** | Where to run commands and why `cd frontend` matters |
| **[Supported Chains](Docs/configuration/supported-chains.md)** | 20+ chains supported (direct and relay modes) |
| **[Storage Modes](Docs/FEED_STORAGE_LOCAL_MODE.md)** | Local JSON vs Supabase configuration |

### For AI Agents & Developers

| File | What It's For |
|------|---------------|
| `CODEBASE_CONTEXT.md` | Technical overview of the entire codebase — give this to your AI agent first |
| `frontend/CROSSCHAIN_CONTEXT.md` | Deep dive into cross-chain implementation details |

**Stuck on something?** Copy the contents of `CODEBASE_CONTEXT.md` into your AI chat and ask your question. The AI will understand the codebase much better with this context.

---

## Features

- 🖥️ **Web UI** — Deploy and manage feeds from your browser (no terminal needed!)
- ⚡ **Flare-Native Direct Reads** — Pools on Flare use `slot0()` state reads (no FDC overhead)
- 🔐 **FDC for External Chains** — Cross-chain prices are cryptographically proven
- 📊 **FTSO Compatible** — Works with standard Flare tooling
- 🤖 **Automated Updates** — Built-in bot or one-click manual updates
- 🌐 **Cross-Chain** — Create feeds from Ethereum, Arbitrum, Base, and more
- 🔧 **Self-Hosted** — Fork it, run it locally, you own everything

---

## Prerequisites

Before you start, you'll need:

1. **Node.js v18 or higher** — [Download here](https://nodejs.org/)
   - Not sure if you have it? Run `node --version` in your terminal
   
2. **A wallet with FLR tokens**
   - You'll need FLR tokens to pay for gas and FDC attestation fees
   
3. **A Uniswap V3 pool address** on Flare or Ethereum
   - This is the trading pair you want to create a price feed for
   - You can find pools on [SparkDEX](https://sparkdex.ai/) (Flare) or [Uniswap](https://app.uniswap.org/) (Ethereum)

---

## Quick Start (5 Minutes)

### Step 1: Get the Code

```bash
# Clone this repository
git clone https://github.com/cobibean/flare-custom-feeds-toolkit.git

# Go into the frontend folder
cd flare-custom-feeds-toolkit/frontend

# Install dependencies (this might take a minute)
npm install
```

### Step 2: Add Your Environment Variables

⚠️ **This step is optional for frontend development**, but required for contract deployment and bot operation.

```bash
# Create .env file in frontend directory
cd frontend
cp .env.example .env  # (if example exists)
# OR create a new .env file
nano .env
```

**Add your private key** (only if you're deploying contracts or running the bot):
```bash
DEPLOYER_PRIVATE_KEY=0xYourPrivateKeyHere
```

**Need more details?** See the **[Environment Variables Guide](Docs/configuration/environment-variables.md)** for:
- Complete variable reference
- .env file locations and precedence rules
- Bot configuration patterns
- Vercel deployment setup

### Step 2: Start the App

⚠️ **Important:** You must run the frontend from the `frontend/` directory!

```bash
cd frontend  # ← Critical! Don't skip this
npm run dev
```

You should see something like:
```
▲ Next.js 16.x
- Local: http://localhost:3000
```

### Step 3: Open in Browser

Go to [http://localhost:3000](http://localhost:3000) in your browser.

### Step 4: Connect Your Wallet

1. Click **"Connect Wallet"** in the top right
2. Choose MetaMask (or Rabby, Coinbase Wallet, etc.)
3. Switch to **Flare Mainnet**

### Step 5: Deploy Your First Feed

1. Go to **Deploy** in the sidebar
2. Click **"Deploy Price Recorder"** — this is a shared contract that records prices
3. Once that's done, click **"Deploy Custom Feed"**
4. Paste your V3 pool address — the app will auto-detect the tokens!
5. Click **Deploy** and confirm the transaction in your wallet

### Step 6: Update Your Feed

1. Go to **Monitor** in the sidebar
2. Find your feed and click **"Update Feed"**
3. The app will guide you through the FDC attestation process (~2 minutes)
4. Done! Your feed now has a verified price

---

## How It Works (Simple Version)

### Flare-Native Pools (Direct State)
```
Your V3 Pool on Flare  →  slot0() Read  →  Price Computed
        📊                    ⚡                💾
```
1. **Read**: Direct RPC call to pool's `slot0()` returns `sqrtPriceX96`
2. **Compute**: Price is calculated using standard Uniswap V3 math
3. **Use**: Instant result — no waiting, no FDC fees!

### External Pools (FDC Cross-chain)
```
External V3 Pool → Records Price → FDC Verifies It → Your Feed Stores It
       📊               📝              ✅                💾
```
1. **Record**: The app records the price from a non-Flare pool (Ethereum, Arbitrum, etc.)
2. **Attest**: Flare's FDC system cryptographically proves the price is real
3. **Store**: The verified price is saved to your custom feed contract on Flare
4. **Use**: Anyone can read your feed — it's public and trustless!

---

## Using Your Feed in Your App

Once your feed is live, here's how to read from it:

### In Solidity (Smart Contracts)

```solidity
interface ICustomFeed {
    function read() external view returns (uint256);
}

contract MyApp {
    ICustomFeed public priceFeed;
    
    constructor(address feedAddress) {
        priceFeed = ICustomFeed(feedAddress);
    }
    
    function getPrice() public view returns (uint256) {
        // Returns price with 6 decimals
        // e.g., 1234567 = $1.234567
        return priceFeed.read();
    }
}
```

### In JavaScript/TypeScript

```javascript
import { createPublicClient, http } from 'viem';
import { flare } from 'viem/chains';

const client = createPublicClient({ 
  chain: flare, 
  transport: http() 
});

const price = await client.readContract({
  address: '0xYourFeedAddress', // Replace with your feed address
  abi: [{ 
    name: 'read', 
    type: 'function', 
    inputs: [], 
    outputs: [{ type: 'uint256' }] 
  }],
  functionName: 'read',
});

// Divide by 10^6 to get human-readable price
console.log('Price:', Number(price) / 1_000_000);
```

---

## Costs

### Flare-Native Pools (Direct State)
| What | Cost |
|------|------|
| RPC call to read `slot0()` | **FREE** |
| No FDC needed | — |
| **Total per read** | **~0 FLR** |

### FDC External Pools (Cross-chain)
| What | Cost |
|------|------|
| Recording the price | ~0.002 FLR (gas) |
| FDC attestation fee | ~1.0 FLR (fixed) |
| Storing the proof | ~0.004 FLR (gas) |
| **Total per update** | **~1.01 FLR** |

**Monthly estimates** (FDC feeds updating every 5 minutes):
- 1 feed: ~8,700 FLR/month
- 5 feeds: ~43,500 FLR/month

**Note**: Flare-native feeds are essentially free to read — only gas for view calls.

---

## Keeping Your Feed Updated

### Option A: Manual Updates (Good for Testing)

Just click "Update Feed" in the Monitor page whenever you want fresh data.

### Option B: Automated Bot (Good for Production)

You have two options:

**B1) Built-in Bot (Web UI)**

- Go to **Bot Control** in the dashboard
- Select which feeds you want to run (**none selected by default**)
  - **Ethereum feeds should run solo** (attestation/indexing can take much longer)
- Click **Start Bot**
  - Either paste a private key, or set `DEPLOYER_PRIVATE_KEY` in `frontend/.env`

**B2) Standalone CLI Bot (Terminal)**

1. Go to **Settings** in the dashboard
2. Click **"Export Bot Config"**
3. Copy the generated `.env` variables into **`frontend/.env`** (recommended), or repo-root `.env`
4. Run the bot:

```bash
# From the root directory (not frontend)
cd ..
npm install
npm run bot:start
```

The bot will automatically update your feeds every few minutes.

---

## Cross-Chain Feeds (FDC External)

You can create price feeds from **external chains** (Ethereum, Arbitrum, Base, etc.) that live on **Flare**!

### How It Works

1. **Select the source chain** when deploying (e.g., Ethereum, Arbitrum)
2. **Paste the pool address** (e.g., WETH/USDC on Uniswap)
3. The app deploys a `CrossChainPoolPriceCustomFeed` on Flare
4. When updating:
   - Price is recorded on the source chain (or relayed for L2s)
   - FDC attestation verifies the cross-chain data
   - Proof is submitted to your Flare feed

### Supported Source Chains

You can create price feeds from **20+ EVM chains**:

| Category | Chains | Trust Model | Gas Required |
|----------|--------|-------------|--------------|
| **Direct** (Trustless FDC) | Flare, Ethereum, Coston2, Sepolia | Fully trustless | Source chain native token |
| **Relay** (Bot-assisted) | Arbitrum, Base, Optimism, Polygon, Avalanche, BNB, Fantom, zkSync, Linea, Scroll, Mantle, Blast, Gnosis, Celo, Polygon zkEVM, Mode, Zora | Bot + FDC | FLR only (bot pays source gas) |

**See the [Supported Chains Reference](Docs/configuration/supported-chains.md) for:**
- Complete chain list with IDs and RPCs
- Gas requirements per chain
- Finding pools on each chain
- Network switching guide

---

## Troubleshooting

### Common Issues

| Problem | Solution |
|---------|----------|
| **"npm run dev doesn't work"** | You must run from `frontend/` directory — see [Directory Structure](Docs/configuration/directory-structure.md) |
| **"Pool not enabled"** | The app will prompt you to enable the pool — just confirm the transaction |
| **"Update interval not elapsed"** | Wait 5 minutes between updates (prevents spam) |
| **"Low balance" warning** | You need FLR for gas + attestation fees (~1 FLR per update) |
| **"Attestation taking forever"** | FDC attestations take 90-180 seconds — progress bar shows status |
| **"Bot not discovering feeds"** | Check env var naming pattern — see [Environment Variables Guide](Docs/configuration/environment-variables.md#feed-discovery-required) |
| **"Network mismatch" (Ethereum feeds)** | Direct chains require network switching — confirm in wallet when prompted |
| **"RPC request failed"** | Try custom RPC endpoint — see [Supported Chains](Docs/configuration/supported-chains.md#custom-rpc-endpoints) |

### Still stuck?

1. Check browser console (F12 → Console tab) for errors
2. Read the **[Environment Variables Guide](Docs/configuration/environment-variables.md)**
3. Check the **[Directory Structure Guide](Docs/configuration/directory-structure.md)**
4. Copy `CODEBASE_CONTEXT.md` into your AI assistant and describe the problem
5. Open an issue on GitHub

---

## Project Structure

```
flare-custom-feeds-toolkit/
├── frontend/                  # 👈 The web app (you'll mostly work here)
│   ├── src/app/              # Pages
│   ├── src/components/       # UI components
│   └── data/feeds.json       # Your deployed feeds (local storage)
├── contracts/                 # Solidity smart contracts
├── scripts/                   # CLI deployment scripts
├── src/                       # Bot code (for automated updates)
├── test/                      # Contract tests
├── CODEBASE_CONTEXT.md       # 🤖 Give this to your AI assistant
└── README.md                 # You are here!
```

---

## For Developers & AI Agents

This codebase is designed to be AI-friendly:

- **[Environment Variables Guide](Docs/configuration/environment-variables.md)** — Complete .env reference with bot patterns
- **[Directory Structure Guide](Docs/configuration/directory-structure.md)** — Execution context and file locations
- **[Supported Chains Reference](Docs/configuration/supported-chains.md)** — Multi-chain configuration
- **`CODEBASE_CONTEXT.md`** — Technical overview of contracts, data flow, and architecture
- **`frontend/CROSSCHAIN_CONTEXT.md`** — Deep dive into cross-chain implementation details

**Pro tip:** Feed `CODEBASE_CONTEXT.md` to your AI assistant for better help with complex questions.

---

## Links

- **Flare Forward**: [flareforward.com](https://flareforward.com)
- **Flare Docs**: [docs.flare.network](https://docs.flare.network)
- **FDC Docs**: [docs.flare.network/tech/fdc](https://docs.flare.network/tech/fdc/)
- **Flare Discord**: [discord.flare.network](https://discord.flare.network)

---

## License

MIT — do whatever you want with it!

---

<p align="center">
  <strong>Built with 💖 by <a href="https://flareforward.com">Flare Forward</a></strong>
</p>

