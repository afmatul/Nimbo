import { randomUUID } from 'node:crypto';

import type { FileKind } from '@nimbo/contracts';

import {
  FakeIndexingRepository,
  FakeIndexQueue,
  FakeIndexStatusNotifier,
} from '../../../../test/support/intelligence-fakes';
import { FakeTransactionRunner, Journal } from '../../../../test/support/storage-fakes';
import { FixedClock } from '../../../shared';
import type { FileVersionCreatedEvent } from '../../storage';
import { FileIndexing } from '../domain/file-indexing';

import { ExtractorRegistry } from './extractor-registry';
import { IndexScheduler } from './index-scheduler';
import type { ITextExtractor } from './ports/i-text-extractor.port';

const NOW = new Date('2026-10-21T15:00:00.000Z');
const OWNER_ID = '11111111-1111-4111-8111-111111111111';

const extractorFor = (kind: FileKind): ITextExtractor => ({
  kind,
  extract: () => Promise.resolve([]),
});

function setup() {
  const transactions = new FakeTransactionRunner(new Journal());
  const indexings = new FakeIndexingRepository();
  const queue = new FakeIndexQueue();
  const notifier = new FakeIndexStatusNotifier();
  const registry = new ExtractorRegistry([extractorFor('docx'), extractorFor('texto')]);
  const scheduler = new IndexScheduler(
    transactions,
    indexings,
    registry,
    queue,
    notifier,
    new FixedClock(NOW),
  );
  return { transactions, indexings, queue, notifier, scheduler };
}

const versionCreated = (kind: FileKind = 'docx'): FileVersionCreatedEvent => ({
  fileId: randomUUID(),
  versionId: randomUUID(),
  ownerId: OWNER_ID,
  kind,
});

const jobOf = (event: FileVersionCreatedEvent) => ({
  fileId: event.fileId,
  versionId: event.versionId,
  ownerId: event.ownerId,
});

describe('IndexScheduler (019 plan §2, RN-11)', () => {
  it('CA-8: una versión indexable queda `pendiente`, en la cola y avisada a la propietaria', async () => {
    const { scheduler, indexings, queue, notifier } = setup();
    const event = versionCreated();

    await scheduler.schedule(event);

    const indexing = indexings.byVersion.get(event.versionId);
    expect(indexing?.snapshot()).toMatchObject({
      fileId: event.fileId,
      versionId: event.versionId,
      state: 'pendiente',
      reason: null,
      attempts: 0,
      createdAt: NOW,
    });
    expect(queue.jobs).toEqual([jobOf(event)]);
    expect(notifier.changes).toEqual([
      { ownerId: OWNER_ID, fileId: event.fileId, state: 'pendiente', reason: null },
    ]);
  });

  it.each<FileKind>(['imagen', 'otro', 'xlsx', 'pptx'])(
    'CA-6: un tipo sin extractor (`%s`) no crea fila, trabajo ni aviso',
    async (kind) => {
      const { scheduler, indexings, queue, notifier } = setup();

      await scheduler.schedule(versionCreated(kind));

      expect(indexings.byVersion.size).toBe(0);
      expect(queue.jobs).toEqual([]);
      expect(notifier.changes).toEqual([]);
    },
  );

  it('CA-9, RN-10: el mismo evento dos veces deja una sola fila, un solo trabajo y un solo aviso', async () => {
    const { scheduler, indexings, queue, notifier } = setup();
    const event = versionCreated();

    await scheduler.schedule(event);
    await scheduler.schedule(event);

    expect(indexings.byVersion.size).toBe(1);
    expect(queue.jobs).toEqual([jobOf(event)]);
    expect(notifier.changes).toHaveLength(1);
  });

  it('plan §7 punto 1: si la fila ya está `pendiente` (el encolado se perdió), vuelve a encolar sin otra fila ni aviso', async () => {
    const { scheduler, indexings, queue, notifier } = setup();
    const event = versionCreated();
    queue.failure = new Error('Redis caído');
    await expect(scheduler.schedule(event)).rejects.toThrow('Redis caído');
    queue.failure = null;
    notifier.changes.length = 0;

    await scheduler.schedule(event);

    expect(indexings.byVersion.get(event.versionId)?.state).toBe('pendiente');
    expect(queue.jobs).toEqual([jobOf(event)]);
    expect(notifier.changes).toEqual([]);
  });

  it.each(['indexado', 'no_indexable', 'fallido'] as const)(
    'CA-9: una versión ya `%s` no vuelve a la cola (no se gasta otra vez en embeddings)',
    async (state) => {
      const { scheduler, indexings, queue, notifier } = setup();
      const event = versionCreated();
      indexings.byVersion.set(event.versionId, settled(event, state));

      await scheduler.schedule(event);

      expect(queue.jobs).toEqual([]);
      expect(notifier.changes).toEqual([]);
    },
  );

  it('RN-5: un fallo del encolado sube al oyente, con la fila `pendiente` ya confirmada para la conciliación', async () => {
    const { scheduler, indexings, queue } = setup();
    const event = versionCreated();
    queue.failure = new Error('Redis caído');

    await expect(scheduler.schedule(event)).rejects.toThrow('Redis caído');

    expect(indexings.byVersion.get(event.versionId)?.state).toBe('pendiente');
  });
});

/** La indexación de `event` ya terminada en `state`. */
function settled(
  event: FileVersionCreatedEvent,
  state: 'indexado' | 'no_indexable' | 'fallido',
): FileIndexing {
  const { fileId, versionId } = event;
  const claimed = FileIndexing.pending({ id: randomUUID(), fileId, versionId, now: NOW }).claim(
    NOW,
  );
  const result = { durationMs: 10, now: NOW };
  if (state === 'indexado') return claimed.complete({ ...result, fragmentCount: 3 });
  if (state === 'no_indexable') return claimed.markUnindexable('sin_texto', result);
  return claimed.fail('proveedor_no_disponible', result);
}
