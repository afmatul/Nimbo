import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { CorrelationContext, PING_QUEUE, PingProcessor, PingQueue } from '../../../src/shared';
import type { LogLine } from '../setup/log-sink';
import { createTestApp } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const WAIT_STEP_MS = 50;
const WAIT_LIMIT_MS = 10_000;

/** Productor y consumidor en el mismo proceso de prueba: basta para verificar la propagación. */
@Module({
  imports: [BullModule.registerQueue({ name: PING_QUEUE })],
  providers: [PingQueue, PingProcessor],
})
class PingTestModule {}

const waitForCompletion = async (testApp: TestApp, jobId: string): Promise<LogLine[]> => {
  const deadline = Date.now() + WAIT_LIMIT_MS;
  while (Date.now() < deadline) {
    const lines = testApp.logs.lines().filter((line) => line.jobId === jobId);
    if (lines.some((line) => line.event === 'job.completed')) {
      return lines;
    }
    await new Promise((resolve) => setTimeout(resolve, WAIT_STEP_MS));
  }
  throw new Error(`El trabajo ${jobId} no se completó en ${String(WAIT_LIMIT_MS)} ms`);
};

describe('cola ping (CA-14)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp({ modules: [PingTestModule] });
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(() => {
    testApp.logs.clear();
  });

  it('CA-14: un trabajo encolado con `correlationId = X` produce bitácoras con `X` y `jobId` en el procesador', async () => {
    const pingQueue = testApp.app.get(PingQueue);

    const job = await CorrelationContext.run({ correlationId: 'X-corr' }, () =>
      pingQueue.enqueue(),
    );
    const jobId = String(job.id);
    const lines = await waitForCompletion(testApp, jobId);

    const events = lines.map((line) => line.event);
    expect(events).toEqual(expect.arrayContaining(['job.started', 'job.completed']));
    for (const line of lines.filter(
      (l) => l.event === 'job.started' || l.event === 'job.completed',
    )) {
      expect(line).toMatchObject({ correlationId: 'X-corr', jobId, queue: PING_QUEUE });
    }
    const enqueued = testApp.logs.lines().find((line) => line.event === 'queue.enqueued');
    expect(enqueued).toMatchObject({ queue: PING_QUEUE, jobId, correlationId: 'X-corr' });
  });

  it('CA-14: un trabajo sin `correlationId` (programado) genera uno propio al iniciar', async () => {
    const queue = testApp.app.get<Queue>(getQueueToken(PING_QUEUE));

    const job = await queue.add(PING_QUEUE, { sentAt: new Date().toISOString() });
    const jobId = String(job.id);
    const lines = await waitForCompletion(testApp, jobId);

    const started = lines.find((line) => line.event === 'job.started');
    expect(started?.correlationId).toMatch(UUID_V4);
    const completed = lines.find((line) => line.event === 'job.completed');
    expect(completed?.correlationId).toBe(started?.correlationId);
  });
});
