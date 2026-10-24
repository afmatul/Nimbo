import type { FileKind } from '@nimbo/contracts';

import {
  FakeIndexingRepository,
  FakeIndexQueue,
  FakeIndexStatusNotifier,
} from '../../../../test/support/intelligence-fakes';
import { FakeTransactionRunner, Journal } from '../../../../test/support/storage-fakes';
import { FixedClock } from '../../../shared';
import type { Actor } from '../../../shared';
import type { IdPage, IndexableFile } from '../../storage';
import { FileIndexing } from '../domain/file-indexing';

import { ExtractorRegistry } from './extractor-registry';
import { IndexReconcileIncompleteError, IndexReconciler, STALE_AFTER_MS } from './index-reconciler';
import type { ReconcileFiles } from './index-reconciler';
import { IndexScheduler } from './index-scheduler';
import type { IntelligenceLogger } from './intelligence-logger';
import type { ITextExtractor } from './ports/i-text-extractor.port';
import { MAX_LOGGED_IDS } from './reconcile-tally';

const NOW = new Date('2026-10-22T12:00:00.000Z');
const BATCH_SIZE = 2;
const ANA = '0a000000-0000-4000-8000-000000000001';
const BETO = '0b000000-0000-4000-8000-000000000002';
const CARLA = '0c000000-0000-4000-8000-000000000003';

const extractorFor = (kind: FileKind): ITextExtractor => ({
  kind,
  extract: () => Promise.resolve([]),
});

const fileOf = (ownerId: string, index: number, kind: FileKind = 'docx'): IndexableFile => ({
  id: `${ownerId.slice(0, 2)}f00000-0000-4000-8000-00000000000${String(index)}`,
  ownerId,
  kind,
  sizeBytes: 10n,
  currentVersionId: `${ownerId.slice(0, 2)}e00000-0000-4000-8000-00000000000${String(index)}`,
});

/** `count` archivos `.docx` de la cuenta, con ids que se ordenan como texto igual que como número. */
const manyFilesOf = (ownerId: string, count: number): IndexableFile[] =>
  Array.from({ length: count }, (_, index) => {
    const serial = String(index).padStart(12, '0');
    return {
      id: `${ownerId.slice(0, 2)}f00000-0000-4000-8000-${serial}`,
      ownerId,
      kind: 'docx',
      sizeBytes: 10n,
      currentVersionId: `${ownerId.slice(0, 2)}e00000-0000-4000-8000-${serial}`,
    };
  });

/** Simula `WHERE id > $after ORDER BY id LIMIT $limit`. */
const pageOf = <T>(items: readonly T[], idOf: (item: T) => string, page: IdPage): T[] =>
  items.filter((item) => page.afterId === null || idOf(item) > page.afterId).slice(0, page.limit);

/** Fachada de `storage` en memoria: anota cada página pedida y con qué actor. */
class FakeReconcileFiles implements ReconcileFiles {
  readonly accountPages: IdPage[] = [];
  readonly filePages: { actorId: string; page: IdPage }[] = [];
  readonly failingOwners = new Set<string>();

  constructor(
    private readonly accounts: readonly string[],
    private readonly files: readonly IndexableFile[],
  ) {}

  clientIds(page: IdPage): Promise<readonly string[]> {
    this.accountPages.push(page);
    return Promise.resolve(pageOf(this.accounts, (id) => id, page));
  }

  listIndexable(actor: Actor, page: IdPage): Promise<readonly IndexableFile[]> {
    this.filePages.push({ actorId: actor.id, page });
    if (this.failingOwners.has(actor.id)) return Promise.reject(new Error('caída'));
    const owned = this.files.filter((file) => file.ownerId === actor.id);
    return Promise.resolve(pageOf(owned, (file) => file.id, page));
  }
}

function setup(accounts: readonly string[], files: readonly IndexableFile[]) {
  const transactions = new FakeTransactionRunner(new Journal());
  const indexings = new FakeIndexingRepository();
  const queue = new FakeIndexQueue();
  const notifier = new FakeIndexStatusNotifier();
  const registry = new ExtractorRegistry([extractorFor('docx'), extractorFor('texto')]);
  const clock = new FixedClock(NOW);
  const scheduler = new IndexScheduler(transactions, indexings, registry, queue, notifier, clock);
  const storage = new FakeReconcileFiles(accounts, files);
  const lines: Record<string, unknown>[] = [];
  const record = (payload: Record<string, unknown>): void => {
    lines.push(payload);
  };
  const logger = { info: record, warn: record, error: record } as unknown as IntelligenceLogger;
  const reconciler = new IndexReconciler(
    transactions,
    storage,
    indexings,
    scheduler,
    registry,
    queue,
    clock,
    { intervalMinutes: 1440, batchSize: BATCH_SIZE },
    logger,
  );
  return { reconciler, storage, indexings, queue, notifier, lines, transactions };
}

const rowFor = (file: IndexableFile, ageMs: number, state: 'pendiente' | 'indexando') =>
  FileIndexing.rehydrate({
    ...FileIndexing.pending({
      id: `${file.id.slice(0, 2)}d00000-0000-4000-8000-000000000000`,
      fileId: file.id,
      versionId: file.currentVersionId,
      now: new Date(NOW.getTime() - ageMs),
    }).snapshot(),
    state,
    attempts: state === 'indexando' ? 1 : 0,
  });

describe('IndexReconciler (019 RN-12, CA-23)', () => {
  it('CA-23: recorre cuentas y archivos por páginas de `INDEX_RECONCILE_BATCH_SIZE`, cada cuenta con su propio actor', async () => {
    const files = [fileOf(ANA, 1), fileOf(ANA, 2), fileOf(ANA, 3), fileOf(CARLA, 1)];
    const { reconciler, storage, queue } = setup([ANA, BETO, CARLA], files);

    await reconciler.reconcileAll();

    expect(storage.accountPages).toEqual([
      { afterId: null, limit: BATCH_SIZE },
      { afterId: BETO, limit: BATCH_SIZE },
    ]);
    expect(storage.filePages).toEqual([
      { actorId: ANA, page: { afterId: null, limit: BATCH_SIZE } },
      { actorId: ANA, page: { afterId: files[1]?.id, limit: BATCH_SIZE } },
      { actorId: BETO, page: { afterId: null, limit: BATCH_SIZE } },
      { actorId: CARLA, page: { afterId: null, limit: BATCH_SIZE } },
    ]);
    expect(queue.jobs.map((job) => job.ownerId)).toEqual([ANA, ANA, ANA, CARLA]);
  });

  it('CA-23: una versión vigente indexable sin fila queda `pendiente`, encolada y avisada; un tipo sin extractor no entra', async () => {
    const docx = fileOf(ANA, 1);
    const image = fileOf(ANA, 2, 'imagen');
    const { reconciler, indexings, queue, notifier } = setup([ANA], [docx, image]);

    await reconciler.reconcileAll();

    expect(indexings.byVersion.get(docx.currentVersionId)?.state).toBe('pendiente');
    expect(indexings.byVersion.has(image.currentVersionId)).toBe(false);
    expect(queue.jobs).toEqual([
      { fileId: docx.id, versionId: docx.currentVersionId, ownerId: ANA },
    ]);
    expect(notifier.changes).toHaveLength(1);
  });

  it('CA-23: vuelve a encolar `pendiente`/`indexando` de más de 30 min y deja en paz los recientes y los terminados', async () => {
    const stalePending = fileOf(ANA, 1);
    const staleRunning = fileOf(ANA, 2);
    const fresh = fileOf(ANA, 3);
    const done = fileOf(ANA, 4);
    const { reconciler, indexings, queue, notifier } = setup(
      [ANA],
      [stalePending, staleRunning, fresh, done],
    );
    const old = STALE_AFTER_MS + 1;
    for (const row of [
      rowFor(stalePending, old, 'pendiente'),
      rowFor(staleRunning, old, 'indexando'),
      rowFor(fresh, STALE_AFTER_MS - 1, 'pendiente'),
      rowFor(done, old, 'indexando').complete({ fragmentCount: 1, durationMs: 5, now: NOW }),
    ]) {
      indexings.byVersion.set(row.versionId, row);
    }

    await reconciler.reconcileAll();

    expect(queue.jobs.map((job) => job.versionId)).toEqual([
      stalePending.currentVersionId,
      staleRunning.currentVersionId,
    ]);
    expect(notifier.changes).toEqual([]);
  });

  it('CA-9: repetir la conciliación no crea filas ni trabajos nuevos', async () => {
    const { reconciler, indexings, queue } = setup([ANA], [fileOf(ANA, 1), fileOf(ANA, 2)]);

    await reconciler.reconcileAll();
    await reconciler.reconcileAll();

    expect(indexings.byVersion.size).toBe(2);
    expect(queue.jobs).toHaveLength(2);
  });

  it('CA-23: deja `index.reconcile_completed` con conteos e ids de versión, sin nombres', async () => {
    const missing = fileOf(ANA, 1);
    const stale = fileOf(ANA, 2);
    const { reconciler, indexings, lines } = setup([ANA, BETO], [missing, stale]);
    const row = rowFor(stale, STALE_AFTER_MS + 1, 'pendiente');
    indexings.byVersion.set(row.versionId, row);

    await reconciler.reconcileAll();

    expect(lines).toEqual([
      {
        event: 'index.reconcile_completed',
        accounts: 2,
        failedAccounts: 0,
        files: 2,
        scheduled: 1,
        requeued: 1,
        scheduledVersionIds: [missing.currentVersionId],
        requeuedVersionIds: [stale.currentVersionId],
        failedAccountIds: [],
        idsTruncated: false,
      },
    ]);
  });

  it('CA-23: `index.reconcile_completed` acota cada lista a `MAX_LOGGED_IDS` ids y conserva los conteos totales', async () => {
    const files = manyFilesOf(ANA, MAX_LOGGED_IDS + 1);
    const done = fileOf(BETO, 1);
    const { reconciler, indexings, lines } = setup([ANA, BETO], [...files, done]);
    const row = rowFor(done, 0, 'indexando').complete({
      fragmentCount: 1,
      durationMs: 5,
      now: NOW,
    });
    indexings.byVersion.set(row.versionId, row);

    await reconciler.reconcileAll();

    expect(lines).toEqual([
      expect.objectContaining({
        event: 'index.reconcile_completed',
        accounts: 2,
        files: MAX_LOGGED_IDS + 2,
        scheduled: MAX_LOGGED_IDS + 1,
        requeued: 0,
        scheduledVersionIds: files.slice(0, MAX_LOGGED_IDS).map((file) => file.currentVersionId),
        idsTruncated: true,
      }),
    ]);
  });

  it('RN-12: el fallo de una cuenta se registra, no frena a las demás y al final falla para que BullMQ reintente', async () => {
    const { reconciler, storage, queue, lines } = setup(
      [ANA, BETO],
      [fileOf(ANA, 1), fileOf(BETO, 1)],
    );
    storage.failingOwners.add(ANA);

    await expect(reconciler.reconcileAll()).rejects.toBeInstanceOf(IndexReconcileIncompleteError);

    expect(queue.jobs.map((job) => job.ownerId)).toEqual([BETO]);
    expect(lines).toContainEqual({
      event: 'index.reconcile_account_failed',
      ownerId: ANA,
      errorClass: 'Error',
    });
    expect(lines).toContainEqual(
      expect.objectContaining({
        event: 'index.reconcile_completed',
        failedAccounts: 1,
        failedAccountIds: [ANA],
      }),
    );
  });
});
