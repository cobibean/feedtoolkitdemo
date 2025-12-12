#!/usr/bin/env node
/**
 * Complete Cross-Chain Attestation
 * 
 * Retries FDC attestation for an already-recorded price.
 * Use this after deployment if the attestation step failed.
 * 
 * Usage:
 *   RECORD_TX=0x... node scripts/complete-crosschain-attestation.js
 */

import { ethers } from 'ethers';
import axios from 'axios';
import fs from 'fs';
import 'dotenv/config';

// ============================================
// CONFIGURATION - Update with deployed addresses
// ============================================

const CONFIG = {
  // RPCs
  ethRpc: process.env.ETH_RPC_URL || 'https://ethereum-rpc.publicnode.com',
  flareRpc: process.env.FLARE_RPC_URL || 'https://flare-api.flare.network/ext/bc/C/rpc',
  
  // Private key
  privateKey: process.env.DEPLOYER_PRIVATE_KEY,
  
  // Deployed contracts (from previous run)
  priceRecorderAddress: process.env.PRICE_RECORDER_ADDRESS || '0x4158CdC115D59D10F1462903f0f0B1Cefc1679B1',
  customFeedAddress: process.env.CUSTOM_FEED_ADDRESS || '0x719c05D4255B0BDf8E80c329169642b711619F73',
  poolAddress: '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640',
  
  // Transaction to attest (from previous run)
  recordTxHash: process.env.RECORD_TX || '0x131f54147efe0902bfd143f8451109d5f5354bd2ccaa483236a53f77b23f5a8a',
  
  // FDC Configuration
  fdcHub: '0xc25c749DC27Efb1864Cb3DADa8845B7687eB2d44',
  relay: '0x57a4c3676d08Aa5d15410b5A6A80fBcEF72f3F45',
  fdcVerifierUrl: 'https://fdc-verifiers-mainnet.flare.network/verifier/eth/EVMTransaction/prepareRequest',
  daLayerUrl: 'https://flr-data-availability.flare.network',
  fdcApiKey: '00000000-0000-0000-0000-000000000000',
  
  // Source IDs
  ethSourceId: '0x4554480000000000000000000000000000000000000000000000000000000000',
  evmTransactionType: '0x45564d5472616e73616374696f6e000000000000000000000000000000000000',
};

// ABIs
// Full ABI for updateFromProof with proper struct
const POOL_PRICE_FEED_ABI = [
  {
    inputs: [
      {
        components: [
          { name: 'merkleProof', type: 'bytes32[]' },
          {
            components: [
              { name: 'attestationType', type: 'bytes32' },
              { name: 'sourceId', type: 'bytes32' },
              { name: 'votingRound', type: 'uint64' },
              { name: 'lowestUsedTimestamp', type: 'uint64' },
              {
                components: [
                  { name: 'transactionHash', type: 'bytes32' },
                  { name: 'requiredConfirmations', type: 'uint16' },
                  { name: 'provideInput', type: 'bool' },
                  { name: 'listEvents', type: 'bool' },
                  { name: 'logIndices', type: 'uint32[]' },
                ],
                name: 'requestBody',
                type: 'tuple',
              },
              {
                components: [
                  { name: 'blockNumber', type: 'uint64' },
                  { name: 'timestamp', type: 'uint64' },
                  { name: 'sourceAddress', type: 'address' },
                  { name: 'isDeployment', type: 'bool' },
                  { name: 'receivingAddress', type: 'address' },
                  { name: 'value', type: 'uint256' },
                  { name: 'input', type: 'bytes' },
                  { name: 'status', type: 'uint8' },
                  {
                    components: [
                      { name: 'logIndex', type: 'uint32' },
                      { name: 'emitterAddress', type: 'address' },
                      { name: 'topics', type: 'bytes32[]' },
                      { name: 'data', type: 'bytes' },
                      { name: 'removed', type: 'bool' },
                    ],
                    name: 'events',
                    type: 'tuple[]',
                  },
                ],
                name: 'responseBody',
                type: 'tuple',
              },
            ],
            name: 'data',
            type: 'tuple',
          },
        ],
        name: '_proof',
        type: 'tuple',
      },
    ],
    name: 'updateFromProof',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  'function latestValue() view returns (uint256)',
  'function lastUpdateTimestamp() view returns (uint64)',
  'function updateCount() view returns (uint256)',
  'function feedId() view returns (bytes21)',
];

const FDC_HUB_ABI = [
  'function requestAttestation(bytes calldata _data) external payable returns (uint256)',
  'function fdcRequestFeeConfigurations() external view returns (address)',
];

const FEE_CONFIG_ABI = [
  'function getRequestFee(bytes calldata _data) external view returns (uint256)',
];

const RELAY_ABI = [
  'function getVotingRoundId(uint256 _timestamp) external view returns (uint256)',
  'function isFinalized(uint256 _attestationType, uint256 _votingRound) external view returns (bool)',
];

async function retryVerifier(txHash, maxRetries = 5, delayMs = 30000) {
  console.log('  Attempting to get attestation request from verifier...');
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`  Attempt ${attempt}/${maxRetries}...`);
    
    const attestationRequestBody = {
      attestationType: CONFIG.evmTransactionType,
      sourceId: CONFIG.ethSourceId,
      requestBody: {
        transactionHash: txHash,
        requiredConfirmations: '12',
        provideInput: false,
        listEvents: true,
        logIndices: [],
      },
    };
    
    try {
      const response = await axios.post(CONFIG.fdcVerifierUrl, attestationRequestBody, {
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': CONFIG.fdcApiKey,
        },
        timeout: 30000,
      });
      
      if (response.data?.abiEncodedRequest) {
        console.log(`  ✅ Success on attempt ${attempt}!`);
        return response.data.abiEncodedRequest;
      }
      
      console.log(`  Status: ${response.data?.status || 'unknown'}`);
      
      if (attempt < maxRetries) {
        console.log(`  Waiting ${delayMs/1000}s before retry...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    } catch (error) {
      console.log(`  Error: ${error.message}`);
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  
  throw new Error('Failed to get valid response from FDC verifier after all retries');
}

async function main() {
  console.log('═'.repeat(70));
  console.log('🔄 Complete Cross-Chain Attestation');
  console.log('═'.repeat(70));
  console.log();
  
  if (!CONFIG.privateKey) {
    throw new Error('DEPLOYER_PRIVATE_KEY not set');
  }
  
  const ethProvider = new ethers.JsonRpcProvider(CONFIG.ethRpc);
  const flareProvider = new ethers.JsonRpcProvider(CONFIG.flareRpc);
  const flareWallet = new ethers.Wallet(CONFIG.privateKey, flareProvider);
  
  console.log('📝 Configuration:');
  console.log(`  - Wallet: ${flareWallet.address}`);
  console.log(`  - Record Tx: ${CONFIG.recordTxHash}`);
  console.log(`  - PriceRecorder: ${CONFIG.priceRecorderAddress}`);
  console.log(`  - CustomFeed: ${CONFIG.customFeedAddress}`);
  console.log();
  
  // Check FLR balance
  const flrBalance = await flareProvider.getBalance(flareWallet.address);
  console.log(`  - FLR Balance: ${ethers.formatEther(flrBalance)} FLR`);
  console.log();
  
  // Check confirmations on ETH
  const tx = await ethProvider.getTransaction(CONFIG.recordTxHash);
  if (!tx) {
    throw new Error(`Transaction not found: ${CONFIG.recordTxHash}`);
  }
  
  const receipt = await ethProvider.getTransactionReceipt(CONFIG.recordTxHash);
  const currentBlock = await ethProvider.getBlockNumber();
  const confirmations = currentBlock - receipt.blockNumber;
  
  console.log(`  - ETH Block: ${receipt.blockNumber}`);
  console.log(`  - Current Block: ${currentBlock}`);
  console.log(`  - Confirmations: ${confirmations}`);
  console.log();
  
  if (confirmations < 12) {
    const blocksNeeded = 12 - confirmations;
    console.log(`  ⚠️  Need ${blocksNeeded} more confirmations. Waiting...`);
    await new Promise(resolve => setTimeout(resolve, blocksNeeded * 12000 + 10000));
  }
  
  // =========================================
  // Get attestation request from verifier
  // =========================================
  console.log('─'.repeat(70));
  console.log('🔐 STEP 1: Request FDC Attestation');
  console.log('─'.repeat(70));
  
  const requestBytes = await retryVerifier(CONFIG.recordTxHash, 5, 30000);
  console.log(`  Request bytes length: ${requestBytes.length}`);
  console.log();
  
  // Get attestation fee
  const fdcHub = new ethers.Contract(CONFIG.fdcHub, FDC_HUB_ABI, flareWallet);
  const feeConfigAddr = await fdcHub.fdcRequestFeeConfigurations();
  const feeConfig = new ethers.Contract(feeConfigAddr, FEE_CONFIG_ABI, flareProvider);
  
  let attestationFee;
  try {
    attestationFee = await feeConfig.getRequestFee(requestBytes);
    console.log(`  Attestation fee: ${ethers.formatEther(attestationFee)} FLR`);
  } catch {
    attestationFee = ethers.parseEther('0.5');
    console.log(`  Using fallback fee: 0.5 FLR`);
  }
  
  // Submit attestation request
  console.log('  Submitting to FdcHub...');
  const attestTx = await fdcHub.requestAttestation(requestBytes, {
    value: attestationFee,
    gasLimit: 500000,
  });
  
  console.log(`  Tx: ${attestTx.hash}`);
  const attestReceipt = await flareProvider.waitForTransaction(attestTx.hash, 1, 120000);
  console.log(`  ✅ Attestation requested!`);
  
  // Get voting round
  const relay = new ethers.Contract(CONFIG.relay, RELAY_ABI, flareProvider);
  const attestBlock = await flareProvider.getBlock(attestReceipt.blockNumber);
  const votingRoundId = await relay.getVotingRoundId(attestBlock.timestamp);
  console.log(`  Voting Round: ${votingRoundId.toString()}`);
  console.log();
  
  // =========================================
  // Wait for finalization
  // =========================================
  console.log('─'.repeat(70));
  console.log('⏳ STEP 2: Wait for Finalization');
  console.log('─'.repeat(70));
  
  const attestationType = 200;
  const maxWaitSeconds = 300;
  const startTime = Date.now();
  
  let finalized = false;
  while (Date.now() - startTime < maxWaitSeconds * 1000) {
    const isFinalized = await relay.isFinalized(attestationType, votingRoundId);
    
    if (isFinalized) {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      console.log(`  ✅ Finalized after ${elapsed} seconds!`);
      finalized = true;
      break;
    }
    
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    process.stdout.write(`\r  ⏱️  Waiting... ${elapsed}s elapsed`);
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
  
  console.log();
  
  if (!finalized) {
    throw new Error('Attestation did not finalize in time');
  }
  
  // Wait for DA Layer sync
  console.log('  Waiting 30s for DA Layer sync...');
  await new Promise(resolve => setTimeout(resolve, 30000));
  console.log();
  
  // =========================================
  // Retrieve proof
  // =========================================
  console.log('─'.repeat(70));
  console.log('📥 STEP 3: Retrieve Proof');
  console.log('─'.repeat(70));
  
  const proofResponse = await axios.post(
    `${CONFIG.daLayerUrl}/api/v1/fdc/proof-by-request-round-raw`,
    {
      votingRoundId: Number(votingRoundId),
      requestBytes: requestBytes,
    },
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    }
  );
  
  if (!proofResponse.data?.response_hex) {
    throw new Error('Failed to retrieve proof');
  }
  
  const responseHex = proofResponse.data.response_hex;
  const merkleProof = proofResponse.data.proof || [];
  
  console.log(`  ✅ Proof retrieved!`);
  console.log(`  Response length: ${responseHex.length}`);
  console.log(`  Merkle proof items: ${merkleProof.length}`);
  console.log();
  
  // =========================================
  // Update feed
  // =========================================
  console.log('─'.repeat(70));
  console.log('📊 STEP 4: Update Feed');
  console.log('─'.repeat(70));
  
  // Decode the response hex to get the structured data
  console.log('  Decoding response data...');
  
  // Response structure type for decoding
  const RESPONSE_TYPE = '(bytes32 attestationType, bytes32 sourceId, uint64 votingRound, uint64 lowestUsedTimestamp, (bytes32 transactionHash, uint16 requiredConfirmations, bool provideInput, bool listEvents, uint32[] logIndices) requestBody, (uint64 blockNumber, uint64 timestamp, address sourceAddress, bool isDeployment, address receivingAddress, uint256 value, bytes input, uint8 status, (uint32 logIndex, address emitterAddress, bytes32[] topics, bytes data, bool removed)[] events) responseBody)';
  
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const decodedResponse = abiCoder.decode([RESPONSE_TYPE], responseHex)[0];
  
  console.log('  Response decoded successfully');
  console.log(`    - attestationType: ${decodedResponse.attestationType.substring(0, 20)}...`);
  console.log(`    - sourceId: ${decodedResponse.sourceId.substring(0, 20)}...`);
  console.log(`    - votingRound: ${decodedResponse.votingRound}`);
  console.log(`    - events count: ${decodedResponse.responseBody.events.length}`);
  
  // Format proof struct matching the contract's expected format
  const proofStruct = {
    merkleProof: merkleProof,
    data: {
      attestationType: decodedResponse.attestationType,
      sourceId: decodedResponse.sourceId,
      votingRound: decodedResponse.votingRound,
      lowestUsedTimestamp: decodedResponse.lowestUsedTimestamp,
      requestBody: {
        transactionHash: decodedResponse.requestBody.transactionHash,
        requiredConfirmations: decodedResponse.requestBody.requiredConfirmations,
        provideInput: decodedResponse.requestBody.provideInput,
        listEvents: decodedResponse.requestBody.listEvents,
        logIndices: [...decodedResponse.requestBody.logIndices],
      },
      responseBody: {
        blockNumber: decodedResponse.responseBody.blockNumber,
        timestamp: decodedResponse.responseBody.timestamp,
        sourceAddress: decodedResponse.responseBody.sourceAddress,
        isDeployment: decodedResponse.responseBody.isDeployment,
        receivingAddress: decodedResponse.responseBody.receivingAddress,
        value: decodedResponse.responseBody.value,
        input: decodedResponse.responseBody.input,
        status: decodedResponse.responseBody.status,
        events: decodedResponse.responseBody.events.map(event => ({
          logIndex: Number(event.logIndex),
          emitterAddress: event.emitterAddress,
          topics: [...event.topics],
          data: event.data,
          removed: event.removed,
        })),
      },
    },
  };
  
  console.log('  Proof struct formatted');
  console.log(`    - receivingAddress: ${proofStruct.data.responseBody.receivingAddress}`);
  console.log(`    - status: ${proofStruct.data.responseBody.status}`);
  
  const customFeed = new ethers.Contract(CONFIG.customFeedAddress, POOL_PRICE_FEED_ABI, flareWallet);
  
  console.log('  Submitting proof to feed...');
  const updateTx = await customFeed.updateFromProof(proofStruct, {
    gasLimit: 1000000,
  });
  
  console.log(`  Tx: ${updateTx.hash}`);
  const updateReceipt = await flareProvider.waitForTransaction(updateTx.hash, 1, 120000);
  
  if (updateReceipt.status === 0) {
    throw new Error('Update transaction reverted on-chain');
  }
  
  console.log(`  ✅ Feed updated!`);
  console.log();
  
  // Verify final state
  console.log('─'.repeat(70));
  console.log('✅ VERIFICATION');
  console.log('─'.repeat(70));
  
  const latestValue = await customFeed.latestValue();
  const lastTimestamp = await customFeed.lastUpdateTimestamp();
  const updateCount = await customFeed.updateCount();
  
  // Price is stored with 6 decimals
  const priceNumber = Number(latestValue) / 1e6;
  const priceDate = new Date(Number(lastTimestamp) * 1000);
  
  console.log(`  Latest Value: ${latestValue.toString()}`);
  console.log(`  Price: $${priceNumber.toFixed(2)} per ETH`);
  console.log(`  Timestamp: ${priceDate.toISOString()}`);
  console.log(`  Update Count: ${updateCount.toString()}`);
  console.log();
  
  console.log('═'.repeat(70));
  console.log('🎉 ATTESTATION COMPLETE!');
  console.log('═'.repeat(70));
  console.log();
  console.log('Feed Address:', CONFIG.customFeedAddress);
  console.log('Explorer:', `https://flare-explorer.flare.network/address/${CONFIG.customFeedAddress}`);
  console.log();
}

main().catch((error) => {
  console.error();
  console.error('❌ Failed!');
  console.error(error);
  process.exit(1);
});
