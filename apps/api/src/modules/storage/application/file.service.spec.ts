import { randomUUID } from 'node:crypto';

import { DOWNLOAD_URL_TTL_SECONDS } from '@nimbo/contracts';

import {
  FakeNodeRepository as InMemoryNodeRepository,
  FakeQuotaRepository,
  FakeTransactionRunner,
  Journal,
} from '../../../../test/support/storage-fakes';
import { createActor, FixedClock, Role } from '../../../shared';
import type {
  Actor,
  IRateLimiter,
  ITransactionRunner,
  RateLimitDecision,
  RateLimitRule,
} from '../../../shared';
import { AuditAction } from '../../audit';
import type { AuditRecord, IAuditLogger } from '../../audit';
import {
  InvalidNodeRequestError,
  NameConflictError,
  NodeNotFoundError,
  StorageTooManyRequestsError,
} from '../domain/errors';
import { File } from '../domain/file';
import { FileName } from '../domain/file-name.vo';
import { Folder } from '../domain/folder';
import { FolderName } from '../domain/folder-name.vo';
import { TrashState } from '../domain/trash-state';

import { AccessibleFileUrlIssuer } from './accessible-file-url-issuer';
import type { FileServiceConfig } from './file-service-config';
import { FileService } from './file.service';
import type { IObjectStorage, PresignDownloadInput } from './ports/i-object-storage.port';
import type { StorageLogger } from './storage-logger';

const NOW = new Date('2026-09-30T10:00:00.000Z');
const EARLIER = new Date('2026-09-29T10:00:00.000Z');
const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const FILE_ID = '22222222-2222-4222-8222-222222222222';
const VERSION_ID = '33333333-3333-4333-8333-333333333333';
const ACTOR: Actor = createActor(OWNER_ID, Role.CLIENT);
const SIGNED_URL = 'https://s3.nimbo.test/bucket/u/obj?X-Amz-Signature=abc';
const DOWNLOAD_PER_MINUTE = 120;
const RETRY_AFTER_SECONDS = 17;
const CONFIG: FileServiceConfig = { downloadUrlPerMinute: DOWNLOAD_PER_MINUTE };

const FILE = File.create({
  id: FILE_ID,
  ownerId: OWNER_ID,
  folderId: null,
  name: FileName.of('Informe final.docx'),
  kind: 'docx',
  sizeBytes: 1_024n,
  currentVersionId: VERSION_ID,
  now: NOW,
});

/** Ejecutor que anota el actor de cada `withActor` y sabe si hay uno abierto (como `requireActorScope`). */
class FakeTransactions implements ITransactionRunner {
  readonly actors: string[] = [];
  private open: Actor | null = null;

  run<T>(work: () => Promise<T>): Promise<T> {
    return work();
  }

  async withActor<T>(actor: Actor, work: () => Promise<T>): Promise<T> {
    this.actors.push(actor.id);
    this.open = actor;
    try {
      return await work();
    } finally {
      this.open = null;
    }
  }

  /** Lanza como `TransactionContext.requireActorScope` si no hay transacción abierta con ese actor. */
  requireScope(actor: Actor): void {
    if (this.open?.id !== actor.id) throw new Error('No hay actor en la transacción');
  }
}

/** Doble del repositorio: exige el ámbito del actor y anota el orden de las llamadas. */
class FakeNodeRepository extends InMemoryNodeRepository {
  constructor(
    private readonly calls: string[],
    private readonly transactions: FakeTransactions,
  ) {
    super(new Journal());
    this.files.set(FILE.id, FILE);
  }

  override findAccessibleById(actor: Actor, id: string): Promise<File | null> {
    this.transactions.requireScope(actor);
    this.calls.push('findAccessibleById');
    return super.findAccessibleById(actor, id);
  }
}

class FakeRateLimiter implements IRateLimiter {
  readonly consumed: { key: string; rules: readonly RateLimitRule[] }[] = [];

  constructor(
    private readonly calls: string[],
    private readonly decision: RateLimitDecision = { allowed: true },
  ) {}

  consume(key: string, rules: readonly RateLimitRule[]): Promise<RateLimitDecision> {
    this.calls.push('consume');
    this.consumed.push({ key, rules });
    return Promise.resolve(this.decision);
  }
}

class FakeAuditLogger implements IAuditLogger {
  readonly records: AuditRecord[] = [];

  constructor(private readonly fails = false) {}

  record(entry: AuditRecord): Promise<void> {
    this.records.push(entry);
    return this.fails ? Promise.reject(new Error('audit down')) : Promise.resolve();
  }

  recordInTransaction(entry: AuditRecord): Promise<void> {
    return this.record(entry);
  }
}

function fakeObjectStorage(calls: string[]) {
  const presigned: PresignDownloadInput[] = [];
  const presignDownload = (input: PresignDownloadInput): Promise<string> => {
    calls.push('presignDownload');
    presigned.push(input);
    return Promise.resolve(SIGNED_URL);
  };
  return { storage: { presignDownload } as unknown as IObjectStorage, presigned };
}

interface SetupOptions {
  readonly decision?: RateLimitDecision;
  readonly auditFails?: boolean;
}

function setup(options: SetupOptions = {}) {
  const calls: string[] = [];
  const transactions = new FakeTransactions();
  const nodes = new FakeNodeRepository(calls, transactions);
  const rateLimiter = new FakeRateLimiter(calls, options.decision);
  const audit = new FakeAuditLogger(options.auditFails);
  const { storage, presigned } = fakeObjectStorage(calls);
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } satisfies StorageLogger;
  const service = new FileService(
    transactions,
    nodes,
    new FakeQuotaRepository(new Journal()),
    new AccessibleFileUrlIssuer(transactions, nodes, storage, new FixedClock(NOW)),
    rateLimiter,
    audit,
    new FixedClock(NOW),
    CONFIG,
    logger,
  );
  return { service, calls, transactions, nodes, rateLimiter, audit, presigned, logger };
}

describe('FileService', () => {
  describe('getDownloadUrl', () => {
    it('CA-16: busca el archivo dentro de `withActor(actor)`', async () => {
      const { service, transactions } = setup();

      await service.getDownloadUrl(ACTOR, FILE_ID);

      expect(transactions.actors).toEqual([ACTOR.id]);
    });

    it('CA-13, CA-15: firma la versión actual por 300 s, con el nombre del archivo como sugerido', async () => {
      const { service, presigned } = setup();

      const result = await service.getDownloadUrl(ACTOR, FILE_ID);

      expect(DOWNLOAD_URL_TTL_SECONDS).toBe(300);
      expect(presigned).toEqual([
        {
          key: `u/${OWNER_ID}/${FILE_ID}/${VERSION_ID}`,
          fileName: 'Informe final.docx',
          expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS,
        },
      ]);
      expect(result).toEqual({
        url: SIGNED_URL,
        expiresAt: new Date(NOW.getTime() + DOWNLOAD_URL_TTL_SECONDS * 1000),
      });
    });

    it('CA-16: un archivo ajeno responde igual que uno inexistente (404)', async () => {
      const { service, presigned } = setup();
      const stranger = createActor('44444444-4444-4444-8444-444444444444', Role.CLIENT);
      const missingId = '55555555-5555-4555-8555-555555555555';

      await expect(service.getDownloadUrl(stranger, FILE_ID)).rejects.toThrow(NodeNotFoundError);
      await expect(service.getDownloadUrl(ACTOR, missingId)).rejects.toThrow(NodeNotFoundError);
      expect(presigned).toEqual([]);
    });

    it('CA-19: la tasa por actor corre antes de buscar el archivo', async () => {
      const { service, calls, rateLimiter } = setup();

      await service.getDownloadUrl(ACTOR, FILE_ID);

      expect(calls).toEqual(['consume', 'findAccessibleById', 'presignDownload']);
      expect(rateLimiter.consumed).toEqual([
        {
          key: `storage:download-url:${OWNER_ID}`,
          rules: [{ limit: DOWNLOAD_PER_MINUTE, windowSeconds: 60 }],
        },
      ]);
    });

    it('CA-19: rechazada por tasa lanza 429 con Retry-After sin buscar el archivo', async () => {
      const { service, calls, audit, logger } = setup({
        decision: { allowed: false, retryAfterSeconds: RETRY_AFTER_SECONDS },
      });

      const error = await service.getDownloadUrl(ACTOR, FILE_ID).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(StorageTooManyRequestsError);
      expect((error as StorageTooManyRequestsError).retryAfterSeconds).toBe(RETRY_AFTER_SECONDS);
      expect(calls).toEqual(['consume']);
      expect(audit.records).toEqual([]);
      expect(logger.warn).toHaveBeenCalledWith({
        event: 'upload.rate_limited',
        operation: 'download_url',
      });
    });

    it('CA-20: audita file.download_url_issued con su tamaño, sin nombre, URL ni clave', async () => {
      const { service, audit } = setup();

      await service.getDownloadUrl(ACTOR, FILE_ID);

      expect(audit.records).toEqual([
        {
          action: AuditAction.FILE_DOWNLOAD_URL_ISSUED,
          actor: ACTOR,
          targetUserId: OWNER_ID,
          resourceId: FILE_ID,
          attributes: { sizeBytes: 1_024 },
        },
      ]);
    });

    it('CA-20: bitácora download.url_issued con fileId, sin URL, nombre ni clave', async () => {
      const { service, logger } = setup();

      await service.getDownloadUrl(ACTOR, FILE_ID);

      expect(logger.info).toHaveBeenCalledWith({ event: 'download.url_issued', fileId: FILE_ID });
      const logged = JSON.stringify(logger.info.mock.calls);
      expect(logged).not.toContain(SIGNED_URL);
      expect(logged).not.toContain('Informe final');
      expect(logged).not.toContain(`u/${OWNER_ID}`);
    });

    it('CA-20: si la auditoría falla, se registra el error y la URL se entrega igual', async () => {
      const { service, logger } = setup({ auditFails: true });

      const result = await service.getDownloadUrl(ACTOR, FILE_ID);

      expect(result.url).toBe(SIGNED_URL);
      expect(logger.error).toHaveBeenCalledWith({
        event: 'audit.record_failed',
        action: AuditAction.FILE_DOWNLOAD_URL_ISSUED,
        fileId: FILE_ID,
      });
    });
  });
});

const BRUNO: Actor = createActor('44444444-4444-4444-8444-444444444444', Role.CLIENT);
const MAX_DEPTH = 10;

/** Servicio sobre el árbol en memoria, con transacción y bloqueo de uso anotados en el diario. */
function organizeSetup() {
  const journal = new Journal();
  const transactions = new FakeTransactionRunner(journal);
  const quotas = new FakeQuotaRepository(journal, transactions.locks);
  const nodes = new InMemoryNodeRepository(journal);
  const service = new FileService(
    transactions,
    nodes,
    quotas,
    new AccessibleFileUrlIssuer(transactions, nodes, {} as IObjectStorage, new FixedClock(NOW)),
    new FakeRateLimiter([]),
    new FakeAuditLogger(),
    new FixedClock(NOW),
    CONFIG,
    { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  );

  const folder = (name: string, owner: Actor = ACTOR): Folder => {
    const created = Folder.create({
      id: randomUUID(),
      ownerId: owner.id,
      name: FolderName.of(name),
      parent: null,
      maxDepth: MAX_DEPTH,
      now: EARLIER,
    });
    nodes.folders.set(created.id, created);
    return created;
  };

  const file = (name: string, folderId: string | null = null): File => {
    const created = File.create({
      id: randomUUID(),
      ownerId: ACTOR.id,
      folderId,
      name: FileName.of(name),
      kind: 'docx',
      sizeBytes: 2_048n,
      currentVersionId: randomUUID(),
      now: EARLIER,
    });
    nodes.files.set(created.id, created);
    return created;
  };

  const trash = (target: Folder): void => {
    nodes.folders.set(
      target.id,
      Folder.rehydrate({ ...target.snapshot(), trash: TrashState.start(NOW, 30) }),
    );
  };

  return { journal, nodes, quotas, service, folder, file, trash };
}

/** Lo que pasó dentro de la transacción, sin las lecturas. */
const writesOf = (journal: Journal): string[] =>
  journal.entries.filter((entry) => !entry.startsWith('nodes:find'));

describe('FileService.rename', () => {
  it('CA-4: cambia el nombre y `actualizado_en`; carpeta, tipo, tamaño y versión no cambian', async () => {
    const { service, nodes, file } = organizeSetup();
    const original = file('Informe.docx');

    const renamed = await service.rename(ACTOR, original.id, {
      name: 'Informe final.docx',
      onConflict: 'ask',
    });

    expect(renamed.name.value).toBe('Informe final.docx');
    expect(renamed.updatedAt).toEqual(NOW);
    expect(renamed).toMatchObject({
      id: original.id,
      folderId: null,
      kind: 'docx',
      sizeBytes: original.sizeBytes,
      currentVersionId: original.currentVersionId,
    });
    expect(nodes.files.get(original.id)?.name.value).toBe('Informe final.docx');
  });

  it('CA-4: toma `lockUsage` primero y guarda con `renameFile` en la misma transacción', async () => {
    const { service, journal, file } = organizeSetup();
    const original = file('Informe.docx');

    await service.rename(ACTOR, original.id, { name: 'Otro.docx', onConflict: 'ask' });

    expect(writesOf(journal)).toEqual([
      'tx:begin',
      'quota:lockUsage',
      'nodes:renameFile',
      'tx:end',
    ]);
  });

  it('CA-4: con `ask`, un nombre ocupado en su carpeta es 409 con `suggestedName` y no guarda', async () => {
    const { service, journal, folder, file } = organizeSetup();
    const reports = folder('Reportes');
    file('Plan.docx', reports.id);
    const original = file('Borrador.docx', reports.id);

    const attempt = service.rename(ACTOR, original.id, { name: 'plan.docx', onConflict: 'ask' });

    await expect(attempt).rejects.toBeInstanceOf(NameConflictError);
    await expect(attempt).rejects.toMatchObject({ suggestedName: 'plan (1).docx' });
    expect(journal.entries).not.toContain('nodes:renameFile');
  });

  it('CA-4: con `keep_both` guarda «(n)» en su carpeta', async () => {
    const { service, folder, file } = organizeSetup();
    const reports = folder('Reportes');
    file('Plan.docx', reports.id);
    const original = file('Borrador.docx', reports.id);

    const renamed = await service.rename(ACTOR, original.id, {
      name: 'Plan.docx',
      onConflict: 'keep_both',
    });

    expect(renamed.name.value).toBe('Plan (1).docx');
  });

  it('CA-4: el mismo nombre en otra carpeta no choca', async () => {
    const { service, folder, file } = organizeSetup();
    file('Plan.docx', folder('Otra').id);
    const original = file('Borrador.docx');

    const renamed = await service.rename(ACTOR, original.id, {
      name: 'Plan.docx',
      onConflict: 'ask',
    });

    expect(renamed.name.value).toBe('Plan.docx');
  });

  it('CA-4: cambiar solo mayúsculas no choca consigo mismo', async () => {
    const { service, file } = organizeSetup();
    const original = file('informe.docx');

    const renamed = await service.rename(ACTOR, original.id, {
      name: 'INFORME.docx',
      onConflict: 'ask',
    });

    expect(renamed.name.value).toBe('INFORME.docx');
  });

  it('CA-4: un nombre inválido es 400 `STORAGE_INVALID_NODE_REQUEST` sin abrir transacción', async () => {
    const { service, journal, file } = organizeSetup();
    const original = file('informe.docx');

    const attempt = service.rename(ACTOR, original.id, { name: 'a/b.docx', onConflict: 'ask' });

    await expect(attempt).rejects.toBeInstanceOf(InvalidNodeRequestError);
    expect(journal.entries).toEqual([]);
  });

  it('CA-22: un archivo ajeno o inexistente es el mismo 404', async () => {
    const { service, file } = organizeSetup();
    const original = file('informe.docx');
    const command = { name: 'otro.docx', onConflict: 'ask' } as const;

    await expect(service.rename(BRUNO, original.id, command)).rejects.toBeInstanceOf(
      NodeNotFoundError,
    );
    await expect(service.rename(ACTOR, randomUUID(), command)).rejects.toBeInstanceOf(
      NodeNotFoundError,
    );
  });
});

describe('FileService.move', () => {
  it('CA-7: pasa a la carpeta destino; tamaño, versión y `espacio_usado` no cambian', async () => {
    const { service, nodes, quotas, folder, file } = organizeSetup();
    const reports = folder('Reportes');
    const original = file('Informe.docx');

    const moved = await service.move(ACTOR, original.id, {
      folderId: reports.id,
      onConflict: 'ask',
    });

    expect(moved).toMatchObject({
      folderId: reports.id,
      sizeBytes: original.sizeBytes,
      currentVersionId: original.currentVersionId,
    });
    expect(moved.name.value).toBe('Informe.docx');
    expect(moved.updatedAt).toEqual(NOW);
    expect(nodes.files.get(original.id)?.folderId).toBe(reports.id);
    expect(quotas.added).toEqual([]);
  });

  it('CA-7: `folderId: null` lo lleva a la raíz, con `lockUsage` primero y `moveFile`', async () => {
    const { service, journal, folder, file } = organizeSetup();
    const original = file('Informe.docx', folder('Reportes').id);

    const moved = await service.move(ACTOR, original.id, { folderId: null, onConflict: 'ask' });

    expect(moved.folderId).toBeNull();
    expect(writesOf(journal)).toEqual(['tx:begin', 'quota:lockUsage', 'nodes:moveFile', 'tx:end']);
  });

  it('CA-7: con `ask`, un nombre ocupado en el destino es 409 con `suggestedName` y no mueve', async () => {
    const { service, journal, folder, file } = organizeSetup();
    const reports = folder('Reportes');
    file('informe.DOCX', reports.id);
    const original = file('Informe.docx');

    const attempt = service.move(ACTOR, original.id, { folderId: reports.id, onConflict: 'ask' });

    await expect(attempt).rejects.toBeInstanceOf(NameConflictError);
    await expect(attempt).rejects.toMatchObject({ suggestedName: 'Informe (1).docx' });
    expect(journal.entries).not.toContain('nodes:moveFile');
  });

  it('CA-7: con `keep_both` llega al destino como «(n)»', async () => {
    const { service, folder, file } = organizeSetup();
    const reports = folder('Reportes');
    file('Informe.docx', reports.id);
    const original = file('Informe.docx');

    const moved = await service.move(ACTOR, original.id, {
      folderId: reports.id,
      onConflict: 'keep_both',
    });

    expect(moved.name.value).toBe('Informe (1).docx');
    expect(moved.folderId).toBe(reports.id);
  });

  it('CA-7: moverlo a la carpeta donde ya está no choca consigo mismo', async () => {
    const { service, folder, file } = organizeSetup();
    const reports = folder('Reportes');
    const original = file('Informe.docx', reports.id);

    const moved = await service.move(ACTOR, original.id, {
      folderId: reports.id,
      onConflict: 'ask',
    });

    expect(moved.name.value).toBe('Informe.docx');
  });

  it('CA-22: un destino ajeno, inexistente o en la papelera es 404 y no mueve', async () => {
    const { service, journal, folder, file, trash } = organizeSetup();
    const original = file('Informe.docx');
    const trashed = folder('Vieja');
    trash(trashed);
    const destinations = [folder('Ajena', BRUNO).id, randomUUID(), trashed.id];

    for (const folderId of destinations) {
      await expect(
        service.move(ACTOR, original.id, { folderId, onConflict: 'ask' }),
      ).rejects.toBeInstanceOf(NodeNotFoundError);
    }
    expect(journal.entries).not.toContain('nodes:moveFile');
  });

  it('CA-22: un archivo ajeno o inexistente es el mismo 404', async () => {
    const { service, file } = organizeSetup();
    const original = file('Informe.docx');
    const command = { folderId: null, onConflict: 'ask' } as const;

    await expect(service.move(BRUNO, original.id, command)).rejects.toBeInstanceOf(
      NodeNotFoundError,
    );
    await expect(service.move(ACTOR, randomUUID(), command)).rejects.toBeInstanceOf(
      NodeNotFoundError,
    );
  });
});
