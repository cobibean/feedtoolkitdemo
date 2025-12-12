#!/usr/bin/env node
/**
 * Retry Update Proof
 * 
 * Re-submits the proof for an existing attestation with correct format.
 */

import { ethers } from 'ethers';
import axios from 'axios';
import 'dotenv/config';

const CONFIG = {
  flareRpc: 'https://flare-api.flare.network/ext/bc/C/rpc',
  privateKey: process.env.DEPLOYER_PRIVATE_KEY,
  customFeedAddress: '0x9153FC81332b75219AF5cA89eaaf530AE7D2d221',
  priceRecorderAddress: '0x4158CdC115D59D10F1462903f0f0B1Cefc1679B1',
  
  // From previous successful attestation
  recordTxHash: '0x131f54147efe0902bfd143f8451109d5f5354bd2ccaa483236a53f77b23f5a8a',
  
  // FDC
  fdcVerifierUrl: 'https://fdc-verifiers-mainnet.flare.network/verifier/eth/EVMTransaction/prepareRequest',
  daLayerUrl: 'https://flr-data-availability.flare.network',
  fdcApiKey: '00000000-0000-0000-0000-000000000000',
  ethSourceId: '0x4554480000000000000000000000000000000000000000000000000000000000',
  evmTransactionType: '0x45564d5472616e73616374696f6e000000000000000000000000000000000000',
};

// Full ABI for updateFromProof
const CUSTOM_FEED_ABI = [
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
  'function priceRecorderAddress() view returns (address)',
];

async function main() {
  console.log('═'.repeat(70));
  console.log('🔄 Retry Update Proof');
  console.log('═'.repeat(70));
  console.log();
  
  const flareProvider = new ethers.JsonRpcProvider(CONFIG.flareRpc);
  const flareWallet = new ethers.Wallet(CONFIG.privateKey, flareProvider);
  
  console.log('Wallet:', flareWallet.address);
  console.log('Feed:', CONFIG.customFeedAddress);
  console.log('Record Tx:', CONFIG.recordTxHash);
  console.log();
  
  // Step 1: Get request bytes from verifier
  console.log('📝 Getting request bytes from verifier...');
  
  const attestationRequestBody = {
    attestationType: CONFIG.evmTransactionType,
    sourceId: CONFIG.ethSourceId,
    requestBody: {
      transactionHash: CONFIG.recordTxHash,
      requiredConfirmations: '12',
      provideInput: false,
      listEvents: true,
      logIndices: [],
    },
  };
  
  const verifierResponse = await axios.post(CONFIG.fdcVerifierUrl, attestationRequestBody, {
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': CONFIG.fdcApiKey,
    },
    timeout: 30000,
  });
  
  if (!verifierResponse.data?.abiEncodedRequest) {
    console.log('Verifier response:', JSON.stringify(verifierResponse.data));
    throw new Error('Verifier did not return valid request');
  }
  
  const requestBytes = verifierResponse.data.abiEncodedRequest;
  console.log(`  ✅ Request bytes: ${requestBytes.substring(0, 50)}...`);
  console.log();
  
  // Step 2: Try to find the voting round ID by scanning recent attestations
  // For now, use the known voting round from our previous attestation
  const votingRoundId = 1189519;
  
  console.log(`📥 Retrieving proof for voting round ${votingRoundId}...`);
  
  const proofResponse = await axios.post(
    `${CONFIG.daLayerUrl}/api/v1/fdc/proof-by-request-round-raw`,
    {
      votingRoundId: votingRoundId,
      requestBytes: requestBytes,
    },
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    }
  );
  
  if (!proofResponse.data?.response_hex) {
    console.log('DA Layer response:', JSON.stringify(proofResponse.data));
    throw new Error('Failed to retrieve proof');
  }
  
  const responseHex = proofResponse.data.response_hex;
  const merkleProof = proofResponse.data.proof || [];
  
  console.log(`  ✅ Proof retrieved`);
  console.log(`  Response hex length: ${responseHex.length}`);
  console.log(`  Merkle proof items: ${merkleProof.length}`);
  console.log();
  
  // Step 3: Decode response
  console.log('🔧 Decoding response...');
  
  const RESPONSE_TYPE = '(bytes32 attestationType, bytes32 sourceId, uint64 votingRound, uint64 lowestUsedTimestamp, (bytes32 transactionHash, uint16 requiredConfirmations, bool provideInput, bool listEvents, uint32[] logIndices) requestBody, (uint64 blockNumber, uint64 timestamp, address sourceAddress, bool isDeployment, address receivingAddress, uint256 value, bytes input, uint8 status, (uint32 logIndex, address emitterAddress, bytes32[] topics, bytes data, bool removed)[] events) responseBody)';
  
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const decodedResponse = abiCoder.decode([RESPONSE_TYPE], responseHex)[0];
  
  console.log('  Decoded fields:');
  console.log(`    - attestationType: ${decodedResponse.attestationType}`);
  console.log(`    - sourceId: ${decodedResponse.sourceId}`);
  console.log(`    - votingRound: ${decodedResponse.votingRound}`);
  console.log(`    - blockNumber: ${decodedResponse.responseBody.blockNumber}`);
  console.log(`    - receivingAddress: ${decodedResponse.responseBody.receivingAddress}`);
  console.log(`    - status: ${decodedResponse.responseBody.status}`);
  console.log(`    - events: ${decodedResponse.responseBody.events.length}`);
  
  // Check if receivingAddress matches priceRecorder
  if (decodedResponse.responseBody.receivingAddress.toLowerCase() !== CONFIG.priceRecorderAddress.toLowerCase()) {
    console.log();
    console.log(`  ⚠️  WARNING: receivingAddress doesn't match expected priceRecorder!`);
    console.log(`    Expected: ${CONFIG.priceRecorderAddress}`);
    console.log(`    Got: ${decodedResponse.responseBody.receivingAddress}`);
  }
  console.log();
  
  // Step 4: Build proof struct
  console.log('📦 Building proof struct...');
  
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
  
  console.log('  ✅ Proof struct ready');
  console.log();
  
  // Step 5: Submit to feed
  console.log('📤 Submitting proof to feed...');
  
  // Use Interface to encode the call data manually
  const iface = new ethers.Interface(CUSTOM_FEED_ABI);
  const callData = iface.encodeFunctionData('updateFromProof', [proofStruct]);
  
  console.log(`  Call data length: ${callData.length}`);
  console.log(`  Call data (first 100): ${callData.substring(0, 100)}...`);
  
  const updateTx = await flareWallet.sendTransaction({
    to: CONFIG.customFeedAddress,
    data: callData,
    gasLimit: 1500000,
  });
  
  console.log(`  Tx: ${updateTx.hash}`);
  console.log('  Waiting for confirmation...');
  
  const receipt = await flareProvider.waitForTransaction(updateTx.hash, 1, 120000);
  
  if (receipt.status === 0) {
    console.log();
    console.log('❌ Transaction reverted on-chain!');
    console.log('  Gas used:', receipt.gasUsed.toString());
    console.log();
    console.log('Checking revert reason...');
    
    // Try to simulate the call to get revert reason
    try {
      await flareProvider.call({
        to: CONFIG.customFeedAddress,
        data: callData,
        from: flareWallet.address,
      });
    } catch (e) {
      console.log('  Revert reason:', e.message);
    }
    
    process.exit(1);
  }
  
  console.log(`  ✅ Transaction confirmed!`);
  console.log(`  Gas used: ${receipt.gasUsed.toString()}`);
  console.log();
  
  // Step 6: Verify
  console.log('✅ VERIFICATION');
  console.log('─'.repeat(50));
  
  const latestValue = await customFeed.latestValue();
  const lastTimestamp = await customFeed.lastUpdateTimestamp();
  const updateCount = await customFeed.updateCount();
  
  const priceNumber = Number(latestValue) / 1e6;
  const priceDate = new Date(Number(lastTimestamp) * 1000);
  
  console.log(`  Latest Value: ${latestValue.toString()}`);
  console.log(`  Price: $${priceNumber.toFixed(2)} per ETH`);
  console.log(`  Timestamp: ${priceDate.toISOString()}`);
  console.log(`  Update Count: ${updateCount.toString()}`);
  console.log();
  
  console.log('═'.repeat(70));
  console.log('🎉 SUCCESS!');
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
