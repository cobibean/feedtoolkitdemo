const assert = require("assert");
const { ethers } = require("hardhat");

describe("CrossChainPoolPriceCustomFeed", function () {
  it("updates from a PriceRelayed event in the proof and validates chain/pool", async function () {
    const [deployer, relayer] = await ethers.getSigners();

    const MockFdcVerification = await ethers.getContractFactory("MockFdcVerification");
    const mockFdc = await MockFdcVerification.deploy();
    await mockFdc.waitForDeployment();

    const priceRelayAddress = "0x0000000000000000000000000000000000009999";
    const sourceChainId = 42161n;
    const poolAddress = "0x0000000000000000000000000000000000001111";

    const Feed = await ethers.getContractFactory("CrossChainPoolPriceCustomFeed");
    const feed = await Feed.deploy(
      priceRelayAddress,
      sourceChainId,
      poolAddress,
      "ARB_POOL",
      await mockFdc.getAddress(),
      18,
      18,
      false
    );
    await feed.waitForDeployment();

    // Build PriceRelayed event log for proof
    const sig = "PriceRelayed(uint256,address,uint160,int24,uint128,address,address,uint256,uint256,uint256,address)";
    const topic0 = ethers.keccak256(ethers.toUtf8Bytes(sig));
    const topic1 = ethers.zeroPadValue(ethers.toBeHex(sourceChainId), 32);
    const topic2 = ethers.zeroPadValue(poolAddress, 32);

    const Q96 = 2n ** 96n; // price = 1
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const eventData = abiCoder.encode(
      ["uint160", "int24", "uint128", "address", "address", "uint256", "uint256", "uint256", "address"],
      [Q96, 0, 1, "0x0000000000000000000000000000000000002000", "0x0000000000000000000000000000000000003000", 1000, 12345, 2000, relayer.address]
    );

    const proof = {
      merkleProof: [],
      data: {
        attestationType: ethers.ZeroHash,
        sourceId: ethers.ZeroHash,
        votingRound: 0,
        lowestUsedTimestamp: 0,
        requestBody: {
          transactionHash: ethers.ZeroHash,
          requiredConfirmations: 1,
          provideInput: false,
          listEvents: true,
          logIndices: [],
        },
        responseBody: {
          blockNumber: 1,
          timestamp: 999,
          sourceAddress: relayer.address,
          isDeployment: false,
          receivingAddress: priceRelayAddress,
          value: 0,
          input: "0x",
          status: 1,
          events: [
            {
              logIndex: 0,
              emitterAddress: priceRelayAddress,
              topics: [topic0, topic1, topic2],
              data: eventData,
              removed: false,
            },
          ],
        },
      },
    };

    await (await feed.updateFromProof(proof)).wait();

    // sqrtPriceX96 = Q96 and equal decimals -> latestValue should be 1e6
    const latest = await feed.latestValue();
    const ts = await feed.lastUpdateTimestamp();
    const count = await feed.updateCount();

    assert.equal(latest.toString(), "1000000");
    assert.equal(ts.toString(), "1000");
    assert.equal(count.toString(), "1");

    // Wrong pool should revert
    const badPoolTopic = ethers.zeroPadValue("0x0000000000000000000000000000000000002222", 32);
    const badProof = {
      ...proof,
      data: {
        ...proof.data,
        responseBody: {
          ...proof.data.responseBody,
          events: [
            {
              ...proof.data.responseBody.events[0],
              topics: [topic0, topic1, badPoolTopic],
            },
          ],
        },
      },
    };

    await assert.rejects(feed.updateFromProof(badProof), /Wrong pool/);
  });
});

