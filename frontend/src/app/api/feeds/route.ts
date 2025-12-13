import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { FeedsData, StoredFeed, StoredRecorder, StoredRelay } from '@/lib/types';
import { createClient } from '@supabase/supabase-js';

// Storage mode is selected at runtime via cookie (set from the Settings page).
// Defaults to Local JSON if cookie is missing.
const STORAGE_MODE_COOKIE = 'flare_feeds_storage_mode';

// Supabase client (only created if env vars exist)
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ? createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )
  : null;

// ============ LOCAL JSON STORAGE ============
const DATA_PATH = join(process.cwd(), 'data', 'feeds.json');
const TEMPLATE_PATH = join(process.cwd(), 'data', 'feeds.template.json');

function getDefaultData(): FeedsData {
  return { version: '2.0.0', feeds: [], recorders: [], relays: [] };
}

function readLocalData(): FeedsData {
  try {
    if (!existsSync(DATA_PATH)) {
      // Bootstrap from template if available (useful for first run / self-hosted)
      if (existsSync(TEMPLATE_PATH)) {
        const template = JSON.parse(readFileSync(TEMPLATE_PATH, 'utf-8')) as FeedsData;
        writeFileSync(DATA_PATH, JSON.stringify(template, null, 2));
        return template;
      }
      return getDefaultData();
    }
    const content = readFileSync(DATA_PATH, 'utf-8');
    return JSON.parse(content) as FeedsData;
  } catch {
    return getDefaultData();
  }
}

function writeLocalData(data: FeedsData): void {
  writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

// ============ SUPABASE STORAGE ============
async function readSupabaseData(includeArchived: boolean): Promise<FeedsData> {
  if (!supabase) return getDefaultData();
  
  try {
    let feedsQuery = supabase.from('feeds').select('*');
    let recordersQuery = supabase.from('recorders').select('*');
    let relaysQuery = supabase.from('relays').select('*');

    // Default: hide archived items (archived_at is null = active)
    if (!includeArchived) {
      feedsQuery = feedsQuery.is('archived_at', null);
      recordersQuery = recordersQuery.is('archived_at', null);
      relaysQuery = relaysQuery.is('archived_at', null);
    }

    const [feedsResult, recordersResult, relaysResult] = await Promise.all([
      feedsQuery,
      recordersQuery,
      relaysQuery,
    ]);

    // Transform database format to app format
    const feeds: StoredFeed[] = (feedsResult.data || []).map((f) => ({
      id: f.id,
      alias: f.alias,
      network: f.network as 'flare' | 'coston2',
      
      // Source chain info (v2.0.0)
      sourceChain: {
        id: f.source_chain_id || 14,
        name: f.source_chain_name || 'Flare',
        category: (f.source_chain_category || 'direct') as 'direct' | 'relay',
      },
      sourcePoolAddress: (f.source_pool_address || f.pool_address) as `0x${string}`,
      
      // Legacy field
      poolAddress: f.pool_address as `0x${string}`,
      
      // Contract addresses
      customFeedAddress: f.custom_feed_address as `0x${string}`,
      priceRecorderAddress: f.price_recorder_address as `0x${string}` | undefined,
      priceRelayAddress: f.price_relay_address as `0x${string}` | undefined,
      
      token0: {
        address: (f.token0_address || '0x0') as `0x${string}`,
        symbol: f.token0_symbol || 'TOKEN0',
        decimals: f.token0_decimals,
      },
      token1: {
        address: (f.token1_address || '0x0') as `0x${string}`,
        symbol: f.token1_symbol || 'TOKEN1',
        decimals: f.token1_decimals,
      },
      invertPrice: f.invert_price,
      deployedAt: f.deployed_at,
      deployedBy: f.deployed_by as `0x${string}`,
      archivedAt: f.archived_at ?? undefined,
    }));

    const recorders: StoredRecorder[] = (recordersResult.data || []).map((r) => ({
      id: r.id,
      address: r.address as `0x${string}`,
      chainId: r.chain_id,
      chainName: r.chain_name,
      // Legacy network field for compatibility
      network: r.chain_id === 14 ? 'flare' : 'coston2',
      updateInterval: r.update_interval,
      deployedAt: r.deployed_at,
      deployedBy: r.deployed_by as `0x${string}`,
      archivedAt: r.archived_at ?? undefined,
    }));

    const relays: StoredRelay[] = (relaysResult.data || []).map((r) => ({
      id: r.id,
      address: r.address as `0x${string}`,
      minRelayInterval: r.min_relay_interval,
      maxPriceAge: r.max_price_age,
      supportedChainIds: r.supported_chains || [],
      deployedAt: r.deployed_at,
      deployedBy: r.deployed_by as `0x${string}`,
      archivedAt: r.archived_at ?? undefined,
    }));

    return { version: '2.0.0', feeds, recorders, relays };
  } catch (error) {
    console.error('Error reading from Supabase:', error);
    return getDefaultData();
  }
}

async function addSupabaseFeed(feed: StoredFeed): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Database not configured' };

  try {
    const { error } = await supabase.from('feeds').insert({
      id: feed.id,
      alias: feed.alias,
      network: feed.network,
      
      // Source chain info
      source_chain_id: feed.sourceChain?.id || 14,
      source_chain_name: feed.sourceChain?.name || 'Flare',
      source_chain_category: feed.sourceChain?.category || 'direct',
      source_pool_address: feed.sourcePoolAddress || feed.poolAddress,
      
      // Legacy
      pool_address: feed.poolAddress,
      
      // Contract addresses
      custom_feed_address: feed.customFeedAddress,
      price_recorder_address: feed.priceRecorderAddress || null,
      price_relay_address: feed.priceRelayAddress || null,
      
      // Tokens
      token0_address: feed.token0.address,
      token0_symbol: feed.token0.symbol,
      token0_decimals: feed.token0.decimals,
      token1_address: feed.token1.address,
      token1_symbol: feed.token1.symbol,
      token1_decimals: feed.token1.decimals,
      
      invert_price: feed.invertPrice,
      deployed_at: feed.deployedAt,
      deployed_by: feed.deployedBy,
    });

    if (error) {
      console.error('Supabase insert error:', error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (error) {
    console.error('Error adding feed to Supabase:', error);
    return { success: false, error: 'Failed to save feed' };
  }
}

async function addSupabaseRecorder(recorder: StoredRecorder): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Database not configured' };

  try {
    const { error } = await supabase.from('recorders').insert({
      id: recorder.id,
      address: recorder.address,
      chain_id: recorder.chainId || 14,
      chain_name: recorder.chainName || 'Flare',
      update_interval: recorder.updateInterval,
      deployed_at: recorder.deployedAt,
      deployed_by: recorder.deployedBy,
    });

    if (error) {
      console.error('Supabase insert error:', error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (error) {
    console.error('Error adding recorder to Supabase:', error);
    return { success: false, error: 'Failed to save recorder' };
  }
}

async function addSupabaseRelay(relay: StoredRelay): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Database not configured' };

  try {
    const { error } = await supabase.from('relays').insert({
      id: relay.id,
      address: relay.address,
      min_relay_interval: relay.minRelayInterval,
      max_price_age: relay.maxPriceAge,
      supported_chains: relay.supportedChainIds || [],
      deployed_at: relay.deployedAt,
      deployed_by: relay.deployedBy,
    });

    if (error) {
      console.error('Supabase insert error:', error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (error) {
    console.error('Error adding relay to Supabase:', error);
    return { success: false, error: 'Failed to save relay' };
  }
}

async function deleteFromSupabase(id: string, type: 'feed' | 'recorder' | 'relay'): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Database not configured' };

  try {
    const tableMap = { feed: 'feeds', recorder: 'recorders', relay: 'relays' };
    const table = tableMap[type];
    const { error } = await supabase.from(table).delete().eq('id', id);

    if (error) {
      console.error('Supabase delete error:', error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (error) {
    console.error('Error deleting from Supabase:', error);
    return { success: false, error: 'Failed to delete' };
  }
}

function getStorageMode(req: NextRequest): 'local' | 'database' {
  // First check query param (used by server-side bot fetch which can't send cookies)
  const { searchParams } = new URL(req.url);
  const queryMode = searchParams.get('storageMode');
  if (queryMode === 'database' || queryMode === 'local') {
    return queryMode;
  }
  // Fall back to cookie (used by browser requests)
  const value = req.cookies.get(STORAGE_MODE_COOKIE)?.value;
  return value === 'database' ? 'database' : 'local';
}

function getIncludeArchived(req: NextRequest): boolean {
  const { searchParams } = new URL(req.url);
  return searchParams.get('includeArchived') === 'true';
}

// ============ API HANDLERS ============

// GET - Read all feeds, recorders, and relays
export async function GET(req: NextRequest) {
  try {
    const mode = getStorageMode(req);
    const includeArchived = getIncludeArchived(req);
    
    console.log(`[Feeds API] GET request - mode: ${mode}, includeArchived: ${includeArchived}`);

    if (mode === 'database') {
      if (!supabase) {
        console.error('[Feeds API] Database mode requested but Supabase not configured. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY env vars.');
        return NextResponse.json({ error: 'Database not configured. Check Supabase environment variables.' }, { status: 400 });
      }
      const data = await readSupabaseData(includeArchived);
      console.log(`[Feeds API] Supabase returned ${data.feeds.length} feeds, ${data.recorders.length} recorders, ${data.relays?.length || 0} relays`);
      return NextResponse.json(data);
    }

    const data = readLocalData();
    if (!includeArchived) {
      return NextResponse.json({
        ...data,
        feeds: data.feeds.filter(f => !f.archivedAt),
        recorders: data.recorders.filter(r => !r.archivedAt),
        relays: (data.relays || []).filter(r => !r.archivedAt),
      });
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error reading feeds:', error);
    return NextResponse.json(getDefaultData());
  }
}

// POST - Add new feed, recorder, or relay
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, ...item } = body;

    const mode = getStorageMode(req);

    if (mode === 'database') {
      // Database mode
      if (!supabase) {
        return NextResponse.json({ error: 'Database not configured' }, { status: 400 });
      }
      if (type === 'recorder') {
        const result = await addSupabaseRecorder(item as StoredRecorder);
        if (!result.success) {
          return NextResponse.json({ error: result.error }, { status: 400 });
        }
      } else if (type === 'relay') {
        const result = await addSupabaseRelay(item as StoredRelay);
        if (!result.success) {
          return NextResponse.json({ error: result.error }, { status: 400 });
        }
      } else {
        const result = await addSupabaseFeed(item as StoredFeed);
        if (!result.success) {
          return NextResponse.json({ error: result.error }, { status: 400 });
        }
      }
      const data = await readSupabaseData(false);
      return NextResponse.json({ success: true, data });
    } else {
      // Local JSON mode
      const data = readLocalData();

      if (type === 'recorder') {
        const recorder = item as StoredRecorder;
        const exists = data.recorders.some(r => 
          r.address.toLowerCase() === recorder.address.toLowerCase()
        );
        if (exists) {
          return NextResponse.json(
            { error: 'Recorder already exists' },
            { status: 400 }
          );
        }
        data.recorders.push(recorder);
      } else if (type === 'relay') {
        const relay = item as StoredRelay;
        // Initialize relays array if it doesn't exist
        if (!data.relays) {
          data.relays = [];
        }
        const exists = data.relays.some(r => 
          r.address.toLowerCase() === relay.address.toLowerCase()
        );
        if (exists) {
          return NextResponse.json(
            { error: 'Relay already exists' },
            { status: 400 }
          );
        }
        data.relays.push(relay);
      } else {
        const feed = item as StoredFeed;
        const exists = data.feeds.some(f => 
          f.customFeedAddress.toLowerCase() === feed.customFeedAddress.toLowerCase()
        );
        if (exists) {
          return NextResponse.json(
            { error: 'Feed already exists' },
            { status: 400 }
          );
        }
        data.feeds.push(feed);
      }

      // Update version to 2.0.0 if adding relay
      if (type === 'relay' && data.version === '1.0.0') {
        data.version = '2.0.0';
      }

      writeLocalData(data);
      return NextResponse.json({ success: true, data });
    }
  } catch (error) {
    console.error('Error saving data:', error);
    return NextResponse.json(
      { error: 'Failed to save data' },
      { status: 500 }
    );
  }
}

// DELETE - Remove feed, recorder, or relay by ID
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const type = (searchParams.get('type') || 'feed') as 'feed' | 'recorder' | 'relay';

    if (!id) {
      return NextResponse.json(
        { error: 'ID is required' },
        { status: 400 }
      );
    }

    const mode = getStorageMode(req);

    if (mode === 'database') {
      if (!supabase) {
        return NextResponse.json({ error: 'Database not configured' }, { status: 400 });
      }
      const result = await deleteFromSupabase(id, type);
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({ success: true });
    } else {
      const data = readLocalData();

      if (type === 'recorder') {
        data.recorders = data.recorders.filter(r => r.id !== id);
      } else if (type === 'relay') {
        if (data.relays) {
          data.relays = data.relays.filter(r => r.id !== id);
        }
      } else {
        data.feeds = data.feeds.filter(f => f.id !== id);
      }

      writeLocalData(data);
      return NextResponse.json({ success: true });
    }
  } catch (error) {
    console.error('Error deleting data:', error);
    return NextResponse.json(
      { error: 'Failed to delete data' },
      { status: 500 }
    );
  }
}

// PATCH - Archive or restore feed/recorder/relay by ID
export async function PATCH(req: NextRequest) {
  try {
    const mode = getStorageMode(req);
    const body = await req.json();
    const id = body?.id as string | undefined;
    const type = (body?.type || 'feed') as 'feed' | 'recorder' | 'relay';
    const action = (body?.action || '') as 'archive' | 'restore';

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }
    if (action !== 'archive' && action !== 'restore') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    if (mode === 'database') {
      if (!supabase) {
        return NextResponse.json({ error: 'Database not configured' }, { status: 400 });
      }

      const tableMap = { feed: 'feeds', recorder: 'recorders', relay: 'relays' } as const;
      const table = tableMap[type];
      const archived_at = action === 'archive' ? new Date().toISOString() : null;

      const { error } = await supabase
        .from(table)
        .update({ archived_at })
        .eq('id', id);

      if (error) {
        console.error('Supabase archive update error:', error);
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({ success: true });
    }

    // Local JSON mode
    const data = readLocalData();
    const archivedAt = action === 'archive' ? new Date().toISOString() : undefined;

    if (type === 'recorder') {
      data.recorders = data.recorders.map(r => (r.id === id ? { ...r, archivedAt } : r));
    } else if (type === 'relay') {
      data.relays = (data.relays || []).map(r => (r.id === id ? { ...r, archivedAt } : r));
    } else {
      data.feeds = data.feeds.map(f => (f.id === id ? { ...f, archivedAt } : f));
    }

    writeLocalData(data);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error archiving/restoring:', error);
    return NextResponse.json({ error: 'Failed to update archive status' }, { status: 500 });
  }
}
