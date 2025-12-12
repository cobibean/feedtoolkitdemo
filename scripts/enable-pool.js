/**
 * Enable Pool on PriceRecorder
 * 
 * Utility script to enable a new pool on an already-deployed PriceRecorder contract.
 * 
 * Usage:
 *   POOL_ADDRESS=0x... npm run enable:pool
 *   # Or with hardhat directly:
 *   npx hardhat run scripts/enable-pool.js --network flare
 * 
 * Environment Variables:
 *   PRICE_RECORDER_ADDRESS - Deployed contract address
 *   POOL_ADDRESS - Pool to enable
 */

import hre from "hardhat";
import "dotenv/config";

const RECORDER = process.env.PRICE_RECORDER_ADDRESS;
const POOL = process.env.POOL_ADDRESS;

async function main() {
  console.log("=".repeat(60));
  console.log("🏊 Enable Pool on PriceRecorder");
  console.log("=".repeat(60));
  console.log();

  if (!RECORDER) {
    throw new Error("PRICE_RECORDER_ADDRESS not set in .env");
  }

  if (!POOL) {
    throw new Error("POOL_ADDRESS not set. Use: POOL_ADDRESS=0x... npm run enable:pool");
  }

  const [signer] = await hre.ethers.getSigners();
  
  console.log("📝 Signer:", signer.address);
  console.log("📍 PriceRecorder:", RECORDER);
  console.log("🏊 Pool to enable:", POOL);
  console.log();
  
  const recorder = await hre.ethers.getContractAt("PriceRecorder", RECORDER);
  
  // Check if already enabled
  const isAlreadyEnabled = await recorder.enabledPools(POOL);
  if (isAlreadyEnabled) {
    console.log("⚠️  Pool is already enabled!");
    console.log();
    const poolInfo = await recorder.getPoolInfo(POOL);
    console.log("📊 Current pool info:");
    console.log("  - Token0:", poolInfo.token0);
    console.log("  - Token1:", poolInfo.token1);
    console.log("  - Fee:", poolInfo.fee.toString(), "basis points");
    console.log("  - Fee %:", (Number(poolInfo.fee) / 10000) + "%");
    console.log("  - Update count:", poolInfo.updateCount.toString());
    return;
  }
  
  console.log("🚀 Enabling pool...");
  const tx = await recorder.enablePool(POOL);
  console.log("  - Transaction hash:", tx.hash);
  await tx.wait();
  
  console.log("  ✅ Pool enabled!");
  console.log();
  
  const poolInfo = await recorder.getPoolInfo(POOL);
  console.log("📊 Pool info:");
  console.log("  - Token0:", poolInfo.token0);
  console.log("  - Token1:", poolInfo.token1);
  console.log("  - Fee:", poolInfo.fee.toString(), "basis points");
  console.log("  - Fee %:", (Number(poolInfo.fee) / 10000) + "%");
  console.log();
  
  console.log("=".repeat(60));
  console.log("✅ Complete!");
  console.log("=".repeat(60));
  console.log();
  console.log("🔗 View transaction:");
  console.log(`   https://flare-explorer.flare.network/tx/${tx.hash}`);
  console.log();
  console.log("📝 Next step - deploy custom feed:");
  console.log("   FEED_ALIAS=TOKEN0_TOKEN1_DEX npm run deploy:feed");
  console.log();
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error();
    console.error("❌ Failed to enable pool!");
    console.error();
    console.error(error);
    process.exit(1);
  });

