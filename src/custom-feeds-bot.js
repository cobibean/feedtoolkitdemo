#!/usr/bin/env node

/**
 * Custom Feeds Bot
 * 
 * Unified bot that handles both:
 * 1. Price Recording - Calls recordPrice() on PriceRecorder every 5 minutes
 * 2. FDC Attestation - Processes PriceRecorded events and submits proofs to feeds
 * 
 * Usage:
 *   node src/custom-feeds-bot.js
 * 
 * Environment Variables:
 *   BOT_CHECK_INTERVAL_SECONDS=60      # Main loop frequency
 *   BOT_STATS_INTERVAL_MINUTES=60      # Stats print frequency
 *   BOT_LOG_LEVEL=compact              # Terminal logging: compact|verbose
 *   BOT_LOG_FILE_ENABLED=true          # Enable JSON file logging
 *   BOT_LOG_FILE_DIR=./logs            # Log file directory
 *   DEPLOYER_PRIVATE_KEY               # Wallet private key
 *   FLARE_RPC_URL                      # Flare RPC endpoint
 *   BOT_NATIVE_UPDATE_INTERVAL_SECONDS=300    # Min seconds between native updates (optional)
 *   RPC_URL_<CHAIN_ID>=https://...      # Source chain RPCs (optional, defaults included)
 *
 * Per-feed configuration:
 *   CUSTOM_FEED_ADDRESS_<ALIAS>=0x...    # Feed address on Flare
 *   POOL_ADDRESS_<ALIAS>=0x...           # Pool address on source chain (optional; bot will verify)
 *   SOURCE_CHAIN_ID_<ALIAS>=1            # Source chain ID (14=Flare, 1=Ethereum, etc.)
 *   PRICE_RELAY_ADDRESS_<ALIAS>=0x...    # (Relay feeds) PriceRelay on Flare (optional; bot can read from feed)
 *   PRICE_RECORDER_ADDRESS_<ALIAS>=0x... # (Direct feeds) PriceRecorder on source chain (optional; bot can read from feed)
 */

import { config } from "dotenv";
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getProofForTransaction } from "./fdc-client.js";

// Load .env file (prefer repo root, fallback to frontend/.env)
// Use the script location (not CWD) so running from other directories still works.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const candidateEnvPaths = [
  process.env.DOTENV_CONFIG_PATH,
  path.join(repoRoot, ".env"),
  path.join(repoRoot, "frontend", ".env"),
  path.join(process.cwd(), ".env"),
  path.join(process.cwd(), "frontend", ".env"),
].filter(Boolean);

const selectedEnvPath = candidateEnvPaths.find((envPath) => fs.existsSync(envPath));
if (selectedEnvPath) config({ path: selectedEnvPath });
else config();

// ============================================================
// CONFIGURATION
// ============================================================

// Auto-discover feeds from environment variables
function discoverFeedsFromEnv() {
  const feeds = [];
  const envKeys = Object.keys(process.env);

  // Find all CUSTOM_FEED_ADDRESS_* environment variables
  const feedKeys = envKeys.filter((key) => key.startsWith("CUSTOM_FEED_ADDRESS_"));

  for (const key of feedKeys) {
    const alias = key.replace("CUSTOM_FEED_ADDRESS_", "");
    const feedAddress = process.env[key];
    if (!feedAddress) continue;

    const poolAddress = process.env[`POOL_ADDRESS_${alias}`];
    const sourceChainIdRaw = process.env[`SOURCE_CHAIN_ID_${alias}`];
    const priceRelayAddress = process.env[`PRICE_RELAY_ADDRESS_${alias}`];
    const priceRecorderAddress = process.env[`PRICE_RECORDER_ADDRESS_${alias}`];

    feeds.push({
      name: alias.replace(/_/g, "/"),
      alias,
      feedAddress,
      poolAddress: poolAddress || null,
      sourceChainId: sourceChainIdRaw ? parseInt(sourceChainIdRaw) : 14,
      priceRelayAddress: priceRelayAddress || null,
      priceRecorderAddress: priceRecorderAddress || null,
      // Filled during initialization (read from on-chain feed contract)
      type: "unknown",
      token0Decimals: null,
      token1Decimals: null,
      invertPrice: false,
      onchainPoolAddress: null,
      onchainRecorderAddress: null,
      onchainRelayAddress: null,
      onchainSourceChainId: null,
    });
  }

  return feeds;
}

// Resolve feed configurations
const FEEDS = discoverFeedsFromEnv();

// Bot configuration
const CONFIG = {
  RPC_URL: process.env.FLARE_RPC_URL || "https://flare-api.flare.network/ext/bc/C/rpc",
  PRIVATE_KEY: process.env.DEPLOYER_PRIVATE_KEY,

  // Timing
  CHECK_INTERVAL: parseInt(process.env.BOT_CHECK_INTERVAL_SECONDS || "60") * 1000,
  STATS_INTERVAL: parseInt(process.env.BOT_STATS_INTERVAL_MINUTES || "60") * 60 * 1000,
  NATIVE_UPDATE_INTERVAL_SECONDS: parseInt(process.env.BOT_NATIVE_UPDATE_INTERVAL_SECONDS || "300"),

  // Logging
  LOG_LEVEL: process.env.BOT_LOG_LEVEL || "compact",
  LOG_FILE_ENABLED: process.env.BOT_LOG_FILE_ENABLED !== "false",
  LOG_FILE_DIR: process.env.BOT_LOG_FILE_DIR || "./logs",

  // Gas & Safety
  GAS_LIMIT: 150000,
  MAX_GAS_PRICE_GWEI: 100,
  MIN_BALANCE_FLR: 1.0,
  CRITICAL_BALANCE_FLR: 0.1,

  // Attestation
  MAX_ATTESTATION_RETRIES: 2,

  FEEDS,
};

// ABIs
const PRICE_RECORDER_ABI = [
  "function recordPrice(address pool) external",
  "function canUpdate(address pool) external view returns (bool)",
  "function timeUntilNextUpdate(address pool) external view returns (uint256)",
  "function enabledPools(address pool) external view returns (bool)",
  "function isRecording() external view returns (bool)",
  "event PriceRecorded(address indexed pool, uint160 sqrtPriceX96, int24 tick, uint128 liquidity, address token0, address token1, uint256 timestamp, uint256 blockNumber)",
];

const CUSTOM_FEED_ABI = [
  "function updateFromProof((bytes32[] merkleProof,(bytes32 attestationType,bytes32 sourceId,uint64 votingRound,uint64 lowestUsedTimestamp,(bytes32 transactionHash,uint16 requiredConfirmations,bool provideInput,bool listEvents,uint32[] logIndices) requestBody,(uint64 blockNumber,uint64 timestamp,address sourceAddress,bool isDeployment,address receivingAddress,uint256 value,bytes input,uint8 status,(uint32 logIndex,address emitterAddress,bytes32[] topics,bytes data,bool removed)[] events) responseBody) data) _proof) external",
  "function updateFromNativePool() external",
  "function latestValue() external view returns (uint256)",
  "function lastUpdateTimestamp() external view returns (uint64)",
  "function updateCount() external view returns (uint256)",
  "function acceptingUpdates() external view returns (bool)",
  "function poolAddress() external view returns (address)",
  "function token0Decimals() external view returns (uint8)",
  "function token1Decimals() external view returns (uint8)",
  "function invertPrice() external view returns (bool)",
  "function priceRecorderAddress() external view returns (address)",
  "function priceRelayAddress() external view returns (address)",
  "function sourceChainId() external view returns (uint256)",
];

const PRICE_RELAY_ABI = [
  "function canRelay(uint256 chainId, address pool) external view returns (bool)",
  "function relayPrice(uint256 sourceChainId,address poolAddress,uint160 sqrtPriceX96,int24 tick,uint128 liquidity,address token0,address token1,uint256 sourceTimestamp,uint256 sourceBlockNumber) external",
  "function timeUntilNextRelay(uint256 chainId, address pool) external view returns (uint256)",
  "function authorizedRelayers(address relayer) external view returns (bool)",
];

const UNISWAP_V3_POOL_ABI = [
  "function slot0() external view returns (uint160 sqrtPriceX96,int24 tick,uint16 observationIndex,uint16 observationCardinality,uint16 observationCardinalityNext,uint8 feeProtocol,bool unlocked)",
  "function liquidity() external view returns (uint128)",
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
];

// Default RPCs (can be overridden via RPC_URL_<CHAIN_ID>)
const DEFAULT_RPC_URLS = {
  1: "https://eth.llamarpc.com",
  11155111: "https://ethereum-sepolia-rpc.publicnode.com",
  14: "https://flare-api.flare.network/ext/bc/C/rpc",
  114: "https://coston2-api.flare.network/ext/bc/C/rpc",
  42161: "https://arb1.arbitrum.io/rpc",
  8453: "https://mainnet.base.org",
  10: "https://mainnet.optimism.io",
  137: "https://polygon-rpc.com",
  43114: "https://api.avax.network/ext/bc/C/rpc",
  56: "https://bsc-dataseed.binance.org",
  250: "https://rpc.ftm.tools",
  324: "https://mainnet.era.zksync.io",
  59144: "https://rpc.linea.build",
  534352: "https://rpc.scroll.io",
  5000: "https://rpc.mantle.xyz",
  81457: "https://rpc.blast.io",
  100: "https://rpc.gnosischain.com",
  42220: "https://forno.celo.org",
  1101: "https://zkevm-rpc.com",
  34443: "https://mainnet.mode.network",
  7777777: "https://rpc.zora.energy",
};

function getRpcUrlForChain(chainId) {
  const envKey = `RPC_URL_${chainId}`;
  if (process.env[envKey]) return process.env[envKey];
  if (chainId === 14) return process.env.FLARE_RPC_URL || DEFAULT_RPC_URLS[14];
  return DEFAULT_RPC_URLS[chainId];
}

const RESPONSE_TUPLE_TYPE =
  "tuple(" +
  "bytes32 attestationType," +
  "bytes32 sourceId," +
  "uint64 votingRound," +
  "uint64 lowestUsedTimestamp," +
  "tuple(" +
  "bytes32 transactionHash," +
  "uint16 requiredConfirmations," +
  "bool provideInput," +
  "bool listEvents," +
  "uint32[] logIndices" +
  ") requestBody," +
  "tuple(" +
  "uint64 blockNumber," +
  "uint64 timestamp," +
  "address sourceAddress," +
  "bool isDeployment," +
  "address receivingAddress," +
  "uint256 value," +
  "bytes input," +
  "uint8 status," +
  "tuple(" +
  "uint32 logIndex," +
  "address emitterAddress," +
  "bytes32[] topics," +
  "bytes data," +
  "bool removed" +
  ")[] events" +
  ") responseBody" +
  ")";

// ============================================================
// LOGGER CLASS
// ============================================================

class DualLogger {
  constructor(config) {
    this.logLevel = config.LOG_LEVEL;
    this.fileEnabled = config.LOG_FILE_ENABLED;
    this.logDir = config.LOG_FILE_DIR;
    this.sessionStart = new Date().toISOString();
    this.events = [];
    this.hourlyStats = [];

    if (this.fileEnabled) {
      // Create logs directory if it doesn't exist
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }

      // Generate log filename with date
      const date = new Date().toISOString().split('T')[0];
      this.logFilePath = path.join(this.logDir, `custom-feeds-bot-${date}.json`);
    }
  }

  // Terminal logging (compact or verbose)
  terminal(message, level = "info") {
    const timestamp = new Date().toTimeString().split(' ')[0];

    if (this.logLevel === "verbose" || level === "error" || level === "warn") {
      console.log(`[${timestamp}] ${message}`);
    } else if (this.logLevel === "compact") {
      // Only show important messages in compact mode
      if (level === "important" || level === "error" || level === "warn") {
        console.log(`[${timestamp}] ${message}`);
      }
    }
  }

  // File logging (detailed JSON)
  logEvent(eventData) {
    if (!this.fileEnabled) return;

    const event = {
      timestamp: new Date().toISOString(),
      ...eventData,
    };

    this.events.push(event);
    this.writeToFile();
  }

  logHourlyStats(stats) {
    if (!this.fileEnabled) return;

    this.hourlyStats.push({
      timestamp: new Date().toISOString(),
      ...stats,
    });

    this.writeToFile();
  }

  logFinalStats(stats) {
    if (!this.fileEnabled) return;

    this.writeToFile(stats);
  }

  writeToFile(finalStats = null) {
    if (!this.fileEnabled) return;

    const data = {
      sessionStart: this.sessionStart,
      events: this.events,
      hourlyStats: this.hourlyStats,
    };

    if (finalStats) {
      data.finalStats = finalStats;
    }

    try {
      fs.writeFileSync(this.logFilePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error("Failed to write log file:", error.message);
    }
  }

  getFilePath() {
    return this.logFilePath;
  }
}

// ============================================================
// CUSTOM FEEDS BOT CLASS
// ============================================================

class CustomFeedsBot {
  constructor(config) {
    this.config = config;
    this.logger = new DualLogger(config);

    // Provider & Wallet
    this.provider = null;
    this.wallet = null;

    // Contracts
    this.feedContracts = new Map(); // poolAddress => feedContract
    this.poolConfigsByAddress = new Map(); // poolAddress => poolConfig
    this.sourceProviders = new Map(); // chainId => provider
    this.sourceWallets = new Map(); // chainId => wallet (only for tx chains)
    this.relayContracts = new Map(); // priceRelayAddress => contract

    // State
    this.isRunning = false;
    this.cycleCount = 0;
    this.lastStatsTime = Date.now();
    this.currentPoolIndex = 0; // Round-robin pool selection

    // Statistics
    this.stats = {
      startTime: Date.now(),
      recording: {
        successful: 0,
        failed: 0,
        consecutiveFailures: 0,
        lastTime: null,
        totalGasUsed: 0n,
        totalCostFLR: 0,
      },
      attestation: {
        successful: 0,
        failed: 0,
        totalTime: 0,
        totalFDCFees: 0,
      },
      pools: {},
    };

    // Initialize per-pool stats
    config.FEEDS.forEach((feed) => {
      this.stats.pools[feed.alias] = {
        name: feed.name,
        recordings: 0,
        attestations: 0,
        lastPrice: null,
        lastRecording: null,
        lastAttestation: null,
      };
    });
  }

  async initialize() {
    this.logger.terminal("🤖 Initializing Custom Feeds Bot...", "important");

    // Validate
    if (!this.config.PRIVATE_KEY) throw new Error("DEPLOYER_PRIVATE_KEY not set");
    if (this.config.FEEDS.length === 0) {
      throw new Error("No feeds configured. Set CUSTOM_FEED_ADDRESS_* (and optionally POOL_ADDRESS_*) env vars.");
    }

    // Setup
    this.provider = new ethers.JsonRpcProvider(this.config.RPC_URL);
    this.wallet = new ethers.Wallet(this.config.PRIVATE_KEY, this.provider);

    // Verify network
    const network = await this.provider.getNetwork();
    if (network.chainId !== 14n) {
      throw new Error(`Wrong network! Expected Chain ID 14 (Flare), got ${network.chainId}`);
    }

    this.logger.terminal(`🌐 Network: Flare (Chain ID: ${network.chainId})`, "important");
    this.logger.terminal(`📍 Wallet: ${this.wallet.address}`, "important");

    const balance = await this.provider.getBalance(this.wallet.address);
    this.logger.terminal(`💰 Balance: ${ethers.formatEther(balance)} FLR`, "important");

    this.logger.terminal(`📊 Configured feeds: ${this.config.FEEDS.length}`, "important");

    // Connect to feed contracts and verify
    let verifiedCount = 0;
    for (const feed of this.config.FEEDS) {
      try {
        // Ensure address is checksummed to avoid ENS lookup
        const checksummedAddress = ethers.getAddress(feed.feedAddress);

        const feedContract = new ethers.Contract(
          checksummedAddress,
          CUSTOM_FEED_ABI,
          this.wallet
        );

        // Verify feed is accepting updates
        const accepting = await feedContract.acceptingUpdates();
        if (!accepting) {
          throw new Error(`Feed is paused for ${feed.alias}!`);
        }

        // Read on-chain config for safety + flow detection
        const [
          onchainPoolAddress,
          token0Decimals,
          token1Decimals,
          invertPrice,
        ] = await Promise.all([
          feedContract.poolAddress(),
          feedContract.token0Decimals(),
          feedContract.token1Decimals(),
          feedContract.invertPrice(),
        ]);

        if (feed.poolAddress && feed.poolAddress.toLowerCase() !== String(onchainPoolAddress).toLowerCase()) {
          throw new Error(`POOL_ADDRESS_${feed.alias} does not match feed.poolAddress()`);
        }

        feed.poolAddress = onchainPoolAddress;
        feed.onchainPoolAddress = onchainPoolAddress;
        feed.token0Decimals = Number(token0Decimals);
        feed.token1Decimals = Number(token1Decimals);
        feed.invertPrice = Boolean(invertPrice);

        // Detect relay vs direct/native by probing contract-specific getters.
        let isRelayFeed = false;
        try {
          const relayAddr = await feedContract.priceRelayAddress();
          if (relayAddr && relayAddr !== ethers.ZeroAddress) {
            isRelayFeed = true;
            feed.type = "relay";
            feed.onchainRelayAddress = relayAddr;

            const scid = await feedContract.sourceChainId();
            feed.onchainSourceChainId = Number(scid);
            feed.sourceChainId = Number(scid);

            // Optional env override/validation
            if (feed.priceRelayAddress && feed.priceRelayAddress.toLowerCase() !== String(relayAddr).toLowerCase()) {
              throw new Error(`PRICE_RELAY_ADDRESS_${feed.alias} does not match feed.priceRelayAddress()`);
            }
            feed.priceRelayAddress = relayAddr;

            // Cache PriceRelay contract instance for tx submission
            if (!this.relayContracts.has(relayAddr.toLowerCase())) {
              this.relayContracts.set(
                relayAddr.toLowerCase(),
                new ethers.Contract(relayAddr, PRICE_RELAY_ABI, this.wallet)
              );
            }

            // Source chain provider for off-chain reads
            const rpcUrl = getRpcUrlForChain(feed.sourceChainId);
            if (!rpcUrl) {
              throw new Error(`Missing RPC for source chain ${feed.sourceChainId}. Set RPC_URL_${feed.sourceChainId}.`);
            }
            if (!this.sourceProviders.has(feed.sourceChainId)) {
              this.sourceProviders.set(feed.sourceChainId, new ethers.JsonRpcProvider(rpcUrl));
            }
          }
        } catch {
          // Not a relay feed (function not present or reverted)
        }

        if (!isRelayFeed) {
          // PoolPriceCustomFeed: recorder address 0 => native, non-zero => direct (FDC)
          let recorderAddr;
          try {
            recorderAddr = await feedContract.priceRecorderAddress();
          } catch (err) {
            throw new Error(`Unsupported feed contract at ${checksummedAddress}: missing priceRecorderAddress/priceRelayAddress`);
          }

          feed.onchainRecorderAddress = recorderAddr;

          if (recorderAddr === ethers.ZeroAddress) {
            feed.type = "native";
          } else {
            feed.type = "direct";

            // Optional env override/validation
            if (feed.priceRecorderAddress && feed.priceRecorderAddress.toLowerCase() !== String(recorderAddr).toLowerCase()) {
              throw new Error(`PRICE_RECORDER_ADDRESS_${feed.alias} does not match feed.priceRecorderAddress()`);
            }
            feed.priceRecorderAddress = recorderAddr;

            // Recorder is deployed on the *source chain* (Flare/Ethereum/etc)
            const sourceChainId = feed.sourceChainId ?? 14;
            const rpcUrl = getRpcUrlForChain(sourceChainId);
            if (!rpcUrl) {
              throw new Error(`Missing RPC for source chain ${sourceChainId}. Set RPC_URL_${sourceChainId}.`);
            }

            // Cache provider + wallet for the source chain (used to send recordPrice tx)
            if (!this.sourceProviders.has(sourceChainId)) {
              this.sourceProviders.set(sourceChainId, new ethers.JsonRpcProvider(rpcUrl));
            }
            if (!this.sourceWallets.has(sourceChainId)) {
              this.sourceWallets.set(sourceChainId, new ethers.Wallet(this.config.PRIVATE_KEY, this.sourceProviders.get(sourceChainId)));
            }

            const signer = sourceChainId === 14 ? this.wallet : this.sourceWallets.get(sourceChainId);
            feed.priceRecorderContract = new ethers.Contract(recorderAddr, PRICE_RECORDER_ABI, signer);

            // Defensive: ensure recorder isn't paused (if contract supports it)
            try {
              const isRecording = await feed.priceRecorderContract.isRecording();
              if (!isRecording) throw new Error("PriceRecorder contract is paused");
            } catch {
              // Some recorder variants may not expose isRecording; ignore.
            }
          }
        }

        const normalizedPoolKey = String(feed.poolAddress).toLowerCase();
        this.feedContracts.set(normalizedPoolKey, feedContract);
        this.poolConfigsByAddress.set(normalizedPoolKey, feed);

        verifiedCount++;

        if (this.config.LOG_LEVEL === "verbose") {
          this.logger.terminal(`   ✅ ${feed.name} [${feed.alias}] (${feed.type})`);
        }
      } catch (error) {
        this.logger.terminal(`   ❌ Failed to initialize ${feed.alias}: ${error.message}`, "error");
        throw error;
      }
    }

    this.logger.terminal(`✅ All ${verifiedCount} feeds verified`, "important");

    // Log file info
    if (this.config.LOG_FILE_ENABLED) {
      this.logger.terminal(`📄 Logging to: ${this.logger.getFilePath()}`, "important");
    }

    this.logger.terminal("✅ Initialization complete!", "important");
    this.logger.terminal("");
  }

  async start() {
    await this.initialize();

    this.isRunning = true;

    this.logger.terminal("▶️  Bot started!", "important");
    this.logger.terminal(`⏱️  Check interval: ${this.config.CHECK_INTERVAL / 1000}s`, "important");
    this.logger.terminal(`📊 Stats interval: ${this.config.STATS_INTERVAL / 60000} min`, "important");
    this.logger.terminal(`📝 Log level: ${this.config.LOG_LEVEL}`, "important");
    this.logger.terminal(`🔄 Mode: Sequential record-then-attest`, "important");
    this.logger.terminal("");
    this.logger.terminal("Press Ctrl+C to stop");
    this.logger.terminal("=".repeat(60));
    this.logger.terminal("");

    // Main loop - Sequential record-then-attest per pool
    while (this.isRunning) {
      try {
        this.cycleCount++;

        // Check balance periodically
        await this.checkBalance();

        // Get next pool to process (round-robin)
        const poolConfig = this.getNextPoolToProcess();

        if (poolConfig) {
          // Record price for this pool
          const recordingResult = await this.tryRecordPrice(poolConfig);

          // If recording succeeded, immediately attest
          if (recordingResult) {
            await this.tryAttest(recordingResult);
          }
        } else {
          // No pools ready, show status
          this.logger.terminal("⏳ No pools ready for update");
        }

        // Print stats periodically
        if (Date.now() - this.lastStatsTime >= this.config.STATS_INTERVAL) {
          this.printHourlyStats();
          this.lastStatsTime = Date.now();
        }

        // Wait for next cycle
        await new Promise(resolve => setTimeout(resolve, this.config.CHECK_INTERVAL));

      } catch (error) {
        this.logger.terminal(`❌ Error in main loop: ${error.message}`, "error");
        this.logger.logEvent({
          type: "error",
          phase: "main_loop",
          error: error.message,
          stack: error.stack,
        });
      }
    }
  }

  stop() {
    this.logger.terminal("");
    this.logger.terminal("⏸️  Stopping bot...", "important");
    this.isRunning = false;
    this.printFinalStats();
    this.logger.terminal("✅ Bot stopped", "important");
  }

  // Round-robin pool selection
  getNextPoolToProcess() {
    // Try each pool starting from current index
    for (let i = 0; i < this.config.FEEDS.length; i++) {
      const poolIndex = (this.currentPoolIndex + i) % this.config.FEEDS.length;
      const poolConfig = this.config.FEEDS[poolIndex];

      // Update index for next call
      if (i === 0) {
        this.currentPoolIndex = (this.currentPoolIndex + 1) % this.config.FEEDS.length;
      }

      return poolConfig; // Return first pool in rotation
    }

    return null; // No pools configured
  }

  // Balance check
  async checkBalance() {
    if (this.cycleCount % 10 !== 0) return;

    const balance = await this.provider.getBalance(this.wallet.address);
    const balanceFLR = Number(ethers.formatEther(balance));

    if (balanceFLR < this.config.CRITICAL_BALANCE_FLR) {
      this.logger.terminal(`🚨 CRITICAL: Balance below ${this.config.CRITICAL_BALANCE_FLR} FLR - stopping bot`, "error");
      this.stop();
      process.exit(1);
    } else if (balanceFLR < this.config.MIN_BALANCE_FLR) {
      this.logger.terminal(`⚠️  LOW BALANCE: ${balanceFLR.toFixed(4)} FLR`, "warn");
    }
  }

  // Try to record price for a pool
  async tryRecordPrice(poolConfig) {
    try {
      if (poolConfig.type === "native") {
        await this.updateNativeFeed(poolConfig);
        return null;
      }

      if (poolConfig.type === "relay") {
        return await this.relayPriceForFeed(poolConfig);
      }

      if (poolConfig.type === "direct") {
        return await this.recordPriceForDirectFeed(poolConfig);
      }

      this.logger.terminal(`⚠️  Unknown feed type for ${poolConfig.alias}`, "warn");
      return null;

    } catch (error) {
      this.logger.terminal(`❌ Recording failed for ${poolConfig.name}: ${error.message}`, "error");
      this.stats.recording.failed++;
      this.stats.recording.consecutiveFailures++;

      this.logger.logEvent({
        type: "recording",
        pool: poolConfig.name,
        alias: poolConfig.alias,
        status: "failed",
        error: error.message,
      });

      // Circuit breaker
      if (this.stats.recording.consecutiveFailures >= 10) {
        this.logger.terminal("🚨 CIRCUIT BREAKER: Too many recording failures!", "error");
        this.stop();
        process.exit(1);
      }

      return null;
    }
  }

  async getGasPriceGwei(provider) {
    const feeData = await provider.getFeeData();

    if (feeData.gasPrice) return Number(feeData.gasPrice) / 1e9;
    if (feeData.maxFeePerGas) return Number(feeData.maxFeePerGas) / 1e9;
    return null;
  }

  async updateNativeFeed(poolConfig) {
    const feedContract = this.feedContracts.get(poolConfig.poolAddress.toLowerCase());
    if (!feedContract) throw new Error(`Feed contract not found for ${poolConfig.alias}`);

    // Enforce a minimum interval client-side (contract does not)
    const last = await feedContract.lastUpdateTimestamp();
    const lastTs = Number(last);
    const now = Math.floor(Date.now() / 1000);
    if (lastTs && now - lastTs < this.config.NATIVE_UPDATE_INTERVAL_SECONDS) {
      return;
    }

    const gasPriceGwei = await this.getGasPriceGwei(this.provider);
    if (gasPriceGwei === null) {
      this.logger.terminal("⚠️  Cannot determine gas price, skipping", "warn");
      return;
    }
    if (gasPriceGwei > this.config.MAX_GAS_PRICE_GWEI) {
      this.logger.terminal(`⚠️  Gas too high (${gasPriceGwei.toFixed(2)} gwei), skipping`, "warn");
      return;
    }

    const startTime = Date.now();
    this.logger.terminal(`⚡ Native update ${poolConfig.name}...`);

    const tx = await feedContract.updateFromNativePool({ gasLimit: 500000 });
    const receipt = await Promise.race([
      tx.wait(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Transaction timeout")), 300000)),
    ]);

    this.stats.recording.successful++;
    this.stats.recording.consecutiveFailures = 0;
    this.stats.recording.lastTime = Date.now();
    this.stats.recording.totalGasUsed += receipt.gasUsed;

    const newValue = await feedContract.latestValue();
    const updateCount = await feedContract.updateCount();
    const feedValue = (Number(newValue) / 1e6).toFixed(6);

    const poolStat = this.stats.pools[poolConfig.alias];
    if (poolStat) {
      poolStat.recordings++;
      poolStat.lastPrice = feedValue;
      poolStat.lastRecording = Date.now();
    }

    this.logger.terminal(`✅ Native updated ${poolConfig.name}: ${feedValue}`, "important");
    this.logger.logEvent({
      type: "native_update",
      pool: poolConfig.name,
      alias: poolConfig.alias,
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
      feedValue,
      updateCount: updateCount.toString(),
      gasUsed: receipt.gasUsed.toString(),
      status: "success",
      duration: Date.now() - startTime,
    });
  }

  async recordPriceForDirectFeed(poolConfig) {
    const startTime = Date.now();

    if (!poolConfig.priceRecorderContract) {
      throw new Error(`Missing PriceRecorder for direct feed ${poolConfig.alias}`);
    }

    const sourceChainId = poolConfig.sourceChainId ?? 14;
    const sourceProvider = sourceChainId === 14 ? this.provider : this.sourceProviders.get(sourceChainId);
    if (!sourceProvider) {
      throw new Error(`Missing provider for source chain ${sourceChainId}. Set RPC_URL_${sourceChainId}.`);
    }

    const canUpdate = await poolConfig.priceRecorderContract.canUpdate(poolConfig.poolAddress);
    if (!canUpdate) return null;

    const gasPriceGwei = await this.getGasPriceGwei(sourceProvider);
    if (gasPriceGwei === null) {
      this.logger.terminal("⚠️  Cannot determine gas price, skipping", "warn");
      return null;
    }
    if (gasPriceGwei > this.config.MAX_GAS_PRICE_GWEI) {
      this.logger.terminal(`⚠️  Gas too high (${gasPriceGwei.toFixed(2)} gwei), skipping`, "warn");
      return null;
    }

    this.logger.terminal(`🚀 Recording ${poolConfig.name} on chain ${sourceChainId}...`);

    const tx = await poolConfig.priceRecorderContract.recordPrice(poolConfig.poolAddress, {
      gasLimit: this.config.GAS_LIMIT,
    });

    const receipt = await Promise.race([
      tx.wait(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Transaction timeout')), 300000)
      )
    ]);

    // Success!
    this.stats.recording.successful++;
    this.stats.recording.consecutiveFailures = 0;
    this.stats.recording.lastTime = Date.now();
    this.stats.recording.totalGasUsed += receipt.gasUsed;

    const gasUsed = BigInt(receipt.gasUsed);
    const gasPrice = BigInt(receipt.gasPrice || receipt.effectiveGasPrice || 0);
    const gasCost = gasUsed * gasPrice;
    const costNative = Number(ethers.formatEther(gasCost));
    // Keep legacy counter for Flare-only dashboards; don't mislabel for other chains
    if (sourceChainId === 14) this.stats.recording.totalCostFLR += costNative;

    // Parse price from event
    let recordedPrice = null;
    const event = receipt.logs.find(log => {
      try {
        const parsed = poolConfig.priceRecorderContract.interface.parseLog(log);
        return parsed?.name === "PriceRecorded";
      } catch {
        return false;
      }
    });

    if (event) {
      const parsed = poolConfig.priceRecorderContract.interface.parseLog(event);
      recordedPrice = this.calculatePrice(parsed.args.sqrtPriceX96, poolConfig);
    }

    // Update pool stats
    const poolStat = this.stats.pools[poolConfig.alias];
    if (poolStat) {
      poolStat.recordings++;
      poolStat.lastPrice = recordedPrice;
      poolStat.lastRecording = Date.now();
    }

    // Compact terminal log
    this.logger.terminal(
      `✅ Recorded ${poolConfig.name}: ${recordedPrice} (Gas: ${receipt.gasUsed.toString()})`,
      "important"
    );

    // Detailed file log
    this.logger.logEvent({
      type: "recording",
      pool: poolConfig.name,
      alias: poolConfig.alias,
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
      price: recordedPrice,
      gasUsed: receipt.gasUsed.toString(),
      gasCost: costNative.toFixed(6),
      chainId: sourceChainId,
      gasPriceGwei: gasPriceGwei.toFixed(2),
      status: "success",
      duration: Date.now() - startTime,
    });

    // Return recording result for immediate attestation
    return {
      kind: "direct",
      txHash: tx.hash,
      poolConfig,
      blockNumber: receipt.blockNumber,
      price: recordedPrice,
    };
  }

  async relayPriceForFeed(poolConfig) {
    const startTime = Date.now();

    if (!poolConfig.priceRelayAddress) {
      throw new Error(`Missing PriceRelay address for relay feed ${poolConfig.alias}`);
    }

    const relay = this.relayContracts.get(poolConfig.priceRelayAddress.toLowerCase());
    if (!relay) {
      throw new Error(`PriceRelay contract not initialized for ${poolConfig.priceRelayAddress}`);
    }

    const canRelay = await relay.canRelay(BigInt(poolConfig.sourceChainId), poolConfig.poolAddress);
    if (!canRelay) return null;

    const sourceProvider = this.sourceProviders.get(poolConfig.sourceChainId);
    if (!sourceProvider) {
      throw new Error(`Missing provider for relay source chain ${poolConfig.sourceChainId}. Set RPC_URL_${poolConfig.sourceChainId}.`);
    }

    const pool = new ethers.Contract(poolConfig.poolAddress, UNISWAP_V3_POOL_ABI, sourceProvider);
    const sourceBlockNumber = await sourceProvider.getBlockNumber();

    const [slot0, liquidity, token0, token1, sourceBlock] = await Promise.all([
      pool.slot0(),
      pool.liquidity(),
      pool.token0(),
      pool.token1(),
      sourceProvider.getBlock(sourceBlockNumber),
    ]);

    const sqrtPriceX96 = slot0[0];
    const tick = slot0[1];
    const unlocked = slot0[6];
    if (!unlocked) return null;

    const sourceTimestampRaw = Number(sourceBlock.timestamp);
    let sourceTimestamp = sourceTimestampRaw;
    let sourceTimestampClamped = false;

    // Clamp timestamp so PriceRelay won't revert due to cross-chain clock skew
    try {
      const flareBlock = await this.provider.getBlock("latest");
      const flareNow = Number(flareBlock.timestamp);
      const allowedMax = flareNow + 600;
      if (sourceTimestamp > allowedMax) {
        sourceTimestamp = allowedMax;
        sourceTimestampClamped = true;
      }
    } catch {
      // Keep raw source timestamp; relay may revert but we avoid masking errors.
    }

    const gasPriceGwei = await this.getGasPriceGwei(this.provider);
    if (gasPriceGwei === null) {
      this.logger.terminal("⚠️  Cannot determine gas price, skipping", "warn");
      return null;
    }
    if (gasPriceGwei > this.config.MAX_GAS_PRICE_GWEI) {
      this.logger.terminal(`⚠️  Gas too high (${gasPriceGwei.toFixed(2)} gwei), skipping`, "warn");
      return null;
    }

    this.logger.terminal(`📤 Relaying ${poolConfig.name} (chain ${poolConfig.sourceChainId} → Flare)...`);
    if (sourceTimestampClamped && this.config.LOG_LEVEL === "verbose") {
      this.logger.terminal(`   ⏱️  Timestamp clamped: ${sourceTimestampRaw} → ${sourceTimestamp}`, "warn");
    }

    const tx = await relay.relayPrice(
      BigInt(poolConfig.sourceChainId),
      poolConfig.poolAddress,
      sqrtPriceX96,
      tick,
      liquidity,
      token0,
      token1,
      BigInt(sourceTimestamp),
      BigInt(sourceBlockNumber),
      { gasLimit: 800000 }
    );

    const receipt = await Promise.race([
      tx.wait(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Transaction timeout")), 300000)),
    ]);

    this.stats.recording.successful++;
    this.stats.recording.consecutiveFailures = 0;
    this.stats.recording.lastTime = Date.now();
    this.stats.recording.totalGasUsed += receipt.gasUsed;

    const relayedPrice = this.calculatePrice(sqrtPriceX96, poolConfig);

    const poolStat = this.stats.pools[poolConfig.alias];
    if (poolStat) {
      poolStat.recordings++;
      poolStat.lastPrice = relayedPrice;
      poolStat.lastRecording = Date.now();
    }

    this.logger.terminal(`✅ Relayed ${poolConfig.name}: ${relayedPrice}`, "important");
    this.logger.logEvent({
      type: "relay",
      pool: poolConfig.name,
      alias: poolConfig.alias,
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
      price: relayedPrice,
      chainId: poolConfig.sourceChainId,
      sourceBlockNumber,
      sourceTimestamp,
      sourceTimestampRaw,
      sourceTimestampClamped,
      gasUsed: receipt.gasUsed.toString(),
      status: "success",
      duration: Date.now() - startTime,
    });

    return {
      kind: "relay",
      txHash: tx.hash,
      poolConfig,
      blockNumber: receipt.blockNumber,
      price: relayedPrice,
    };
  }

  calculatePrice(sqrtPriceX96, poolConfig) {
    const Q96 = 2n ** 96n;
    const token0Decimals = BigInt(poolConfig.token0Decimals);
    const token1Decimals = BigInt(poolConfig.token1Decimals);

    // Calculate raw price with HIGH precision (18 decimals)
    const numerator = sqrtPriceX96 * sqrtPriceX96 * (10n ** 18n);
    const denominator = Q96 * Q96;
    let price = numerator / denominator;

    // Apply decimal adjustment
    const decimalAdjustment = token0Decimals - token1Decimals;
    if (decimalAdjustment !== 0n) {
      if (decimalAdjustment > 0n) {
        price = price * (10n ** decimalAdjustment);
      } else {
        price = price / (10n ** (-decimalAdjustment));
      }
    }

    // Scale down from 18 decimals to 6 decimals for display
    price = price / (10n ** 12n);

    // Apply price inversion if configured
    if (poolConfig.invertPrice && price > 0n) {
      price = (10n ** 12n) / price;
    }

    return (Number(price) / 1e6).toFixed(6);
  }

  // Try to attest a recorded price
  async tryAttest(recordingResult) {
    const { txHash, poolConfig, blockNumber, price, kind } = recordingResult;
    const startTime = Date.now();

    this.logger.terminal(`📤 Attesting ${poolConfig.name}...`);

    // Retry loop
    for (let attempt = 0; attempt <= this.config.MAX_ATTESTATION_RETRIES; attempt++) {
      try {
        // Get FDC proof
        const sourceChainIdForProof = kind === "direct" ? (poolConfig.sourceChainId ?? 14) : 14;
        const proof = await getProofForTransaction(this.provider, this.wallet, txHash, {
          sourceChainId: sourceChainIdForProof,
        });

        // Format proof
        const proofStruct = this.formatProofForContract(proof);

        // Get feed contract
        const feedContract = this.feedContracts.get(poolConfig.poolAddress.toLowerCase());

        // Submit to feed
        const updateTx = await feedContract.updateFromProof(proofStruct, {
          gasLimit: 500000,
        });

        const receipt = await updateTx.wait();

        // Read new value
        const newValue = await feedContract.latestValue();
        const updateCount = await feedContract.updateCount();

        const duration = Math.floor((Date.now() - startTime) / 1000);
        const feedValue = (Number(newValue) / 1e6).toFixed(6);

        // Success!
        this.stats.attestation.successful++;
        this.stats.attestation.totalTime += duration;
        this.stats.attestation.totalFDCFees += 1.0;

        const poolStat = this.stats.pools[poolConfig.alias];
        if (poolStat) {
          poolStat.attestations++;
          poolStat.lastAttestation = Date.now();
        }

        // Compact terminal log
        this.logger.terminal(
          `✅ Attested ${poolConfig.name} (${duration}s, Feed: ${feedValue})`,
          "important"
        );

        // Detailed file log
        this.logger.logEvent({
          type: "attestation",
          pool: poolConfig.name,
          alias: poolConfig.alias,
          txHash,
          blockNumber,
          fdcFee: "1.0 FLR",
          attestationTime: duration,
          feedValue,
          updateCount: updateCount.toString(),
          gasUsed: receipt.gasUsed.toString(),
          status: "success",
          retryCount: attempt,
          fdcRoundId: proof.fdcRoundId,
          proofSourceChainId: sourceChainIdForProof,
          kind,
        });

        return; // Success, exit retry loop

      } catch (error) {
        if (attempt < this.config.MAX_ATTESTATION_RETRIES) {
          this.logger.terminal(`⚠️  Attestation failed (attempt ${attempt + 1}), retrying...`, "warn");
          this.logger.logEvent({
            type: "attestation",
            pool: poolConfig.name,
            alias: poolConfig.alias,
            txHash,
            status: "retry",
            retryCount: attempt + 1,
            error: error.message,
          });

          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 10000));
        } else {
          // Max retries exceeded
          this.stats.attestation.failed++;

          this.logger.terminal(`❌ Attestation failed for ${poolConfig.name} after ${attempt + 1} attempts: ${error.message}`, "error");

          this.logger.logEvent({
            type: "attestation",
            pool: poolConfig.name,
            alias: poolConfig.alias,
            txHash,
            blockNumber,
            status: "failed",
            retryCount: attempt,
            error: error.message,
          });

          return; // Give up, move to next pool
        }
      }
    }
  }

  formatProofForContract(proof) {
    const coder = ethers.AbiCoder.defaultAbiCoder();
    const [rawResponse] = coder.decode([RESPONSE_TUPLE_TYPE], proof.responseHex);

    const toArray = (value) => {
      if (!value) return [];
      return Array.from(value);
    };

    const logIndices = toArray(rawResponse.requestBody?.logIndices).map((value) =>
      BigInt(value ?? 0n)
    );

    const normalizedEvents = toArray(rawResponse.responseBody?.events).map((event) => {
      return {
        logIndex: BigInt(event.logIndex ?? 0),
        emitterAddress: event.emitterAddress,
        topics: toArray(event.topics),
        data: event.data,
        removed: event.removed,
      };
    });

    return {
      merkleProof: Array.isArray(proof.merkleProof) ? proof.merkleProof : [],
      data: {
        attestationType: rawResponse.attestationType,
        sourceId: rawResponse.sourceId,
        votingRound: rawResponse.votingRound,
        lowestUsedTimestamp: rawResponse.lowestUsedTimestamp,
        requestBody: {
          transactionHash: rawResponse.requestBody.transactionHash,
          requiredConfirmations: rawResponse.requestBody.requiredConfirmations,
          provideInput: rawResponse.requestBody.provideInput,
          listEvents: rawResponse.requestBody.listEvents,
          logIndices,
        },
        responseBody: {
          blockNumber: rawResponse.responseBody.blockNumber,
          timestamp: rawResponse.responseBody.timestamp,
          sourceAddress: rawResponse.responseBody.sourceAddress,
          isDeployment: rawResponse.responseBody.isDeployment,
          receivingAddress: rawResponse.responseBody.receivingAddress,
          value: rawResponse.responseBody.value,
          input: rawResponse.responseBody.input,
          status: rawResponse.responseBody.status,
          events: normalizedEvents,
        },
      },
    };
  }

  // Statistics
  printHourlyStats() {
    const uptimeMinutes = Math.floor((Date.now() - this.stats.startTime) / 60000);

    const totalCostFlare = this.stats.recording.totalCostFLR + this.stats.attestation.totalFDCFees;
    const stats = {
      uptime: uptimeMinutes,
      recordings: this.stats.recording.successful,
      attestations: this.stats.attestation.successful,
      gasUsed: this.stats.recording.totalGasUsed.toString(),
      totalCost: totalCostFlare.toFixed(6) + " FLR (Flare-side only)",
    };

    this.logger.terminal("📊 Hourly Stats:", "important");
    this.logger.terminal(`   Recordings: ${stats.recordings} | Attestations: ${stats.attestations}`, "important");

    this.logger.logHourlyStats(stats);
  }

  printFinalStats() {
    const uptimeMinutes = Math.floor((Date.now() - this.stats.startTime) / 60000);
    const avgGasUsed = this.stats.recording.successful > 0
      ? Number(this.stats.recording.totalGasUsed / BigInt(this.stats.recording.successful))
      : 0;

    const totalCostFinal = this.stats.recording.totalCostFLR + this.stats.attestation.totalFDCFees;
    const finalStats = {
      uptime: `${uptimeMinutes} minutes`,
      recording: {
        successful: this.stats.recording.successful,
        failed: this.stats.recording.failed,
        avgGasUsed,
        gasCost: this.stats.recording.totalCostFLR.toFixed(6) + " FLR (Flare-side only)",
      },
      attestation: {
        successful: this.stats.attestation.successful,
        failed: this.stats.attestation.failed,
        avgTime: this.stats.attestation.successful > 0
          ? Math.floor(this.stats.attestation.totalTime / this.stats.attestation.successful)
          : 0,
        fdcFees: this.stats.attestation.totalFDCFees.toFixed(1) + " FLR",
      },
      totalCost: totalCostFinal.toFixed(6) + " FLR (Flare-side only)",
      pools: this.stats.pools,
    };

    this.logger.terminal("=".repeat(60), "important");
    this.logger.terminal("📊 Final Session Statistics", "important");
    this.logger.terminal("=".repeat(60), "important");
    this.logger.terminal(`Uptime: ${uptimeMinutes} minutes`, "important");
    this.logger.terminal(`Total Recordings: ${finalStats.recording.successful}`, "important");
    this.logger.terminal(`Total Attestations: ${finalStats.attestation.successful}`, "important");
    this.logger.terminal(`Total Cost: ${finalStats.totalCost} (Gas: ${finalStats.recording.gasCost} + FDC Fees: ${finalStats.attestation.fdcFees})`, "important");
    this.logger.terminal(`Note: Source-chain gas (e.g., ETH for recordPrice) is not included in these totals.`, "important");
    this.logger.terminal("=".repeat(60), "important");

    this.logger.logFinalStats(finalStats);

    if (this.config.LOG_FILE_ENABLED) {
      this.logger.terminal(`📄 Full logs saved to: ${this.logger.getFilePath()}`, "important");
    }
  }
}

// ============================================================
// MAIN EXECUTION
// ============================================================

async function main() {
  console.log("=".repeat(60));
  console.log("🤖 Flare Custom Feeds Bot");
  console.log("=".repeat(60));
  console.log();

  const bot = new CustomFeedsBot(CONFIG);

  // Graceful shutdown
  process.on("SIGINT", () => {
    bot.stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    bot.stop();
    process.exit(0);
  });

  await bot.start();
}

main().catch(error => {
  console.error();
  console.error("❌ Bot crashed!");
  console.error();
  console.error(error);
  process.exit(1);
});
