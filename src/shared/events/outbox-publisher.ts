import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../config/prisma';
import { createEventEnvelope, type CoopEventType } from '@coop/events';
import { eventBus } from './event-bus';

export interface OutboxPublishOptions<T = Record<string, unknown>> {
  eventType: CoopEventType | string;
  aggregateId: string;
  payload: T;
  branchId?: string;
  traceparent?: string;
}

/**
 * Persists a domain event to the `outbox_events` table inside the caller's transaction.
 * Guarantees zero-loss atomic persistence with financial database operations.
 */
export async function recordOutboxEvent<T extends Record<string, unknown>>(
  tx: Prisma.TransactionClient | PrismaClient,
  options: OutboxPublishOptions<T>,
): Promise<string> {
  const envelope = createEventEnvelope(
    options.eventType,
    'urn:coop:service:backend',
    options.aggregateId,
    options.payload,
    {
      branchId: options.branchId,
      traceparent: options.traceparent,
    },
  );

  const outbox = await tx.outboxEvent.create({
    data: {
      aggregateId: options.aggregateId,
      eventType: options.eventType,
      payload: envelope as unknown as Prisma.InputJsonValue,
      status: 'PENDING',
      retryCount: 0,
    },
  });

  return outbox.id;
}

/**
 * Dispatch pending outbox events to the message broker / event listeners.
 * Can be invoked periodically by BullMQ or a lightweight timer.
 */
export async function relayPendingOutboxEvents(
  batchSize = 50,
  client: PrismaClient = defaultPrisma,
): Promise<{ processed: number; errors: number }> {
  const pendingEvents = await client.outboxEvent.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    take: batchSize,
  });

  let processed = 0;
  let errors = 0;

  for (const event of pendingEvents) {
    try {
      // 1. Emit to internal event bus (for local in-process listeners)
      //    In production, this publishes to Redis Streams / Kafka / RabbitMQ.
      const payload = event.payload as any;
      
      // Also emit to backward-compatible event bus if event type matches
      if (payload && payload.type && payload.data) {
        eventBus.emit({
          type: payload.type.replace(/^financial\./, '').replace(/^system\./, ''),
          payload: payload.data,
        } as any);
      }

      // 2. Mark event as successfully PUBLISHED
      await client.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: 'PUBLISHED',
          publishedAt: new Date(),
        },
      });

      processed++;
    } catch (err: any) {
      errors++;
      const nextRetry = event.retryCount + 1;
      await client.outboxEvent.update({
        where: { id: event.id },
        data: {
          retryCount: nextRetry,
          lastError: err?.message || String(err),
          status: nextRetry >= 5 ? 'FAILED' : 'PENDING',
        },
      });
    }
  }

  return { processed, errors };
}
