# Environment Variables Guide

> **Critical Setup Reference** — Most deployment failures are caused by misconfigured environment variables.

---

## Quick Reference

| Use Case | Where to Put `.env` | Required Variables |
|----------|---------------------|-------------------|
| **Frontend Development** | `frontend/.env` | None (uses defaults) |
| **Contract Deployment** | `.env` (root) OR `frontend/.env` | `DEPLOYER_PRIVATE_KEY` |
| **Bot (Standalone CLI)** | `.env` (root) OR `frontend/.env` | `DEPLOYER_PRIVATE_KEY`, `CUSTOM_FEED_ADDRESS_*` |
| **Vercel Deployment** | Vercel Dashboard (no file) | All frontend + deployment vars |

---

## File Locations & Precedence

### The Two .env Locations

```
flare-custom-feeds-toolkit/
├── .env                    # ← Root .env (used by Hardhat, bot)
└── frontend/
    └── .env                # ← Frontend .env (used by Next.js)
```

### Precedence Rules

**Hardhat scripts** (`npx hardhat run ...`):
1. Check `./env` (repo root)
2. Fallback to `frontend/.env`
3. Use defaults if neither exists

**Next.js** (`npm run dev` in frontend):
- Only reads `frontend/.env`
- Ignores root `.env`

**Standalone bot** (`node src/custom-feeds-bot.js` from root):
1. Check `./env` (repo root)
2. Fallback to `frontend/.env`
3. Use defaults if neither exists

### Recommendation

**For local development:**
```bash
# Put ALL variables in frontend/.env
cp .env.example frontend/.env
```

This works for both frontend and backend because Hardhat falls back to `frontend/.env`.

**For production:**
- **Self-hosted**: Use root `.env` for bot, `frontend/.env` for web UI
- **Vercel**: Set all vars in Vercel Dashboard (Project → Settings → Environment Variables)

---

## Complete Environment Variable Reference

### Core Configuration

#### `DEPLOYER_PRIVATE_KEY`
- **Required for:** Contract deployment, bot operation
- **Format:** `0x` + 64 hex characters
- **Security:** ⚠️ NEVER commit this! Add `.env` to `.gitignore`
- **Example:** `0x1234567890abcdef...`

```bash
# Generate from MetaMask: Settings → Security & Privacy → Reveal Private Key
DEPLOYER_PRIVATE_KEY=0xYourPrivateKeyHere
```

**Multi-wallet setup:**
```bash
# Different wallets for different purposes (optional)
DEPLOYER_PRIVATE_KEY=0x...        # Main deployment wallet
BOT_PRIVATE_KEY=0x...             # Separate bot wallet (optional, uses DEPLOYER if missing)
```

---

### Network RPC URLs

All RPC URLs are **optional** — defaults are provided. Override for custom endpoints or when public RPCs are slow.

#### Flare Networks

```bash
# Flare Mainnet (default: https://flare-api.flare.network/ext/bc/C/rpc)
FLARE_RPC_URL=https://flare-api.flare.network/ext/bc/C/rpc

# Coston2 Testnet (default: https://coston2-api.flare.network/ext/bc/C/rpc)
COSTON2_RPC_URL=https://coston2-api.flare.network/ext/bc/C/rpc
```

#### External Chains

```bash
# Ethereum Mainnet (default: https://eth.llamarpc.com)
ETH_RPC_URL=https://eth.llamarpc.com

# Sepolia Testnet (default: https://ethereum-sepolia-rpc.publicnode.com)
SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
```

**Custom RPC by Chain ID:**
```bash
# Pattern: RPC_URL_<CHAIN_ID>
RPC_URL_1=https://eth.llamarpc.com           # Ethereum
RPC_URL_42161=https://arb1.arbitrum.io/rpc   # Arbitrum
RPC_URL_8453=https://mainnet.base.org        # Base
RPC_URL_137=https://polygon-rpc.com          # Polygon
```

**All supported chain IDs:** See [Supported Chains Reference](./supported-chains.md)

---

### Bot Configuration

#### Feed Discovery (Required)

The bot auto-discovers feeds using this naming pattern:

```bash
# Pattern: CUSTOM_FEED_ADDRESS_<ALIAS>=0x...
# The ALIAS must be consistent across all related variables

# Example: Flare-native feed
CUSTOM_FEED_ADDRESS_FXRP_USDTO=0x1234567890123456789012345678901234567890
POOL_ADDRESS_FXRP_USDTO=0xAbCdEf1234567890AbCdEf1234567890AbCdEf12
PRICE_RECORDER_ADDRESS_FXRP_USDTO=0x9876543210987654321098765432109876543210
SOURCE_CHAIN_ID_FXRP_USDTO=14

# Example: Ethereum cross-chain feed
CUSTOM_FEED_ADDRESS_ETH_WETH_USDC=0xFedCbA0987654321FedCbA0987654321FedCbA09
POOL_ADDRESS_ETH_WETH_USDC=0x8765432109876543210987654321098765432109
PRICE_RECORDER_ADDRESS_ETH_WETH_USDC=0x5432109876543210987654321098765432109876
SOURCE_CHAIN_ID_ETH_WETH_USDC=1

# Example: Arbitrum relay feed
CUSTOM_FEED_ADDRESS_ARB_GMX_ETH=0x2345678901234567890123456789012345678901
POOL_ADDRESS_ARB_GMX_ETH=0x3456789012345678901234567890123456789012
PRICE_RELAY_ADDRESS_ARB_GMX_ETH=0x4567890123456789012345678901234567890123
SOURCE_CHAIN_ID_ARB_GMX_ETH=42161
```

**Rules:**
- `CUSTOM_FEED_ADDRESS_<ALIAS>` is **required** — this is how the bot finds feeds
- `<ALIAS>` must match across all variables (e.g., `FXRP_USDTO`)
- `<ALIAS>` can be any string (use token symbols for clarity)
- Use underscores `_`, not hyphens `-`

**Optional per-feed variables:**
- `POOL_ADDRESS_<ALIAS>` — Bot can read from feed contract if missing
- `SOURCE_CHAIN_ID_<ALIAS>` — Defaults to 14 (Flare) if missing
- `PRICE_RECORDER_ADDRESS_<ALIAS>` — For direct chains, bot reads from feed if missing
- `PRICE_RELAY_ADDRESS_<ALIAS>` — For relay chains, bot reads from feed if missing

#### Bot Timing

```bash
# Main loop frequency (default: 60 seconds)
BOT_CHECK_INTERVAL_SECONDS=60

# Minimum seconds between native pool updates (default: 300 = 5 min)
BOT_NATIVE_UPDATE_INTERVAL_SECONDS=300

# How often to print stats summary (default: 60 minutes)
BOT_STATS_INTERVAL_MINUTES=60
```

#### Bot Logging

```bash
# Terminal log level: compact | verbose (default: compact)
BOT_LOG_LEVEL=compact

# Enable JSON file logging (default: true)
BOT_LOG_FILE_ENABLED=true

# Log file directory (default: ./logs)
BOT_LOG_FILE_DIR=./logs
```

---

### Storage Mode (Frontend Only)

Used by the web UI to persist feed data. Set in the UI Settings page, not via `.env`.

```bash
# Supabase configuration (optional — defaults to local JSON storage)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

**When to use Supabase:**
- Multi-user deployments
- Production with multiple bot instances
- Vercel deployment (filesystem is ephemeral)

**When to use local JSON (default):**
- Single-user, self-hosted
- Development and testing
- Simple deployments

See [Storage Modes](./storage-modes.md) for details.

---

## Example .env Files

### Minimal (Frontend Development)

```bash
# frontend/.env
# No variables needed — uses public RPCs and local storage
```

### Standard (Contract Deployment + Bot)

```bash
# frontend/.env (or root .env)

# === CORE ===
DEPLOYER_PRIVATE_KEY=0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef

# === BOT FEEDS ===
# Flare-native feed
CUSTOM_FEED_ADDRESS_FXRP_USDTO=0x1234567890123456789012345678901234567890
SOURCE_CHAIN_ID_FXRP_USDTO=14

# Ethereum cross-chain feed
CUSTOM_FEED_ADDRESS_ETH_WETH_USDC=0xAbCdEf1234567890AbCdEf1234567890AbCdEf12
SOURCE_CHAIN_ID_ETH_WETH_USDC=1

# === BOT CONFIG (optional, using defaults) ===
BOT_CHECK_INTERVAL_SECONDS=60
BOT_LOG_LEVEL=compact
```

### Advanced (Production with Custom RPCs)

```bash
# frontend/.env

# === CORE ===
DEPLOYER_PRIVATE_KEY=0xProductionPrivateKeyHere

# === CUSTOM RPC ENDPOINTS ===
FLARE_RPC_URL=https://your-custom-flare-node.com
ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/your-api-key
RPC_URL_42161=https://arb-mainnet.g.alchemy.com/v2/your-api-key

# === BOT FEEDS ===
CUSTOM_FEED_ADDRESS_FXRP_USDTO=0x1234567890123456789012345678901234567890
CUSTOM_FEED_ADDRESS_ETH_WETH_USDC=0xAbCdEf1234567890AbCdEf1234567890AbCdEf12
CUSTOM_FEED_ADDRESS_ARB_GMX_ETH=0xFedCbA0987654321FedCbA0987654321FedCbA09

# === BOT CONFIG ===
BOT_CHECK_INTERVAL_SECONDS=30
BOT_NATIVE_UPDATE_INTERVAL_SECONDS=180
BOT_LOG_LEVEL=verbose
BOT_LOG_FILE_DIR=/var/log/flare-feeds

# === STORAGE (optional - Supabase) ===
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

---

## Vercel Deployment

**Do NOT commit `.env` files to git when deploying to Vercel.**

Instead, set environment variables in Vercel Dashboard:

1. Go to your project on Vercel
2. **Settings** → **Environment Variables**
3. Add each variable (select Production, Preview, Development as needed)

**Required variables for Vercel:**
```bash
DEPLOYER_PRIVATE_KEY=0x...           # If using in-browser bot
NEXT_PUBLIC_SUPABASE_URL=https://... # Required (filesystem is ephemeral)
NEXT_PUBLIC_SUPABASE_ANON_KEY=...    # Required
```

**Vercel-specific settings:**
- **Root Directory:** `frontend/`
- **Build Command:** `npm run build`
- **Output Directory:** `.next` (default)

---

## Security Best Practices

### Private Key Safety

```bash
# ✅ DO: Use different wallets for different environments
DEPLOYER_PRIVATE_KEY=0x...  # Production wallet (high value)
DEV_PRIVATE_KEY=0x...       # Development wallet (testnet only)

# ❌ DON'T: Use production keys in development
# ❌ DON'T: Commit .env files to git
# ❌ DON'T: Share private keys in chat/email
```

### .gitignore Check

Ensure your `.gitignore` includes:
```gitignore
.env
.env.local
.env.production
frontend/.env
frontend/.env.local
```

### Key Derivation (Advanced)

For multi-bot deployments, derive keys instead of storing many:

```bash
# Master seed (store securely, not in .env)
MASTER_SEED=your-mnemonic-phrase-here

# Bot reads from Flare ContractRegistry
# Uses deterministic key derivation for feeds
```

---

## Troubleshooting

### "Private key not found"

**Symptoms:**
```
Error: private key cannot be undefined
```

**Fix:**
1. Check you're running commands from the correct directory
2. Verify `.env` file exists in the right location
3. Ensure `DEPLOYER_PRIVATE_KEY=0x...` is set
4. Check for trailing spaces or quotes

```bash
# ✅ Correct
DEPLOYER_PRIVATE_KEY=0x1234...

# ❌ Wrong (no 0x prefix)
DEPLOYER_PRIVATE_KEY=1234...

# ❌ Wrong (has quotes)
DEPLOYER_PRIVATE_KEY="0x1234..."
```

---

### "Bot not discovering feeds"

**Symptoms:**
- Bot starts but says "Discovered 0 feeds"
- Feeds deployed via UI but bot doesn't see them

**Fix:**
1. Export bot config from UI (Settings → Bot Configuration)
2. Copy all `CUSTOM_FEED_ADDRESS_*` variables to `.env`
3. Ensure `<ALIAS>` names match (case-sensitive)
4. Check bot is reading the correct `.env` file

```bash
# Bot prints this on startup:
# "📂 Loaded .env from: /path/to/your/.env"
# Verify the path is correct
```

---

### "RPC request failed"

**Symptoms:**
```
Error: could not detect network
Error: underlying network changed
```

**Fix:**
1. Check RPC URL is correct and accessible
2. Try public RPC URL defaults (remove custom RPC vars)
3. Check firewall/VPN isn't blocking RPC requests

```bash
# Test RPC connectivity
curl -X POST https://flare-api.flare.network/ext/bc/C/rpc \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

---

### "Vercel deployment missing feeds"

**Symptoms:**
- Feeds exist locally but not on Vercel
- Feeds disappear after redeploy

**Fix:**
- Vercel filesystem is ephemeral — local JSON storage doesn't persist
- **You must use Supabase storage for Vercel deployments**
- Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Change storage mode in Settings page after deployment

---

## Related Documentation

- [Directory Structure](./directory-structure.md) — Where to run commands
- [Supported Chains](./supported-chains.md) — Chain IDs and RPC URLs
- [Storage Modes](../FEED_STORAGE_LOCAL_MODE.md) — Local JSON vs Supabase
- [Bot Configuration](../operations/bot-configuration.md) — Complete bot guide

---

## Quick Start Checklist

For new deployments, follow this order:

- [ ] Create `frontend/.env` file
- [ ] Add `DEPLOYER_PRIVATE_KEY=0x...`
- [ ] (Optional) Add custom RPC URLs
- [ ] Deploy contracts via UI or CLI
- [ ] Export bot config from Settings page
- [ ] Add `CUSTOM_FEED_ADDRESS_*` variables to `.env`
- [ ] Start bot: `npm run bot:start`
- [ ] Verify feeds are updating

**Pro tip:** Keep a separate `.env.example` in your repo (without private keys) so teammates know what variables to set.

