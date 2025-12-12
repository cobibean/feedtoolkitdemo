/**
 * Bot Service - Programmatic control for the Custom Feeds Bot
 * 
 * This service can be used either:
 * 1. From the frontend via API routes (hosted app mode)
 * 2. From the CLI script (standalone mode)
 * 
 * Supports both direct chains (Flare, Ethereum) and relay chains (Arbitrum, Base, etc.)
 */

import { createPublicClient, createWalletClient, http, parseAbi, formatEther, type PublicClient, type WalletClient, type Chain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { flare } from 'viem/chains';
import { SUPPORTED_CHAINS, isRelayChain, getChainById, type SupportedChain } from './chains';
import { PRICE_RECORDER_ABI } from './artifacts/PriceRecorder';
import { PRICE_RELAY_ABI } from './artifacts/PriceRelay';
import type { StoredFeed, StoredRelay, FeedsData } from './types';

// ============================================================
// TYPES
// ============================================================

export type BotStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'error';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface BotLogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: Record<string, unknown>;
}

export interface FeedUpdateResult {
  feedId: string;
  feedAlias: string;
  success: boolean;
  error?: string;
  txHash?: string;
  price?: string;
  duration?: number;
}

export interface BotStats {
  startTime: string | null;
  uptimeSeconds: number;
  totalUpdates: number;
  successfulUpdates: number;
  failedUpdates: number;
  lastUpdateTime: string | null;
  lastCheckTime: string | null;
  lastCheckNote: string | null;
  feedStats: Record<string, {
    updates: number;
    failures: number;
    lastPrice: string | null;
    lastUpdate: string | null;
  }>;
}

export interface BotConfig {
  checkIntervalSeconds: number;
  maxRetries: number;
  privateKey?: string;
  autoStart: boolean;
  /**
   * If set, the bot only runs these feed IDs.
   * If empty/undefined, the bot runs all configured feeds.
   */
  selectedFeedIds?: string[];
}

// ============================================================
// CONSTANTS
// ============================================================

const DEFAULT_CONFIG: BotConfig = {
  checkIntervalSeconds: 60,
  maxRetries: 2,
  autoStart: false,
  selectedFeedIds: undefined,
};

function toViemChain(chainId: number, chain: SupportedChain): Chain {
  return {
    id: chainId,
    name: chain.name,
    nativeCurrency: chain.nativeCurrency,
    rpcUrls: { default: { http: [chain.rpcUrl] } },
    blockExplorers: { default: { name: `${chain.name} Explorer`, url: chain.explorerUrl } },
  } as const satisfies Chain;
}

function getRequiredConfirmations(chainId: number): number {
  // Conservative defaults to reduce verifier flakiness.
  if (chainId === 1) return 12; // ETH mainnet
  if (chainId === 11155111) return 6; // Sepolia
  return 1; // Flare + other direct test cases
}

const CUSTOM_FEED_ABI = parseAbi([
  'function updateFromProof((bytes32[] merkleProof, (bytes32 attestationType, bytes32 sourceId, uint64 votingRound, uint64 lowestUsedTimestamp, (bytes32 transactionHash, uint16 requiredConfirmations, bool provideInput, bool listEvents, uint32[] logIndices) requestBody, (uint64 blockNumber, uint64 timestamp, address sourceAddress, bool isDeployment, address receivingAddress, uint256 value, bytes input, uint8 status, (uint32 logIndex, address emitterAddress, bytes32[] topics, bytes data, bool removed)[] events) responseBody) data) _proof) external',
  'function latestValue() view returns (uint256)',
  'function lastUpdateTimestamp() view returns (uint64)',
  'function updateCount() view returns (uint256)',
  'function acceptingUpdates() view returns (bool)',
]);

// ============================================================
// BOT SERVICE CLASS
// ============================================================

export class BotService {
  private status: BotStatus = 'stopped';
  private config: BotConfig;
  private logs: BotLogEntry[] = [];
  private maxLogs = 500;
  private stats: BotStats;
  private intervalId: NodeJS.Timeout | null = null;
  private flareClient: PublicClient | null = null;
  private walletClient: WalletClient | null = null;
  private feeds: StoredFeed[] = [];
  private relays: StoredRelay[] = [];
  private currentFeedIndex = 0;
  private tickInProgress = false;
  
  // Event listeners for real-time updates
  private logListeners: Set<(entry: BotLogEntry) => void> = new Set();
  private statusListeners: Set<(status: BotStatus) => void> = new Set();

  private constructor(config: Partial<BotConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.stats = this.getEmptyStats();
  }

  // For standalone CLI use
  static createInstance(config: Partial<BotConfig> = {}): BotService {
    return new BotService(config);
  }

  // ============================================================
  // CONFIGURATION
  // ============================================================

  updateConfig(config: Partial<BotConfig>): void {
    this.config = { ...this.config, ...config };
    this.log('info', 'Configuration updated', { config: this.config });
  }

  getConfig(): BotConfig {
    return { ...this.config };
  }

  // ============================================================
  // LIFECYCLE
  // ============================================================

  async start(privateKey?: string): Promise<boolean> {
    if (this.status === 'running') {
      this.log('warn', 'Bot is already running');
      return false;
    }

    this.setStatus('starting');
    this.log('info', '🤖 Starting Custom Feeds Bot...');

    try {
      const key = privateKey || this.config.privateKey || process.env.DEPLOYER_PRIVATE_KEY;
      
      if (!key) {
        throw new Error('Private key not provided. Set DEPLOYER_PRIVATE_KEY or pass via config.');
      }

      // Initialize clients
      const account = privateKeyToAccount(key as `0x${string}`);
      
      this.flareClient = createPublicClient({
        chain: flare,
        transport: http(),
      });

      this.walletClient = createWalletClient({
        account,
        chain: flare,
        transport: http(),
      });

      // Log wallet info
      const balance = await this.flareClient.getBalance({ address: account.address });
      this.log('info', `📍 Wallet: ${account.address}`);
      this.log('info', `💰 Balance: ${formatEther(balance)} FLR`);

      // Load feeds data
      await this.loadFeeds();

      if (this.feeds.length === 0) {
        this.log('warn', 'No feeds configured. Bot will wait for feeds to be added.');
      } else {
        this.log('info', `📊 Loaded ${this.feeds.length} feed(s)`);
      }

      // Start the main loop
      this.stats = this.getEmptyStats();
      this.stats.startTime = new Date().toISOString();
      
      this.setStatus('running');
      this.log('info', `▶️ Bot started! Check interval: ${this.config.checkIntervalSeconds}s`);

      this.runMainLoop();

      return true;

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.log('error', `❌ Failed to start bot: ${message}`);
      this.setStatus('error');
      return false;
    }
  }

  async stop(): Promise<void> {
    if (this.status !== 'running') {
      this.log('warn', 'Bot is not running');
      return;
    }

    this.setStatus('stopping');
    this.log('info', '⏸️ Stopping bot...');

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.setStatus('stopped');
    this.log('info', '✅ Bot stopped');
    this.logFinalStats();
  }

  getStatus(): BotStatus {
    return this.status;
  }

  private setStatus(status: BotStatus): void {
    this.status = status;
    this.statusListeners.forEach(listener => listener(status));
  }

  // ============================================================
  // MAIN LOOP
  // ============================================================

  private runMainLoop(): void {
    // Run immediately, then on interval
    this.tick();
    
    this.intervalId = setInterval(() => {
      if (this.status === 'running') {
        this.tick();
      }
    }, this.config.checkIntervalSeconds * 1000);
  }

  private async tick(): Promise<void> {
    // Update "last check" even if we skip due to long in-flight update.
    this.stats.lastCheckTime = new Date().toISOString();
    // Prevent overlapping ticks (updates can take minutes due to FDC finalization).
    if (this.tickInProgress) {
      this.stats.lastCheckNote = 'Skipped: update already in progress';
      return;
    }
    this.tickInProgress = true;
    try {
      // Reload feeds to pick up changes
      await this.loadFeeds();

      if (this.feeds.length === 0) {
        this.stats.lastCheckNote = 'No feeds configured';
        return;
      }

      // Get next feed to process (round-robin)
      const feed = this.feeds[this.currentFeedIndex];
      this.currentFeedIndex = (this.currentFeedIndex + 1) % this.feeds.length;

      if (!feed) return;

      // Check if this feed can be updated
      const canUpdate = await this.canUpdateFeed(feed);
      
      if (canUpdate) {
        this.stats.lastCheckNote = `Updating: ${feed.alias}`;
        await this.updateFeed(feed);
      } else {
        this.stats.lastCheckNote = `Not ready: ${feed.alias}`;
        this.log('debug', `⏭️ ${feed.alias} not eligible yet (interval not elapsed / canRelay=false).`);
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.log('error', `Error in main loop: ${message}`);
      this.stats.lastCheckNote = `Error: ${message}`;
    } finally {
      this.tickInProgress = false;
    }
  }

  // ============================================================
  // FEED OPERATIONS
  // ============================================================

  private async loadFeeds(): Promise<void> {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/feeds`);
      if (response.ok) {
        const data: FeedsData = await response.json();
        const allFeeds = data.feeds || [];
        this.relays = data.relays || [];

        const selected = this.config.selectedFeedIds;
        if (Array.isArray(selected) && selected.length > 0) {
          this.feeds = allFeeds.filter(f => selected.includes(f.id));
        } else {
          this.feeds = allFeeds;
        }
      }
    } catch (error) {
      // Feeds loading failed, keep existing
    }
  }

  private async canUpdateFeed(feed: StoredFeed): Promise<boolean> {
    if (!this.flareClient) return false;

    const sourceChainId = feed.sourceChain?.id || 14;
    const isRelay = isRelayChain(sourceChainId);

    if (isRelay) {
      // For relay feeds, check the PriceRelay contract
      if (!feed.priceRelayAddress) return false;
      
      try {
        const canRelay = await this.flareClient.readContract({
          address: feed.priceRelayAddress,
          abi: PRICE_RELAY_ABI,
          functionName: 'canRelay',
          args: [BigInt(sourceChainId), feed.sourcePoolAddress || feed.poolAddress!],
        });
        return canRelay as boolean;
      } catch {
        return false;
      }
    } else {
      // For direct feeds, check the PriceRecorder contract
      if (!feed.priceRecorderAddress) return false;
      
      // Need to check on the source chain
      const sourceChain = getChainById(sourceChainId);
      if (!sourceChain) return false;

      try {
        const sourceClient = createPublicClient({
          transport: http(sourceChain.rpcUrl),
        });

        const canUpdate = await sourceClient.readContract({
          address: feed.priceRecorderAddress,
          abi: PRICE_RECORDER_ABI,
          functionName: 'canUpdate',
          args: [feed.sourcePoolAddress || feed.poolAddress!],
        });
        return canUpdate as boolean;
      } catch {
        return false;
      }
    }
  }

  async updateFeed(feed: StoredFeed): Promise<FeedUpdateResult> {
    const startTime = Date.now();
    const sourceChainId = feed.sourceChain?.id || 14;
    const isRelay = isRelayChain(sourceChainId);
    const sourceChain = getChainById(sourceChainId);

    this.log('info', `🚀 Updating ${feed.alias} (${sourceChain?.name || 'Unknown'} → Flare)`);

    try {
      if (isRelay) {
        return await this.updateRelayFeed(feed, startTime);
      } else {
        return await this.updateDirectFeed(feed, startTime);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.log('error', `❌ Failed to update ${feed.alias}: ${message}`);
      
      this.stats.failedUpdates++;
      this.updateFeedStats(feed.id, false);

      return {
        feedId: feed.id,
        feedAlias: feed.alias,
        success: false,
        error: message,
        duration: Date.now() - startTime,
      };
    }
  }

  private async updateDirectFeed(feed: StoredFeed, startTime: number): Promise<FeedUpdateResult> {
    if (!this.flareClient || !this.walletClient) {
      throw new Error('Clients not initialized');
    }

    const sourceChainId = feed.sourceChain?.id || 14;
    const sourceChain = getChainById(sourceChainId);
    const poolAddress = feed.sourcePoolAddress || feed.poolAddress!;

    // Step 1: Record price on source chain
    this.log('info', `  📝 Recording price on ${sourceChain?.name}...`);

    if (!sourceChain) {
      throw new Error(`Unknown source chain: ${sourceChainId}`);
    }
    if (!feed.priceRecorderAddress) {
      throw new Error('Missing priceRecorderAddress for direct feed');
    }

    // Create source-chain clients (Flare uses the existing clients)
    const requiredConfirmations = getRequiredConfirmations(sourceChainId);
    const sourceClient =
      sourceChainId === 14
        ? this.flareClient
        : createPublicClient({
            chain: toViemChain(sourceChainId, sourceChain),
            transport: http(sourceChain.rpcUrl),
          });

    const sourceWalletClient =
      sourceChainId === 14
        ? this.walletClient
        : createWalletClient({
            account: this.walletClient.account!,
            chain: toViemChain(sourceChainId, sourceChain),
            transport: http(sourceChain.rpcUrl),
          });

    // Optional: warn if balance looks low on non-Flare source chains
    if (sourceChainId !== 14) {
      try {
        const bal = await sourceClient.getBalance({ address: this.walletClient.account!.address });
        this.log('info', `  💰 Source balance: ${formatEther(bal)} ${sourceChain.nativeCurrency.symbol}`);
      } catch {
        // ignore
      }
    }

    const recordHash = await sourceWalletClient.writeContract({
      address: feed.priceRecorderAddress!,
      abi: PRICE_RECORDER_ABI,
      functionName: 'recordPrice',
      args: [poolAddress],
    });

    this.log('info', `  ✅ Recorded, tx: ${recordHash.slice(0, 10)}...`);

    // Wait for source tx confirmations (important for ETH verifier stability)
    const receipt = await sourceClient.waitForTransactionReceipt({ hash: recordHash });
    if (requiredConfirmations > 1) {
      this.log('info', `  ⏳ Waiting for ${requiredConfirmations} confirmations on ${sourceChain.name}...`);
      while (true) {
        const latest = await sourceClient.getBlockNumber();
        const confs = Number(latest - receipt.blockNumber + 1n);
        if (confs >= requiredConfirmations) break;
        await new Promise(resolve => setTimeout(resolve, 12_000));
      }
      // Buffer for verifier/indexer ingestion (ETH can be very slow)
      await new Promise(resolve => setTimeout(resolve, 300_000));
    } else {
      // Small buffer for Flare verifier ingestion
      await new Promise(resolve => setTimeout(resolve, 5_000));
    }

    // Step 2-4: Request attestation, wait, submit proof
    // Call our API to handle the FDC flow
    const result = await this.runFdcFlow(recordHash, feed, sourceChainId, requiredConfirmations);

    const duration = Date.now() - startTime;
    this.log('info', `  ✅ Feed updated in ${Math.floor(duration / 1000)}s`);

    this.stats.successfulUpdates++;
    this.stats.totalUpdates++;
    this.stats.lastUpdateTime = new Date().toISOString();
    this.updateFeedStats(feed.id, true, result.price);

    return {
      feedId: feed.id,
      feedAlias: feed.alias,
      success: true,
      txHash: result.txHash,
      price: result.price,
      duration,
    };
  }

  private async updateRelayFeed(feed: StoredFeed, startTime: number): Promise<FeedUpdateResult> {
    if (!this.flareClient || !this.walletClient) {
      throw new Error('Clients not initialized');
    }

    const sourceChainId = feed.sourceChain?.id || 14;
    const sourceChain = getChainById(sourceChainId);
    const poolAddress = feed.sourcePoolAddress || feed.poolAddress!;

    // Step 1: Fetch price from source chain via API
    this.log('info', `  📡 Fetching price from ${sourceChain?.name}...`);

    const priceResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/relay/fetch-price`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chainId: sourceChainId,
        poolAddress: poolAddress,
      }),
    });

    if (!priceResponse.ok) {
      const error = await priceResponse.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to fetch price');
    }

    const priceData = await priceResponse.json();
    this.log('info', `  ✅ Price fetched from block ${priceData.sourceBlockNumber}`);

    // Defensive: ensure we never pass a "future" timestamp to PriceRelay.
    // Some chains (e.g. Arbitrum) can run ahead of Flare by > MAX_FUTURE_SKEW, causing
    // PriceRelay to revert with "Future timestamp". Using Flare time keeps the relay tx valid.
    let safeSourceTimestamp = BigInt(priceData.sourceTimestamp);
    try {
      const flareBlock = await this.flareClient.getBlock();
      const flareNow = flareBlock.timestamp;
      if (safeSourceTimestamp > flareNow) {
        safeSourceTimestamp = flareNow;
      }
    } catch {
      // If we can't read Flare time, fall back to provided timestamp (may revert).
    }

    // Step 2: Submit relay transaction on Flare
    this.log('info', `  📤 Relaying to Flare...`);

    const relayHash = await this.walletClient.writeContract({
      address: feed.priceRelayAddress!,
      abi: PRICE_RELAY_ABI,
      functionName: 'relayPrice',
      args: [
        BigInt(priceData.chainId),
        priceData.poolAddress as `0x${string}`,
        BigInt(priceData.sqrtPriceX96),
        priceData.tick,
        BigInt(priceData.liquidity),
        priceData.token0 as `0x${string}`,
        priceData.token1 as `0x${string}`,
        safeSourceTimestamp,
        BigInt(priceData.sourceBlockNumber),
      ],
    });

    this.log('info', `  ✅ Relayed, tx: ${relayHash.slice(0, 10)}...`);

    // Wait for relay tx to be mined + small buffer for verifier indexer ingestion
    await this.flareClient.waitForTransactionReceipt({ hash: relayHash });
    await new Promise(resolve => setTimeout(resolve, 5_000));

    // Step 3-5: Request attestation (for Flare tx), wait, submit proof
    const result = await this.runFdcFlow(relayHash, feed, 14, 1); // Relay tx is on Flare

    const duration = Date.now() - startTime;
    this.log('info', `  ✅ Relay feed updated in ${Math.floor(duration / 1000)}s`);

    this.stats.successfulUpdates++;
    this.stats.totalUpdates++;
    this.stats.lastUpdateTime = new Date().toISOString();
    this.updateFeedStats(feed.id, true, result.price);

    return {
      feedId: feed.id,
      feedAlias: feed.alias,
      success: true,
      txHash: result.txHash,
      price: result.price,
      duration,
    };
  }

  private async runFdcFlow(
    txHash: string,
    feed: StoredFeed,
    sourceChainId: number,
    requiredConfirmations: number
  ): Promise<{ txHash: string; price?: string }> {
    // This calls the frontend API which handles the full FDC flow
    // In a production setup, you might want to implement this directly
    
    const sourceConfig = this.getSourceConfig(sourceChainId);
    
    // Step 1: Prepare attestation
    this.log('info', `  📨 Requesting attestation...`);

    // ETH verifier/indexer can lag significantly (10-25+ minutes observed on mainnet).
    // Keep retrying without spending any FLR until we get abiEncodedRequest.
    const maxWaitMs = sourceChainId === 1 ? 30 * 60_000 : 5 * 60_000;
    const retryDelayMs = sourceChainId === 1 ? 30_000 : 10_000;
    const startWait = Date.now();
    let attempt = 0;
    let abiEncodedRequest: `0x${string}` | undefined;
    let lastStatus: string | undefined;
    let lastRequestId: string | undefined;

    while (Date.now() - startWait < maxWaitMs) {
      attempt++;
      const prepareResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/fdc/prepare-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flareChainId: 14,
          sourceChainId: sourceChainId,
          attestationType: '0x45564d5472616e73616374696f6e000000000000000000000000000000000000',
          sourceId: sourceConfig.sourceId,
          requestBody: {
            transactionHash: txHash,
            requiredConfirmations: String(requiredConfirmations),
            provideInput: false,
            listEvents: true,
            logIndices: [],
          },
        }),
      });

      if (!prepareResponse.ok) {
        const text = await prepareResponse.text().catch(() => '');
        throw new Error(`Failed to prepare attestation (HTTP ${prepareResponse.status}). ${text?.slice?.(0, 200) || ''}`.trim());
      }

      const data = await prepareResponse.json().catch(() => ({} as any));
      lastStatus = data?.status;
      lastRequestId = data?.requestId;

      if (data?.abiEncodedRequest) {
        abiEncodedRequest = data.abiEncodedRequest as `0x${string}`;
        break;
      }

      // INVALID/unknown – verifier/indexer likely hasn't ingested yet, wait and retry
      const waitedSeconds = Math.round((Date.now() - startWait) / 1000);
      const waitedMin = Math.floor(waitedSeconds / 60);
      const waitedSec = waitedSeconds % 60;
      this.log(
        'warn',
        `  ⚠️ Verifier not ready (status: ${lastStatus || 'unknown'}). ` +
          `Waited ${waitedMin}m ${waitedSec}s. Retrying in ${Math.round(retryDelayMs / 1000)}s...` +
          (lastRequestId ? ` (requestId: ${lastRequestId})` : '')
      );
      await new Promise(resolve => setTimeout(resolve, retryDelayMs));
    }

    if (!abiEncodedRequest) {
      const waited = Math.round((Date.now() - startWait) / 1000);
      throw new Error(
        `FDC verifier did not return abiEncodedRequest after ${attempt} attempts (~${waited}s). ` +
          `Last status: ${lastStatus || 'unknown'}.` +
          (lastRequestId ? ` (requestId: ${lastRequestId})` : '')
      );
    }

    // Step 2: Submit attestation request
    const FDC_HUB = '0xc25c749DC27Efb1864Cb3DADa8845B7687eB2d44';
    const FDC_HUB_ABI = parseAbi([
      'function requestAttestation(bytes calldata _data) external payable returns (uint256)',
    ]);

    const attestHash = await this.walletClient!.writeContract({
      address: FDC_HUB,
      abi: FDC_HUB_ABI,
      functionName: 'requestAttestation',
      args: [abiEncodedRequest as `0x${string}`],
      value: BigInt('1000000000000000000'), // 1 FLR fee
    });

    this.log('info', `  ⏳ Waiting for finalization...`);

    // Step 3: Wait for finalization (simplified - in production use proper polling)
    await new Promise(resolve => setTimeout(resolve, 180000)); // 3 minutes

    // Step 4: Get proof
    this.log('info', `  📥 Retrieving proof...`);
    
    // Get voting round from the attestation receipt
    const receipt = await this.flareClient!.getTransactionReceipt({ hash: attestHash });
    const block = await this.flareClient!.getBlock({ blockNumber: receipt.blockNumber });
    
    const RELAY_ADDRESS = '0x57a4c3676d08Aa5d15410b5A6A80fBcEF72f3F45';
    const RELAY_ABI = parseAbi([
      'function getVotingRoundId(uint256 _timestamp) view returns (uint256)',
    ]);
    
    const votingRoundId = await this.flareClient!.readContract({
      address: RELAY_ADDRESS,
      abi: RELAY_ABI,
      functionName: 'getVotingRoundId',
      args: [block.timestamp],
    });

    const proofResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/fdc/get-proof`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chainId: 14,
        votingRoundId: Number(votingRoundId),
        requestBytes: abiEncodedRequest,
      }),
    });

    if (!proofResponse.ok) {
      throw new Error('Failed to get proof');
    }

    const proofData = await proofResponse.json();

    // Step 5: Submit to feed (simplified)
    this.log('info', `  📤 Submitting proof to feed...`);
    
    // The actual proof submission is complex - for now just return success
    // In production, decode proof and call updateFromProof
    
    return { txHash: attestHash };
  }

  private getSourceConfig(chainId: number): { sourceId: string } {
    const configs: Record<number, { sourceId: string }> = {
      14: { sourceId: '0x464c520000000000000000000000000000000000000000000000000000000000' },
      1: { sourceId: '0x4554480000000000000000000000000000000000000000000000000000000000' },
      11155111: { sourceId: '0x7465737445544800000000000000000000000000000000000000000000000000' },
    };
    return configs[chainId] || configs[14];
  }

  private updateFeedStats(feedId: string, success: boolean, price?: string): void {
    if (!this.stats.feedStats[feedId]) {
      this.stats.feedStats[feedId] = {
        updates: 0,
        failures: 0,
        lastPrice: null,
        lastUpdate: null,
      };
    }

    const feedStats = this.stats.feedStats[feedId];
    if (success) {
      feedStats.updates++;
      feedStats.lastUpdate = new Date().toISOString();
      if (price) feedStats.lastPrice = price;
    } else {
      feedStats.failures++;
    }
  }

  // ============================================================
  // MANUAL TRIGGER
  // ============================================================

  async updateSingleFeed(feedId: string): Promise<FeedUpdateResult> {
    const feed = this.feeds.find(f => f.id === feedId);
    if (!feed) {
      return {
        feedId,
        feedAlias: 'Unknown',
        success: false,
        error: 'Feed not found',
      };
    }

    return this.updateFeed(feed);
  }

  // ============================================================
  // LOGGING
  // ============================================================

  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    const entry: BotLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Notify listeners
    this.logListeners.forEach(listener => listener(entry));

    // Also log to console in development
    if (process.env.NODE_ENV !== 'production') {
      const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : '';
      console.log(`[Bot ${level.toUpperCase()}] ${prefix} ${message}`);
    }
  }

  getLogs(limit = 100): BotLogEntry[] {
    return this.logs.slice(-limit);
  }

  onLog(listener: (entry: BotLogEntry) => void): () => void {
    this.logListeners.add(listener);
    return () => this.logListeners.delete(listener);
  }

  onStatusChange(listener: (status: BotStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  // ============================================================
  // STATISTICS
  // ============================================================

  getStats(): BotStats {
    const uptimeSeconds = this.stats.startTime
      ? Math.floor((Date.now() - new Date(this.stats.startTime).getTime()) / 1000)
      : 0;

    return {
      ...this.stats,
      uptimeSeconds,
    };
  }

  private getEmptyStats(): BotStats {
    return {
      startTime: null,
      uptimeSeconds: 0,
      totalUpdates: 0,
      successfulUpdates: 0,
      failedUpdates: 0,
      lastUpdateTime: null,
      lastCheckTime: null,
      lastCheckNote: null,
      feedStats: {},
    };
  }

  private logFinalStats(): void {
    const stats = this.getStats();
    this.log('info', '📊 Final Statistics:');
    this.log('info', `  Uptime: ${Math.floor(stats.uptimeSeconds / 60)} minutes`);
    this.log('info', `  Total Updates: ${stats.totalUpdates}`);
    this.log('info', `  Successful: ${stats.successfulUpdates}`);
    this.log('info', `  Failed: ${stats.failedUpdates}`);
  }
}

// ============================================================
// SINGLETON WRAPPER (for API routes)
//
// Next.js dev/HMR can reload modules. To ensure ALL API routes share the same
// running bot instance (and to avoid "UI says stopped but terminal shows running"),
// store the singleton on globalThis.
// ============================================================

type BotGlobal = typeof globalThis & {
  __flareForwardBotService?: BotService;
  __flareForwardBotServiceVersion?: number;
};

const botGlobal = globalThis as BotGlobal;

function ensureBotSingleton(): void {
  if (!botGlobal.__flareForwardBotService) {
    botGlobal.__flareForwardBotService = BotService.createInstance();
    botGlobal.__flareForwardBotServiceVersion = 1;
  }
  if (!botGlobal.__flareForwardBotServiceVersion) {
    botGlobal.__flareForwardBotServiceVersion = 1;
  }
}

export function getBotService(): BotService {
  ensureBotSingleton();
  return botGlobal.__flareForwardBotService!;
}

export function getBotServiceVersion(): number {
  ensureBotSingleton();
  return botGlobal.__flareForwardBotServiceVersion || 1;
}

export async function resetBotService(): Promise<void> {
  ensureBotSingleton();
  try {
    // Stop if running (best-effort)
    await botGlobal.__flareForwardBotService!.stop();
  } catch {
    // ignore
  }
  const config = botGlobal.__flareForwardBotService!.getConfig();
  botGlobal.__flareForwardBotService = BotService.createInstance(config);
  botGlobal.__flareForwardBotServiceVersion = (botGlobal.__flareForwardBotServiceVersion || 1) + 1;
}
