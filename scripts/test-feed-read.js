/**
 * Test Custom Feed Read Functions
 * 
 * Tests all IICustomFeed interface functions on deployed contract.
 * 
 * Usage:
 *   FEED_ALIAS=TOKEN0_TOKEN1_DEX npm run test:feed
 *   # Or directly:
 *   node scripts/test-feed-read.js
 */

import "dotenv/config";
import { ethers } from "ethers";

const alias = (process.env.FEED_ALIAS || "").toUpperCase();
const CUSTOM_FEED =
  (alias && process.env[`CUSTOM_FEED_ADDRESS_${alias}`]) ||
  process.env.CUSTOM_FEED_ADDRESS;
const RPC_URL = process.env.FLARE_RPC_URL || "https://flare-api.flare.network/ext/bc/C/rpc";

const ABI = [
  "function feedId() view returns (bytes21)",
  "function read() view returns (uint256)",
  "function decimals() pure returns (int8)",
  "function calculateFee() pure returns (uint256)",
  "function getCurrentFeed() payable returns (uint256, int8, uint64)",
  "function latestValue() view returns (uint256)",
  "function lastUpdateTimestamp() view returns (uint64)",
  "function updateCount() view returns (uint256)",
  "function owner() view returns (address)",
  "function acceptingUpdates() view returns (bool)",
  "function priceRecorderAddress() view returns (address)",
  "function poolAddress() view returns (address)",
  "function token0Decimals() view returns (uint8)",
  "function token1Decimals() view returns (uint8)",
  "function invertPrice() view returns (bool)",
];

async function main() {
  console.log("=".repeat(60));
  console.log("🧪 Test Custom Feed Interface");
  console.log("=".repeat(60));
  console.log();

  if (!CUSTOM_FEED) {
    if (alias) {
      throw new Error(`CUSTOM_FEED_ADDRESS_${alias} not set in .env`);
    }
    throw new Error("CUSTOM_FEED_ADDRESS not set in .env. Use FEED_ALIAS=XXX to specify which feed.");
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const feed = new ethers.Contract(CUSTOM_FEED, ABI, provider);

  console.log("📍 Feed Address:", CUSTOM_FEED);
  if (alias) {
    console.log("📍 Feed Alias:", alias);
  }
  console.log();

  // Test all interface functions
  console.log("📋 IICustomFeed Interface Tests:");
  console.log();

  // feedId()
  const feedId = await feed.feedId();
  console.log("✅ feedId():", feedId);
  console.log("   Starts with 0x21:", feedId.startsWith("0x21") ? "YES ✅" : "NO ❌");
  console.log();

  // decimals()
  const decimals = await feed.decimals();
  console.log("✅ decimals():", decimals.toString());
  console.log();

  // calculateFee()
  const fee = await feed.calculateFee();
  console.log("✅ calculateFee():", fee.toString(), "(free)");
  console.log();

  // Configuration
  console.log("📊 Configuration:");
  const owner = await feed.owner();
  const accepting = await feed.acceptingUpdates();
  const priceRecorder = await feed.priceRecorderAddress();
  const poolAddr = await feed.poolAddress();
  const t0Decimals = await feed.token0Decimals();
  const t1Decimals = await feed.token1Decimals();
  const inverted = await feed.invertPrice();

  console.log("  - Owner:", owner);
  console.log("  - Accepting Updates:", accepting);
  console.log("  - Price Recorder:", priceRecorder);
  console.log("  - Pool:", poolAddr);
  console.log("  - Token0 Decimals:", t0Decimals.toString());
  console.log("  - Token1 Decimals:", t1Decimals.toString());
  console.log("  - Invert Price:", inverted);
  console.log();

  // Current data
  console.log("💾 Current Data:");
  const updateCount = await feed.updateCount();
  console.log("  - Total updates:", updateCount.toString());

  try {
    const latestValue = await feed.latestValue();
    const timestamp = await feed.lastUpdateTimestamp();
    
    if (Number(latestValue) > 0) {
      const price = (Number(latestValue) / 1e6).toFixed(6);
      const date = new Date(Number(timestamp) * 1000);
      
      console.log("  - Latest value:", latestValue.toString(), `(${price})`);
      console.log("  - Timestamp:", timestamp.toString(), `(${date.toISOString()})`);
      console.log();

      // Test read()
      console.log("✅ read():", (Number(await feed.read()) / 1e6).toFixed(6));
      console.log();

      // Test getCurrentFeed()
      const [value, decs, ts] = await feed.getCurrentFeed();
      console.log("✅ getCurrentFeed():");
      console.log("   - Value:", (Number(value) / 1e6).toFixed(6));
      console.log("   - Decimals:", decs.toString());
      console.log("   - Timestamp:", new Date(Number(ts) * 1000).toISOString());
    } else {
      console.log("  ⚠️  No data yet (feed not updated)");
      console.log();
      console.log("⚠️  read() and getCurrentFeed() will revert until first update");
    }
  } catch (error) {
    console.log("  ⚠️  No data available:", error.message);
    console.log("     Expected before first FDC proof submission");
  }

  console.log();
  console.log("=".repeat(60));
  console.log("✅ All Interface Tests Complete!");
  console.log("=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Error:", error);
    process.exit(1);
  });

