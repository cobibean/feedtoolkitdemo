import { NextRequest, NextResponse } from 'next/server';
import { getBotService } from '@/lib/bot-service';

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

    // Update config if provided
    if (config || feedIds) {
      botService.updateConfig({
        ...(config || {}),
        ...(Array.isArray(feedIds) ? { selectedFeedIds: feedIds } : {}),
      });
    }

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
