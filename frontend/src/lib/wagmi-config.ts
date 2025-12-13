import { http, createConfig } from 'wagmi';
import { 
  connectorsForWallets 
} from '@rainbow-me/rainbowkit';
import {
  injectedWallet,
  rabbyWallet,
  metaMaskWallet,
  coinbaseWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { type Chain } from 'viem';

type WagmiGlobal = typeof globalThis & {
  __flareForwardWagmiConnectors?: ReturnType<typeof connectorsForWallets>;
  __flareForwardWagmiConfig?: ReturnType<typeof createConfig>;
};

const wagmiGlobal = globalThis as WagmiGlobal;

// Define Flare Mainnet
export const flare = {
  id: 14,
  name: 'Flare',
  nativeCurrency: { name: 'Flare', symbol: 'FLR', decimals: 18 },
  iconUrl: '/flarelogo.png',
  iconBackground: '#E62058',
  rpcUrls: {
    default: { http: ['https://flare-api.flare.network/ext/bc/C/rpc'] },
    public: { http: ['https://flare-api.flare.network/ext/bc/C/rpc'] },
  },
  blockExplorers: {
    default: { name: 'Flare Explorer', url: 'https://flare-explorer.flare.network' },
  },
} as const satisfies Chain;

// Define Ethereum Mainnet (NEW)
export const ethereum = {
  id: 1,
  name: 'Ethereum',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://eth.llamarpc.com'] },
    public: { http: ['https://eth.llamarpc.com'] },
  },
  blockExplorers: {
    default: { name: 'Etherscan', url: 'https://etherscan.io' },
  },
} as const satisfies Chain;

// Define Sepolia Testnet (NEW - for testing)
export const sepolia = {
  id: 11155111,
  name: 'Sepolia',
  nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://ethereum-sepolia-rpc.publicnode.com'] },
    public: { http: ['https://ethereum-sepolia-rpc.publicnode.com'] },
  },
  blockExplorers: {
    default: { name: 'Sepolia Etherscan', url: 'https://sepolia.etherscan.io' },
  },
  testnet: true,
} as const satisfies Chain;

// Define Coston2 Testnet (kept for reference)
export const coston2 = {
  id: 114,
  name: 'Coston2',
  nativeCurrency: { name: 'Coston2 Flare', symbol: 'C2FLR', decimals: 18 },
  iconUrl: '/flarelogo.png',
  iconBackground: '#E62058',
  rpcUrls: {
    default: { http: ['https://coston2-api.flare.network/ext/bc/C/rpc'] },
    public: { http: ['https://coston2-api.flare.network/ext/bc/C/rpc'] },
  },
  blockExplorers: {
    default: { name: 'Coston2 Explorer', url: 'https://coston2-explorer.flare.network' },
  },
  testnet: true,
} as const satisfies Chain;

// Include Flare testnet + Ethereum testnet in chains array for cross-chain support
const chains = [flare, coston2, ethereum, sepolia] as const;

// Custom wallet configuration - desktop/browser wallets only
// WalletConnect removed to avoid API key requirements for this dev tool
// Users can add WalletConnect support by getting a free Project ID at https://cloud.walletconnect.com/
const connectors =
  wagmiGlobal.__flareForwardWagmiConnectors ??
  (wagmiGlobal.__flareForwardWagmiConnectors = connectorsForWallets(
    [
      {
        groupName: 'Wallets',
        wallets: [
          injectedWallet,    // Detects ANY injected wallet (Rabby, MetaMask, etc.)
          rabbyWallet,       // Explicit Rabby support
          metaMaskWallet,    // MetaMask
          coinbaseWallet,    // Coinbase Wallet
        ],
      },
    ],
    {
      appName: 'Flare Custom Feeds',
      // If you want to enable WalletConnect in the future, set a real project id:
      // NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=...
      projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'flare-custom-feeds',
    }
  ));

// Create wagmi config with custom connectors
export const config =
  wagmiGlobal.__flareForwardWagmiConfig ??
  (wagmiGlobal.__flareForwardWagmiConfig = createConfig({
    chains,
    connectors,
    transports: {
      [flare.id]: http(),
      [coston2.id]: http(),
      [ethereum.id]: http(),
      [sepolia.id]: http(),
    },
    // Providers live in a client component; avoid SSR hydration mode which can
    // cause repeated connector initialization under dev/HMR.
    ssr: false,
  }));

// Export for use in components
export const supportedChains = chains;
export type SupportedChainId =
  | typeof flare.id
  | typeof coston2.id
  | typeof ethereum.id
  | typeof sepolia.id;

export function getChainById(chainId: number): Chain | undefined {
  return supportedChains.find(chain => chain.id === chainId);
}

export function getExplorerUrl(chainId: number, type: 'address' | 'tx', hash: string): string {
  const chain = getChainById(chainId);
  if (!chain?.blockExplorers?.default) return '#';
  const base = chain.blockExplorers.default.url;
  return type === 'address' ? `${base}/address/${hash}` : `${base}/tx/${hash}`;
}

// Check if a chain is Flare network (where feeds are deployed)
export function isFlareNetwork(chainId: number): boolean {
  return chainId === flare.id || chainId === coston2.id;
}

// Get the main Flare chain for feed deployment
export function getFlareChain(): typeof flare {
  return flare;
}
