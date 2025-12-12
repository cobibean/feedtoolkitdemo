import { NextRequest, NextResponse } from 'next/server';
import { getBotService } from '@/lib/bot-service';

/**
 * POST /api/bot/update-single
 * Triggers a single feed update
 * 
 * Body:
 * - feedId: ID of the feed to update
 */
export async function POST(request: NextRequest) {
  try {
    const botService = getBotService();
    const body = await request.json();
    const { feedId } = body;

    if (!feedId) {
      return NextResponse.json(
        { error: 'feedId is required' },
        { status: 400 }
      );
    }

    // Check if bot is running
    if (botService.getStatus() !== 'running') {
      return NextResponse.json(
        { error: 'Bot is not running. Start the bot first.' },
        { status: 400 }
      );
    }

    const result = await botService.updateSingleFeed(feedId);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error updating feed:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
