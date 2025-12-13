import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Database-only cleanup endpoint.
// Deletes archived items older than 30 days.
//
// Note: In production you likely want to protect this endpoint (e.g. cron secret),
// and use a service role key / server-side auth with appropriate RLS policies.

const supabase =
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    : null;

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function GET() {
  try {
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 400 });
    }

    const cutoffIso = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();

    const [feedsRes, recordersRes, relaysRes] = await Promise.all([
      supabase.from('feeds').delete({ count: 'exact' }).lt('archived_at', cutoffIso),
      supabase.from('recorders').delete({ count: 'exact' }).lt('archived_at', cutoffIso),
      supabase.from('relays').delete({ count: 'exact' }).lt('archived_at', cutoffIso),
    ]);

    const firstErr = feedsRes.error || recordersRes.error || relaysRes.error;
    if (firstErr) {
      console.error('Cleanup error:', firstErr);
      return NextResponse.json({ error: firstErr.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      cutoff: cutoffIso,
      deleted: {
        feeds: feedsRes.count ?? 0,
        recorders: recordersRes.count ?? 0,
        relays: relaysRes.count ?? 0,
      },
    });
  } catch (error) {
    console.error('Cleanup failed:', error);
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
  }
}


