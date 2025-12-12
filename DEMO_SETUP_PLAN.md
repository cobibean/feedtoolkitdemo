# Demo Deployment Plan

> Setting up a live demo of the Flare Custom Feeds Toolkit for grant reviewers.

**Goal:** Deploy a working demo at `feedtoolkitdemo.vercel.app` (or similar) backed by Supabase.

---

## Overview

| Step | Task | Status |
|------|------|--------|
| 1 | Create GitHub Repository | ⬜ Pending |
| 2 | Set Up Supabase Project | ✅ Complete |
| 3 | Wire Up Supabase in Code | ✅ Complete |
| 4 | Deploy to Vercel | ⬜ Pending |
| 5 | Test & Verify | ⬜ Pending |

---

## Step 1: Create GitHub Repository

### Tasks
- [ ] Initialize git in this directory (if not already)
- [ ] Create new GitHub repo named `feedtoolkitdemo`
- [ ] Push code to GitHub

### Commands
```bash
cd /Users/cobibean/flare-custom-feeds-toolkit-main/feedtoolkitdemo

# Initialize git
git init

# Add all files
git add .

# Initial commit
git commit -m "Initial commit: Flare Custom Feeds Toolkit Demo"

# Create GitHub repo and push
gh repo create feedtoolkitdemo --public --source=. --push
```

### Verification
- [ ] Repo visible at `https://github.com/cobibean/feedtoolkitdemo`

---

## Step 2: Set Up Supabase Project

### Tasks
- [ ] Create new Supabase project named `feedtoolkitdemo`
- [ ] Create database tables: `feeds`, `relays`, `recorders`
- [ ] Get connection credentials (URL + anon key)

### Database Schema

```sql
-- Feeds table (replaces feeds.json → feeds array)
CREATE TABLE feeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alias TEXT NOT NULL,
  network TEXT NOT NULL DEFAULT 'flare',
  
  -- Source chain info
  source_chain_id INTEGER NOT NULL DEFAULT 14,
  source_chain_name TEXT NOT NULL DEFAULT 'Flare',
  source_chain_category TEXT NOT NULL DEFAULT 'direct',
  source_pool_address TEXT NOT NULL,
  
  -- Flare contract addresses
  custom_feed_address TEXT NOT NULL,
  price_recorder_address TEXT,
  price_relay_address TEXT,
  
  -- Pool address (legacy compatibility)
  pool_address TEXT NOT NULL,
  
  -- Token info
  token0_address TEXT NOT NULL,
  token0_symbol TEXT NOT NULL,
  token0_decimals INTEGER NOT NULL,
  token1_address TEXT NOT NULL,
  token1_symbol TEXT NOT NULL,
  token1_decimals INTEGER NOT NULL,
  
  invert_price BOOLEAN NOT NULL DEFAULT false,
  
  -- Metadata
  deployed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deployed_by TEXT NOT NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Recorders table (replaces feeds.json → recorders array)
CREATE TABLE recorders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id INTEGER NOT NULL,
  chain_name TEXT NOT NULL,
  address TEXT NOT NULL,
  update_interval INTEGER NOT NULL DEFAULT 300,
  deployed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deployed_by TEXT NOT NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Relays table (replaces feeds.json → relays array)
CREATE TABLE relays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address TEXT NOT NULL,
  min_relay_interval INTEGER NOT NULL DEFAULT 60,
  max_price_age INTEGER NOT NULL DEFAULT 300,
  supported_chains INTEGER[] NOT NULL DEFAULT '{}',
  deployed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deployed_by TEXT NOT NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS (Row Level Security) - allow all for demo
ALTER TABLE feeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE recorders ENABLE ROW LEVEL SECURITY;
ALTER TABLE relays ENABLE ROW LEVEL SECURITY;

-- Public read/write policies for demo (no auth required)
CREATE POLICY "Allow all" ON feeds FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON recorders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON relays FOR ALL USING (true) WITH CHECK (true);
```

### Environment Variables Needed
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Verification
- [ ] Supabase project created
- [ ] Tables created via SQL editor
- [ ] Credentials saved

---

## Step 3: Wire Up Supabase in Code

### Files to Modify

1. **`frontend/src/lib/supabase.ts`** — Initialize Supabase client
2. **`frontend/src/app/api/feeds/route.ts`** — Replace JSON file with Supabase queries
3. **`frontend/src/context/feeds-context.tsx`** — Use API routes (already does)
4. **`frontend/.env.local`** — Add Supabase credentials (local dev)

### Implementation Details

#### 3.1 Update `supabase.ts`
```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Type definitions for database tables
export interface DbFeed {
  id: string;
  alias: string;
  network: string;
  source_chain_id: number;
  source_chain_name: string;
  source_chain_category: string;
  source_pool_address: string;
  custom_feed_address: string;
  price_recorder_address: string | null;
  price_relay_address: string | null;
  pool_address: string;
  token0_address: string;
  token0_symbol: string;
  token0_decimals: number;
  token1_address: string;
  token1_symbol: string;
  token1_decimals: number;
  invert_price: boolean;
  deployed_at: string;
  deployed_by: string;
}

export interface DbRecorder {
  id: string;
  chain_id: number;
  chain_name: string;
  address: string;
  update_interval: number;
  deployed_at: string;
  deployed_by: string;
}

export interface DbRelay {
  id: string;
  address: string;
  min_relay_interval: number;
  max_price_age: number;
  supported_chains: number[];
  deployed_at: string;
  deployed_by: string;
}
```

#### 3.2 Update `api/feeds/route.ts`
- GET: Query Supabase instead of reading JSON file
- POST: Insert/update in Supabase instead of writing JSON file
- Transform DB snake_case to frontend camelCase

### Verification
- [ ] `supabase.ts` updated with client initialization
- [ ] `api/feeds/route.ts` uses Supabase
- [ ] Local dev works with `.env.local`

---

## Step 4: Deploy to Vercel

### Tasks
- [ ] Connect GitHub repo to Vercel
- [ ] Set root directory to `frontend`
- [ ] Add environment variables
- [ ] Deploy

### Vercel Configuration

**Project Settings:**
- Framework Preset: Next.js
- Root Directory: `frontend`
- Build Command: `npm run build`
- Output Directory: `.next`

**Environment Variables (Vercel Dashboard):**
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
NEXT_PUBLIC_APP_URL=https://feedtoolkitdemo.vercel.app
```

**Optional (for bot functionality):**
```
DEPLOYER_PRIVATE_KEY=0x...  # Only if you want bot to work
```

### Commands
```bash
# Install Vercel CLI if needed
npm i -g vercel

# Login to Vercel
vercel login

# Deploy (will prompt for project settings)
cd frontend
vercel --prod
```

### Verification
- [ ] Site accessible at Vercel URL
- [ ] No build errors
- [ ] Pages load correctly

---

## Step 5: Test & Verify

### Smoke Tests
- [ ] Homepage loads
- [ ] Dashboard accessible
- [ ] Deploy page shows chain selector
- [ ] Monitor page loads (empty is fine)
- [ ] Settings page works
- [ ] Wallet connect works

### Functional Tests (if deploying test feed)
- [ ] Can connect wallet
- [ ] Can deploy PriceRecorder (if have testnet FLR)
- [ ] Feed shows up in monitor
- [ ] Can update feed

### Demo Prep
- [ ] Pre-deploy one example feed (optional)
- [ ] Have testnet wallet ready with FLR
- [ ] Test on mobile/tablet view
- [ ] Prepare talking points for reviewers

---

## Quick Reference

### Key URLs (fill in after setup)
| Resource | URL |
|----------|-----|
| GitHub Repo | `https://github.com/cobibean/feedtoolkitdemo` |
| Supabase Dashboard | `https://supabase.com/dashboard/project/XXXXX` |
| Vercel Dashboard | `https://vercel.com/cobibean/feedtoolkitdemo` |
| Live Demo | `https://feedtoolkitdemo.vercel.app` |

### Credentials Checklist
- [ ] Supabase URL saved
- [ ] Supabase Anon Key saved
- [ ] Added to Vercel env vars
- [ ] Added to local `.env.local` for dev

---

## Notes

### Why Supabase?
- The original toolkit uses a local `feeds.json` file
- This doesn't work on Vercel (serverless, no persistent filesystem)
- Supabase provides a free PostgreSQL database
- Easy to set up, good DX, works great with Next.js

### Security Considerations
- Demo uses public Supabase policies (no auth)
- For production: add user authentication
- Private key should never be in client-side code
- Bot functionality requires server-side key (optional for demo)

### Rollback Plan
If Supabase integration has issues:
1. The code can fall back to in-memory storage
2. Or use Vercel KV as simpler alternative
3. The demo will still show the UI/UX

---

*Last updated: December 11, 2025*
