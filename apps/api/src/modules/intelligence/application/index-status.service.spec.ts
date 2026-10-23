import { randomUUID } from 'node:crypto';

import type { FileKind } from '@nimbo/contracts';

import {
  FakeIndexingRepository,
  FakeIndexQueue,
  FakeIndexStatusNotifier,
} from '../../../../test/support/intelligence-fakes';
import {
  FakeAuditLogger,
  FakeRateLimiter,
  FakeTransactionRunner,
  Journal,
} from '../../../../test/support/storage-fakes';
import {
  createActor,
  FixedClock,
  InsufficientRoleError,
  RateLimitExceededError,
  Role,
} from '../../../shared';
import type { Actor } from '../../../shared';
import { AuditAction } from '../../audit';
import { NodeNotFoundError } from '../../storage';
import type { IndexableFile } from '../../storage';
import { IndexingNotRetryableError } from '../domain/errors';
import { FileIndexing } from '../domain/file-indexing';

import { ExtractorRegistry } from './extractor-registry';
import { IndexStatusService } from './index-status.service';
import type { IndexStatusFiles, IndexStatusPermissions } from './index-status.service';
import type { IntelligenceLogger } from './intelligence-logger';
import type { ITextExtractor } from './ports/i-text-extractor.port';

const CREATED = new Date('2026-10-21T15:00:00.000Z');
const NOW = new Date('2026-10-22T09:30:00.000Z');
const RETRIES_PER_MINUTE = 10;
const OWNER = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const EDITOR = createActor('33333333-3333-4333-8333-333333333333', Role.CLIENT);

const extractorFor = (kind: FileKind): ITextExtractor => ({
  kind,
  extract: () => Promise.resolve([]),
});

const aFile = (kind: FileKind = 'docx'): IndexableFile => ({
  id: randomUUID(),
  ownerId: OWNER.id,
  kind,
  sizeBytes: 1024n,
  currentVersionId: randomUUID(),
});

const failedIndexing = (file: IndexableFile): FileIndexing =>
  FileIndexing.pending({
    id: randomUUID(),
    fileId: file.id,
    versionId: file.currentVersionId,
    now: CREATED,
  })
    .claim(CREATED)
    .fail('proveedor_no_disponible', { durationMs: null, now: CREATED });

/** Archivos que ve cada actor y qué puede editar: antes de 012 nadie más que la propietaria (PD-120). */
class FakeAccess implements IndexStatusFiles, IndexStatusPermissions {
  readonly visible = new Map<string, Set<string>>();
  readonly editable = new Set<string>();
  readonly files = new Map<string, IndexableFile>();

  grant(actor: Actor, file: IndexableFile, canEdit: boolean): void {
    this.files.set(file.id, file);
    this.visible.set(actor.id, new Set([...(this.visible.get(actor.id) ?? []), file.id]));
    if (canEdit) this.editable.add(`${actor.id}:${file.id}`);
  }

  findAccessible(actor: Actor, fileId: string): Promise<IndexableFile | null> {
    const seen = this.visible.get(actor.id)?.has(fileId) ?? false;
    return Promise.resolve(seen ? (this.files.get(fileId) ?? null) : null);
  }

  can(actor: Actor, nodeId: string): Promise<boolean> {
    return Promise.resolve(this.editable.has(`${actor.id}:${nodeId}`));
  }
}

function setup() {
  const journal = new Journal();
  const access = new FakeAccess();
  const indexings = new FakeIndexingRepository();
  const queue = new FakeIndexQueue();
  const notifier = new FakeIndexStatusNotifier();
  const rateLimiter = new FakeRateLimiter(journal);
  const audit = new FakeAuditLogger(journal);
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const service = new IndexStatusService(
    new FakeTransactionRunner(journal),
    access,
    indexings,
    access,
    new ExtractorRegistry([extractorFor('docx'), extractorFor('texto')]),
    queue,
    notifier,
    rateLimiter,
    audit,
    new FixedClock(NOW),
    { retriesPerMinute: RETRIES_PER_MINUTE },
    logger as unknown as IntelligenceLogger,
  );
  return { access, indexings, queue, notifier, rateLimiter, audit, service };
}

/** Un archivo `fallido` de la propietaria, visible para `EDITOR` con o sin edición. */
function failedWorld(editorCanEdit: boolean) {
  const world = setup();
  const file = aFile();
  world.access.grant(OWNER, file, true);
  world.access.grant(EDITOR, file, editorCanEdit);
  world.indexings.byVersion.set(file.currentVersionId, failedIndexing(file));
  return { ...world, file };
}

describe('IndexStatusService (019 plan §4)', () => {
  describe('get', () => {
    it('CA-14: `fallido` con motivo, fecha y «Reintentar» para quien puede editar', async () => {
      const { service, file } = failedWorld(true);

      await expect(service.get(EDITOR, file.id)).resolves.toEqual({
        state: 'fallido',
        reason: 'proveedor_no_disponible',
        updatedAt: CREATED,
        canRetry: true,
      });
    });

    it('CA-13: un lector ve el estado pero no la acción', async () => {
      const { service, file } = failedWorld(false);

      await expect(service.get(EDITOR, file.id)).resolves.toMatchObject({
        state: 'fallido',
        canRetry: false,
      });
    });

    it('CA-6: un tipo sin extractor responde `state: null` sin leer la indexación', async () => {
      const { service, access } = setup();
      const image = aFile('imagen');
      access.grant(OWNER, image, true);

      await expect(service.get(OWNER, image.id)).resolves.toEqual({
        state: null,
        reason: null,
        updatedAt: null,
        canRetry: false,
      });
    });

    it('CA-18: un archivo que el actor no ve es `NodeNotFoundError`', async () => {
      const { service } = setup();

      await expect(service.get(OWNER, randomUUID())).rejects.toBeInstanceOf(NodeNotFoundError);
    });
  });

  describe('retry', () => {
    it('CA-13: un editor reintenta: `pendiente` sin intentos, en la cola, auditado con él y avisado a la propietaria', async () => {
      const { service, file, indexings, queue, audit, notifier } = failedWorld(true);

      await service.retry(EDITOR, file.id);

      expect(indexings.byVersion.get(file.currentVersionId)?.snapshot()).toMatchObject({
        state: 'pendiente',
        reason: null,
        attempts: 0,
        updatedAt: NOW,
      });
      expect(queue.jobs).toEqual([
        { fileId: file.id, versionId: file.currentVersionId, ownerId: OWNER.id },
      ]);
      expect(audit.records).toEqual([
        {
          action: AuditAction.FILE_INDEX_RETRIED,
          actor: EDITOR,
          targetUserId: OWNER.id,
          resourceId: file.id,
          attributes: { versionId: file.currentVersionId },
        },
      ]);
      expect(notifier.changes).toEqual([
        { ownerId: OWNER.id, fileId: file.id, state: 'pendiente', reason: null },
      ]);
    });

    it('CA-13: un lector recibe `SHARED_FORBIDDEN` y nada cambia', async () => {
      const { service, file, indexings, queue } = failedWorld(false);

      await expect(service.retry(EDITOR, file.id)).rejects.toBeInstanceOf(InsufficientRoleError);
      expect(indexings.byVersion.get(file.currentVersionId)?.state).toBe('fallido');
      expect(queue.jobs).toEqual([]);
    });

    it('CA-13: sin fila (tipo no indexable o sin empezar) → 409', async () => {
      const { service, access } = setup();
      const file = aFile();
      access.grant(OWNER, file, true);

      await expect(service.retry(OWNER, file.id)).rejects.toBeInstanceOf(IndexingNotRetryableError);
    });

    it('CA-13: si otro reintento ganó la carrera (CAS), 409 y un solo trabajo', async () => {
      const { service, file, queue } = failedWorld(true);

      const results = await Promise.allSettled([
        service.retry(OWNER, file.id),
        service.retry(OWNER, file.id),
      ]);

      expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
      expect(queue.jobs).toHaveLength(1);
    });

    it('plan §4: el límite de tasa va antes de resolver el archivo (sin oráculo) y responde 429', async () => {
      const { service, rateLimiter } = setup();
      rateLimiter.decision = { allowed: false, retryAfterSeconds: 42 };

      const rejected = service.retry(OWNER, randomUUID());

      await expect(rejected).rejects.toBeInstanceOf(RateLimitExceededError);
      await expect(rejected).rejects.toMatchObject({ retryAfterSeconds: 42 });
      expect(rateLimiter.calls).toEqual([
        {
          key: `intelligence:index-retry:${OWNER.id}`,
          rules: [{ limit: RETRIES_PER_MINUTE, windowSeconds: 60 }],
        },
      ]);
    });
  });
});
