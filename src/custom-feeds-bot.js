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
 *   PRICE_RECORDER_ADDRESS             # PriceRecorder contract address
 *   DEPLOYER_PRIVATE_KEY               # Wallet private key
 *   FLARE_RPC_URL                      # Flare RPC endpoint
 *   POOL_ADDRESS_<ALIAS>               # Pool addresses (e.g., POOL_ADDRESS_FXRP_USDTO_SPARKDEX)
 *   CUSTOM_FEED_ADDRESS_<ALIAS>        # Feed addresses (e.g., CUSTOM_FEED_ADDRESS_FXRP_USDTO_SPARKDEX)
 */

import { config } from "dotenv";
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { getProofForTransaction } from "./fdc-client.js";

// Load .env file (prefer repo root, fallback to frontend/.env)
const rootEnvPath = path.join(process.cwd(), ".env");
const frontendEnvPath = path.join(process.cwd(), "frontend", ".env");
config({ path: fs.existsSync(rootEnvPath) ? rootEnvPath : frontendEnvPath });

// ============================================================
// CONFIGURATION
// ============================================================

// Pool specifications - Add your pools here
// Each pool needs corresponding POOL_ADDRESS_<ALIAS> and CUSTOM_FEED_ADDRESS_<ALIAS> env vars
const POOL_SPECS = [
  // Example pool configurations - uncomment and modify for your pools:
  // {
  //   name: "FXRP/USD₮0 (SparkDex)",
  //   alias: "FXRP_USDTO_SPARKDEX",
  //   token0Decimals: 6,
  //   token1Decimals: 6,
  //   invertPrice: false,
  // },
  // {
  //   name: "WFLR/FXRP (SparkDex)",
  //   alias: "WFLR_FXRP_SPARKDEX",
  //   token0Decimals: 18,
  //   token1Decimals: 6,
  //   invertPrice: false,
  // },
];

// Auto-discover pools from environment variables
function discoverPoolsFromEnv() {
  const pools = [];
  const envKeys = Object.keys(process.env);
  
  // Find all POOL_ADDRESS_* environment variables
  const poolAddressKeys = envKeys.filter(key => key.startsWith('POOL_ADDRESS_'));
  
  for (const key of poolAddressKeys) {
    const alias = key.replace('POOL_ADDRESS_', '');
    const poolAddress = process.env[key];
    const feedAddressKey = `CUSTOM_FEED_ADDRESS_${alias}`;
    const feedAddress = process.env[feedAddressKey];
    
    if (poolAddress && feedAddress) {
      // Check if we have a spec for this pool, otherwise use defaults
      const spec = POOL_SPECS.find(s => s.alias === alias) || {
        name: alias.replace(/_/g, '/').replace(/SPARKDEX|ENOSYS/g, m => ` (${m})`),
        alias: alias,
        token0Decimals: 18, // Default - will be overridden if spec exists
        token1Decimals: 6,
        invertPrice: false,
      };
      
      pools.push({
        ...spec,
        alias,
        poolAddress,
        feedAddress,
        enabled: true,
      });
    }
  }
  
  return pools;
}

// Resolve pool configurations
const POOLS = discoverPoolsFromEnv();

// Bot configuration
const CONFIG = {
  PRICE_RECORDER: process.env.PRICE_RECORDER_ADDRESS,
  RPC_URL: process.env.FLARE_RPC_URL || "https://flare-api.flare.network/ext/bc/C/rpc",
  PRIVATE_KEY: process.env.DEPLOYER_PRIVATE_KEY,

  // Timing
  CHECK_INTERVAL: parseInt(process.env.BOT_CHECK_INTERVAL_SECONDS || "60") * 1000,
  STATS_INTERVAL: parseInt(process.env.BOT_STATS_INTERVAL_MINUTES || "60") * 60 * 1000,

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

  POOLS,
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
  "function latestValue() external view returns (uint256)",
  "function lastUpdateTimestamp() external view returns (uint64)",
  "function updateCount() external view returns (uint256)",
  "function acceptingUpdates() external view returns (bool)",
];

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
    this.priceRecorder = null;
    this.feedContracts = new Map(); // poolAddress => feedContract
    this.poolConfigsByAddress = new Map(); // poolAddress => poolConfig

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
    config.POOLS.forEach(pool => {
      this.stats.pools[pool.poolAddress] = {
        name: pool.name,
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
    if (!this.config.PRICE_RECORDER) throw new Error("PRICE_RECORDER_ADDRESS not set");
    if (!this.config.PRIVATE_KEY) throw new Error("DEPLOYER_PRIVATE_KEY not set");
    if (this.config.POOLS.length === 0) throw new Error("No pools configured. Set POOL_ADDRESS_* and CUSTOM_FEED_ADDRESS_* env vars.");

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

    // Connect to PriceRecorder
    this.priceRecorder = new ethers.Contract(
      this.config.PRICE_RECORDER,
      PRICE_RECORDER_ABI,
      this.wallet
    );

    const isRecording = await this.priceRecorder.isRecording();
    if (!isRecording) throw new Error("PriceRecorder contract is paused!");

    this.logger.terminal(`📋 PriceRecorder: ${this.config.PRICE_RECORDER}`, "important");
    this.logger.terminal(`📊 Configured pools: ${this.config.POOLS.length}`, "important");

    // Connect to feed contracts and verify
    let verifiedCount = 0;
    for (const pool of this.config.POOLS) {
      try {
        // Ensure address is checksummed to avoid ENS lookup
        const checksummedAddress = ethers.getAddress(pool.feedAddress);

        const feedContract = new ethers.Contract(
          checksummedAddress,
          CUSTOM_FEED_ABI,
          this.wallet
        );

        const normalizedAddress = pool.poolAddress.toLowerCase();
        this.feedContracts.set(normalizedAddress, feedContract);
        this.poolConfigsByAddress.set(normalizedAddress, pool);

        // Verify feed is accepting updates
        const accepting = await feedContract.acceptingUpdates();
        if (!accepting) {
          throw new Error(`Feed is paused for pool ${pool.name}!`);
        }

        verifiedCount++;

        if (this.config.LOG_LEVEL === "verbose") {
          this.logger.terminal(`   ✅ ${pool.name} [${pool.alias}]`);
        }
      } catch (error) {
        this.logger.terminal(`   ❌ Failed to initialize ${pool.name}: ${error.message}`, "error");
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
    for (let i = 0; i < this.config.POOLS.length; i++) {
      const poolIndex = (this.currentPoolIndex + i) % this.config.POOLS.length;
      const poolConfig = this.config.POOLS[poolIndex];

      // Update index for next call
      if (i === 0) {
        this.currentPoolIndex = (this.currentPoolIndex + 1) % this.config.POOLS.length;
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
      // Check if pool can update
      const canUpdate = await this.priceRecorder.canUpdate(poolConfig.poolAddress);

      if (!canUpdate) {
        return null; // Not ready yet
      }

      // Check gas price
      const feeData = await this.provider.getFeeData();
      let gasPriceGwei;

      if (feeData.gasPrice) {
        gasPriceGwei = Number(feeData.gasPrice) / 1e9;
      } else if (feeData.maxFeePerGas) {
        gasPriceGwei = Number(feeData.maxFeePerGas) / 1e9;
      } else {
        this.logger.terminal("⚠️  Cannot determine gas price, skipping", "warn");
        return null;
      }

      if (gasPriceGwei > this.config.MAX_GAS_PRICE_GWEI) {
        this.logger.terminal(`⚠️  Gas too high (${gasPriceGwei.toFixed(2)} gwei), skipping`, "warn");
        return null;
      }

      // Record price
      return await this.recordPriceForPool(poolConfig, gasPriceGwei);

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

  async recordPriceForPool(poolConfig, gasPriceGwei) {
    const startTime = Date.now();

    this.logger.terminal(`🚀 Recording ${poolConfig.name}...`);

    const tx = await this.priceRecorder.recordPrice(poolConfig.poolAddress, {
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
    const costFLR = Number(ethers.formatEther(gasCost));
    this.stats.recording.totalCostFLR += costFLR;

    // Parse price from event
    let recordedPrice = null;
    const event = receipt.logs.find(log => {
      try {
        const parsed = this.priceRecorder.interface.parseLog(log);
        return parsed?.name === "PriceRecorded";
      } catch {
        return false;
      }
    });

    if (event) {
      const parsed = this.priceRecorder.interface.parseLog(event);
      recordedPrice = this.calculatePrice(parsed.args.sqrtPriceX96, poolConfig);
    }

    // Update pool stats
    const poolStat = this.stats.pools[poolConfig.poolAddress];
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
      gasCost: costFLR.toFixed(6) + " FLR",
      gasPriceGwei: gasPriceGwei.toFixed(2),
      status: "success",
      duration: Date.now() - startTime,
    });

    // Return recording result for immediate attestation
    return {
      txHash: tx.hash,
      poolConfig,
      blockNumber: receipt.blockNumber,
      price: recordedPrice,
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
    const { txHash, poolConfig, blockNumber, price } = recordingResult;
    const startTime = Date.now();

    this.logger.terminal(`📤 Attesting ${poolConfig.name}...`);

    // Retry loop
    for (let attempt = 0; attempt <= this.config.MAX_ATTESTATION_RETRIES; attempt++) {
      try {
        // Get FDC proof
        const proof = await getProofForTransaction(this.provider, this.wallet, txHash);

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

        const poolStat = this.stats.pools[poolConfig.poolAddress];
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

    const totalCost = this.stats.recording.totalCostFLR + this.stats.attestation.totalFDCFees;
    const stats = {
      uptime: uptimeMinutes,
      recordings: this.stats.recording.successful,
      attestations: this.stats.attestation.successful,
      gasUsed: this.stats.recording.totalGasUsed.toString(),
      totalCost: totalCost.toFixed(6) + " FLR",
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
        gasCost: this.stats.recording.totalCostFLR.toFixed(6) + " FLR",
      },
      attestation: {
        successful: this.stats.attestation.successful,
        failed: this.stats.attestation.failed,
        avgTime: this.stats.attestation.successful > 0
          ? Math.floor(this.stats.attestation.totalTime / this.stats.attestation.successful)
          : 0,
        fdcFees: this.stats.attestation.totalFDCFees.toFixed(1) + " FLR",
      },
      totalCost: totalCostFinal.toFixed(6) + " FLR",
      pools: this.stats.pools,
    };

    this.logger.terminal("=".repeat(60), "important");
    this.logger.terminal("📊 Final Session Statistics", "important");
    this.logger.terminal("=".repeat(60), "important");
    this.logger.terminal(`Uptime: ${uptimeMinutes} minutes`, "important");
    this.logger.terminal(`Total Recordings: ${finalStats.recording.successful}`, "important");
    this.logger.terminal(`Total Attestations: ${finalStats.attestation.successful}`, "important");
    this.logger.terminal(`Total Cost: ${finalStats.totalCost} (Gas: ${finalStats.recording.gasCost} + FDC Fees: ${finalStats.attestation.fdcFees})`, "important");
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

