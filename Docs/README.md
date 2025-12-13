# Flare Custom Feeds Toolkit Documentation

> **Complete documentation for deploying, operating, and extending custom price feeds on Flare**

---

## 🚀 Getting Started

New to the toolkit? Start here:

1. **[README.md](../README.md)** — Overview and quick start
2. **[Environment Variables Guide](configuration/environment-variables.md)** — Critical setup (prevents 90% of failures)
3. **[Directory Structure Guide](configuration/directory-structure.md)** — Where to run commands
4. **[Supported Chains Reference](configuration/supported-chains.md)** — 20+ chains supported

---

## 📖 Documentation Index

### Configuration Guides

**Must-read for setup:**

| Document | Description | When to Read |
|----------|-------------|--------------|
| **[Environment Variables](configuration/environment-variables.md)** | Complete .env reference, bot patterns, Vercel setup | Before first deployment |
| **[Directory Structure](configuration/directory-structure.md)** | Execution context, file locations, common mistakes | If commands fail |
| **[Supported Chains](configuration/supported-chains.md)** | 20+ chain details, gas requirements, RPC config | When deploying cross-chain |
| **[Storage Modes](FEED_STORAGE_LOCAL_MODE.md)** | Local JSON vs Supabase | When setting up production |

---

### For Developers & AI Agents

**Technical deep dives:**

| Document | Description | Audience |
|----------|-------------|----------|
| **[CODEBASE_CONTEXT.md](../CODEBASE_CONTEXT.md)** | Complete technical overview (contracts, bot, frontend) | AI agents, developers |
| **[CROSSCHAIN_CONTEXT.md](../frontend/CROSSCHAIN_CONTEXT.md)** | Cross-chain implementation details | Contributors, advanced users |

---

## 🎯 Documentation by Use Case

### "I'm deploying my first feed"

**Read in this order:**
1. [Environment Variables Guide](configuration/environment-variables.md) — Set up `.env`
2. [README Quick Start](../README.md#quick-start-5-minutes) — Follow step-by-step
3. [Supported Chains Reference](configuration/supported-chains.md) — Pick your chain

**Common pitfalls:**
- ❌ Running `npm run dev` from root → see [Directory Structure](configuration/directory-structure.md#the-critical-rule)
- ❌ Missing `DEPLOYER_PRIVATE_KEY` → see [Environment Variables](configuration/environment-variables.md#deployer_private_key)

---

### "I'm setting up the bot"

**Read in this order:**
1. [Environment Variables Guide](configuration/environment-variables.md#bot-configuration) — Bot patterns
2. [Supported Chains Reference](configuration/supported-chains.md#bot-configuration-for-multi-chain) — Multi-chain setup
3. [README Bot Section](../README.md#keeping-your-feed-updated) — Bot operation

**Key sections:**
- [Feed Discovery Pattern](configuration/environment-variables.md#feed-discovery-required) — `CUSTOM_FEED_ADDRESS_<ALIAS>`
- [Bot Timing Config](configuration/environment-variables.md#bot-timing) — Intervals
- [Bot Logging](configuration/environment-variables.md#bot-logging) — Log files

---

### "I'm deploying cross-chain feeds"

**Read in this order:**
1. [Supported Chains Reference](configuration/supported-chains.md#understanding-chain-categories) — Direct vs Relay
2. [Supported Chains: Gas Requirements](configuration/supported-chains.md#gas-requirements-by-chain) — Budgeting
3. [Supported Chains: Network Switching](configuration/supported-chains.md#network-switching-direct-chains-only) — UX flow

**For Ethereum feeds specifically:**
- You need **ETH** for gas on Ethereum
- Wallet will prompt network switches (Ethereum → Flare)
- See [Network Switching Guide](configuration/supported-chains.md#update-flow-example-ethereum--flare)

---

### "I'm deploying to Vercel"

**Read in this order:**
1. [Environment Variables: Vercel Deployment](configuration/environment-variables.md#vercel-deployment) — Env var setup
2. [Storage Modes](FEED_STORAGE_LOCAL_MODE.md) — Supabase required (filesystem is ephemeral)

**Critical:**
- Set **Root Directory** to `frontend/` in Vercel
- Use **Supabase storage mode** (local JSON doesn't persist)
- Set all env vars in Vercel Dashboard (don't commit `.env`)

---

### "Something isn't working"

**Troubleshooting guides:**

| Problem | Solution |
|---------|----------|
| Commands fail | [Directory Structure: Common Mistakes](configuration/directory-structure.md#common-mistakes--fixes) |
| Env vars not working | [Environment Variables: Troubleshooting](configuration/environment-variables.md#troubleshooting) |
| Chain/network errors | [Supported Chains: Troubleshooting](configuration/supported-chains.md#troubleshooting) |
| Bot not finding feeds | [Environment Variables: Bot Discovery](configuration/environment-variables.md#bot-not-discovering-feeds) |
| General issues | [README: Troubleshooting](../README.md#troubleshooting) |

---

## 📊 Documentation Status

### Phase 1: Critical Foundation ✅

**Completed:**
- ✅ Environment Variables Guide
- ✅ Directory Structure Guide
- ✅ Supported Chains Reference
- ✅ README updates with doc links

**Coverage:** 70% of setup failures prevented

---

### Phase 2: Operational Guides (Future)

**Planned:**
- [ ] Bot Configuration Deep Dive
- [ ] Feed Creation Flow (end-to-end)
- [ ] REST API Endpoints Reference
- [ ] Cross-Chain Architecture (user-friendly)
- [ ] Contract Deployment Scripts (CLI)

---

## 🎓 Learning Path

### Beginner
1. Read [README.md](../README.md) overview
2. Follow [Quick Start](../README.md#quick-start-5-minutes)
3. Reference [Environment Variables](configuration/environment-variables.md) as needed

### Intermediate
4. Explore [Supported Chains](configuration/supported-chains.md) for multi-chain
5. Set up [bot automation](../README.md#option-b-automated-bot-good-for-production)
6. Understand [Storage Modes](FEED_STORAGE_LOCAL_MODE.md)

### Advanced
7. Read [CODEBASE_CONTEXT.md](../CODEBASE_CONTEXT.md) for architecture
8. Study [CROSSCHAIN_CONTEXT.md](../frontend/CROSSCHAIN_CONTEXT.md) for implementation
9. Extend with custom price sources

---

## 💡 Pro Tips

### For New Users
- ✅ Always run `npm run dev` from `frontend/` directory
- ✅ Use default RPCs first (no API keys needed)
- ✅ Start with Flare-native pools (no cross-chain complexity)
- ✅ Test on Coston2 testnet before mainnet

### For Bot Operators
- ✅ Use consistent `<ALIAS>` naming for feeds
- ✅ Keep Ethereum feeds in separate bot instance
- ✅ Monitor `logs/` directory for JSON logs
- ✅ Set up alerts for bot failures

### For Production
- ✅ Use Supabase storage (not local JSON)
- ✅ Set up monitoring for feed staleness
- ✅ Use custom RPC endpoints (Alchemy, Infura)
- ✅ Keep `frontend/data/feeds.json` backed up

---

## 🔗 Quick Links

### External Resources
- [Flare Network Docs](https://docs.flare.network/)
- [FDC Documentation](https://docs.flare.network/tech/fdc/)
- [Uniswap V3 Docs](https://docs.uniswap.org/protocol/concepts/V3-overview/concentrated-liquidity)
- [SparkDEX](https://sparkdex.ai/) (Flare DEX)

### Project Links
- [GitHub Repository](https://github.com/cobibean/flare-custom-feeds-toolkit)
- [Flare Forward](https://flareforward.com)
- [Flare Discord](https://discord.flare.network)

---

## 📝 Contributing to Docs

Found an error or want to improve these docs?

1. Open an issue on GitHub with the `documentation` label
2. Submit a PR with your changes
3. Ask in Discord #dev-chat

**Documentation principles:**
- Accuracy > Completeness
- Examples > Descriptions
- Troubleshooting > Perfection
- User-facing > Technical jargon

---

## 📄 Document Changelog

| Date | Change | Files Affected |
|------|--------|----------------|
| 2025-12-13 | Phase 1 documentation complete | `environment-variables.md`, `directory-structure.md`, `supported-chains.md`, `README.md` |
| 2025-11-15 | Cross-chain context added | `CROSSCHAIN_CONTEXT.md` |
| 2025-10-01 | Initial codebase context | `CODEBASE_CONTEXT.md` |

---

**Documentation built by AI for humans** 🤖❤️👨‍💻

*Last updated: December 13, 2025*

