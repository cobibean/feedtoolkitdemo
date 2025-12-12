import { createClient } from '@supabase/supabase-js';

// Check if we should use the database (for hosted demo) or local JSON (for self-hosted)
export const USE_DATABASE = process.env.NEXT_PUBLIC_USE_DATABASE === 'true';

// Only create client if database mode is enabled
export const supabase = USE_DATABASE
  ? createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  : null;

// Database types matching the Supabase schema (cross-chain v2.0.0)
export interface DbFeed {
  id: string;
  alias: string;
  network: string;
  
  // Source chain info
  source_chain_id: number;
  source_chain_name: string;
  source_chain_category: string;
  source_pool_address: string;
  
  // Flare contract addresses
  custom_feed_address: string;
  price_recorder_address: string | null;
  price_relay_address: string | null;
  
  // Pool address (legacy compatibility)
  pool_address: string;
  
  // Token info
  token0_address: string;
  token0_symbol: string;
  token0_decimals: number;
  token1_address: string;
  token1_symbol: string;
  token1_decimals: number;
  
  invert_price: boolean;
  
  // Metadata
  deployed_at: string;
  deployed_by: string;
  created_at: string;
  updated_at: string;
}

export interface DbRecorder {
  id: string;
  chain_id: number;
  chain_name: string;
  address: string;
  update_interval: number;
  deployed_at: string;
  deployed_by: string;
  created_at: string;
}

export interface DbRelay {
  id: string;
  address: string;
  min_relay_interval: number;
  max_price_age: number;
  supported_chains: number[];
  deployed_at: string;
  deployed_by: string;
  created_at: string;
}
