import { Inject, Injectable } from '@nestjs/common';
import { STORAGE_NODE_FIELD_MESSAGES } from '@nimbo/contracts';
import type { OnConflict } from '@nimbo/contracts';
import { PinoLogger } from 'nestjs-pino';

import { I_CLOCK, I_RATE_LIMITER, I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, IClock, IRateLimiter, ITransactionRunner } from '../../../shared';
import { AccessLevel, PermissionResolver } from '../../access';
import { AuditAction, I_AUDIT_LOGGER } from '../../audit';
import type { IAuditLogger } from '../../audit';
import { InvalidNodeRequestError, NodeNotFoundError, VersionNotFoundError } from '../domain/errors';
import { File } from '../domain/file';
import { FileName } from '../domain/file-name.vo';

import { currentVersionObject, signDownload } from './current-version-download';
import type { DownloadObject, DownloadUrl } from './current-version-download';
import { FILE_SERVICE_CONFIG } from './file-service-config';
import type { FileServiceConfig } from './file-service-config';
import { freeFileName } from './free-file-name';
import { I_NODE_REPOSITORY } from './ports/i-node.repository.port';
import type { INodeRepository } from './ports/i-node.repository.port';
import { I_OBJECT_STORAGE } from './ports/i-object-storage.port';
import type { IObjectStorage } from './ports/i-object-storage.port';
import { I_QUOTA_REPOSITORY } from './ports/i-quota.repository.port';
import type { IQuotaRepository } from './ports/i-quota.repository.port';
import { I_VERSION_REPOSITORY } from './ports/i-version.repository.port';
import type { IVersionRepository } from './ports/i-version.repository.port';
import { recordAudit } from './record-audit';
import { rateLimited } from './storage-logger';
import type { StorageLogger } from './storage-logger';
import { WritableAccountPolicy } from './writable-account.policy';

const RATE_LIMIT_WINDOW_SECONDS = 60;
const DOWNLOAD_RATE_KEY_PREFIX = 'storage:download-url:';

/** Lo que se firma al descargar (un solo objeto y el nombre del archivo) y el tamaño que se audita (sin la clave). */
interface DownloadTarget extends DownloadObject {
  readonly fileId: string;
  readonly sizeBytes: bigint;
}

/** Ficha de `GET /files/:id`: el archivo y el nivel del actor sobre él (012 CA-12). */
export interface FileDetail {
  readonly file: File;
  readonly accessLevel: AccessLevel;
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
 * Archivos del actor: renombrar, mover (006 plan §2) y emitir la URL de descarga de la versión actual (005 plan §6) o
 * de una versión retenida (014 CA-8), por la misma ruta de firma, tasa y auditoría. Cada operación corre
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
    @Inject(I_VERSION_REPOSITORY) private readonly versions: IVersionRepository,
    @Inject(I_OBJECT_STORAGE) private readonly objects: IObjectStorage,
    @Inject(I_RATE_LIMITER) private readonly rateLimiter: IRateLimiter,
    @Inject(I_AUDIT_LOGGER) private readonly audit: IAuditLogger,
    @Inject(I_CLOCK) private readonly clock: IClock,
    @Inject(FILE_SERVICE_CONFIG) private readonly config: FileServiceConfig,
    @Inject(PinoLogger) private readonly logger: StorageLogger,
    @Inject(WritableAccountPolicy) private readonly writable: WritableAccountPolicy,
    @Inject(PermissionResolver) private readonly permissions: PermissionResolver,
  ) {}

  /**
   * 012 CA-12: la ficha la abre el propietario y quien tiene el archivo compartido, con su nivel de `access` (la regla
   * no se duplica, como en `FolderService`). Ajeno, inexistente o en la papelera es `NodeNotFoundError`. No se audita.
   */
  async getDetail(actor: Actor, fileId: string): Promise<FileDetail> {
    return this.transactions.withActor(actor, async () => {
      const file = await this.requireFile(actor, fileId);
      const accessLevel = await this.permissions.levelFor(actor, file.id);
      if (accessLevel === null) throw new NodeNotFoundError();
      return { file, accessLevel };
    });
  }

  /**
   * CA-4: otro nombre en la misma carpeta, con la regla «(n)» de 005; el tipo, el tamaño y la versión no cambian.
   * Solo cambiar mayúsculas no choca consigo mismo.
   */
  async rename(actor: Actor, fileId: string, command: RenameFileCommand): Promise<File> {
    const requested = parseFileName(command.name);
    await this.writable.assertWritable(actor);
    return this.transactions.withActor(actor, async () => {
      await this.quotas.lockUsage(actor);
      const file = await this.requireOwnedFile(actor, fileId);
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
   * versiones y `espacio_usado` no cambian. Un archivo o un destino que no son del actor es `NodeNotFoundError` (012
   * CA-14: lo compartido tampoco).
   */
  async move(actor: Actor, fileId: string, command: MoveFileCommand): Promise<File> {
    await this.writable.assertWritable(actor);
    return this.transactions.withActor(actor, async () => {
      await this.quotas.lockUsage(actor);
      const file = await this.requireOwnedFile(actor, fileId);
      await this.assertOwnedFolder(actor, command.folderId);
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
   * La tasa corre antes de resolver el archivo (sin oráculo, CA-19); ajeno, inexistente o en la papelera es
   * `NodeNotFoundError` (CA-16). La versión vigente la descarga también quien la tiene compartida (012 CA-12). Con
   * `versionId` firma esa versión, que es historial: solo del propietario (014 RN-7, 012 CA-14); si no es del archivo
   * (inexistente, podada o de otro archivo) es `VersionNotFoundError` (014 CA-11). La auditoría es de mejor esfuerzo: si falla, se registra y la
   * URL se entrega igual.
   */
  async getDownloadUrl(actor: Actor, fileId: string, versionId?: string): Promise<DownloadUrl> {
    await this.assertWithinRate(actor);
    const target = await this.transactions.withActor(actor, () =>
      this.resolveDownload(actor, fileId, versionId),
    );
    const issued = await signDownload(this.objects, this.clock, target);
    await this.recordIssued(actor, target);
    this.logger.info({ event: 'download.url_issued', fileId: target.fileId });
    return issued;
  }

  private async resolveDownload(
    actor: Actor,
    fileId: string,
    versionId: string | undefined,
  ): Promise<DownloadTarget> {
    if (versionId === undefined) {
      const file = await this.requireFile(actor, fileId);
      return { fileId: file.id, sizeBytes: file.sizeBytes, ...currentVersionObject(file) };
    }
    const file = await this.requireOwnedFile(actor, fileId);
    const target = { fileId: file.id, fileName: file.name.value };
    const version = await this.versions.find(actor, file.id, versionId);
    if (version === null) throw new VersionNotFoundError();
    return { ...target, objectKey: version.objectKey.value, sizeBytes: version.sizeBytes };
  }

  private async requireFile(actor: Actor, fileId: string): Promise<File> {
    const file = await this.nodes.findAccessibleById(actor, fileId);
    if (file === null) throw new NodeNotFoundError();
    return file;
  }

  private async requireOwnedFile(actor: Actor, fileId: string): Promise<File> {
    const file = await this.nodes.findOwnedLiveFile(actor, fileId);
    if (file === null) throw new NodeNotFoundError();
    return file;
  }

  /** `null` es la raíz, siempre del actor. */
  private async assertOwnedFolder(actor: Actor, folderId: string | null): Promise<void> {
    if (folderId === null) return;
    if ((await this.nodes.findOwnedFolder(actor, folderId)) === null) {
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

  private recordIssued(actor: Actor, target: DownloadTarget): Promise<void> {
    return recordAudit(
      this.audit,
      this.logger,
      {
        action: AuditAction.FILE_DOWNLOAD_URL_ISSUED,
        actor,
        targetUserId: actor.id,
        resourceId: target.fileId,
        attributes: { sizeBytes: Number(target.sizeBytes) },
      },
      { fileId: target.fileId },
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
