import { randomUUID } from 'node:crypto';

import {
  FakeIndexingRepository,
  FakeIndexStatusNotifier,
} from '../../../../test/support/intelligence-fakes';
import {
  FakeAuditLogger,
  FakeTransactionRunner,
  Journal,
} from '../../../../test/support/storage-fakes';
import { createActor, Role } from '../../../shared';
import { AuditAction } from '../../audit';
import { FileIndexing } from '../domain/file-indexing';

import { IndexingOutcomeRecorder } from './indexing-outcome.recorder';
import type { IndexingRun } from './indexing-outcome.recorder';
import type { IntelligenceLogger } from './intelligence-logger';

const NOW = new Date('2026-10-22T10:00:00.000Z');
const LATER = new Date('2026-10-22T10:00:04.210Z');
const OWNER = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);

/** Claves que la bitácora técnica puede llevar (plan 019 §5, CA-21): ids, estado, motivo y medidas. */
const LOG_KEYS = new Set([
  'event',
  'fileId',
  'versionId',
  'state',
  'reason',
  'durationMs',
  'attempt',
  'fragmentCount',
  'errorClass',
  'cause',
]);

function setup() {
  const journal = new Journal();
  const indexings = new FakeIndexingRepository();
  const audit = new FakeAuditLogger(journal);
  const notifier = new FakeIndexStatusNotifier();
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const recorder = new IndexingOutcomeRecorder(
    new FakeTransactionRunner(journal),
    indexings,
    audit,
    notifier,
    logger as IntelligenceLogger,
  );
  return { indexings, audit, notifier, logger, recorder };
}

/** Indexación reclamada y guardada en `indexings`: el intento en curso. */
function claimedRun(indexings: FakeIndexingRepository): IndexingRun {
  const pending = FileIndexing.pending({
    id: randomUUID(),
    fileId: randomUUID(),
    versionId: randomUUID(),
    now: NOW,
  });
  const indexing = pending.claim(NOW);
  indexings.byVersion.set(indexing.versionId, indexing);
  return { owner: OWNER, indexing };
}

const loggedEntries = (logger: ReturnType<typeof setup>['logger']): Record<string, unknown>[] =>
  [...logger.info.mock.calls, ...logger.warn.mock.calls].map(
    ([entry]) => entry as Record<string, unknown>,
  );

describe('IndexingOutcomeRecorder (019 plan §2 y §5)', () => {
  it('CA-4: `no_indexable` guarda el estado, audita con motivo y duración, registra y avisa', async () => {
    const { recorder, indexings, audit, notifier, logger } = setup();
    const run = claimedRun(indexings);
    const settled = run.indexing.markUnindexable('sin_texto', { durationMs: 830, now: LATER });

    const applied = await recorder.settle(run, settled);

    expect(applied).toBe(true);
    expect(indexings.byVersion.get(run.indexing.versionId)?.state).toBe('no_indexable');
    expect(audit.records).toEqual([
      {
        action: AuditAction.FILE_INDEX_UNINDEXABLE,
        actor: OWNER,
        targetUserId: OWNER.id,
        resourceId: run.indexing.fileId,
        attributes: { versionId: run.indexing.versionId, reason: 'sin_texto', durationMs: 830 },
      },
    ]);
    expect(logger.info).toHaveBeenCalledWith({
      event: 'indexing.unindexable',
      fileId: run.indexing.fileId,
      versionId: run.indexing.versionId,
      state: 'no_indexable',
      reason: 'sin_texto',
      durationMs: 830,
      attempt: 1,
      fragmentCount: 0,
    });
    expect(notifier.changes).toEqual([
      {
        ownerId: OWNER.id,
        fileId: run.indexing.fileId,
        state: 'no_indexable',
        reason: 'sin_texto',
      },
    ]);
  });

  it('CA-12: `fallido` audita `file.index_failed`, registra como advertencia y omite la duración desconocida', async () => {
    const { recorder, indexings, audit, notifier, logger } = setup();
    const run = claimedRun(indexings);
    const settled = run.indexing.fail('proveedor_no_disponible', { durationMs: null, now: LATER });

    await recorder.settle(run, settled);

    expect(audit.records[0]).toMatchObject({
      action: AuditAction.FILE_INDEX_FAILED,
      attributes: { versionId: run.indexing.versionId, reason: 'proveedor_no_disponible' },
    });
    expect(audit.records[0]?.attributes).not.toHaveProperty('durationMs');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'indexing.failed', reason: 'proveedor_no_disponible' }),
    );
    expect(notifier.changes[0]).toMatchObject({
      state: 'fallido',
      reason: 'proveedor_no_disponible',
    });
  });

  it('CA-9: si otro cambió el estado antes (comparar y asignar), no audita ni avisa y lo registra como descarte', async () => {
    const { recorder, indexings, audit, notifier, logger } = setup();
    const run = claimedRun(indexings);
    const elsewhere = run.indexing.fail('error_interno', { durationMs: null, now: LATER });
    indexings.byVersion.set(run.indexing.versionId, elsewhere);

    const applied = await recorder.settle(
      run,
      run.indexing.markUnindexable('sin_texto', { durationMs: 1, now: LATER }),
    );

    expect(applied).toBe(false);
    expect(indexings.byVersion.get(run.indexing.versionId)).toBe(elsewhere);
    expect(audit.records).toEqual([]);
    expect(notifier.changes).toEqual([]);
    expect(logger.info).toHaveBeenCalledWith({
      event: 'indexing.discarded',
      fileId: run.indexing.fileId,
      versionId: run.indexing.versionId,
      cause: 'not_claimable',
    });
  });

  it('CA-1: `announce` de `indexado` audita duración y fragmentos, registra y avisa sin motivo', async () => {
    const { recorder, indexings, audit, notifier, logger } = setup();
    const run = claimedRun(indexings);
    const indexed = run.indexing.complete({ fragmentCount: 37, durationMs: 4210, now: LATER });

    await recorder.announce(OWNER, indexed);

    expect(audit.records[0]).toMatchObject({
      action: AuditAction.FILE_INDEXED,
      attributes: { versionId: run.indexing.versionId, durationMs: 4210, fragmentCount: 37 },
    });
    expect(audit.records[0]?.attributes).not.toHaveProperty('reason');
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'indexing.completed',
        state: 'indexado',
        fragmentCount: 37,
      }),
    );
    expect(notifier.changes).toEqual([
      { ownerId: OWNER.id, fileId: run.indexing.fileId, state: 'indexado', reason: null },
    ]);
  });

  it('CA-14: un aviso que falla no propaga el error (el estado ya está guardado) y se registra', async () => {
    const { recorder, indexings, notifier, logger } = setup();
    const run = claimedRun(indexings);
    jest.spyOn(notifier, 'notify').mockRejectedValue(new Error('redis caído'));
    const indexed = run.indexing.complete({ fragmentCount: 1, durationMs: 5, now: LATER });

    await expect(recorder.announce(OWNER, indexed)).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith({
      event: 'indexing.notify_failed',
      fileId: run.indexing.fileId,
      versionId: run.indexing.versionId,
      errorClass: 'Error',
    });
  });

  it('el inicio, el descarte y un intento fallido se registran con ids, intento y clase del error', () => {
    const { recorder, indexings, logger } = setup();
    const run = claimedRun(indexings);
    const ids = { fileId: run.indexing.fileId, versionId: run.indexing.versionId };

    recorder.started(run);
    recorder.discarded(ids, 'not_current');
    recorder.attemptFailed(run, new TypeError('fallo de red'));

    expect(logger.info).toHaveBeenCalledWith({ event: 'indexing.started', ...ids, attempt: 1 });
    expect(logger.info).toHaveBeenCalledWith({
      event: 'indexing.discarded',
      ...ids,
      cause: 'not_current',
    });
    expect(logger.warn).toHaveBeenCalledWith({
      event: 'indexing.attempt_failed',
      ...ids,
      attempt: 1,
      errorClass: 'TypeError',
    });
  });

  it('CA-21: la bitácora solo lleva ids, estado, motivo y medidas; nunca el mensaje del error', async () => {
    const { recorder, indexings, logger } = setup();
    const run = claimedRun(indexings);
    recorder.attemptFailed(run, new Error('texto secreto del contrato.docx'));
    await recorder.settle(run, run.indexing.fail('error_interno', { durationMs: 9, now: LATER }));

    const entries = loggedEntries(logger);

    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(Object.keys(entry).every((key) => LOG_KEYS.has(key))).toBe(true);
      expect(JSON.stringify(entry)).not.toContain('secreto');
    }
  });
});
