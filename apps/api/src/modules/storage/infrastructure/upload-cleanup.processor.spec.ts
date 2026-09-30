import type { Job } from 'bullmq';

import { CorrelationContext, createActor, FixedClock, Role } from '../../../shared';
import type { Actor, ITransactionRunner } from '../../../shared';
import type {
  ExpiredUpload,
  IExpiredUploadScanner,
} from '../application/ports/i-expired-upload.scanner.port';
import type { StorageLogger } from '../application/storage-logger';
import type { UploadService } from '../application/upload.service';

import { UploadCleanupIncompleteError, UploadCleanupProcessor } from './upload-cleanup.processor';
import type { UploadCleanupJobData } from './upload-cleanup.scheduler';

const NOW = new Date('2026-10-01T12:00:00.000Z');
const BATCH_SIZE = 100;
const CORRELATION_ID = '6f1c2a8e-3b1d-4c6e-9a7f-2d4b8e1c0f93';
const JOB_ID = 'repeat:upload-cleanup:1';
const OWNER_A = '0b9f4c1e-7a2d-4e5f-8c3b-1d2e3f4a5b6c';
const OWNER_B = '5c6b5a4f-3e2d-4c1b-9a8f-7e6d5c4b3a29';

const EXPIRED: readonly ExpiredUpload[] = [
  { id: 'a1111111-1111-4111-8111-111111111111', propietarioId: OWNER_A },
  { id: 'b2222222-2222-4222-8222-222222222222', propietarioId: OWNER_B },
  { id: 'c3333333-3333-4333-8333-333333333333', propietarioId: OWNER_A },
];

interface LoggedLine {
  readonly level: 'info' | 'warn' | 'error';
  readonly payload: Record<string, unknown>;
  readonly correlationId: string | undefined;
  readonly jobId: string | undefined;
}

const job = (data: Partial<UploadCleanupJobData> = { correlationId: CORRELATION_ID }) =>
  ({ id: JOB_ID, data, attemptsMade: 0 }) as unknown as Job<UploadCleanupJobData>;

const setup = (options: { expired?: readonly ExpiredUpload[]; failing?: string[] } = {}) => {
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
  const listExpiredIds = jest.fn((now: Date, limit: number) => {
    journal.push(`scan:${String(insideRun)}:${now.toISOString()}:${String(limit)}`);
    return Promise.resolve(options.expired ?? EXPIRED);
  });
  const scanner: IExpiredUploadScanner = { listExpiredIds };
  const expire = jest.fn((actor: Actor, uploadId: string) => {
    journal.push(`expire:${uploadId}`);
    if (options.failing?.includes(uploadId) === true) {
      return Promise.reject(new Error(`fallo con u/${actor.id}/clave-secreta`));
    }
    return Promise.resolve();
  });
  const uploads = { expire } as unknown as UploadService;
  const processor = new UploadCleanupProcessor(
    transactions,
    scanner,
    uploads,
    new FixedClock(NOW),
    { intervalMinutes: 10, batchSize: BATCH_SIZE },
    logger,
  );
  return { processor, journal, lines, expire };
};

describe('UploadCleanupProcessor (CA-9, D-6, ADR-0021)', () => {
  it('CA-9: consume la cola `upload-cleanup` con `concurrency: 1`', () => {
    expect(Reflect.getMetadata('bullmq:processor_metadata', UploadCleanupProcessor)).toEqual({
      name: 'upload-cleanup',
    });
    expect(Reflect.getMetadata('bullmq:worker_metadata', UploadCleanupProcessor)).toEqual({
      concurrency: 1,
    });
  });

  it('CA-9: fase 1 llama al escáner dentro de `ITransactionRunner.run` (sin actor) con el reloj y el lote', async () => {
    const { processor, journal } = setup();

    await processor.process(job());

    expect(journal[0]).toBe('run');
    expect(journal[1]).toBe(`scan:true:${NOW.toISOString()}:${String(BATCH_SIZE)}`);
  });

  it('CA-9: fase 2 vence cada carga como su dueño (`createActor(propietarioId, CLIENT)`)', async () => {
    const { processor, expire } = setup();

    await processor.process(job());

    expect(expire.mock.calls).toEqual(
      EXPIRED.map((upload) => [createActor(upload.propietarioId, Role.CLIENT), upload.id]),
    );
  });

  it('CA-9: registra `upload.cleanup_run` con `scanned`, `expired` y `failed`, con el `correlationId` y el `jobId`', async () => {
    const { processor, lines } = setup();

    await processor.process(job());

    expect(lines).toEqual([
      {
        level: 'info',
        correlationId: CORRELATION_ID,
        jobId: JOB_ID,
        payload: { event: 'upload.cleanup_run', scanned: 3, expired: 3, failed: 0 },
      },
    ]);
  });

  it('CA-9: sin cargas vencidas no vence nada y termina bien', async () => {
    const { processor, expire, lines } = setup({ expired: [] });

    await processor.process(job());

    expect(expire).not.toHaveBeenCalled();
    expect(lines.map((line) => line.payload)).toEqual([
      { event: 'upload.cleanup_run', scanned: 0, expired: 0, failed: 0 },
    ]);
  });

  it('CA-9: el fallo de una fila se registra, no frena el lote y el trabajo falla al final (reintentos)', async () => {
    const failed = EXPIRED[0]?.id ?? '';
    const { processor, journal, lines } = setup({ failing: [failed] });

    await expect(processor.process(job())).rejects.toBeInstanceOf(UploadCleanupIncompleteError);

    expect(journal.filter((entry) => entry.startsWith('expire:'))).toHaveLength(EXPIRED.length);
    expect(lines.map((line) => [line.level, line.payload])).toEqual([
      ['error', { event: 'upload.cleanup_failed', cargaId: failed, errorName: 'Error' }],
      ['info', { event: 'upload.cleanup_run', scanned: 3, expired: 2, failed: 1 }],
    ]);
  });

  it('CA-20: la bitácora de un fallo no lleva el mensaje del error (puede traer claves de objeto)', async () => {
    const { processor, lines } = setup({ failing: [EXPIRED[1]?.id ?? ''] });

    await expect(processor.process(job())).rejects.toThrow();

    expect(JSON.stringify(lines)).not.toMatch(/clave-secreta|u\//);
  });

  it('RNF-17: sin `correlationId` en el trabajo usa uno nuevo', async () => {
    const { processor, lines } = setup({ expired: [] });

    await processor.process(job({}));

    expect(lines[0]?.correlationId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
