#!/usr/bin/env node
/**
 * Redeploy CustomFeed on Flare
 * 
 * Deploys a new PoolPriceCustomFeed with fixed overflow calculation
 */

import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

const CONFIG = {
  flareRpc: 'https://flare-api.flare.network/ext/bc/C/rpc',
  privateKey: process.env.DEPLOYER_PRIVATE_KEY,
  
  // Existing PriceRecorder on Ethereum (already deployed and working)
  priceRecorderAddress: '0x4158CdC115D59D10F1462903f0f0B1Cefc1679B1',
  
  // Pool on Ethereum
  poolAddress: '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640',
  
  // Feed config
  feedAlias: 'ETH_USDC_UNISWAP',
  token0Decimals: 6,  // USDC
  token1Decimals: 18, // WETH
  invertPrice: true,  // Show ETH price in USDC
  
  // Flare contract registry
  contractRegistry: '0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019',
};

const CONTRACT_REGISTRY_ABI = [
  'function getContractAddressByName(string name) external view returns (address)',
];

function loadContractBytecode() {
  const artifactPath = path.join(process.cwd(), 'artifacts', 'contracts', 'PoolPriceCustomFeed.sol', 'PoolPriceCustomFeed.json');
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  return artifact.bytecode;
}

async function main() {
  console.log('═'.repeat(70));
  console.log('🔄 Redeploy PoolPriceCustomFeed on Flare');
  console.log('═'.repeat(70));
  console.log();
  
  const provider = new ethers.JsonRpcProvider(CONFIG.flareRpc);
  const wallet = new ethers.Wallet(CONFIG.privateKey, provider);
  
  console.log('Wallet:', wallet.address);
  
  const balance = await provider.getBalance(wallet.address);
  console.log('Balance:', ethers.formatEther(balance), 'FLR');
  console.log();
  
  // Get FdcVerification address
  console.log('Getting FdcVerification address...');
  const registry = new ethers.Contract(CONFIG.contractRegistry, CONTRACT_REGISTRY_ABI, provider);
  const fdcVerificationAddress = await registry.getContractAddressByName('FdcVerification');
  console.log('  FdcVerification:', fdcVerificationAddress);
  console.log();
  
  // Deploy
  console.log('Deploying PoolPriceCustomFeed...');
  
  const bytecode = loadContractBytecode();
  const iface = new ethers.Interface([
    'constructor(address _priceRecorder, address _poolAddress, string memory _feedName, address _fdcVerificationAddress, uint8 _token0Decimals, uint8 _token1Decimals, bool _invertPrice)'
  ]);
  
  const deployData = bytecode + iface.encodeDeploy([
    CONFIG.priceRecorderAddress,
    CONFIG.poolAddress,
    CONFIG.feedAlias,
    fdcVerificationAddress,
    CONFIG.token0Decimals,
    CONFIG.token1Decimals,
    CONFIG.invertPrice,
  ]).slice(2);
  
  const tx = await wallet.sendTransaction({
    data: deployData,
    gasLimit: 3000000,
    gasPrice: ethers.parseUnits('25', 'gwei'),
  });
  
  console.log('  Tx:', tx.hash);
  console.log('  Waiting for confirmation...');
  
  const receipt = await tx.wait();
  const feedAddress = receipt.contractAddress;
  
  console.log('  ✅ Deployed:', feedAddress);
  console.log('  Gas used:', receipt.gasUsed.toString());
  console.log();
  
  // Verify
  console.log('Verifying deployment...');
  
  const FEED_ABI = [
    'function priceRecorderAddress() view returns (address)',
    'function poolAddress() view returns (address)',
    'function token0Decimals() view returns (uint8)',
    'function token1Decimals() view returns (uint8)',
    'function invertPrice() view returns (bool)',
    'function acceptingUpdates() view returns (bool)',
  ];
  
  const feed = new ethers.Contract(feedAddress, FEED_ABI, provider);
  
  console.log('  priceRecorderAddress:', await feed.priceRecorderAddress());
  console.log('  poolAddress:', await feed.poolAddress());
  console.log('  token0Decimals:', await feed.token0Decimals());
  console.log('  token1Decimals:', await feed.token1Decimals());
  console.log('  invertPrice:', await feed.invertPrice());
  console.log('  acceptingUpdates:', await feed.acceptingUpdates());
  console.log();
  
  console.log('═'.repeat(70));
  console.log('🎉 DEPLOYMENT COMPLETE!');
  console.log('═'.repeat(70));
  console.log();
  console.log('New Feed Address:', feedAddress);
  console.log('Explorer:', `https://flare-explorer.flare.network/address/${feedAddress}`);
  console.log();
  console.log('Update CONFIG.customFeedAddress in retry-update-proof.js to:', feedAddress);
  console.log();
}

main().catch((error) => {
  console.error('❌ Failed!');
  console.error(error);
  process.exit(1);
});
