/**
 * PriceRecorder Deployment Script
 * 
 * Deploys the PriceRecorder helper contract to Flare mainnet.
 * 
 * Usage:
 *   npx hardhat run scripts/deploy-price-recorder.js --network flare
 * 
 * Environment Variables:
 *   DEPLOYER_PRIVATE_KEY - Private key for deployment wallet
 *   FLARE_RPC_URL - RPC endpoint (optional, defaults to public endpoint)
 *   POOL_ADDRESS - (Optional) Pool to enable after deployment
 */

import hre from "hardhat";
import "dotenv/config";

// Configuration
const CONFIG = {
  // Initial update interval (5 minutes = 300 seconds)
  UPDATE_INTERVAL: parseInt(process.env.UPDATE_INTERVAL || "300"),
  
  // Optional: Pool to enable after deployment
  POOL_ADDRESS: process.env.POOL_ADDRESS,
};

async function main() {
  console.log("=".repeat(60));
  console.log("🚀 PriceRecorder Deployment Script");
  console.log("=".repeat(60));
  console.log();

  // Get deployer account
  const [deployer] = await hre.ethers.getSigners();
  console.log("📝 Deployer address:", deployer.address);
  
  // Check balance
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("💰 Deployer balance:", hre.ethers.formatEther(balance), "FLR");
  console.log();

  if (balance < hre.ethers.parseEther("1")) {
    console.warn("⚠️  WARNING: Low FLR balance. You may need at least 1 FLR for deployment.");
    console.log();
  }

  // Get network info
  const network = await hre.ethers.provider.getNetwork();
  console.log("🌐 Network:", network.name);
  console.log("🔗 Chain ID:", network.chainId.toString());
  console.log();

  // Confirm deployment
  console.log("📋 Deployment Configuration:");
  console.log("  - Update Interval:", CONFIG.UPDATE_INTERVAL, "seconds (", CONFIG.UPDATE_INTERVAL / 60, "minutes)");
  if (CONFIG.POOL_ADDRESS) {
    console.log("  - Pool to Enable:", CONFIG.POOL_ADDRESS);
  }
  console.log();

  // Deploy contract
  console.log("🔨 Deploying PriceRecorder contract...");
  const PriceRecorder = await hre.ethers.getContractFactory("PriceRecorder");
  const recorder = await PriceRecorder.deploy(CONFIG.UPDATE_INTERVAL);
  
  await recorder.waitForDeployment();
  const recorderAddress = await recorder.getAddress();
  
  console.log("✅ PriceRecorder deployed to:", recorderAddress);
  console.log();

  // Verify deployment
  console.log("🔍 Verifying deployment...");
  const owner = await recorder.owner();
  const isRecording = await recorder.isRecording();
  const updateInterval = await recorder.updateInterval();
  
  console.log("  - Owner:", owner);
  console.log("  - Is Recording:", isRecording);
  console.log("  - Update Interval:", updateInterval.toString(), "seconds");
  console.log();

  // Enable pool if provided
  if (CONFIG.POOL_ADDRESS) {
    console.log("🏊 Enabling pool...");
    try {
      const enableTx = await recorder.enablePool(CONFIG.POOL_ADDRESS);
      console.log("  - Transaction hash:", enableTx.hash);
      await enableTx.wait();
      console.log("  ✅ Pool enabled!");
      console.log();

      // Verify pool info
      console.log("📊 Pool Information:");
      const poolInfo = await recorder.getPoolInfo(CONFIG.POOL_ADDRESS);
      const isEnabled = await recorder.enabledPools(CONFIG.POOL_ADDRESS);
      console.log("  - Token0:", poolInfo.token0);
      console.log("  - Token1:", poolInfo.token1);
      console.log("  - Fee:", poolInfo.fee.toString());
      console.log("  - Enabled:", isEnabled);
      console.log();
    } catch (error) {
      console.error("  ❌ Failed to enable pool:", error.message);
      console.log();
    }
  }

  // Summary
  console.log("=".repeat(60));
  console.log("📦 Deployment Summary");
  console.log("=".repeat(60));
  console.log();
  console.log("Contract Address:", recorderAddress);
  console.log("Owner:", owner);
  console.log("Update Interval:", CONFIG.UPDATE_INTERVAL, "seconds");
  console.log();
  console.log("🔗 View on FlareScan:");
  console.log(`   https://flare-explorer.flare.network/address/${recorderAddress}`);
  console.log();
  console.log("=".repeat(60));
  console.log();

  // Next steps
  console.log("📝 Next Steps:");
  console.log();
  console.log("1. Add contract address to .env:");
  console.log(`   PRICE_RECORDER_ADDRESS=${recorderAddress}`);
  console.log();
  console.log("2. Enable your V3 pool:");
  console.log(`   POOL_ADDRESS=0xYourPoolAddress npm run enable:pool`);
  console.log();
  console.log("3. Deploy custom feed for the pool:");
  console.log(`   FEED_ALIAS=TOKEN0_TOKEN1_DEX npm run deploy:feed`);
  console.log();
  console.log("4. Start the bot:");
  console.log(`   npm run bot:start`);
  console.log();
  console.log("=".repeat(60));

  return recorderAddress;
}

// Run deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error();
    console.error("❌ Deployment failed!");
    console.error();
    console.error(error);
    process.exit(1);
  });

