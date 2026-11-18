import { COOP_EVENT_TYPES } from '@coop/events';
import { recordOutboxEvent, relayPendingOutboxEvents } from './outbox-publisher';

async function testOutbox() {
  console.log('Testing Transactional Outbox...');

  // Mock Prisma client with in-memory store
  const inMemoryOutbox: any[] = [];

  const mockTx: any = {
    outboxEvent: {
      create: async ({ data }: any) => {
        const record = { id: `outbox-${Date.now()}`, ...data };
        inMemoryOutbox.push(record);
        return record;
      },
      findMany: async ({ where, take }: any) => {
        return inMemoryOutbox.filter((e) => e.status === where.status).slice(0, take);
      },
      update: async ({ where, data }: any) => {
        const found = inMemoryOutbox.find((e) => e.id === where.id);
        if (found) {
          Object.assign(found, data);
        }
        return found;
      },
    },
  };

  // 1. Record event
  const outboxId = await recordOutboxEvent(mockTx, {
    eventType: COOP_EVENT_TYPES.SAVINGS_DEPOSITED,
    aggregateId: 'acc-12345',
    payload: {
      accountId: 'acc-12345',
      memberId: 'mem-999',
      amount: 1500,
    },
    branchId: 'br-001',
  });

  if (!outboxId || inMemoryOutbox.length !== 1) {
    throw new Error('Failed to record outbox event');
  }

  if (inMemoryOutbox[0].status !== 'PENDING') {
    throw new Error(`Expected PENDING status, got ${inMemoryOutbox[0].status}`);
  }

  // 2. Relay events
  const result = await relayPendingOutboxEvents(10, mockTx);

  if (result.processed !== 1 || inMemoryOutbox[0].status !== 'PUBLISHED') {
    throw new Error(`Expected PUBLISHED status, got ${inMemoryOutbox[0].status}`);
  }

  console.log('✅ Transactional Outbox recording and relay tested successfully!');
}

testOutbox().catch((err) => {
  console.error('❌ Outbox test failed:', err);
  process.exit(1);
});
