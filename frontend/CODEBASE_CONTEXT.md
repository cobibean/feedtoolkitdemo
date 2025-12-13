# Frontend Codebase Context

> **Note:** The main codebase documentation has moved to the project root.

**📖 See [`../CODEBASE_CONTEXT.md`](../CODEBASE_CONTEXT.md) for the full AI-optimized reference.**

---

## Quick Reference (Frontend-Specific)

### Key Files

| File | Purpose |
|------|---------|
| `src/app/page.tsx` | Landing page |
| `src/app/dashboard/` | Dashboard routes (deploy, monitor, bot, settings) |
| `src/app/api/` | API routes (feeds CRUD, FDC proxy, bot control) |
| `src/hooks/use-feed-updater.ts` | FDC attestation workflow |
| `src/hooks/use-pool-info.ts` | Auto-detect V3 pool info |
| `src/lib/artifacts/` | Contract ABIs + bytecode |
| `src/lib/chains.ts` | Multi-chain configuration |
| `data/feeds.json` | Local storage for deployed feeds |

### Commands

```bash
npm run dev      # Start dev server at localhost:3000
npm run build    # Production build
npm run lint     # Run ESLint
```

### Environment Variables

Create `frontend/.env`:

```bash
# Optional - for in-browser bot
DEPLOYER_PRIVATE_KEY=0x...

# Optional - Supabase (if using cloud storage)
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```
