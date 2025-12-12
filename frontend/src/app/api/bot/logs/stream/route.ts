import { NextRequest } from 'next/server';
import { getBotService, getBotServiceVersion } from '@/lib/bot-service';
 
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
 
/**
 * GET /api/bot/logs/stream
 * Server-Sent Events stream for bot logs + status updates.
 */
export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;
  let botService = getBotService();
  let botVersion = getBotServiceVersion();
 
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (chunk: string) => controller.enqueue(encoder.encode(chunk));
      const sendEvent = (event: string, data: unknown) => {
        write(`event: ${event}\n`);
        write(`data: ${JSON.stringify(data)}\n\n`);
      };
 
      let unsubscribeLog = () => {};
      let unsubscribeStatus = () => {};

      const bindToCurrentBot = () => {
        unsubscribeLog();
        unsubscribeStatus();
        botService = getBotService();
        botVersion = getBotServiceVersion();

        // Send snapshot from the active instance
        sendEvent('status', { status: botService.getStatus(), stats: botService.getStats(), version: botVersion });
        const recentLogs = botService.getLogs(100);
        for (const entry of recentLogs) {
          sendEvent('log', entry);
        }

        unsubscribeLog = botService.onLog((entry) => {
          sendEvent('log', entry);
        });
        unsubscribeStatus = botService.onStatusChange((status) => {
          sendEvent('status', { status, stats: botService.getStats(), version: botVersion });
        });
      };

      bindToCurrentBot();
 
      const ping = setInterval(() => {
        // Comment ping to keep connection alive
        write(`: ping ${Date.now()}\n\n`);
      }, 15_000);

      // In dev, the bot singleton can be reset; re-bind automatically so UI keeps receiving logs.
      const rebindCheck = setInterval(() => {
        const currentVersion = getBotServiceVersion();
        if (currentVersion !== botVersion) {
          sendEvent('reset', { from: botVersion, to: currentVersion });
          bindToCurrentBot();
        }
      }, 2_000);
 
      cleanup = () => {
        clearInterval(ping);
        clearInterval(rebindCheck);
        unsubscribeLog();
        unsubscribeStatus();
      };
      request.signal.addEventListener('abort', () => cleanup?.(), { once: true });
    },
    cancel() {
      cleanup?.();
    },
  });
 
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Connection: 'keep-alive',
    },
  });
}
