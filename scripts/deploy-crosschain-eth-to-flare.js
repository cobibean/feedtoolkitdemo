#!/usr/bin/env node
/**
 * Cross-Chain Deployment: ETH Mainnet → Flare Mainnet
 * 
 * Complete end-to-end deployment and test of cross-chain price feed:
 * 
 * 1. Deploy PriceRecorder on Ethereum Mainnet
 * 2. Deploy PoolPriceCustomFeed on Flare Mainnet
 * 3. Enable pool on PriceRecorder
 * 4. Record price on Ethereum
 * 5. Request FDC attestation on Flare
 * 6. Wait for finalization
 * 7. Retrieve proof and update feed
 * 
 * Usage:
 *   node scripts/deploy-crosschain-eth-to-flare.js
 * 
 * Environment Variables:
 *   DEPLOYER_PRIVATE_KEY - Private key with ETH and FLR
 */

import { ethers } from 'ethers';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  // RPCs - using reliable public endpoints
  ethRpc: process.env.ETH_RPC_URL || 'https://ethereum-rpc.publicnode.com',
  flareRpc: process.env.FLARE_RPC_URL || 'https://flare-api.flare.network/ext/bc/C/rpc',
  
  // Private key
  privateKey: process.env.DEPLOYER_PRIVATE_KEY,
  
  // Pool to track: WETH/USDC 0.05% on Ethereum (most liquid)
  poolAddress: '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640',
  feedAlias: 'ETH_USDC_UNISWAP',
  
  // Update interval (5 minutes)
  updateInterval: 300,
  
  // FDC Configuration
  fdcHub: '0xc25c749DC27Efb1864Cb3DADa8845B7687eB2d44',
  relay: '0x57a4c3676d08Aa5d15410b5A6A80fBcEF72f3F45',
  contractRegistry: '0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019',
  fdcVerifierUrl: 'https://fdc-verifiers-mainnet.flare.network/verifier/eth/EVMTransaction/prepareRequest',
  daLayerUrl: 'https://flr-data-availability.flare.network',
  fdcApiKey: '00000000-0000-0000-0000-000000000000',
  
  // Source IDs
  ethSourceId: '0x4554480000000000000000000000000000000000000000000000000000000000',
  evmTransactionType: '0x45564d5472616e73616374696f6e000000000000000000000000000000000000',
};

// ============================================
// ABIs
// ============================================

const PRICE_RECORDER_ABI = [
  'constructor(uint256 _updateInterval)',
  'function enablePool(address pool) external',
  'function recordPrice(address pool) external returns (uint160 sqrtPriceX96, int24 tick, uint128 liquidity)',
  'function enabledPools(address) external view returns (bool)',
  'function canUpdate(address pool) external view returns (bool)',
  'function owner() external view returns (address)',
  'function updateInterval() external view returns (uint256)',
  'event PriceRecorded(address indexed pool, uint160 sqrtPriceX96, int24 tick, uint128 liquidity, address token0, address token1, uint256 timestamp, uint256 blockNumber)',
];

const POOL_PRICE_FEED_ABI = [
  'constructor(address _priceRecorder, address _poolAddress, string memory _feedName, address _fdcVerification, uint8 _token0Decimals, uint8 _token1Decimals, bool _invertPrice)',
  'function updateFromProof(bytes32[] calldata _merkleProof, bytes calldata _response) external',
  'function getCurrentPrice() external view returns (uint256 price, uint256 timestamp, uint256 roundId)',
  'function feedId() external view returns (string)',
  'function owner() external view returns (address)',
  'function priceRecorderAddress() external view returns (address)',
  'function poolAddress() external view returns (address)',
  'function acceptingUpdates() external view returns (bool)',
];

const POOL_ABI = [
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
];

const ERC20_ABI = [
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)',
];

const CONTRACT_REGISTRY_ABI = [
  'function getContractAddressByName(string name) external view returns (address)',
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

// ============================================
// HELPER FUNCTIONS
// ============================================

function loadContractBytecode(contractName) {
  const artifactPath = path.join(process.cwd(), 'artifacts', 'contracts', `${contractName}.sol`, `${contractName}.json`);
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Contract artifact not found: ${artifactPath}. Run 'npm run compile' first.`);
  }
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  return artifact.bytecode;
}

async function waitForTx(provider, hash, confirmations = 1) {
  console.log(`  ⏳ Waiting for ${confirmations} confirmation(s)...`);
  const receipt = await provider.waitForTransaction(hash, confirmations, 120000);
  if (receipt.status === 0) {
    throw new Error(`Transaction failed: ${hash}`);
  }
  return receipt;
}

// ============================================
// MAIN DEPLOYMENT FLOW
// ============================================

async function main() {
  console.log('═'.repeat(70));
  console.log('🚀 Cross-Chain Deployment: ETH Mainnet → Flare Mainnet');
  console.log('═'.repeat(70));
  console.log();
  
  // Validate private key
  if (!CONFIG.privateKey) {
    throw new Error('DEPLOYER_PRIVATE_KEY not set in environment');
  }
  
  // Create providers and wallets
  const ethProvider = new ethers.JsonRpcProvider(CONFIG.ethRpc);
  const flareProvider = new ethers.JsonRpcProvider(CONFIG.flareRpc);
  
  const ethWallet = new ethers.Wallet(CONFIG.privateKey, ethProvider);
  const flareWallet = new ethers.Wallet(CONFIG.privateKey, flareProvider);
  
  console.log('📝 Deployer Address:', ethWallet.address);
  console.log();
  
  // Check balances
  const ethBalance = await ethProvider.getBalance(ethWallet.address);
  const flareBalance = await flareProvider.getBalance(flareWallet.address);
  
  console.log('💰 Balances:');
  console.log(`  - ETH (Ethereum): ${ethers.formatEther(ethBalance)} ETH`);
  console.log(`  - FLR (Flare):    ${ethers.formatEther(flareBalance)} FLR`);
  console.log();
  
  if (ethBalance < ethers.parseEther('0.001')) {
    throw new Error('Insufficient ETH balance. Need at least 0.001 ETH for deployment.');
  }
  
  // Warn if low but try anyway since gas can be very cheap
  if (ethBalance < ethers.parseEther('0.005')) {
    console.log('  ⚠️  WARNING: Low ETH balance. Deployment may fail if gas prices spike.');
    console.log();
  }
  
  if (flareBalance < ethers.parseEther('5')) {
    throw new Error('Insufficient FLR balance. Need at least 5 FLR for deployment and attestation.');
  }
  
  // Get pool info from Ethereum
  console.log('─'.repeat(70));
  console.log('📊 STEP 1: Get Pool Information from Ethereum');
  console.log('─'.repeat(70));
  
  const pool = new ethers.Contract(CONFIG.poolAddress, POOL_ABI, ethProvider);
  const token0Addr = await pool.token0();
  const token1Addr = await pool.token1();
  
  const token0 = new ethers.Contract(token0Addr, ERC20_ABI, ethProvider);
  const token1 = new ethers.Contract(token1Addr, ERC20_ABI, ethProvider);
  
  const [token0Symbol, token0Decimals, token1Symbol, token1Decimals] = await Promise.all([
    token0.symbol(),
    token0.decimals(),
    token1.symbol(),
    token1.decimals(),
  ]);
  
  console.log(`  Pool: ${CONFIG.poolAddress}`);
  console.log(`  Token0: ${token0Symbol} (${token0Addr}) - ${token0Decimals} decimals`);
  console.log(`  Token1: ${token1Symbol} (${token1Addr}) - ${token1Decimals} decimals`);
  console.log();
  
  // Get current price
  const [sqrtPriceX96] = await pool.slot0();
  const Q96 = 2n ** 96n;
  const ethPriceScaled = (Q96 * Q96 * (10n ** 24n)) / (sqrtPriceX96 * sqrtPriceX96);
  const currentEthPrice = Number(ethPriceScaled) / 1e12;
  console.log(`  Current ETH Price: ~$${currentEthPrice.toFixed(2)} USD`);
  console.log();
  
  // =========================================
  // STEP 2: Deploy PriceRecorder on Ethereum
  // =========================================
  console.log('─'.repeat(70));
  console.log('📦 STEP 2: Deploy PriceRecorder on Ethereum Mainnet');
  console.log('─'.repeat(70));
  
  const priceRecorderBytecode = loadContractBytecode('PriceRecorder');
  const priceRecorderInterface = new ethers.Interface(PRICE_RECORDER_ABI);
  const priceRecorderDeployData = priceRecorderBytecode + priceRecorderInterface.encodeDeploy([CONFIG.updateInterval]).slice(2);
  
  console.log('  Deploying PriceRecorder...');
  const ethGasPrice = (await ethProvider.getFeeData()).gasPrice;
  console.log(`  Gas price: ${ethers.formatUnits(ethGasPrice, 'gwei')} gwei`);
  
  const priceRecorderDeployTx = await ethWallet.sendTransaction({
    data: priceRecorderDeployData,
    gasLimit: 2000000,
  });
  
  console.log(`  Tx: ${priceRecorderDeployTx.hash}`);
  const priceRecorderReceipt = await waitForTx(ethProvider, priceRecorderDeployTx.hash, 2);
  const priceRecorderAddress = priceRecorderReceipt.contractAddress;
  
  console.log(`  ✅ PriceRecorder deployed: ${priceRecorderAddress}`);
  console.log(`  Gas used: ${priceRecorderReceipt.gasUsed.toString()}`);
  console.log();
  
  // =========================================
  // STEP 3: Deploy PoolPriceCustomFeed on Flare
  // =========================================
  console.log('─'.repeat(70));
  console.log('📦 STEP 3: Deploy PoolPriceCustomFeed on Flare Mainnet');
  console.log('─'.repeat(70));
  
  // Get FdcVerification address from registry
  const registry = new ethers.Contract(CONFIG.contractRegistry, CONTRACT_REGISTRY_ABI, flareProvider);
  const fdcVerificationAddress = await registry.getContractAddressByName('FdcVerification');
  console.log(`  FdcVerification: ${fdcVerificationAddress}`);
  
  const customFeedBytecode = loadContractBytecode('PoolPriceCustomFeed');
  const customFeedInterface = new ethers.Interface(POOL_PRICE_FEED_ABI);
  
  // Deploy with: priceRecorder (on ETH), pool (on ETH), feedName, fdcVerification, token0Decimals, token1Decimals, invertPrice
  // For USDC/WETH pool, we want to show WETH price in USDC, so invertPrice = true (since token0=USDC, token1=WETH)
  const invertPrice = true;
  
  const customFeedDeployData = customFeedBytecode + customFeedInterface.encodeDeploy([
    priceRecorderAddress,
    CONFIG.poolAddress,
    CONFIG.feedAlias,
    fdcVerificationAddress,
    token0Decimals,
    token1Decimals,
    invertPrice,
  ]).slice(2);
  
  console.log('  Deploying PoolPriceCustomFeed...');
  
  const customFeedDeployTx = await flareWallet.sendTransaction({
    data: customFeedDeployData,
    gasLimit: 3000000,
    gasPrice: ethers.parseUnits('25', 'gwei'),
  });
  
  console.log(`  Tx: ${customFeedDeployTx.hash}`);
  const customFeedReceipt = await waitForTx(flareProvider, customFeedDeployTx.hash, 1);
  const customFeedAddress = customFeedReceipt.contractAddress;
  
  console.log(`  ✅ PoolPriceCustomFeed deployed: ${customFeedAddress}`);
  console.log(`  Gas used: ${customFeedReceipt.gasUsed.toString()}`);
  console.log();
  
  // =========================================
  // STEP 4: Enable Pool on PriceRecorder
  // =========================================
  console.log('─'.repeat(70));
  console.log('🔓 STEP 4: Enable Pool on PriceRecorder (Ethereum)');
  console.log('─'.repeat(70));
  
  const priceRecorder = new ethers.Contract(priceRecorderAddress, PRICE_RECORDER_ABI, ethWallet);
  
  console.log('  Enabling pool...');
  const enableTx = await priceRecorder.enablePool(CONFIG.poolAddress);
  console.log(`  Tx: ${enableTx.hash}`);
  await waitForTx(ethProvider, enableTx.hash, 2);
  
  const isEnabled = await priceRecorder.enabledPools(CONFIG.poolAddress);
  console.log(`  ✅ Pool enabled: ${isEnabled}`);
  console.log();
  
  // =========================================
  // STEP 5: Record Price on Ethereum
  // =========================================
  console.log('─'.repeat(70));
  console.log('📝 STEP 5: Record Price on Ethereum');
  console.log('─'.repeat(70));
  
  console.log('  Recording price...');
  const recordTx = await priceRecorder.recordPrice(CONFIG.poolAddress);
  console.log(`  Tx: ${recordTx.hash}`);
  const recordReceipt = await waitForTx(ethProvider, recordTx.hash, 2);
  
  console.log(`  ✅ Price recorded!`);
  console.log(`  Block: ${recordReceipt.blockNumber}`);
  console.log(`  Gas used: ${recordReceipt.gasUsed.toString()}`);
  console.log();
  
  // Parse PriceRecorded event
  const priceRecordedEvent = recordReceipt.logs.find(log => {
    try {
      const parsed = priceRecorder.interface.parseLog(log);
      return parsed?.name === 'PriceRecorded';
    } catch {
      return false;
    }
  });
  
  if (priceRecordedEvent) {
    const parsed = priceRecorder.interface.parseLog(priceRecordedEvent);
    console.log('  Event data:');
    console.log(`    - sqrtPriceX96: ${parsed.args.sqrtPriceX96.toString()}`);
    console.log(`    - tick: ${parsed.args.tick}`);
    console.log(`    - liquidity: ${parsed.args.liquidity.toString()}`);
    console.log();
  }
  
  // =========================================
  // STEP 6: Request FDC Attestation on Flare
  // =========================================
  console.log('─'.repeat(70));
  console.log('🔐 STEP 6: Request FDC Attestation on Flare');
  console.log('─'.repeat(70));
  
  // Wait for more confirmations on Ethereum (FDC needs ~12-15)
  console.log('  Waiting for additional confirmations on Ethereum (FDC needs 12+)...');
  const currentBlock = await ethProvider.getBlockNumber();
  const confirmations = currentBlock - recordReceipt.blockNumber;
  
  if (confirmations < 12) {
    const blocksNeeded = 12 - confirmations;
    console.log(`  Currently ${confirmations} confirmations, need ${blocksNeeded} more (~${blocksNeeded * 12}s)...`);
    await new Promise(resolve => setTimeout(resolve, blocksNeeded * 12000 + 10000)); // Extra buffer
  }
  
  // Prepare attestation request
  console.log('  Preparing attestation request via FDC verifier...');
  
  const attestationRequestBody = {
    attestationType: CONFIG.evmTransactionType,
    sourceId: CONFIG.ethSourceId,
    requestBody: {
      transactionHash: recordTx.hash,
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
    console.log('  Verifier response:', JSON.stringify(verifierResponse.data));
    throw new Error(`FDC verifier did not return abiEncodedRequest. Status: ${verifierResponse.data?.status}`);
  }
  
  const requestBytes = verifierResponse.data.abiEncodedRequest;
  console.log(`  ✅ Request prepared (${requestBytes.length} bytes)`);
  
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
    console.log(`  Using fallback fee: ${ethers.formatEther(attestationFee)} FLR`);
  }
  
  // Submit attestation request
  console.log('  Submitting attestation request to FdcHub...');
  const attestTx = await fdcHub.requestAttestation(requestBytes, {
    value: attestationFee,
    gasLimit: 500000,
  });
  
  console.log(`  Tx: ${attestTx.hash}`);
  const attestReceipt = await waitForTx(flareProvider, attestTx.hash, 1);
  console.log(`  ✅ Attestation requested!`);
  
  // Get voting round ID
  const relay = new ethers.Contract(CONFIG.relay, RELAY_ABI, flareProvider);
  const attestBlock = await flareProvider.getBlock(attestReceipt.blockNumber);
  const votingRoundId = await relay.getVotingRoundId(attestBlock.timestamp);
  console.log(`  Voting Round: ${votingRoundId.toString()}`);
  console.log();
  
  // =========================================
  // STEP 7: Wait for Finalization
  // =========================================
  console.log('─'.repeat(70));
  console.log('⏳ STEP 7: Wait for Finalization (~90-180 seconds)');
  console.log('─'.repeat(70));
  
  const attestationType = 200; // EVMTransaction
  const maxWaitSeconds = 300;
  const startTime = Date.now();
  const endTime = startTime + (maxWaitSeconds * 1000);
  
  let finalized = false;
  while (Date.now() < endTime) {
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
  // STEP 8: Retrieve Proof from DA Layer
  // =========================================
  console.log('─'.repeat(70));
  console.log('📥 STEP 8: Retrieve Proof from DA Layer');
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
    throw new Error('Failed to retrieve proof from DA Layer');
  }
  
  const responseHex = proofResponse.data.response_hex;
  const merkleProof = proofResponse.data.proof || [];
  
  console.log(`  ✅ Proof retrieved!`);
  console.log(`  Response hex length: ${responseHex.length}`);
  console.log(`  Merkle proof items: ${merkleProof.length}`);
  console.log();
  
  // =========================================
  // STEP 9: Update Feed with Proof
  // =========================================
  console.log('─'.repeat(70));
  console.log('📊 STEP 9: Update Feed with Proof on Flare');
  console.log('─'.repeat(70));
  
  const customFeed = new ethers.Contract(customFeedAddress, POOL_PRICE_FEED_ABI, flareWallet);
  
  console.log('  Submitting proof to feed...');
  const updateTx = await customFeed.updateFromProof(merkleProof, responseHex, {
    gasLimit: 1000000,
  });
  
  console.log(`  Tx: ${updateTx.hash}`);
  await waitForTx(flareProvider, updateTx.hash, 1);
  console.log(`  ✅ Feed updated!`);
  console.log();
  
  // =========================================
  // STEP 10: Verify Final State
  // =========================================
  console.log('─'.repeat(70));
  console.log('✅ STEP 10: Verify Final State');
  console.log('─'.repeat(70));
  
  const [price, timestamp, roundId] = await customFeed.getCurrentPrice();
  const feedId = await customFeed.feedId();
  
  // Convert price to human readable
  const priceNumber = Number(price) / 1e18;
  const priceDate = new Date(Number(timestamp) * 1000);
  
  console.log(`  Feed ID: ${feedId}`);
  console.log(`  Price: ${priceNumber.toFixed(2)} USD per ETH`);
  console.log(`  Timestamp: ${priceDate.toISOString()}`);
  console.log(`  Round ID: ${roundId.toString()}`);
  console.log();
  
  // =========================================
  // SUMMARY
  // =========================================
  console.log('═'.repeat(70));
  console.log('🎉 DEPLOYMENT COMPLETE!');
  console.log('═'.repeat(70));
  console.log();
  console.log('Deployed Contracts:');
  console.log(`  PriceRecorder (Ethereum): ${priceRecorderAddress}`);
  console.log(`  CustomFeed (Flare):       ${customFeedAddress}`);
  console.log();
  console.log('Pool Configuration:');
  console.log(`  Pool Address: ${CONFIG.poolAddress}`);
  console.log(`  Pair: ${token0Symbol}/${token1Symbol}`);
  console.log(`  Feed Alias: ${CONFIG.feedAlias}`);
  console.log();
  console.log('Current Feed State:');
  console.log(`  Price: $${priceNumber.toFixed(2)} per ETH`);
  console.log(`  Last Update: ${priceDate.toISOString()}`);
  console.log();
  console.log('Explorer Links:');
  console.log(`  ETH PriceRecorder: https://etherscan.io/address/${priceRecorderAddress}`);
  console.log(`  FLR CustomFeed:    https://flare-explorer.flare.network/address/${customFeedAddress}`);
  console.log();
  
  // Save deployment info
  const deploymentInfo = {
    timestamp: new Date().toISOString(),
    deployer: ethWallet.address,
    sourceChain: {
      name: 'Ethereum',
      chainId: 1,
      priceRecorderAddress,
      poolAddress: CONFIG.poolAddress,
    },
    destinationChain: {
      name: 'Flare',
      chainId: 14,
      customFeedAddress,
    },
    pool: {
      address: CONFIG.poolAddress,
      token0: { symbol: token0Symbol, address: token0Addr, decimals: token0Decimals },
      token1: { symbol: token1Symbol, address: token1Addr, decimals: token1Decimals },
    },
    feed: {
      alias: CONFIG.feedAlias,
      invertPrice,
      initialPrice: priceNumber,
    },
    transactions: {
      priceRecorderDeploy: priceRecorderDeployTx.hash,
      customFeedDeploy: customFeedDeployTx.hash,
      enablePool: enableTx.hash,
      recordPrice: recordTx.hash,
      requestAttestation: attestTx.hash,
      updateFeed: updateTx.hash,
    },
  };
  
  fs.mkdirSync('deployments', { recursive: true });
  fs.writeFileSync(
    'deployments/crosschain-eth-to-flare.json',
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log('💾 Deployment info saved to: deployments/crosschain-eth-to-flare.json');
  console.log();
  console.log('═'.repeat(70));
}

main().catch((error) => {
  console.error();
  console.error('❌ Deployment failed!');
  console.error(error);
  process.exit(1);
});
