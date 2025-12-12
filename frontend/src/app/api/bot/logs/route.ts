import { NextRequest, NextResponse } from 'next/server';
import { getBotService } from '@/lib/bot-service';

/**
 * GET /api/bot/logs
 * Returns bot logs
 * 
 * Query params:
 * - limit: Number of logs to return (default: 100)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '100');

    const botService = getBotService();
    const logs = botService.getLogs(limit);

    return NextResponse.json({
      logs,
      count: logs.length,
    });
  } catch (error) {
    console.error('Error getting bot logs:', error);
    return NextResponse.json(
      { error: 'Failed to get bot logs' },
      { status: 500 }
    );
  }
}
