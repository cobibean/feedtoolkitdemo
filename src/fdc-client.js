/**
 * FDC Client Module
 * 
 * Handles FDC (Flare Data Connector) attestation requests and proof retrieval.
 * 
 * Workflow:
 * 1. Request EVMTransaction attestation via FdcHub
 * 2. Wait for finalization (~90-180 seconds)
 * 3. Retrieve proof from DA Layer API
 * 
 * Usage:
 *   import { requestAttestation, waitForProof } from './fdc-client.js';
 */

import axios from "axios";
import { ethers } from "ethers";

// FDC Contract Addresses (Flare Mainnet)
const CONTRACT_REGISTRY = "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019";
const FDC_HUB = "0xc25c749DC27Efb1864Cb3DADa8845B7687eB2d44";
const RELAY = "0x57a4c3676d08Aa5d15410b5A6A80fBcEF72f3F45";
const DA_LAYER_API = "https://flr-data-availability.flare.network";
const VERIFIER_URL = "https://fdc-verifiers-mainnet.flare.network/verifier/flr/EVMTransaction/prepareRequest";
const VERIFIER_API_KEY = process.env.FDC_VERIFIER_API_KEY || "00000000-0000-0000-0000-000000000000"; // Public key

// ABIs
const REGISTRY_ABI = [
  "function getContractAddressByName(string) view returns (address)"
];

const FDC_HUB_ABI = [
  "function requestAttestation(bytes calldata _data) external payable returns (uint256)",
  "function fdcRequestFeeConfigurations() external view returns (address)",
];

const RELAY_ABI = [
  "function isFinalized(uint256 _attestationType, uint256 _votingRound) external view returns (bool)",
  "function getVotingRoundId(uint256 _timestamp) external view returns (uint256)",
];

const FEE_CONFIG_ABI = [
  "function getRequestFee(bytes calldata _data) external view returns (uint256)",
];

/**
 * Prepare EVMTransaction attestation request using Flare's verifier service
 * @param {string} transactionHash - Transaction hash to attest
 * @returns {Promise<string>} ABI-encoded attestation request with MIC
 */
export async function prepareAttestationRequest(transactionHash) {
  console.log("  - Preparing request via Flare verifier service...");

  // Request body for EVMTransaction per Swagger docs
  const requestJson = {
    attestationType: "0x45564d5472616e73616374696f6e000000000000000000000000000000000000", // "EVMTransaction"
    sourceId: "0x464c520000000000000000000000000000000000000000000000000000000000", // "FLR"
    requestBody: {
      transactionHash: transactionHash,
      requiredConfirmations: "1",
      provideInput: false,
      listEvents: true,
      logIndices: [] // Empty array = all events
    }
  };

  try {
    const response = await axios.post(VERIFIER_URL, requestJson, {
      headers: {
        "X-API-KEY": VERIFIER_API_KEY,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });

    if (response.data && response.data.abiEncodedRequest) {
      console.log("  - Request prepared with MIC ✅");
      return response.data.abiEncodedRequest;
    } else {
      throw new Error("Invalid verifier response");
    }
  } catch (error) {
    console.error("  ❌ Verifier service failed:", error.message);
    throw error;
  }
}

/**
 * Request FDC attestation for a transaction
 * @param {ethers.Provider} provider - Ethers provider
 * @param {ethers.Wallet} wallet - Wallet for signing
 * @param {string} transactionHash - Transaction to attest
 * @returns {Promise<{votingRoundId: number, requestBytes: string}>}
 */
export async function requestAttestation(provider, wallet, transactionHash) {
  console.log("📨 Requesting FDC attestation...");
  console.log("  - Transaction:", transactionHash);

  const fdcHub = new ethers.Contract(FDC_HUB, FDC_HUB_ABI, wallet);

  // Prepare request using verifier service (includes MIC calculation)
  const requestBytes = await prepareAttestationRequest(transactionHash);
  console.log("  - Request bytes length:", requestBytes.length);

  // Get fee from FdcRequestFeeConfigurations via FdcHub
  let fee;
  try {
    const feeConfigAddress = await fdcHub.fdcRequestFeeConfigurations();
    console.log("  - FeeConfig address:", feeConfigAddress);

    const feeConfig = new ethers.Contract(feeConfigAddress, FEE_CONFIG_ABI, provider);
    fee = await feeConfig.getRequestFee(requestBytes);
    console.log("  - Attestation fee:", ethers.formatEther(fee), "FLR");
  } catch (error) {
    // Fallback if query fails
    fee = ethers.parseEther("0.5"); // 0.5 FLR fallback
    console.log("  - Using fallback fee:", ethers.formatEther(fee), "FLR");
    console.log("  - (Fee query failed:", error.message + ")");
  }

  // Submit attestation request
  console.log("  - Submitting to FdcHub...");
  console.log("  - Data length:", requestBytes.length);
  console.log("  - Fee:", ethers.formatEther(fee), "FLR");

  const tx = await fdcHub.requestAttestation(requestBytes, {
    value: fee,
    gasLimit: 500000,
  });

  console.log("  - Transaction:", tx.hash);
  console.log("  - Waiting for confirmation...");
  const receipt = await tx.wait();

  if (receipt.status === 0) {
    throw new Error("FdcHub transaction failed - check fee or request format");
  }

  console.log("  ✅ Attestation requested!");
  console.log("  - Block:", receipt.blockNumber);

  // Get voting round ID
  const relay = new ethers.Contract(RELAY, RELAY_ABI, provider);
  const blockTimestamp = (await provider.getBlock(receipt.blockNumber)).timestamp;
  const votingRoundId = await relay.getVotingRoundId(blockTimestamp);

  console.log("  - Voting Round:", votingRoundId.toString());
  console.log();

  return {
    votingRoundId: Number(votingRoundId),
    requestBytes,
  };
}

/**
 * Wait for attestation to finalize
 * @param {ethers.Provider} provider - Ethers provider
 * @param {number} votingRoundId - Voting round ID
 * @param {number} maxWaitSeconds - Maximum seconds to wait (default: 300)
 * @returns {Promise<boolean>}
 */
export async function waitForFinalization(provider, votingRoundId, maxWaitSeconds = 300) {
  console.log("⏳ Waiting for finalization...");
  console.log("  - Voting Round:", votingRoundId);
  console.log("  - Max wait:", maxWaitSeconds, "seconds");
  console.log();

  const relay = new ethers.Contract(RELAY, RELAY_ABI, provider);
  const attestationType = 200; // EVMTransaction = 200

  const startTime = Date.now();
  const endTime = startTime + (maxWaitSeconds * 1000);

  while (Date.now() < endTime) {
    const isFinalized = await relay.isFinalized(attestationType, votingRoundId);

    if (isFinalized) {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      console.log(`  ✅ Finalized after ${elapsed} seconds!`);
      console.log();
      return true;
    }

    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    process.stdout.write(`\r  ⏱️  Waiting... ${elapsed}s elapsed`);

    await new Promise(resolve => setTimeout(resolve, 10000)); // Check every 10s
  }

  console.log();
  console.log("  ❌ Timeout waiting for finalization");
  return false;
}

/**
 * Retrieve proof from DA Layer API
 * @param {number} votingRoundId - Voting round ID
 * @param {string} requestBytes - Original request bytes
 * @returns {Promise<object>} Proof object
 */
export async function retrieveProof(votingRoundId, requestBytes) {
  console.log("📥 Retrieving proof from DA Layer...");
  console.log("  - Voting Round:", votingRoundId);
  console.log("  - Request bytes (first 66 chars):", requestBytes.substring(0, 66));
  console.log("  - API:", DA_LAYER_API);

  const payload = {
    votingRoundId: Number(votingRoundId),
    requestBytes: requestBytes,
  };

  console.log("  - Payload:", JSON.stringify(payload).substring(0, 150));

  try {
    const response = await axios.post(
      `${DA_LAYER_API}/api/v1/fdc/proof-by-request-round-raw`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    if (!response.data || !response.data.response_hex) {
      throw new Error("Invalid response from DA Layer");
    }

    console.log("  ✅ Proof retrieved!");
    console.log("  - Response hex length:", response.data.response_hex.length);
    console.log("  - Merkle proof:", response.data.proof ? "Present" : "None");
    console.log();

    return {
      responseHex: response.data.response_hex,
      merkleProof: response.data.proof || [], // Note: 'proof' not 'proofs'
    };
  } catch (error) {
    console.error();
    console.error("❌ Failed to retrieve proof from DA Layer!");
    console.error("  Error:", error.message);
    if (error.response) {
      console.error("  Status:", error.response.status);
      console.error("  Data:", JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

/**
 * Complete FDC workflow: Request → Wait → Retrieve
 * @param {ethers.Provider} provider - Ethers provider
 * @param {ethers.Wallet} wallet - Wallet for signing
 * @param {string} transactionHash - Transaction to attest
 * @returns {Promise<{responseHex: string, merkleProof: string[], fdcRoundId: number, abiEncodedRequest: string, sourceId: string, attestationType: string}>}
 */
export async function getProofForTransaction(provider, wallet, transactionHash) {
  console.log("=".repeat(60));
  console.log("🔐 FDC Attestation Workflow");
  console.log("=".repeat(60));
  console.log();

  // Step 1: Request attestation
  const { votingRoundId, requestBytes } = await requestAttestation(
    provider,
    wallet,
    transactionHash
  );

  // Step 2: Wait for finalization
  const finalized = await waitForFinalization(provider, votingRoundId);

  if (!finalized) {
    throw new Error("Attestation did not finalize in time");
  }

  // Wait additional 30s for DA Layer to sync
  console.log("⏳ Waiting 30s for DA Layer sync...");
  await new Promise(resolve => setTimeout(resolve, 30000));
  console.log();

  // Step 3: Retrieve proof
  const proof = await retrieveProof(votingRoundId, requestBytes);

  console.log("=".repeat(60));
  console.log("✅ FDC Workflow Complete!");
  console.log("=".repeat(60));
  console.log();

  // Return proof with FDC metadata
  return {
    ...proof,
    fdcRoundId: votingRoundId,
    abiEncodedRequest: requestBytes,
    sourceId: "0x464c520000000000000000000000000000000000000000000000000000000000", // "FLR"
    attestationType: "0x45564d5472616e73616374696f6e000000000000000000000000000000000000", // "EVMTransaction"
  };
}

// Export configuration for use in other scripts
export const FDC_CONFIG = {
  CONTRACT_REGISTRY,
  FDC_HUB,
  RELAY,
  DA_LAYER_API,
  VERIFIER_URL,
};

