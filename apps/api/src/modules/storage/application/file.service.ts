import { Inject, Injectable } from '@nestjs/common';
import { DOWNLOAD_URL_TTL_SECONDS, FILES_PAGE_DEFAULT, FILES_PAGE_MAX } from '@nimbo/contracts';
import { PinoLogger } from 'nestjs-pino';

import { I_CLOCK, I_RATE_LIMITER } from '../../../shared';
import type { Actor, IClock, IRateLimiter } from '../../../shared';
import { AuditAction, I_AUDIT_LOGGER } from '../../audit';
import type { IAuditLogger } from '../../audit';
import { NodeNotFoundError, StorageTooManyRequestsError } from '../domain/errors';
import type { File } from '../domain/file';
import { ObjectKey } from '../domain/object-key';

import { FILE_SERVICE_CONFIG } from './file-service-config';
import type { FileServiceConfig } from './file-service-config';
import { I_NODE_REPOSITORY } from './ports/i-node.repository.port';
import type { FileListPage, FileListQuery, INodeRepository } from './ports/i-node.repository.port';
import { I_OBJECT_STORAGE } from './ports/i-object-storage.port';
import type { IObjectStorage } from './ports/i-object-storage.port';

const RATE_LIMIT_WINDOW_SECONDS = 60;
const DOWNLOAD_RATE_KEY_PREFIX = 'storage:download-url:';
const MS_PER_SECOND = 1000;

/**
 * Lo mínimo que `FileService` necesita del logger (se inyecta `PinoLogger`; permite un doble en las pruebas).
 * Solo identificadores: nunca nombre de archivo, URL, clave de objeto ni firmas (plan §7, CA-20).
 */
export interface FileServiceLogger {
  info(payload: Record<string, unknown>): void;
  error(payload: Record<string, unknown>): void;
}

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

/** Lista los archivos del actor y emite la URL de descarga (plan §6). No abre transacción: los puertos la toman. */
@Injectable()
export class FileService {
  constructor(
    @Inject(I_NODE_REPOSITORY) private readonly nodes: INodeRepository,
    @Inject(I_OBJECT_STORAGE) private readonly objects: IObjectStorage,
    @Inject(I_RATE_LIMITER) private readonly rateLimiter: IRateLimiter,
    @Inject(I_AUDIT_LOGGER) private readonly audit: IAuditLogger,
    @Inject(I_CLOCK) private readonly clock: IClock,
    @Inject(FILE_SERVICE_CONFIG) private readonly config: FileServiceConfig,
    @Inject(PinoLogger) private readonly logger: FileServiceLogger,
  ) {}

  /** Página de la raíz del actor. Lanza `InvalidQueryError` si el cursor no es uno emitido por la API. */
  list(actor: Actor, query: FileListQuery): Promise<FileListPage> {
    return this.nodes.listAccessible(actor, { ...query, limit: clampPageLimit(query.limit) });
  }

  /**
   * La tasa corre antes de resolver el archivo (sin oráculo, CA-19); ajeno o inexistente es `NodeNotFoundError`
   * (CA-16). La auditoría es de mejor esfuerzo: si falla, se registra y la URL se entrega igual.
   */
  async getDownloadUrl(actor: Actor, fileId: string): Promise<DownloadUrl> {
    await this.assertWithinRate(actor);
    const file = await this.nodes.findAccessibleById(actor, fileId);
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
    if (!decision.allowed) throw new StorageTooManyRequestsError(decision.retryAfterSeconds);
  }

  private async recordIssued(actor: Actor, file: File): Promise<void> {
    const action = AuditAction.FILE_DOWNLOAD_URL_ISSUED;
    try {
      await this.audit.record({ action, actor, targetUserId: actor.id, resourceId: file.id });
    } catch {
      this.logger.error({ event: 'audit.record_failed', action, fileId: file.id });
    }
  }
}
