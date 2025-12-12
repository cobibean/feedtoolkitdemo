/**
 * Test Manual Price Recording
 * 
 * Tests the recordPrice() function manually to verify the
 * PriceRecorder contract is working correctly.
 * 
 * Usage:
 *   POOL_ADDRESS=0x... npm run test:record
 *   # Or with hardhat directly:
 *   npx hardhat run scripts/test-record-price.js --network flare
 * 
 * Prerequisites:
 *   - PriceRecorder deployed and PRICE_RECORDER_ADDRESS in .env
 *   - Pool enabled on PriceRecorder
 */

import hre from "hardhat";
import "dotenv/config";

const PRICE_RECORDER_ADDRESS = process.env.PRICE_RECORDER_ADDRESS;
const POOL_ADDRESS = process.env.POOL_ADDRESS;

async function main() {
  console.log("=".repeat(60));
  console.log("🧪 Test Manual Price Recording");
  console.log("=".repeat(60));
  console.log();

  if (!PRICE_RECORDER_ADDRESS) {
    throw new Error("PRICE_RECORDER_ADDRESS not set in .env");
  }

  if (!POOL_ADDRESS) {
    throw new Error("POOL_ADDRESS not set. Use: POOL_ADDRESS=0x... npm run test:record");
  }

  const [signer] = await hre.ethers.getSigners();
  console.log("📝 Caller:", signer.address);
  console.log("📍 PriceRecorder:", PRICE_RECORDER_ADDRESS);
  console.log("🏊 Pool:", POOL_ADDRESS);
  console.log();

  // Load contract
  const PriceRecorder = await hre.ethers.getContractFactory("PriceRecorder");
  const recorder = PriceRecorder.attach(PRICE_RECORDER_ADDRESS);

  // Check if pool is enabled
  const isEnabled = await recorder.enabledPools(POOL_ADDRESS);
  console.log("✅ Pool enabled:", isEnabled);
  
  if (!isEnabled) {
    throw new Error("Pool not enabled! Run: POOL_ADDRESS=0x... npm run enable:pool");
  }

  // Check if we can update
  const canUpdate = await recorder.canUpdate(POOL_ADDRESS);
  console.log("🔍 Can update:", canUpdate);

  if (!canUpdate) {
    const timeUntilNext = await recorder.timeUntilNextUpdate(POOL_ADDRESS);
    console.log("⏳ Time until next update:", timeUntilNext.toString(), "seconds");
    console.log();
    console.log("⚠️  Cannot update yet. Waiting for interval to elapse...");
    return;
  }

  console.log();

  // Get pool info before
  const poolInfoBefore = await recorder.getPoolInfo(POOL_ADDRESS);
  console.log("📊 Pool info before:");
  console.log("  - Update count:", poolInfoBefore.updateCount.toString());
  console.log("  - Last update:", poolInfoBefore.lastUpdate.toString());
  console.log();

  // Record price
  console.log("🚀 Recording price...");
  const tx = await recorder.recordPrice(POOL_ADDRESS);
  console.log("  - Transaction hash:", tx.hash);
  console.log("  - Waiting for confirmation...");
  
  const receipt = await tx.wait();
  console.log("  ✅ Transaction confirmed!");
  console.log("  - Block number:", receipt.blockNumber);
  console.log("  - Gas used:", receipt.gasUsed.toString());
  console.log();

  // Parse event
  console.log("📋 Event logs:");
  const priceRecordedEvent = receipt.logs.find(log => {
    try {
      const parsed = recorder.interface.parseLog(log);
      return parsed?.name === "PriceRecorded";
    } catch {
      return false;
    }
  });

  if (priceRecordedEvent) {
    const parsed = recorder.interface.parseLog(priceRecordedEvent);
    console.log("  ✅ PriceRecorded event found!");
    console.log("  - Pool:", parsed.args.pool);
    console.log("  - sqrtPriceX96:", parsed.args.sqrtPriceX96.toString());
    console.log("  - Tick:", parsed.args.tick.toString());
    console.log("  - Liquidity:", parsed.args.liquidity.toString());
    console.log("  - Token0:", parsed.args.token0);
    console.log("  - Token1:", parsed.args.token1);
    console.log("  - Timestamp:", parsed.args.timestamp.toString());
    console.log("  - Block number:", parsed.args.blockNumber.toString());
    console.log();

    // Calculate human-readable price
    const sqrtPriceX96 = parsed.args.sqrtPriceX96;
    const Q96 = 2n ** 96n;
    const price = (sqrtPriceX96 * sqrtPriceX96 * (10n ** 6n)) / (Q96 * Q96);
    console.log("  💵 Human-readable price:", (Number(price) / 1e6).toFixed(6));
  } else {
    console.log("  ⚠️  PriceRecorded event not found in logs");
  }
  console.log();

  // Get pool info after
  const poolInfoAfter = await recorder.getPoolInfo(POOL_ADDRESS);
  console.log("📊 Pool info after:");
  console.log("  - Update count:", poolInfoAfter.updateCount.toString());
  console.log("  - Last update:", poolInfoAfter.lastUpdate.toString());
  console.log();

  console.log("=".repeat(60));
  console.log("✅ Test Complete!");
  console.log("=".repeat(60));
  console.log();
  console.log("🔗 View transaction on FlareScan:");
  console.log(`   https://flare-explorer.flare.network/tx/${tx.hash}`);
  console.log();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error();
    console.error("❌ Test failed!");
    console.error();
    console.error(error);
    process.exit(1);
  });

