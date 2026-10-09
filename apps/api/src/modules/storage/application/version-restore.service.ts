import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { I_CLOCK, I_RATE_LIMITER, I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, IClock, IRateLimiter, ITransactionRunner } from '../../../shared';
import { AuditAction, I_AUDIT_LOGGER } from '../../audit';
import type { IAuditLogger } from '../../audit';
import {
  NodeNotFoundError,
  VersionAlreadyCurrentError,
  VersionNotFoundError,
} from '../domain/errors';
import type { File } from '../domain/file';
import { FileVersion } from '../domain/file-version';
import { ObjectKey } from '../domain/object-key';
import type { VersionEntry } from '../domain/version-history';

import { FileVersionService } from './file-version.service';
import { I_PLAN_LIMITS_PROVIDER } from './plan-limits';
import type { IPlanLimitsProvider, PlanLimits } from './plan-limits';
import { I_NODE_REPOSITORY } from './ports/i-node.repository.port';
import type { INodeRepository } from './ports/i-node.repository.port';
import { I_OBJECT_STORAGE } from './ports/i-object-storage.port';
import type { IObjectStorage } from './ports/i-object-storage.port';
import { I_QUOTA_REPOSITORY } from './ports/i-quota.repository.port';
import type { IQuotaRepository } from './ports/i-quota.repository.port';
import { I_VERSION_REPOSITORY } from './ports/i-version.repository.port';
import type { IVersionRepository } from './ports/i-version.repository.port';
import { QuotaService } from './quota.service';
import { recordAudit } from './record-audit';
import { rateLimited } from './storage-logger';
import type { StorageLogger } from './storage-logger';
import { VERSION_RESTORE_CONFIG } from './version-restore-config';
import type { VersionRestoreConfig } from './version-restore-config';

const RATE_LIMIT_WINDOW_SECONDS = 60;
const RESTORE_RATE_KEY_PREFIX = 'storage:version-restore:';

const errorNameOf = (error: unknown): string => (error instanceof Error ? error.name : 'unknown');

/** Qué se pide restaurar y con qué límites del plan (pedidos fuera de la transacción). */
interface RestoreRequest {
  readonly fileId: string;
  readonly versionId: string;
  readonly limits: PlanLimits;
}

/** El archivo vivo y la versión retenida, no actual, cuyo contenido se restaura. */
interface Restorable {
  readonly file: File;
  readonly source: FileVersion;
}

/** El objeto copiado: id de la versión nueva y su clave (`u/{propietario}/{archivo}/{version}`). */
interface CopiedObject {
  readonly id: string;
  readonly objectKey: ObjectKey;
}

/**
 * Restaurar una versión (plan 014 §1, CA-9 a CA-12): crea una versión **nueva** de origen `restauracion` con el
 * contenido de una retenida; ninguna existente cambia. Tasa propia antes de resolver el archivo (sin oráculo) →
 * archivo con `accessibleNodes` → versión (404/409) → cuota (RN-9: sin máximo por archivo) → `copyObject` fuera de la
 * transacción (como los bytes de una carga) → transacción que bajo `lockUsage` revalida todo y llama a
 * `FileVersionService.register` → poda y auditoría tras el commit. Si la transacción falla, purga la copia (Art. XI).
 */
@Injectable()
export class VersionRestoreService {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_NODE_REPOSITORY) private readonly nodes: INodeRepository,
    @Inject(I_VERSION_REPOSITORY) private readonly versions: IVersionRepository,
    @Inject(I_QUOTA_REPOSITORY) private readonly quotas: IQuotaRepository,
    @Inject(I_OBJECT_STORAGE) private readonly objects: IObjectStorage,
    @Inject(QuotaService) private readonly quota: QuotaService,
    @Inject(FileVersionService) private readonly fileVersions: FileVersionService,
    @Inject(I_PLAN_LIMITS_PROVIDER) private readonly planLimits: IPlanLimitsProvider,
    @Inject(I_RATE_LIMITER) private readonly rateLimiter: IRateLimiter,
    @Inject(I_AUDIT_LOGGER) private readonly audit: IAuditLogger,
    @Inject(I_CLOCK) private readonly clock: IClock,
    @Inject(VERSION_RESTORE_CONFIG) private readonly config: VersionRestoreConfig,
    @Inject(PinoLogger) private readonly logger: StorageLogger,
  ) {}

  /** Devuelve la versión nueva con su cambio de tamaño frente a la que era la actual. */
  async restore(actor: Actor, fileId: string, versionId: string): Promise<VersionEntry> {
    await this.assertWithinRate(actor);
    const request = { fileId, versionId, limits: await this.planLimits.limitsFor(actor) };
    const { file, source } = await this.transactions.withActor(actor, () =>
      this.resolveRestorable(actor, request),
    );
    const id = randomUUID();
    const copy = { id, objectKey: ObjectKey.of(file.ownerId, file.id, id) };
    await this.objects.copyObject(source.objectKey.value, copy.objectKey.value);
    const entry = await this.registerCopy(actor, request, copy);
    await this.fileVersions.afterCommit(actor, file.id);
    await this.recordRestored(actor, entry.version, source.number);
    return entry;
  }

  /** Ajeno, inexistente o en la papelera ⇒ 404 de nodo; versión ajena al archivo ⇒ 404; la actual ⇒ 409; cuota ⇒ 422. */
  private async resolveRestorable(actor: Actor, request: RestoreRequest): Promise<Restorable> {
    const file = await this.nodes.findAccessibleById(actor, request.fileId);
    if (file === null) throw new NodeNotFoundError();
    const source = await this.versions.find(actor, file.id, request.versionId);
    if (source === null) throw new VersionNotFoundError();
    if (source.id === file.currentVersionId) throw new VersionAlreadyCurrentError();
    const demand = { bytes: source.sizeBytes, purpose: 'restore' } as const;
    await this.quota.assertFits(actor, demand, request.limits);
    return { file, source };
  }

  private async registerCopy(
    actor: Actor,
    request: RestoreRequest,
    copy: CopiedObject,
  ): Promise<VersionEntry> {
    try {
      return await this.transactions.withActor(actor, () =>
        this.registerRestoration(actor, request, copy),
      );
    } catch (error) {
      await this.discardCopy(request.fileId, copy);
      throw error;
    }
  }

  /** `lockUsage` primero: revalida con el árbol ya serializado (una poda o un reemplazo pudieron llegar antes). */
  private async registerRestoration(
    actor: Actor,
    request: RestoreRequest,
    copy: CopiedObject,
  ): Promise<VersionEntry> {
    await this.quotas.lockUsage(actor);
    const { file, source } = await this.resolveRestorable(actor, request);
    const now = this.clock.now();
    const { version } = await this.fileVersions.register(actor, {
      file,
      buildVersion: (number) =>
        FileVersion.fromRestoration(source, { ...copy, createdBy: actor.id, number, now }),
    });
    return { version, deltaBytes: version.sizeBytes - file.sizeBytes };
  }

  /** Compensación de mejor esfuerzo: un fallo se registra (sin la clave) y no tapa el error original. */
  private async discardCopy(fileId: string, copy: CopiedObject): Promise<void> {
    try {
      await this.objects.purgeObject(copy.objectKey.value);
    } catch (error) {
      this.logger.error({
        event: 'version.restore_discard_failed',
        fileId,
        versionId: copy.id,
        errorName: errorNameOf(error),
      });
    }
  }

  private async assertWithinRate(actor: Actor): Promise<void> {
    const decision = await this.rateLimiter.consume(RESTORE_RATE_KEY_PREFIX + actor.id, [
      { limit: this.config.restorePerMinute, windowSeconds: RATE_LIMIT_WINDOW_SECONDS },
    ]);
    if (!decision.allowed) {
      throw rateLimited(this.logger, 'version_restore', decision.retryAfterSeconds);
    }
  }

  private async recordRestored(
    actor: Actor,
    version: FileVersion,
    restoredFromNumber: number,
  ): Promise<void> {
    const ids = { fileId: version.fileId, versionId: version.id };
    const numbers = { versionNumber: version.number, restoredFromNumber };
    this.logger.info({ event: 'version.restored', ...ids, ...numbers });
    await recordAudit(
      this.audit,
      this.logger,
      {
        action: AuditAction.FILE_VERSION_RESTORED,
        actor,
        targetUserId: actor.id,
        resourceId: version.fileId,
        attributes: { versionId: version.id, ...numbers, sizeBytes: Number(version.sizeBytes) },
      },
      ids,
    );
  }
}
