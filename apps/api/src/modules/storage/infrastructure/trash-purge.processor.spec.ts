import type { Job } from 'bullmq';

import { CorrelationContext, createActor, FixedClock, Role } from '../../../shared';
import type { Actor, ITransactionRunner } from '../../../shared';
import type {
  ExpiredTrashItem,
  IExpiredTrashScanner,
} from '../application/ports/i-expired-trash.scanner.port';
import type { TrashItemRef } from '../application/ports/i-trash.repository.port';
import type { StorageLogger } from '../application/storage-logger';
import { TrashPurgeIncompleteError } from '../application/trash-purger';
import type { TrashService } from '../application/trash.service';

import { TrashPurgeProcessor } from './trash-purge.processor';
import type { TrashPurgeJobData } from './trash-purge.scheduler';

const NOW = new Date('2026-10-01T12:00:00.000Z');
const BATCH_SIZE = 100;
const CORRELATION_ID = '6f1c2a8e-3b1d-4c6e-9a7f-2d4b8e1c0f93';
const JOB_ID = 'repeat:trash-purge:1';
const OWNER_A = '0b9f4c1e-7a2d-4e5f-8c3b-1d2e3f4a5b6c';
const OWNER_B = '5c6b5a4f-3e2d-4c1b-9a8f-7e6d5c4b3a29';

const EXPIRED: readonly ExpiredTrashItem[] = [
  { type: 'file', id: 'a1111111-1111-4111-8111-111111111111', propietarioId: OWNER_A },
  { type: 'folder', id: 'b2222222-2222-4222-8222-222222222222', propietarioId: OWNER_B },
  { type: 'file', id: 'c3333333-3333-4333-8333-333333333333', propietarioId: OWNER_A },
];

interface LoggedLine {
  readonly level: 'info' | 'warn' | 'error';
  readonly payload: Record<string, unknown>;
  readonly correlationId: string | undefined;
  readonly jobId: string | undefined;
}

const job = (data: Partial<TrashPurgeJobData> = { correlationId: CORRELATION_ID }) =>
  ({ id: JOB_ID, data, attemptsMade: 0 }) as unknown as Job<TrashPurgeJobData>;

const setup = (options: { expired?: readonly ExpiredTrashItem[]; failing?: string[] } = {}) => {
  const journal: string[] = [];
  const lines: LoggedLine[] = [];
  const record =
    (level: LoggedLine['level']) =>
    (payload: Record<string, unknown>): void => {
      const store = CorrelationContext.get();
      lines.push({ level, payload, correlationId: store?.correlationId, jobId: store?.jobId });
    };
  const logger: StorageLogger = {
    info: record('info'),
    warn: record('warn'),
    error: record('error'),
  };
  let insideRun = false;
  const transactions: ITransactionRunner = {
    run: async (work) => {
      journal.push('run');
      insideRun = true;
      try {
        return await work();
      } finally {
        insideRun = false;
      }
    },
    withActor: (_actor, work) => work(),
  };
  const listExpired = jest.fn((now: Date, limit: number) => {
    journal.push(`scan:${String(insideRun)}:${now.toISOString()}:${String(limit)}`);
    return Promise.resolve(options.expired ?? EXPIRED);
  });
  const scanner: IExpiredTrashScanner = { listExpired };
  const purgeExpired = jest.fn((actor: Actor, item: TrashItemRef) => {
    journal.push(`purge:${item.id}`);
    if (options.failing?.includes(item.id) === true) {
      return Promise.reject(new TrashPurgeIncompleteError(1));
    }
    return Promise.resolve();
  });
  const trash = { purgeExpired } as unknown as TrashService;
  const processor = new TrashPurgeProcessor(
    transactions,
    scanner,
    trash,
    new FixedClock(NOW),
    { intervalMinutes: 60, batchSize: BATCH_SIZE },
    logger,
  );
  return { processor, journal, lines, purgeExpired };
};

describe('TrashPurgeProcessor (006 CA-19, CA-20; plan §4, §5)', () => {
  it('CA-19: consume la cola `trash-purge` con `concurrency: 1`', () => {
    expect(Reflect.getMetadata('bullmq:processor_metadata', TrashPurgeProcessor)).toEqual({
      name: 'trash-purge',
    });
    expect(Reflect.getMetadata('bullmq:worker_metadata', TrashPurgeProcessor)).toEqual({
      concurrency: 1,
    });
  });

  it('CA-19: fase 1 llama a `papelera_vencida` dentro de `ITransactionRunner.run` (sin actor) con el reloj y el lote', async () => {
    const { processor, journal } = setup();

    await processor.process(job());

    expect(journal[0]).toBe('run');
    expect(journal[1]).toBe(`scan:true:${NOW.toISOString()}:${String(BATCH_SIZE)}`);
  });

  it('CA-19: fase 2 purga cada raíz como su dueño (`createActor(propietarioId, CLIENT)`)', async () => {
    const { processor, purgeExpired } = setup();

    await processor.process(job());

    expect(purgeExpired.mock.calls).toEqual(
      EXPIRED.map((item) => [
        createActor(item.propietarioId, Role.CLIENT),
        { type: item.type, id: item.id },
      ]),
    );
  });

  it('CA-19: registra `trash.purge_run` con el `correlationId` y el `jobId`', async () => {
    const { processor, lines } = setup();

    await processor.process(job());

    expect(lines).toEqual([
      {
        level: 'info',
        correlationId: CORRELATION_ID,
        jobId: JOB_ID,
        payload: { event: 'trash.purge_run', scanned: 3, purged: 3, failed: 0 },
      },
    ]);
  });

  it('CA-20: un elemento con error se registra, no frena el lote y el trabajo falla al final (reintentos)', async () => {
    const failed = EXPIRED[1]?.id ?? '';
    const { processor, journal, lines } = setup({ failing: [failed] });

    await expect(processor.process(job())).rejects.toBeInstanceOf(TrashPurgeIncompleteError);

    expect(journal.filter((entry) => entry.startsWith('purge:'))).toHaveLength(EXPIRED.length);
    expect(lines.map((line) => [line.level, line.payload])).toEqual([
      [
        'error',
        {
          event: 'trash.purge_item_failed',
          nodeType: 'folder',
          nodeId: failed,
          errorName: 'TrashPurgeIncompleteError',
        },
      ],
      ['info', { event: 'trash.purge_run', scanned: 3, purged: 2, failed: 1 }],
    ]);
  });

  it('CA-20: un reintento sin nada vencido termina bien (idempotente)', async () => {
    const { processor, purgeExpired } = setup({ expired: [] });

    await expect(processor.process(job())).resolves.toBeUndefined();
    expect(purgeExpired).not.toHaveBeenCalled();
  });

  it('RNF-17: sin `correlationId` en el trabajo usa uno nuevo', async () => {
    const { processor, lines } = setup({ expired: [] });

    await processor.process(job({}));

    expect(lines[0]?.correlationId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
