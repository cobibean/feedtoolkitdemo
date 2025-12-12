import { NextResponse } from 'next/server';
import { getBotService, resetBotService } from '@/lib/bot-service';

/**
 * POST /api/bot/stop
 * Stops the bot service
 */
export async function POST() {
  try {
    const botService = getBotService();
    await botService.stop();
    // Reset the singleton so new code paths/config apply cleanly on next start
    await resetBotService();

    return NextResponse.json({
      success: true,
      message: 'Bot stopped successfully',
      status: botService.getStatus(),
      stats: botService.getStats(),
    });
  } catch (error) {
    console.error('Error stopping bot:', error);
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
