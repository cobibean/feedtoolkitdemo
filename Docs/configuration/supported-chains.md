# Supported Chains Reference

> **Complete Multi-Chain Guide** — The Flare Custom Feeds Toolkit supports 20+ EVM chains across two architectures: **Direct** (trustless FDC) and **Relay** (bot-assisted).

---

## Quick Reference

| Category | Chains | Trust Model | Gas Required | Update Time |
|----------|--------|-------------|--------------|-------------|
| **Direct** | Flare, Ethereum, Coston2, Sepolia | Trustless (FDC native) | Source chain native token | 2-5 minutes |
| **Relay** | 18+ L1/L2 chains | Bot + FDC attestation | FLR only (bot pays source gas) | 5-10 minutes |

---

## Understanding Chain Categories

### Direct Chains (Trustless FDC)

**How it works:**
1. Transaction happens on source chain (e.g., Ethereum)
2. FDC's `EVMTransaction` attestation type **natively verifies** the transaction
3. Proof submitted to Flare feed contract
4. No intermediaries — fully trustless

**Supported:**
- ✅ Flare (chainId: 14)
- ✅ Ethereum (chainId: 1)
- ✅ Coston2 Testnet (chainId: 114)
- ✅ Sepolia Testnet (chainId: 11155111)

**Gas requirements:**
- User must have **native tokens** on source chain (ETH for Ethereum, FLR for Flare)
- FDC attestation fee (~1 FLR) paid on Flare

**Use cases:**
- Maximum security (no trust assumptions beyond FDC)
- High-value feeds
- Regulatory compliance requirements

---

### Relay Chains (Bot-Assisted)

**How it works:**
1. Bot fetches price from source chain (off-chain RPC call)
2. Bot calls `PriceRelay.relayPrice()` on Flare
3. FDC attests **the relay transaction** (on Flare, not source chain)
4. Proof submitted to feed contract

**Security model:**
- Trust the relay bot operator (you or Flare Forward)
- FDC verifies the relay transaction is authentic
- Multiple security checks: token binding, monotonicity, deviation limits

**Supported:** 18+ chains (Arbitrum, Base, Polygon, Avalanche, etc.)

**Gas requirements:**
- User pays **only FLR** (bot handles source chain gas via RPC)
- No source chain wallet/gas needed

**Use cases:**
- Chains without direct FDC support
- Convenience (no multi-chain wallet management)
- Development/testing

---

## Complete Chain List

### Direct Chains (Mainnet)

#### Flare
- **Chain ID:** 14
- **Category:** Direct
- **Native Token:** FLR (18 decimals)
- **RPC URL:** `https://flare-api.flare.network/ext/bc/C/rpc`
- **Explorer:** [https://flare-explorer.flare.network](https://flare-explorer.flare.network)
- **FDC Source ID:** `0x464c520000000000000000000000000000000000000000000000000000000000`
- **Verifier Path:** `flr`

**Notes:**
- Flare-native pools can use **direct state reads** (`slot0()`) — no FDC fees!
- Cross-chain Flare-to-Flare requires FDC attestation

**Gas:** ~0.002 FLR per transaction

---

#### Ethereum
- **Chain ID:** 1
- **Category:** Direct
- **Native Token:** ETH (18 decimals)
- **RPC URL:** `https://eth.llamarpc.com` (public, free)
- **Explorer:** [https://etherscan.io](https://etherscan.io)
- **FDC Source ID:** `0x4554480000000000000000000000000000000000000000000000000000000000`
- **Verifier Path:** `eth`

**Notes:**
- Requires ETH for gas when calling `recordPrice()`
- FDC attestation takes ~2-5 minutes (finality requirement)
- Highest liquidity pools available

**Gas:** ~0.003 ETH per `recordPrice()` (~$10 at $3000/ETH)

**Recommended RPC alternatives:**
```bash
# Alchemy (requires API key)
ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY

# Infura (requires API key)
ETH_RPC_URL=https://mainnet.infura.io/v3/YOUR_API_KEY

# Ankr (public)
ETH_RPC_URL=https://rpc.ankr.com/eth
```

---

### Direct Chains (Testnet)

#### Coston2
- **Chain ID:** 114
- **Category:** Direct
- **Native Token:** C2FLR (18 decimals)
- **RPC URL:** `https://coston2-api.flare.network/ext/bc/C/rpc`
- **Explorer:** [https://coston2-explorer.flare.network](https://coston2-explorer.flare.network)
- **FDC Source ID:** `0x7465737443324652000000000000000000000000000000000000000000000000`
- **Verifier Path:** `c2flr`

**Notes:**
- Flare testnet — free C2FLR from [faucet](https://faucet.flare.network/)
- Use for development and testing before mainnet

---

#### Sepolia
- **Chain ID:** 11155111
- **Category:** Direct
- **Native Token:** ETH (18 decimals)
- **RPC URL:** `https://ethereum-sepolia-rpc.publicnode.com`
- **Explorer:** [https://sepolia.etherscan.io](https://sepolia.etherscan.io)
- **FDC Source ID:** `0x7465737445544800000000000000000000000000000000000000000000000000`
- **Verifier Path:** `sepolia`

**Notes:**
- Ethereum testnet — free ETH from [faucets](https://sepoliafaucet.com/)
- Test Ethereum cross-chain flows before mainnet

---

### Relay Chains (Mainnet)

All relay chains use the same pattern: bot fetches price, relays to Flare, FDC attests relay.

#### Arbitrum
- **Chain ID:** 42161
- **Category:** Relay
- **Native Token:** ETH (18 decimals)
- **RPC URL:** `https://arb1.arbitrum.io/rpc`
- **Explorer:** [https://arbiscan.io](https://arbiscan.io)

**Notes:** Optimistic L2, low gas fees, high liquidity

---

#### Base
- **Chain ID:** 8453
- **Category:** Relay
- **Native Token:** ETH (18 decimals)
- **RPC URL:** `https://mainnet.base.org`
- **Explorer:** [https://basescan.org](https://basescan.org)

**Notes:** Coinbase L2, growing DeFi ecosystem

---

#### Optimism
- **Chain ID:** 10
- **Category:** Relay
- **Native Token:** ETH (18 decimals)
- **RPC URL:** `https://mainnet.optimism.io`
- **Explorer:** [https://optimistic.etherscan.io](https://optimistic.etherscan.io)

**Notes:** Optimistic L2, established ecosystem

---

#### Polygon
- **Chain ID:** 137
- **Category:** Relay
- **Native Token:** MATIC (18 decimals)
- **RPC URL:** `https://polygon-rpc.com`
- **Explorer:** [https://polygonscan.com](https://polygonscan.com)

**Notes:** Mature DeFi ecosystem, wide token support

---

#### Avalanche
- **Chain ID:** 43114
- **Category:** Relay
- **Native Token:** AVAX (18 decimals)
- **RPC URL:** `https://api.avax.network/ext/bc/C/rpc`
- **Explorer:** [https://snowtrace.io](https://snowtrace.io)

**Notes:** Fast finality, Trader Joe DEX popular

---

#### BNB Chain
- **Chain ID:** 56
- **Category:** Relay
- **Native Token:** BNB (18 decimals)
- **RPC URL:** `https://bsc-dataseed.binance.org`
- **Explorer:** [https://bscscan.com](https://bscscan.com)

**Notes:** High throughput, PancakeSwap liquidity

---

#### Fantom
- **Chain ID:** 250
- **Category:** Relay
- **Native Token:** FTM (18 decimals)
- **RPC URL:** `https://rpc.ftm.tools`
- **Explorer:** [https://ftmscan.com](https://ftmscan.com)

**Notes:** Fast finality, SpookySwap ecosystem

---

#### zkSync Era
- **Chain ID:** 324
- **Category:** Relay
- **Native Token:** ETH (18 decimals)
- **RPC URL:** `https://mainnet.era.zksync.io`
- **Explorer:** [https://explorer.zksync.io](https://explorer.zksync.io)

**Notes:** ZK rollup, growing ecosystem

---

#### Linea
- **Chain ID:** 59144
- **Category:** Relay
- **Native Token:** ETH (18 decimals)
- **RPC URL:** `https://rpc.linea.build`
- **Explorer:** [https://lineascan.build](https://lineascan.build)

**Notes:** Consensys ZK rollup

---

#### Scroll
- **Chain ID:** 534352
- **Category:** Relay
- **Native Token:** ETH (18 decimals)
- **RPC URL:** `https://rpc.scroll.io`
- **Explorer:** [https://scrollscan.com](https://scrollscan.com)

**Notes:** ZK rollup, EVM-equivalent

---

#### Mantle
- **Chain ID:** 5000
- **Category:** Relay
- **Native Token:** MNT (18 decimals)
- **RPC URL:** `https://rpc.mantle.xyz`
- **Explorer:** [https://explorer.mantle.xyz](https://explorer.mantle.xyz)

**Notes:** Modular L2, BitDAO ecosystem

---

#### Blast
- **Chain ID:** 81457
- **Category:** Relay
- **Native Token:** ETH (18 decimals)
- **RPC URL:** `https://rpc.blast.io`
- **Explorer:** [https://blastscan.io](https://blastscan.io)

**Notes:** Optimistic L2 with native yield

---

#### Gnosis
- **Chain ID:** 100
- **Category:** Relay
- **Native Token:** xDAI (18 decimals)
- **RPC URL:** `https://rpc.gnosischain.com`
- **Explorer:** [https://gnosisscan.io](https://gnosisscan.io)

**Notes:** EVM chain, stable token native currency

---

#### Celo
- **Chain ID:** 42220
- **Category:** Relay
- **Native Token:** CELO (18 decimals)
- **RPC URL:** `https://forno.celo.org`
- **Explorer:** [https://celoscan.io](https://celoscan.io)

**Notes:** Mobile-first, stable token focus

---

#### Polygon zkEVM
- **Chain ID:** 1101
- **Category:** Relay
- **Native Token:** ETH (18 decimals)
- **RPC URL:** `https://zkevm-rpc.com`
- **Explorer:** [https://zkevm.polygonscan.com](https://zkevm.polygonscan.com)

**Notes:** ZK rollup, high security

---

#### Mode
- **Chain ID:** 34443
- **Category:** Relay
- **Native Token:** ETH (18 decimals)
- **RPC URL:** `https://mainnet.mode.network`
- **Explorer:** [https://explorer.mode.network](https://explorer.mode.network)

**Notes:** Optimistic L2, DeFi focused

---

#### Zora
- **Chain ID:** 7777777
- **Category:** Relay
- **Native Token:** ETH (18 decimals)
- **RPC URL:** `https://rpc.zora.energy`
- **Explorer:** [https://explorer.zora.energy](https://explorer.zora.energy)

**Notes:** NFT-focused L2

---

## RPC Configuration

### Using Default RPCs

All chains have **free public RPCs** configured by default. No API keys needed!

```bash
# No .env variables needed — defaults work out of the box
npm run dev
```

---

### Custom RPC Endpoints

Override defaults for better performance or rate limits:

```bash
# Method 1: Named environment variables
FLARE_RPC_URL=https://your-custom-flare-rpc.com
ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
COSTON2_RPC_URL=https://coston2-api.flare.network/ext/bc/C/rpc
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY

# Method 2: Chain ID pattern (works for any chain)
RPC_URL_1=https://eth.llamarpc.com            # Ethereum
RPC_URL_14=https://flare-api.flare.network/ext/bc/C/rpc  # Flare
RPC_URL_42161=https://arb1.arbitrum.io/rpc    # Arbitrum
RPC_URL_8453=https://mainnet.base.org         # Base
```

**Precedence:** Named vars (e.g., `FLARE_RPC_URL`) override pattern vars (e.g., `RPC_URL_14`).

---

### Recommended RPC Providers

| Provider | Free Tier | Chains | Notes |
|----------|-----------|--------|-------|
| [Alchemy](https://www.alchemy.com/) | 300M requests/month | Ethereum, Polygon, Arbitrum, Optimism, Base | Best reliability |
| [Infura](https://infura.io/) | 100k requests/day | Ethereum, Polygon, Arbitrum, Optimism | Industry standard |
| [Ankr](https://www.ankr.com/) | Unlimited (rate limited) | 50+ chains | No API key needed |
| [Chainstack](https://chainstack.com/) | 3M requests/month | 20+ chains | Good for multi-chain |
| Public RPCs | Varies | All chains | Can be slow/unreliable |

---

## Gas Requirements by Chain

### Direct Chains

| Chain | Operation | Gas Cost | USD Cost (approx) |
|-------|-----------|----------|-------------------|
| **Flare** | `recordPrice()` | 0.002 FLR | ~$0.00005 |
| **Flare** | FDC attestation fee | 1.0 FLR | ~$0.025 |
| **Ethereum** | `recordPrice()` | 0.003 ETH | ~$10 @ $3000/ETH |
| **Ethereum** | FDC attestation fee | 1.0 FLR | ~$0.025 |

**Total per update:**
- Flare-to-Flare: ~1.002 FLR (~$0.025)
- Ethereum-to-Flare: ~0.003 ETH + 1.0 FLR (~$10.03)

---

### Relay Chains

| Chain | Who Pays Gas | Cost to User |
|-------|--------------|--------------|
| **All relay chains** | Bot operator | 1.0 FLR (FDC fee only) |

**Total per update:** ~1.0 FLR (~$0.025)

**Note:** The bot fetches prices via RPC (no on-chain transaction), so users don't need native tokens on source chains.

---

## Network Switching (Direct Chains Only)

When updating **direct chain** feeds (Ethereum, Sepolia), your wallet must switch networks:

### Update Flow Example (Ethereum → Flare)

```
1. User clicks "Update Feed" on Ethereum feed
   └─ Wallet prompts: "Switch to Ethereum?"
   └─ User confirms

2. Call recordPrice() on Ethereum
   └─ Transaction requires ETH for gas
   └─ User signs transaction

3. Wallet prompts: "Switch back to Flare?"
   └─ User confirms

4. Request FDC attestation (on Flare)
   └─ Transaction requires FLR for attestation fee
   └─ User signs transaction

5. Wait 2-5 minutes for finalization

6. Submit proof to feed contract (on Flare)
   └─ Transaction requires FLR for gas
   └─ User signs transaction

7. ✅ Feed updated!
```

**Relay chains skip steps 1-3** — no network switching needed!

---

## Finding Pools on Each Chain

### Flare

**DEXs:**
- [SparkDEX](https://sparkdex.ai/) — Primary Flare DEX
- [BlazeSwap](https://blazeswap.com/) — Uniswap V2 fork

**Example pool addresses:**
```
FXRP/USDTO: 0x... (check SparkDEX)
FLR/USDC: 0x...
```

---

### Ethereum

**DEXs:**
- [Uniswap V3](https://app.uniswap.org/) — Largest liquidity
- [SushiSwap](https://www.sushi.com/)

**Example pool addresses:**
```bash
# Find on Uniswap V3 Info
# https://info.uniswap.org/#/

# WETH/USDC 0.05% pool
0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640

# WETH/USDC 0.3% pool
0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8
```

---

### Arbitrum

**DEXs:**
- [Uniswap V3](https://app.uniswap.org/)
- [Camelot](https://camelot.exchange/)
- [SushiSwap](https://www.sushi.com/)

---

### Base

**DEXs:**
- [Uniswap V3](https://app.uniswap.org/)
- [Aerodrome](https://aerodrome.finance/)
- [BaseSwap](https://baseswap.fi/)

---

### Other Chains

Check [DeFi Llama](https://defillama.com/protocols/Dexes) for DEX rankings per chain.

---

## Chain Selection Guide

### Choose Direct Chains When:

- ✅ Maximum security is required
- ✅ Regulatory/compliance needs
- ✅ High-value feeds ($1M+)
- ✅ Pool exists on Ethereum or Flare

### Choose Relay Chains When:

- ✅ Pool only exists on L2/alt-L1
- ✅ Convenience (no multi-chain wallet management)
- ✅ Development/testing (easier setup)
- ✅ Trust in relay operator is acceptable

---

## Bot Configuration for Multi-Chain

### Ethereum Feed Example

```bash
# Bot must connect to Ethereum to call recordPrice()
CUSTOM_FEED_ADDRESS_ETH_WETH_USDC=0x...
POOL_ADDRESS_ETH_WETH_USDC=0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640
PRICE_RECORDER_ADDRESS_ETH_WETH_USDC=0x...
SOURCE_CHAIN_ID_ETH_WETH_USDC=1

# Optional: Custom Ethereum RPC
ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
```

**Important:** Ethereum feeds should run in a **separate bot instance** because FDC attestation can take 5+ minutes.

---

### Arbitrum Relay Feed Example

```bash
# Bot fetches price via RPC, relays to Flare
CUSTOM_FEED_ADDRESS_ARB_GMX_ETH=0x...
POOL_ADDRESS_ARB_GMX_ETH=0x...
PRICE_RELAY_ADDRESS_ARB_GMX_ETH=0x...
SOURCE_CHAIN_ID_ARB_GMX_ETH=42161

# Optional: Custom Arbitrum RPC
RPC_URL_42161=https://arb-mainnet.g.alchemy.com/v2/YOUR_KEY
```

**Note:** Bot handles all source chain interactions — user doesn't need Arbitrum wallet/gas.

---

## Troubleshooting

### "Network mismatch" Error

**Symptoms:**
```
Error: Network mismatch. Expected chainId 1, got 14
```

**Fix:**
- Direct chains require network switching
- Confirm network switch in MetaMask when prompted
- Check wallet is set to correct network

---

### "Insufficient funds" on Source Chain

**Symptoms:**
```
Error: insufficient funds for gas * price + value
```

**Fix:**
- Direct chains require native tokens (ETH for Ethereum, FLR for Flare)
- Get tokens from faucets (testnet) or exchanges (mainnet)
- For relay chains, this shouldn't happen (bot pays gas)

---

### "RPC request failed"

**Symptoms:**
```
Error: fetch failed (429 rate limit exceeded)
```

**Fix:**
- Public RPCs have rate limits
- Use custom RPC endpoint (Alchemy, Infura)
- Add API key to `.env`

```bash
ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY
```

---

### "Chain not supported"

**Symptoms:**
- Chain doesn't appear in dropdown
- Error: `Unsupported chain ID: X`

**Fix:**
- Check [supported chains list](#complete-chain-list)
- Open GitHub issue to request new chain
- Custom chain support requires FDC or relay implementation

---

## Adding New Chains

**Want to add a chain?** Open an issue on GitHub with:

1. Chain name and ID
2. RPC URL and explorer
3. DEX(s) with Uniswap V3 pools
4. Liquidity depth (does it justify the effort?)
5. Category request: direct (requires FDC support) or relay

**Relay chains are easier to add** — usually 1-2 day implementation.

---

## Related Documentation

- [Environment Variables Guide](./environment-variables.md) — RPC configuration
- [Cross-Chain Architecture](../deployment/cross-chain-feeds.md) — Technical deep dive
- [Bot Configuration](../operations/bot-configuration.md) — Multi-chain bot setup
- [Feed Creation Flow](../deployment/feed-creation-flow.md) — Deploying cross-chain feeds

---

## Quick Reference Table

| Chain | ID | Category | Native | RPC Default |
|-------|-----|----------|--------|-------------|
| Flare | 14 | Direct | FLR | `flare-api.flare.network` |
| Ethereum | 1 | Direct | ETH | `eth.llamarpc.com` |
| Coston2 | 114 | Direct | C2FLR | `coston2-api.flare.network` |
| Sepolia | 11155111 | Direct | ETH | `ethereum-sepolia-rpc.publicnode.com` |
| Arbitrum | 42161 | Relay | ETH | `arb1.arbitrum.io/rpc` |
| Base | 8453 | Relay | ETH | `mainnet.base.org` |
| Optimism | 10 | Relay | ETH | `mainnet.optimism.io` |
| Polygon | 137 | Relay | MATIC | `polygon-rpc.com` |
| Avalanche | 43114 | Relay | AVAX | `api.avax.network/ext/bc/C/rpc` |
| BNB Chain | 56 | Relay | BNB | `bsc-dataseed.binance.org` |
| Fantom | 250 | Relay | FTM | `rpc.ftm.tools` |
| zkSync Era | 324 | Relay | ETH | `mainnet.era.zksync.io` |
| Linea | 59144 | Relay | ETH | `rpc.linea.build` |
| Scroll | 534352 | Relay | ETH | `rpc.scroll.io` |
| Mantle | 5000 | Relay | MNT | `rpc.mantle.xyz` |
| Blast | 81457 | Relay | ETH | `rpc.blast.io` |
| Gnosis | 100 | Relay | xDAI | `rpc.gnosischain.com` |
| Celo | 42220 | Relay | CELO | `forno.celo.org` |
| Polygon zkEVM | 1101 | Relay | ETH | `zkevm-rpc.com` |
| Mode | 34443 | Relay | ETH | `mainnet.mode.network` |
| Zora | 7777777 | Relay | ETH | `rpc.zora.energy` |

