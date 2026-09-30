import { Inject, Injectable } from '@nestjs/common';
import { DOWNLOAD_URL_TTL_SECONDS, FILES_PAGE_DEFAULT, FILES_PAGE_MAX } from '@nimbo/contracts';
import { PinoLogger } from 'nestjs-pino';

import { I_CLOCK, I_RATE_LIMITER, I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, IClock, IRateLimiter, ITransactionRunner } from '../../../shared';
import { AuditAction, I_AUDIT_LOGGER } from '../../audit';
import type { IAuditLogger } from '../../audit';
import { NodeNotFoundError } from '../domain/errors';
import type { File } from '../domain/file';
import { ObjectKey } from '../domain/object-key';

import { FILE_SERVICE_CONFIG } from './file-service-config';
import type { FileServiceConfig } from './file-service-config';
import { I_NODE_REPOSITORY } from './ports/i-node.repository.port';
import type { FileListPage, FileListQuery, INodeRepository } from './ports/i-node.repository.port';
import { I_OBJECT_STORAGE } from './ports/i-object-storage.port';
import type { IObjectStorage } from './ports/i-object-storage.port';
import { recordAudit } from './record-audit';
import { rateLimited } from './storage-logger';
import type { StorageLogger } from './storage-logger';

const RATE_LIMIT_WINDOW_SECONDS = 60;
const DOWNLOAD_RATE_KEY_PREFIX = 'storage:download-url:';
const MS_PER_SECOND = 1000;

/** URL de descarga firmada y el instante en que deja de valer (CA-13). */
export interface DownloadUrl {
  readonly url: string;
  readonly expiresAt: Date;
}

/** Ajusta el tamaño de página a 1–`FILES_PAGE_MAX`; un valor no numérico toma `FILES_PAGE_DEFAULT`. */
function clampPageLimit(limit: number): number {
  if (!Number.isFinite(limit)) return FILES_PAGE_DEFAULT;
  return Math.min(Math.max(Math.trunc(limit), 1), FILES_PAGE_MAX);
}

/**
 * Lista los archivos del actor y emite la URL de descarga (plan §6). Cada lectura corre en `withActor(actor)`: el
 * repositorio toma el `EntityManager` de ese ámbito (RLS y `accessibleNodes`, CA-16).
 */
@Injectable()
export class FileService {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_NODE_REPOSITORY) private readonly nodes: INodeRepository,
    @Inject(I_OBJECT_STORAGE) private readonly objects: IObjectStorage,
    @Inject(I_RATE_LIMITER) private readonly rateLimiter: IRateLimiter,
    @Inject(I_AUDIT_LOGGER) private readonly audit: IAuditLogger,
    @Inject(I_CLOCK) private readonly clock: IClock,
    @Inject(FILE_SERVICE_CONFIG) private readonly config: FileServiceConfig,
    @Inject(PinoLogger) private readonly logger: StorageLogger,
  ) {}

  /** Página de la raíz del actor. Lanza `InvalidQueryError` si el cursor no es uno emitido por la API. */
  list(actor: Actor, query: FileListQuery): Promise<FileListPage> {
    const page = { ...query, limit: clampPageLimit(query.limit) };
    return this.transactions.withActor(actor, () => this.nodes.listAccessible(actor, page));
  }

  /**
   * La tasa corre antes de resolver el archivo (sin oráculo, CA-19); ajeno o inexistente es `NodeNotFoundError`
   * (CA-16). La auditoría es de mejor esfuerzo: si falla, se registra y la URL se entrega igual.
   */
  async getDownloadUrl(actor: Actor, fileId: string): Promise<DownloadUrl> {
    await this.assertWithinRate(actor);
    const file = await this.transactions.withActor(actor, () =>
      this.nodes.findAccessibleById(actor, fileId),
    );
    if (file === null) throw new NodeNotFoundError();
    const url = await this.objects.presignDownload({
      key: ObjectKey.of(file.ownerId, file.id, file.currentVersionId).value,
      fileName: file.name.value,
      expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS,
    });
    const expiresAt = new Date(
      this.clock.now().getTime() + DOWNLOAD_URL_TTL_SECONDS * MS_PER_SECOND,
    );
    await this.recordIssued(actor, file);
    this.logger.info({ event: 'download.url_issued', fileId: file.id });
    return { url, expiresAt };
  }

  private async assertWithinRate(actor: Actor): Promise<void> {
    const decision = await this.rateLimiter.consume(DOWNLOAD_RATE_KEY_PREFIX + actor.id, [
      { limit: this.config.downloadUrlPerMinute, windowSeconds: RATE_LIMIT_WINDOW_SECONDS },
    ]);
    if (!decision.allowed) {
      throw rateLimited(this.logger, 'download_url', decision.retryAfterSeconds);
    }
  }

  private recordIssued(actor: Actor, file: File): Promise<void> {
    return recordAudit(
      this.audit,
      this.logger,
      {
        action: AuditAction.FILE_DOWNLOAD_URL_ISSUED,
        actor,
        targetUserId: actor.id,
        resourceId: file.id,
      },
      { fileId: file.id },
    );
  }
}
