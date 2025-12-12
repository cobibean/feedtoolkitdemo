import { NextResponse } from 'next/server';
import { getBotService } from '@/lib/bot-service';

/**
 * GET /api/bot/status
 * Returns current bot status, stats, and recent logs
 */
export async function GET() {
  try {
    const botService = getBotService();
    const status = botService.getStatus();
    const stats = botService.getStats();
    const logs = botService.getLogs(50);
    const config = botService.getConfig();

    return NextResponse.json({
      status,
      stats,
      logs,
      config,
    });
  } catch (error) {
    console.error('Error getting bot status:', error);
    return NextResponse.json(
      { error: 'Failed to get bot status' },
      { status: 500 }
    );
  }
}
