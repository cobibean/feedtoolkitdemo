/**
 * PoolPriceCustomFeed Deployment Script
 * 
 * Deploys the custom feed contract with FDC verification to Flare mainnet.
 * 
 * Usage:
 *   FEED_ALIAS=FXRP_USDTO_SPARKDEX npm run deploy:feed
 *   # Or with hardhat directly:
 *   npx hardhat run scripts/deploy-custom-feed.js --network flare
 * 
 * Environment Variables:
 *   PRICE_RECORDER_ADDRESS         - Deployed PriceRecorder address
 *   FEED_ALIAS                     - Feed name/alias (e.g., FXRP_USDTO_SPARKDEX)
 *   POOL_ADDRESS_<ALIAS>           - Pool bound to that alias
 *   INVERT_PRICE                   - (Optional) "true" to invert price for market convention
 *   FLARE_CONTRACT_REGISTRY        - (Optional) Defaults to mainnet registry
 */

import "dotenv/config";
import { mkdirSync, writeFileSync } from "fs";
import hre from "hardhat";

const alias = (process.env.FEED_ALIAS || "").toUpperCase();
const poolEnvKey = `POOL_ADDRESS_${alias}`;

if (!alias || alias.length === 0 || alias.length > 20) {
  console.error("❌ FEED_ALIAS must be set and be 1-20 characters.");
  console.error("   Example: FEED_ALIAS=FXRP_USDTO_SPARKDEX npm run deploy:feed");
  process.exit(1);
}

const CONFIG = {
  ALIAS: alias,
  PRICE_RECORDER: process.env.PRICE_RECORDER_ADDRESS,
  POOL_ADDRESS: process.env[poolEnvKey],
  FEED_NAME: alias,
  FLARE_CONTRACT_REGISTRY: process.env.FLARE_CONTRACT_REGISTRY || "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019",
};

async function main() {
  console.log("=".repeat(60));
  console.log("🚀 PoolPriceCustomFeed Deployment");
  console.log("=".repeat(60));
  console.log();

  if (!CONFIG.PRICE_RECORDER) {
    throw new Error("PRICE_RECORDER_ADDRESS is not set in environment.");
  }

  if (!CONFIG.POOL_ADDRESS) {
    throw new Error(
      `Pool address missing. Set ${poolEnvKey} in your environment before deploying.`
    );
  }

  // Get deployer
  const [deployer] = await hre.ethers.getSigners();
  console.log("📝 Deployer:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("💰 Balance:", hre.ethers.formatEther(balance), "FLR");
  console.log();

  if (balance < hre.ethers.parseEther("1")) {
    console.warn("⚠️  WARNING: Low balance. Need ~2 FLR for deployment.");
  }

  // Get network
  const network = await hre.ethers.provider.getNetwork();
  console.log("🌐 Network:", network.name);
  console.log("🔗 Chain ID:", network.chainId.toString());
  console.log();

  // Configuration display
  console.log("📋 Deployment Configuration:");
  console.log("  - Feed Alias:", CONFIG.ALIAS);
  console.log("  - Price Recorder:", CONFIG.PRICE_RECORDER);
  console.log("  - Pool:", CONFIG.POOL_ADDRESS);
  console.log("  - Contract Registry:", CONFIG.FLARE_CONTRACT_REGISTRY);
  console.log();

  // Get FdcVerification address from ContractRegistry
  console.log("🔍 Getting FdcVerification address from ContractRegistry...");

  const registryABI = [
    "function getContractAddressByName(string) view returns (address)"
  ];

  const registry = new hre.ethers.Contract(
    CONFIG.FLARE_CONTRACT_REGISTRY,
    registryABI,
    deployer
  );

  let fdcVerificationAddress;
  try {
    fdcVerificationAddress = await registry.getContractAddressByName("FdcVerification");
    console.log("  ✅ FdcVerification:", fdcVerificationAddress);
    console.log();
  } catch (error) {
    console.error();
    console.error("❌ Failed to get FdcVerification from registry!");
    console.error("  Error:", error.message);
    console.error();
    console.error("Make sure you're connected to Flare mainnet.");
    process.exit(1);
  }

  // Get token decimals from pool
  console.log("🔍 Querying pool for token information...");

  const poolABI = [
    "function token0() external view returns (address)",
    "function token1() external view returns (address)",
  ];

  const erc20ABI = [
    "function decimals() external view returns (uint8)",
    "function symbol() external view returns (string)",
  ];

  const pool = new hre.ethers.Contract(CONFIG.POOL_ADDRESS, poolABI, deployer);

  let token0Address, token1Address, token0Decimals, token1Decimals, token0Symbol, token1Symbol;
  try {
    token0Address = await pool.token0();
    token1Address = await pool.token1();

    const token0 = new hre.ethers.Contract(token0Address, erc20ABI, deployer);
    const token1 = new hre.ethers.Contract(token1Address, erc20ABI, deployer);

    [token0Decimals, token1Decimals, token0Symbol, token1Symbol] = await Promise.all([
      token0.decimals(),
      token1.decimals(),
      token0.symbol(),
      token1.symbol(),
    ]);

    console.log(`  ✅ Token0: ${token0Symbol} (${token0Address}) - ${token0Decimals} decimals`);
    console.log(`  ✅ Token1: ${token1Symbol} (${token1Address}) - ${token1Decimals} decimals`);
    console.log();
  } catch (error) {
    console.error();
    console.error("❌ Failed to query pool tokens!");
    console.error("  Error:", error.message);
    console.error();
    console.error("Make sure POOL_ADDRESS is a valid Uniswap V3 pool.");
    process.exit(1);
  }

  // Determine if price should be inverted
  const invertPrice = process.env.INVERT_PRICE === 'true' || false;
  if (invertPrice) {
    console.log("📊 Price will be INVERTED (showing token0/token1 instead of token1/token0)");
  } else {
    console.log("📊 Price will be NORMAL (showing token1/token0)");
  }
  console.log();

  // Deploy contract
  console.log("🔨 Deploying PoolPriceCustomFeed...");
  const PoolPriceCustomFeed = await hre.ethers.getContractFactory("PoolPriceCustomFeed");

  const feed = await PoolPriceCustomFeed.deploy(
    CONFIG.PRICE_RECORDER,
    CONFIG.POOL_ADDRESS,
    CONFIG.FEED_NAME,
    fdcVerificationAddress,
    token0Decimals,
    token1Decimals,
    invertPrice
  );

  console.log("  ⏳ Waiting for deployment...");
  await feed.waitForDeployment();

  const feedAddress = await feed.getAddress();
  console.log("  ✅ Deployed!");
  console.log();

  // Verify deployment
  console.log("📊 Feed Configuration:");
  const feedId = await feed.feedId();
  const decimals = await feed.decimals();
  const owner = await feed.owner();
  const accepting = await feed.acceptingUpdates();
  const priceRecorder = await feed.priceRecorderAddress();
  const poolAddr = await feed.poolAddress();
  const t0Decimals = await feed.token0Decimals();
  const t1Decimals = await feed.token1Decimals();
  const inverted = await feed.invertPrice();

  console.log("  - Address:", feedAddress);
  console.log("  - Feed ID:", feedId);
  console.log("  - Output Decimals:", decimals.toString());
  console.log("  - Token0 Decimals:", t0Decimals.toString(), `(${token0Symbol})`);
  console.log("  - Token1 Decimals:", t1Decimals.toString(), `(${token1Symbol})`);
  console.log("  - Invert Price:", inverted);
  console.log("  - Owner:", owner);
  console.log("  - Accepting Updates:", accepting);
  console.log("  - Price Recorder:", priceRecorder);
  console.log("  - Pool:", poolAddr);
  console.log();

  // Validate addresses match
  if (priceRecorder.toLowerCase() !== CONFIG.PRICE_RECORDER.toLowerCase()) {
    console.error("❌ CRITICAL: Price Recorder mismatch!");
    console.error("  Expected:", CONFIG.PRICE_RECORDER);
    console.error("  Got:", priceRecorder);
    process.exit(1);
  }

  if (poolAddr.toLowerCase() !== CONFIG.POOL_ADDRESS.toLowerCase()) {
    console.error("❌ CRITICAL: Pool address mismatch!");
    console.error("  Expected:", CONFIG.POOL_ADDRESS);
    console.error("  Got:", poolAddr);
    process.exit(1);
  }

  console.log("✅ Configuration validated!");
  console.log();

  // Save deployment info
  const deploymentInfo = {
    network: network.chainId === 14n ? "flare-mainnet" : "coston2-testnet",
    chainId: Number(network.chainId),
    deployedAt: new Date().toISOString(),
    contractAddress: feedAddress,
    feedId: feedId,
    feedName: CONFIG.FEED_NAME,
    decimals: Number(decimals),
    token0: {
      address: token0Address,
      symbol: token0Symbol,
      decimals: Number(token0Decimals),
    },
    token1: {
      address: token1Address,
      symbol: token1Symbol,
      decimals: Number(token1Decimals),
    },
    priceRecorderAddress: CONFIG.PRICE_RECORDER,
    poolAddress: CONFIG.POOL_ADDRESS,
    fdcVerificationAddress: fdcVerificationAddress,
    invertPrice: invertPrice,
    owner: owner,
    deployer: deployer.address,
  };

  try {
    mkdirSync("deployments", { recursive: true });
    const filename = `deployments/custom-feed-${CONFIG.ALIAS.toLowerCase()}.json`;
    writeFileSync(filename, JSON.stringify(deploymentInfo, null, 2));
    console.log("💾 Deployment info saved to:", filename);
  } catch (err) {
    console.warn("⚠️  Could not save deployment file:", err.message);
  }
  console.log();

  // Summary
  console.log("=".repeat(60));
  console.log("📦 Deployment Complete!");
  console.log("=".repeat(60));
  console.log();
  console.log("Contract Address:", feedAddress);
  console.log("Feed ID:", feedId);
  console.log("Feed Alias:", CONFIG.ALIAS);
  console.log();
  console.log("🔗 View on FlareScan:");
  console.log(`   https://flare-explorer.flare.network/address/${feedAddress}`);
  console.log();
  console.log("=".repeat(60));
  console.log();

  // Next steps
  console.log("📝 Next Steps:");
  console.log();
  console.log("1. Add feed address to .env:");
  console.log(`   CUSTOM_FEED_ADDRESS_${CONFIG.ALIAS}=${feedAddress}`);
  console.log();
  console.log("2. Start the bot:");
  console.log(`   npm run bot:start`);
  console.log();
  console.log("3. Test feed read:");
  console.log(`   FEED_ALIAS=${CONFIG.ALIAS} npm run test:feed`);
  console.log();
  console.log("=".repeat(60));

  return feedAddress;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error();
    console.error("❌ Deployment failed!");
    console.error();
    console.error(error);
    process.exit(1);
  });

