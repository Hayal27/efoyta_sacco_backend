import { relayPendingOutboxEvents } from '../events/outbox-publisher';

let relayTimer: NodeJS.Timeout | null = null;
let isRelaying = false;

/**
 * Starts the Outbox Relay worker loop.
 * Periodically polls `outbox_events` table for PENDING events and publishes them.
 */
export function initOutboxRelayLoop(intervalMs = 3000): void {
  if (relayTimer) return;

  console.info(`[outbox-relay] Starting outbox relay worker (polling every ${intervalMs}ms)...`);

  relayTimer = setInterval(async () => {
    if (isRelaying) return; // Prevent overlapping runs
    isRelaying = true;

    try {
      const result = await relayPendingOutboxEvents(50);
      if (result.processed > 0 || result.errors > 0) {
        console.info(`[outbox-relay] Dispatched ${result.processed} events (${result.errors} errors)`);
      }
    } catch (err: any) {
      console.error('[outbox-relay] Error during outbox relay cycle:', err?.message || err);
    } finally {
      isRelaying = false;
    }
  }, intervalMs);

  // Unref timer so it doesn't block process exit
  relayTimer.unref();
}

export function stopOutboxRelayLoop(): void {
  if (relayTimer) {
    clearInterval(relayTimer);
    relayTimer = null;
    console.info('[outbox-relay] Stopped outbox relay loop');
  }
}
