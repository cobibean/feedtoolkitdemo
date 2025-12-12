const assert = require("assert");
const { ethers } = require("hardhat");

async function setNextTimestamp(ts) {
  await ethers.provider.send("evm_setNextBlockTimestamp", [ts]);
  await ethers.provider.send("evm_mine", []);
}

describe("PriceRelay", function () {
  it("enforces owner and relayer permissions and basic relay guards", async function () {
    const [owner, other] = await ethers.getSigners();

    const PriceRelay = await ethers.getContractFactory("PriceRelay");
    const relay = await PriceRelay.deploy(60, 300);
    await relay.waitForDeployment();

    // Owner only: enableChain
    await assert.rejects(
      relay.connect(other).enableChain(42161),
      /Not owner/
    );
    await (await relay.enableChain(42161)).wait();

    // Owner only: enablePool
    const pool = "0x0000000000000000000000000000000000001000";
    const token0 = "0x0000000000000000000000000000000000002000";
    const token1 = "0x0000000000000000000000000000000000003000";
    await assert.rejects(
      relay.connect(other).enablePool(42161, pool, token0, token1),
      /Not owner/
    );
    await (await relay.enablePool(42161, pool, token0, token1)).wait();

    // Non-authorized relayer cannot relay
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const sqrt = 2n ** 96n; // price ~= 1
    await assert.rejects(
      relay.connect(other).relayPrice(
        42161,
        pool,
        sqrt,
        0,
        1,
        token0,
        token1,
        now,
        1
      ),
      /Not authorized relayer/
    );

    // Authorized relayer can relay
    await (await relay.authorizeRelayer(other.address)).wait();
    const tx = await relay.connect(other).relayPrice(
      42161,
      pool,
      sqrt,
      0,
      1,
      token0,
      token1,
      now,
      1
    );
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    // Monotonic block number enforced
    await setNextTimestamp(now + 61);
    await assert.rejects(
      relay.connect(other).relayPrice(
        42161,
        pool,
        sqrt,
        0,
        1,
        token0,
        token1,
        now + 61,
        1 // same sourceBlockNumber
      ),
      /Stale block number/
    );
  });

  it("allows <=10m future skew and checks price deviation on actual price", async function () {
    const [owner] = await ethers.getSigners();
    const PriceRelay = await ethers.getContractFactory("PriceRelay");
    const relay = await PriceRelay.deploy(60, 300);
    await relay.waitForDeployment();

    await (await relay.enableChain(8453)).wait();
    const pool = "0x0000000000000000000000000000000000001111";
    const token0 = "0x0000000000000000000000000000000000002222";
    const token1 = "0x0000000000000000000000000000000000003333";
    await (await relay.enablePool(8453, pool, token0, token1)).wait();

    const Q96 = 2n ** 96n;
    const oldSqrt = Q96;

    const base = (await ethers.provider.getBlock("latest")).timestamp;

    // First relay (no deviation check)
    await (await relay.relayPrice(8453, pool, oldSqrt, 0, 1, token0, token1, base, 10)).wait();

    // Future skew >10m should revert
    await setNextTimestamp(base + 61);
    await assert.rejects(
      // Note: tx mines in a new block (timestamp may increment by 1), so use +602 to exceed 600s skew reliably.
      relay.relayPrice(8453, pool, oldSqrt, 0, 1, token0, token1, base + 61 + 602, 11),
      /Future timestamp/
    );

    // Future skew <=10m allowed
    await (await relay.relayPrice(8453, pool, oldSqrt, 0, 1, token0, token1, base + 61 + 600, 11)).wait();

    // Rate limit: need to wait minRelayInterval
    await setNextTimestamp(base + 61 + 600 + 61);

    // Small sqrt change (~1.1x) => price ~1.21x => 21% deviation, should pass
    const okSqrt = (Q96 * 11n) / 10n;
    await (await relay.relayPrice(8453, pool, okSqrt, 0, 1, token0, token1, base + 61 + 600 + 61, 12)).wait();

    // Rate limit again
    await setNextTimestamp(base + 61 + 600 + 61 + 61);

    // Large sqrt change (2x) => price 4x => 300% deviation, should revert
    const badSqrt = Q96 * 2n;
    await assert.rejects(
      relay.relayPrice(8453, pool, badSqrt, 0, 1, token0, token1, base + 61 + 600 + 61 + 61, 13),
      /Price deviation too high/
    );
  });
});

