import { NextRequest, NextResponse } from 'next/server';
import { getBotService } from '@/lib/bot-service';

const STORAGE_MODE_COOKIE = 'flare_feeds_storage_mode';

/**
 * POST /api/bot/start
 * Starts the bot service
 * 
 * Body (optional):
 * - privateKey: Override the default private key
 * - config: Bot configuration options
 * - feedIds: Array of feed IDs to run (if omitted, runs all)
 */
export async function POST(request: NextRequest) {
  try {
    const botService = getBotService();

    // Idempotent start: if already running, return success
    if (botService.getStatus() === 'running') {
      return NextResponse.json({
        success: true,
        message: 'Bot is already running',
        status: botService.getStatus(),
      });
    }

    const body = await request.json().catch(() => ({}));
    const { privateKey, config, feedIds } = body;

    // Capture storage mode from browser cookie so bot knows which backend to use
    const storageModeValue = request.cookies.get(STORAGE_MODE_COOKIE)?.value;
    const storageMode: 'local' | 'database' = storageModeValue === 'database' ? 'database' : 'local';

    // Update config if provided, always include storageMode
    botService.updateConfig({
      ...(config || {}),
      ...(Array.isArray(feedIds) ? { selectedFeedIds: feedIds } : {}),
      storageMode,
    });

    // Start the bot
    const success = await botService.start(privateKey);

    if (success) {
      return NextResponse.json({
        success: true,
        message: 'Bot started successfully',
        status: botService.getStatus(),
      });
    } else {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to start bot. Check if it\'s already running or if private key is configured.',
          status: botService.getStatus(),
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Error starting bot:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        status: 'error',
      },
      { status: 500 }
    );
  }
}
