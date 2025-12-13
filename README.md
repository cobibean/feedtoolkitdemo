# Flare Custom Feeds Toolkit

<p align="center">
  <strong>Built by <a href="https://flareforward.com">Flare Forward</a></strong>
</p>

> Create your own FDC-verified price feeds from Uniswap V3 pools on Flare — no blockchain experience required!

---

## What is This?

This toolkit lets you create **custom price feeds** on the Flare Network. Think of it like making your own price oracle for any token pair that has a Uniswap V3 pool.

**Why would you want this?**
- You need a price feed for a token that isn't covered by Flare's built-in FTSO
- You're building a DeFi app and need reliable, verified price data
- You want to experiment with the Flare Data Connector (FDC)

**What makes it special?**
- All prices are **cryptographically verified** by Flare's FDC — no trust required
- Works with the standard `IICustomFeed` interface, so it's compatible with FTSO tooling
- **No command line needed** — deploy everything from a web UI
- **Cross-chain support** — Create feeds from Ethereum, Flare, and more

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   V3 Pool       │────▶│  PriceRecorder  │────▶│   FDC System    │────▶│  CustomFeed     │
│ (sqrtPriceX96)  │     │ (emit event)    │     │ (attest)        │     │ (verified price)│
└─────────────────┘     └─────────────────┘     └─────────────────┘     └─────────────────┘
```

## 🆘 Need Help? Use the AI Context File!

This repo includes a special documentation file designed for AI coding assistants (Cursor, Claude, ChatGPT, etc.):

| File | What It's For |
|------|---------------|
| `CODEBASE_CONTEXT.md` | Technical overview of the entire codebase — give this to your AI agent first |

**Stuck on something?** Copy the contents of `CODEBASE_CONTEXT.md` into your AI chat and ask your question. The AI will understand the codebase much better with this context.

**Example prompts:**
- "Here's my codebase context: [paste CODEBASE_CONTEXT.md]. How do I add a new feed to the monitor page?"
- "Here's my codebase context: [paste]. I'm getting this error: [error]. What's wrong?"

---

## Features

- 🖥️ **Web UI** — Deploy and manage feeds from your browser (no terminal needed!)
- 🔐 **FDC Verified** — All prices are cryptographically proven
- 📊 **FTSO Compatible** — Works with standard Flare tooling
- 🤖 **Automated Updates** — Built-in bot or one-click manual updates
- 🌐 **Cross-Chain** — Create feeds from Ethereum pools directly
- 🔧 **Self-Hosted** — Fork it, run it locally, you own everything

---

## Prerequisites

Before you start, you'll need:

1. **Node.js v18 or higher** — [Download here](https://nodejs.org/)
   - Not sure if you have it? Run `node --version` in your terminal
   
2. **A wallet with FLR tokens** 
   - For testing: Use [Coston2 testnet](https://faucet.flare.network/) (free tokens!)
   - For production: You'll need real FLR on mainnet
   
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

For **local development**, Next.js loads env vars from the **project root you run it from**.

- **If you run the web app from `frontend/`** (recommended), put your env in: **`frontend/.env`**
- **If you run Hardhat/CLI scripts from the repo root**, you can also use **repo-root `.env`** — but the toolkit will now also fallback to `frontend/.env` for convenience.

Copy the template and fill in values:

```bash
# from the repo root
cp .env.example frontend/.env
```

If you deploy on **Vercel**, you typically **do not commit any `.env` file**. Instead, set the same variables in **Vercel → Project → Settings → Environment Variables** (and make sure the Vercel project root is `frontend/`).

### Step 2: Start the App

```bash
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
3. Switch to **Coston2** (testnet) or **Flare Mainnet**

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

```
Your V3 Pool → Records Price → FDC Verifies It → Your Feed Stores It
     📊              📝              ✅                💾
```

1. **Record**: The app reads the current price from a Uniswap V3 pool
2. **Attest**: Flare's FDC system cryptographically proves the price is real
3. **Store**: The verified price is saved to your custom feed contract
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

Each price update costs approximately **1.01 FLR**:

| What | Cost |
|------|------|
| Recording the price | ~0.002 FLR (gas) |
| FDC attestation fee | ~1.0 FLR (fixed) |
| Storing the proof | ~0.004 FLR (gas) |
| **Total** | **~1.01 FLR** |

**Monthly estimates** (if updating every 5 minutes):
- 1 feed: ~8,700 FLR/month
- 5 feeds: ~43,500 FLR/month

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

## Cross-Chain Feeds (Ethereum → Flare)

You can create price feeds from **Ethereum** Uniswap V3 pools that live on **Flare**!

### How It Works

1. **Select Ethereum** as the source chain when deploying
2. **Paste an Ethereum pool address** (e.g., WETH/USDC on Uniswap)
3. The app deploys a `CrossChainPoolPriceCustomFeed` on Flare
4. When updating:
   - You switch to Ethereum to record the price
   - Switch back to Flare to request FDC attestation
   - FDC verifies the Ethereum transaction
   - Proof is submitted to your Flare feed

### Supported Source Chains

| Chain | Status |
|-------|--------|
| Flare | ✅ Active |
| Ethereum | ✅ Active |
| Sepolia (testnet) | ✅ Active |
| Arbitrum, Base, OP | ⏳ Coming (Phase 2) |

---

## Testing on Testnet First (Recommended!)

Before spending real FLR, test everything on Coston2:

1. Get free testnet tokens: [Flare Faucet](https://faucet.flare.network)
2. Switch to Coston2 in the app (top left network switcher)
3. Deploy and test your feed
4. When ready, switch to Mainnet and redeploy

---

## Troubleshooting

### "Pool not enabled"
The app will prompt you to enable the pool — just confirm the transaction.

### "Update interval not elapsed"
You need to wait 5 minutes between updates. This is to prevent spam.

### "Low balance" warning
You need FLR for gas + attestation fees. Get testnet tokens from the [faucet](https://faucet.flare.network) or buy FLR for mainnet.

### "Attestation taking forever"
FDC attestations take 90-180 seconds. The progress bar shows you where you are. If it's stuck, check your internet connection.

### Something else broken?
1. Check the browser console (F12 → Console tab) for errors
2. Copy `CODEBASE_CONTEXT.md` into your AI assistant and describe the problem
3. Open an issue on GitHub

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

- **`CODEBASE_CONTEXT.md`** — Technical overview of contracts, data flow, and architecture. Feed this to your AI assistant for better help.
- **`frontend/CROSSCHAIN_CONTEXT.md`** — Deep dive into cross-chain implementation details.

---

## Links

- **Flare Forward**: [flareforward.com](https://flareforward.com)
- **Flare Docs**: [docs.flare.network](https://docs.flare.network)
- **FDC Docs**: [docs.flare.network/tech/fdc](https://docs.flare.network/tech/fdc/)
- **Flare Discord**: [discord.flare.network](https://discord.flare.network)
- **Testnet Faucet**: [faucet.flare.network](https://faucet.flare.network)

---

## License

MIT — do whatever you want with it!

---

<p align="center">
  <strong>Built with 💖 by <a href="https://flareforward.com">Flare Forward</a></strong>
</p>

