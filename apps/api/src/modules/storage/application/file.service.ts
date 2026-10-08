import { Inject, Injectable } from '@nestjs/common';
import { STORAGE_NODE_FIELD_MESSAGES } from '@nimbo/contracts';
import type { OnConflict } from '@nimbo/contracts';
import { PinoLogger } from 'nestjs-pino';

import { I_CLOCK, I_RATE_LIMITER, I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, IClock, IRateLimiter, ITransactionRunner } from '../../../shared';
import { AuditAction, I_AUDIT_LOGGER } from '../../audit';
import type { IAuditLogger } from '../../audit';
import { InvalidNodeRequestError, NodeNotFoundError } from '../domain/errors';
import { File } from '../domain/file';
import { FileName } from '../domain/file-name.vo';

import { AccessibleFileUrlIssuer } from './accessible-file-url-issuer';
import { FILE_SERVICE_CONFIG } from './file-service-config';
import type { FileServiceConfig } from './file-service-config';
import { freeFileName } from './free-file-name';
import { I_NODE_REPOSITORY } from './ports/i-node.repository.port';
import type { INodeRepository } from './ports/i-node.repository.port';
import { I_QUOTA_REPOSITORY } from './ports/i-quota.repository.port';
import type { IQuotaRepository } from './ports/i-quota.repository.port';
import { recordAudit } from './record-audit';
import { rateLimited } from './storage-logger';
import type { StorageLogger } from './storage-logger';

const RATE_LIMIT_WINDOW_SECONDS = 60;
const DOWNLOAD_RATE_KEY_PREFIX = 'storage:download-url:';

/** URL de descarga firmada y el instante en que deja de valer (CA-13). */
export interface DownloadUrl {
  readonly url: string;
  readonly expiresAt: Date;
}

/** `PATCH /files/:id`: nombre nuevo tal como llegó y qué hacer si está ocupado en su carpeta (CA-4). */
export interface RenameFileCommand {
  readonly name: string;
  readonly onConflict: OnConflict;
}

/** `POST /files/:id/move`: carpeta destino (`null` = raíz) y qué hacer si el nombre está ocupado allí (CA-7). */
export interface MoveFileCommand {
  readonly folderId: string | null;
  readonly onConflict: OnConflict;
}

/**
 * Archivos del actor: renombrar, mover (006 plan §2) y emitir la URL de descarga (005 plan §6). Cada operación corre
 * en `withActor(actor)`: el repositorio toma el `EntityManager` de ese ámbito (RLS y `accessibleNodes`, CA-16). Las
 * mutaciones toman primero `lockUsage`, el mismo punto de serialización del árbol que carpetas y cargas. Ajeno,
 * inexistente o en la papelera es el mismo `NodeNotFoundError` (CA-22). Renombrar y mover no se auditan (CA-24).
 */
@Injectable()
export class FileService {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_NODE_REPOSITORY) private readonly nodes: INodeRepository,
    @Inject(I_QUOTA_REPOSITORY) private readonly quotas: IQuotaRepository,
    private readonly urlIssuer: AccessibleFileUrlIssuer,
    @Inject(I_RATE_LIMITER) private readonly rateLimiter: IRateLimiter,
    @Inject(I_AUDIT_LOGGER) private readonly audit: IAuditLogger,
    @Inject(I_CLOCK) private readonly clock: IClock,
    @Inject(FILE_SERVICE_CONFIG) private readonly config: FileServiceConfig,
    @Inject(PinoLogger) private readonly logger: StorageLogger,
  ) {}

  /**
   * CA-4: otro nombre en la misma carpeta, con la regla «(n)» de 005; el tipo, el tamaño y la versión no cambian.
   * Solo cambiar mayúsculas no choca consigo mismo.
   */
  async rename(actor: Actor, fileId: string, command: RenameFileCommand): Promise<File> {
    const requested = parseFileName(command.name);
    return this.transactions.withActor(actor, async () => {
      await this.quotas.lockUsage(actor);
      const file = await this.requireFile(actor, fileId);
      const name = await freeFileName(this.nodes, actor, {
        name: requested,
        folderId: file.folderId,
        keepBoth: command.onConflict === 'keep_both',
        exceptId: file.id,
      });
      const renamed = File.rehydrate({ ...file.snapshot(), name, updatedAt: this.clock.now() });
      await this.nodes.renameFile(actor, renamed);
      return renamed;
    });
  }

  /**
   * CA-7: el archivo pasa a `folderId` (`null` = raíz) con la regla «(n)» de 005 en el destino; el tamaño, las
   * versiones y `espacio_usado` no cambian. Un destino que el actor no ve es `NodeNotFoundError`.
   */
  move(actor: Actor, fileId: string, command: MoveFileCommand): Promise<File> {
    return this.transactions.withActor(actor, async () => {
      await this.quotas.lockUsage(actor);
      const file = await this.requireFile(actor, fileId);
      await this.assertFolderAccessible(actor, command.folderId);
      const name = await freeFileName(this.nodes, actor, {
        name: file.name,
        folderId: command.folderId,
        keepBoth: command.onConflict === 'keep_both',
        exceptId: file.id,
      });
      const moved = File.rehydrate({
        ...file.snapshot(),
        folderId: command.folderId,
        name,
        updatedAt: this.clock.now(),
      });
      await this.nodes.moveFile(actor, moved);
      return moved;
    });
  }

  /**
   * La tasa corre antes de resolver el archivo (sin oráculo, CA-19); ajeno o inexistente es `NodeNotFoundError`
   * (CA-16). La auditoría es de mejor esfuerzo: si falla, se registra y la URL se entrega igual.
   */
  async getDownloadUrl(actor: Actor, fileId: string): Promise<DownloadUrl> {
    await this.assertWithinRate(actor);
    const file = await this.urlIssuer.resolve(actor, fileId);
    const { url, expiresAt } = await this.urlIssuer.sign(file);
    await this.recordIssued(actor, file);
    this.logger.info({ event: 'download.url_issued', fileId: file.id });
    return { url, expiresAt };
  }

  private async requireFile(actor: Actor, fileId: string): Promise<File> {
    const file = await this.nodes.findAccessibleById(actor, fileId);
    if (file === null) throw new NodeNotFoundError();
    return file;
  }

  /** `null` es la raíz, siempre accesible. */
  private async assertFolderAccessible(actor: Actor, folderId: string | null): Promise<void> {
    if (folderId === null) return;
    if ((await this.nodes.findAccessibleFolder(actor, folderId)) === null) {
      throw new NodeNotFoundError();
    }
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
        attributes: { sizeBytes: Number(file.sizeBytes) },
      },
      { fileId: file.id },
    );
  }
}

/** El esquema de la petición ya validó la forma; esto normaliza y cubre a quien llame sin pasar por él (CA-4). */
function parseFileName(raw: string): FileName {
  const parsed = FileName.parse(raw);
  if (parsed.ok) return parsed.name;
  throw new InvalidNodeRequestError([
    { field: 'name', reason: parsed.reason, message: STORAGE_NODE_FIELD_MESSAGES[parsed.reason] },
  ]);
}
