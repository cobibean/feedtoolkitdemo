// Chain configuration for cross-chain support
// Direct chains: Flare, Ethereum, Sepolia (FDC EVMTransaction natively supported)
// Relay chains: All other EVM chains (prices relayed via PriceRelay on Flare)

export type ChainCategory = 'direct' | 'relay';

export interface SupportedChain {
  id: number;
  name: string;
  category: ChainCategory;
  sourceId?: `0x${string}`;
  verifierPath?: string;
  rpcUrl: string;
  explorerUrl: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  testnet?: boolean;
}

export const SUPPORTED_CHAINS: SupportedChain[] = [
  // === DIRECT CHAINS (Mainnet) ===
  {
    id: 14,
    name: 'Flare',
    category: 'direct',
    sourceId: '0x464c520000000000000000000000000000000000000000000000000000000000',
    verifierPath: 'flr',
    rpcUrl: 'https://flare-api.flare.network/ext/bc/C/rpc',
    explorerUrl: 'https://flare-explorer.flare.network',
    nativeCurrency: { name: 'Flare', symbol: 'FLR', decimals: 18 },
  },
  {
    id: 1,
    name: 'Ethereum',
    category: 'direct',
    sourceId: '0x4554480000000000000000000000000000000000000000000000000000000000',
    verifierPath: 'eth',
    rpcUrl: 'https://eth.llamarpc.com',
    explorerUrl: 'https://etherscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  // === DIRECT CHAINS (Testnet) ===
  {
    id: 11155111,
    name: 'Sepolia',
    category: 'direct',
    sourceId: '0x7465737445544800000000000000000000000000000000000000000000000000', // testETH
    verifierPath: 'sepolia',
    rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
    explorerUrl: 'https://sepolia.etherscan.io',
    nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },
    testnet: true,
  },
  // === RELAY CHAINS ===
  // Prices fetched off-chain, relayed to PriceRelay on Flare, then FDC attests the relay tx
  {
    id: 42161,
    name: 'Arbitrum',
    category: 'relay',
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    explorerUrl: 'https://arbiscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  {
    id: 8453,
    name: 'Base',
    category: 'relay',
    rpcUrl: 'https://mainnet.base.org',
    explorerUrl: 'https://basescan.org',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  {
    id: 10,
    name: 'Optimism',
    category: 'relay',
    rpcUrl: 'https://mainnet.optimism.io',
    explorerUrl: 'https://optimistic.etherscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  {
    id: 137,
    name: 'Polygon',
    category: 'relay',
    rpcUrl: 'https://polygon-rpc.com',
    explorerUrl: 'https://polygonscan.com',
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
  },
  {
    id: 43114,
    name: 'Avalanche',
    category: 'relay',
    rpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
    explorerUrl: 'https://snowtrace.io',
    nativeCurrency: { name: 'Avalanche', symbol: 'AVAX', decimals: 18 },
  },
  {
    id: 56,
    name: 'BNB Chain',
    category: 'relay',
    rpcUrl: 'https://bsc-dataseed.binance.org',
    explorerUrl: 'https://bscscan.com',
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
  },
  {
    id: 250,
    name: 'Fantom',
    category: 'relay',
    rpcUrl: 'https://rpc.ftm.tools',
    explorerUrl: 'https://ftmscan.com',
    nativeCurrency: { name: 'Fantom', symbol: 'FTM', decimals: 18 },
  },
  {
    id: 324,
    name: 'zkSync Era',
    category: 'relay',
    rpcUrl: 'https://mainnet.era.zksync.io',
    explorerUrl: 'https://explorer.zksync.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  {
    id: 59144,
    name: 'Linea',
    category: 'relay',
    rpcUrl: 'https://rpc.linea.build',
    explorerUrl: 'https://lineascan.build',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  {
    id: 534352,
    name: 'Scroll',
    category: 'relay',
    rpcUrl: 'https://rpc.scroll.io',
    explorerUrl: 'https://scrollscan.com',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  {
    id: 5000,
    name: 'Mantle',
    category: 'relay',
    rpcUrl: 'https://rpc.mantle.xyz',
    explorerUrl: 'https://explorer.mantle.xyz',
    nativeCurrency: { name: 'Mantle', symbol: 'MNT', decimals: 18 },
  },
  {
    id: 81457,
    name: 'Blast',
    category: 'relay',
    rpcUrl: 'https://rpc.blast.io',
    explorerUrl: 'https://blastscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  {
    id: 100,
    name: 'Gnosis',
    category: 'relay',
    rpcUrl: 'https://rpc.gnosischain.com',
    explorerUrl: 'https://gnosisscan.io',
    nativeCurrency: { name: 'xDAI', symbol: 'xDAI', decimals: 18 },
  },
  {
    id: 42220,
    name: 'Celo',
    category: 'relay',
    rpcUrl: 'https://forno.celo.org',
    explorerUrl: 'https://celoscan.io',
    nativeCurrency: { name: 'Celo', symbol: 'CELO', decimals: 18 },
  },
  {
    id: 1101,
    name: 'Polygon zkEVM',
    category: 'relay',
    rpcUrl: 'https://zkevm-rpc.com',
    explorerUrl: 'https://zkevm.polygonscan.com',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  {
    id: 34443,
    name: 'Mode',
    category: 'relay',
    rpcUrl: 'https://mainnet.mode.network',
    explorerUrl: 'https://explorer.mode.network',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  {
    id: 7777777,
    name: 'Zora',
    category: 'relay',
    rpcUrl: 'https://rpc.zora.energy',
    explorerUrl: 'https://explorer.zora.energy',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
];

export function getChainById(chainId: number): SupportedChain | undefined {
  return SUPPORTED_CHAINS.find(c => c.id === chainId);
}

export function isDirectChain(chainId: number): boolean {
  return getChainById(chainId)?.category === 'direct';
}

export function isRelayChain(chainId: number): boolean {
  return getChainById(chainId)?.category === 'relay';
}

export function getDirectChains(includeTestnets = true): SupportedChain[] {
  return SUPPORTED_CHAINS.filter(c => 
    c.category === 'direct' && (includeTestnets || !c.testnet)
  );
}

export function getRelayChains(): SupportedChain[] {
  return SUPPORTED_CHAINS.filter(c => c.category === 'relay');
}

// Phase 3: Return all supported chains for selection (direct + relay)
export function getSelectableChains(includeTestnets = true): SupportedChain[] {
  return SUPPORTED_CHAINS.filter(c => includeTestnets || !c.testnet);
}

// Get all chains (alias for getSelectableChains with all options)
export function getAllChains(includeTestnets = true): SupportedChain[] {
  return getSelectableChains(includeTestnets);
}

// Get chain explorer URL for address or transaction
export function getChainExplorerUrl(
  chainId: number, 
  type: 'address' | 'tx', 
  hash: string
): string {
  const chain = getChainById(chainId);
  if (!chain?.explorerUrl) return '#';
  return `${chain.explorerUrl}/${type === 'address' ? 'address' : 'tx'}/${hash}`;
}
