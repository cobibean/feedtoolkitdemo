# Flare Custom Feeds Toolkit - Frontend

This is the **Next.js web UI** for the Flare Custom Feeds Toolkit.

**📖 For full documentation, see the [main README](../README.md) in the project root.**

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to use the app.

## Tech Stack

- **Next.js 16** (App Router)
- **RainbowKit + wagmi + viem** (Wallet connection)
- **shadcn/ui + Tailwind CSS** (UI components)
- **React 19**

## Project Structure

```
frontend/
├── src/
│   ├── app/              # Next.js pages & API routes
│   ├── components/       # React components
│   ├── hooks/            # Custom React hooks
│   ├── lib/              # Utilities & contract artifacts
│   └── context/          # React Context providers
├── data/
│   └── feeds.json        # Local storage for deployed feeds
└── public/               # Static assets
```

## Deployment

For Vercel deployment, set the project root to `frontend/` and configure environment variables in the Vercel dashboard.

See `../CODEBASE_CONTEXT.md` for technical details.
