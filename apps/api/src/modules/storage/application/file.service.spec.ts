import { DOWNLOAD_URL_TTL_SECONDS, FILES_PAGE_DEFAULT, FILES_PAGE_MAX } from '@nimbo/contracts';

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
import { NodeNotFoundError, StorageTooManyRequestsError } from '../domain/errors';
import { File } from '../domain/file';
import { FileName } from '../domain/file-name.vo';

import type { FileServiceConfig } from './file-service-config';
import { FileService } from './file.service';
import type { FileListPage, FileListQuery, INodeRepository } from './ports/i-node.repository.port';
import type { IObjectStorage, PresignDownloadInput } from './ports/i-object-storage.port';
import type { StorageLogger } from './storage-logger';

const NOW = new Date('2026-09-30T10:00:00.000Z');
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

/** Doble del repositorio: devuelve el archivo solo a su propietario y anota el orden de las llamadas. */
class FakeNodeRepository implements INodeRepository {
  readonly queries: FileListQuery[] = [];

  constructor(
    private readonly calls: string[],
    private readonly transactions: FakeTransactions,
    private readonly page: FileListPage = { items: [FILE], nextCursor: 'cursor-2' },
  ) {}

  findAccessibleById(actor: Actor, id: string): Promise<File | null> {
    this.transactions.requireScope(actor);
    this.calls.push('findAccessibleById');
    return Promise.resolve(actor.id === FILE.ownerId && id === FILE.id ? FILE : null);
  }

  listAccessible(actor: Actor, query: FileListQuery): Promise<FileListPage> {
    this.transactions.requireScope(actor);
    this.calls.push('listAccessible');
    this.queries.push(query);
    return Promise.resolve(this.page);
  }

  findTakenNames(): Promise<readonly string[]> {
    return Promise.resolve([]);
  }

  insertWithVersion(): Promise<void> {
    return Promise.resolve();
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
    storage,
    rateLimiter,
    audit,
    new FixedClock(NOW),
    CONFIG,
    logger,
  );
  return { service, calls, transactions, nodes, rateLimiter, audit, presigned, logger };
}

describe('FileService', () => {
  describe('list', () => {
    it('CA-1: devuelve la página del repositorio con su cursor opaco', async () => {
      const { service, nodes } = setup();

      const page = await service.list(ACTOR, { cursor: 'cursor-1', limit: 20 });

      expect(page).toEqual({ items: [FILE], nextCursor: 'cursor-2' });
      expect(nodes.queries).toEqual([{ cursor: 'cursor-1', limit: 20 }]);
    });

    it('CA-16: consulta dentro de `withActor(actor)` (RLS y `accessibleNodes` exigen el ámbito)', async () => {
      const { service, transactions } = setup();

      await service.list(ACTOR, { limit: 20 });

      expect(transactions.actors).toEqual([ACTOR.id]);
    });

    it.each([
      [0, 1],
      [-5, 1],
      [101, FILES_PAGE_MAX],
      [Number.NaN, FILES_PAGE_DEFAULT],
      [12.7, 12],
    ])('CA-1: un límite %p fuera de rango se ajusta a %p', async (limit, expected) => {
      const { service, nodes } = setup();

      await service.list(ACTOR, { limit });

      expect(nodes.queries[0]?.limit).toBe(expected);
    });
  });

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

    it('CA-20: audita file.download_url_issued sin nombre, URL ni clave', async () => {
      const { service, audit } = setup();

      await service.getDownloadUrl(ACTOR, FILE_ID);

      expect(audit.records).toEqual([
        {
          action: AuditAction.FILE_DOWNLOAD_URL_ISSUED,
          actor: ACTOR,
          targetUserId: OWNER_ID,
          resourceId: FILE_ID,
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
