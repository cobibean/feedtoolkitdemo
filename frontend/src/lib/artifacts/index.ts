// Contract artifacts - pre-compiled and bundled with the frontend
// Users don't need to compile contracts themselves

export { PRICE_RECORDER_ABI, PRICE_RECORDER_BYTECODE } from './PriceRecorder';
export { 
  POOL_PRICE_CUSTOM_FEED_ABI, 
  POOL_PRICE_CUSTOM_FEED_BYTECODE,
  CONTRACT_REGISTRY,
  CONTRACT_REGISTRY_ABI,
} from './PoolPriceCustomFeed';

// Phase 2: Cross-chain relay support
export { PRICE_RELAY_ABI, PRICE_RELAY_BYTECODE } from './PriceRelay';
export {
  CROSSCHAIN_POOL_PRICE_CUSTOM_FEED_ABI,
  CROSSCHAIN_POOL_PRICE_CUSTOM_FEED_BYTECODE,
} from './CrossChainPoolPriceCustomFeed';
