import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { errorName, I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, ITransactionRunner } from '../../../shared';
import { AuditAction, I_AUDIT_LOGGER } from '../../audit';
import type { IAuditLogger } from '../../audit';
import type { FileVersion } from '../domain/file-version';
import { VersionRetention } from '../domain/version-retention';

import { I_PLAN_LIMITS_PROVIDER } from './plan-limits';
import type { IPlanLimitsProvider } from './plan-limits';
import { I_NODE_REPOSITORY } from './ports/i-node.repository.port';
import type { INodeRepository } from './ports/i-node.repository.port';
import { I_OBJECT_STORAGE } from './ports/i-object-storage.port';
import type { IObjectStorage } from './ports/i-object-storage.port';
import { I_QUOTA_REPOSITORY } from './ports/i-quota.repository.port';
import type { IQuotaRepository } from './ports/i-quota.repository.port';
import { I_VERSION_REPOSITORY } from './ports/i-version.repository.port';
import type { IVersionRepository } from './ports/i-version.repository.port';
import { recordAudit } from './record-audit';
import type { StorageLogger } from './storage-logger';

/** Por qué se borra una versión: excede las retenidas (014) o venció su conservación (014b). */
type PruneReason = 'retention' | 'kept_expired';

/**
 * Poda por retención (plan 014 §1, CA-13, CA-14): después del commit de una versión nueva, borra las que exceden
 * `PlanLimits.retainedVersions`, de la más antigua a la más reciente y nunca la actual. Cada una corre en su **propia**
 * transacción `lockUsage` → `purgeObject` → fila → `addUsedBytes(-bytes)`, como `TrashPurger`: si el objeto falla, la
 * fila y el espacio no cambian y la poda siguiente lo reintenta. Nunca lanza: registra `version.prune_failed` con solo
 * UUID y el nombre del error (el mensaje de S3 puede traer la clave). Desde 014b también purga, con el mismo camino, los
 * originales conservados vencidos (`purgeExpiredOriginals`), que nunca restan del espacio (RN-7).
 */
@Injectable()
export class VersionPruner {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_NODE_REPOSITORY) private readonly nodes: INodeRepository,
    @Inject(I_VERSION_REPOSITORY) private readonly versions: IVersionRepository,
    @Inject(I_QUOTA_REPOSITORY) private readonly quotas: IQuotaRepository,
    @Inject(I_OBJECT_STORAGE) private readonly objects: IObjectStorage,
    @Inject(I_PLAN_LIMITS_PROVIDER) private readonly planLimits: IPlanLimitsProvider,
    @Inject(I_AUDIT_LOGGER) private readonly audit: IAuditLogger,
    @Inject(PinoLogger) private readonly logger: StorageLogger,
  ) {}

  /** Poda el archivo `fileId` del actor; si no lo ve vivo (ajeno, inexistente o en la papelera) no hace nada. */
  async prune(actor: Actor, fileId: string): Promise<void> {
    let surplus: readonly FileVersion[];
    try {
      surplus = await this.surplusOf(actor, fileId);
    } catch (error) {
      this.logger.error({ event: 'version.prune_failed', fileId, errorName: errorName(error) });
      return;
    }
    await this.pruneAll(actor, surplus, 'retention');
  }

  /**
   * Purga los originales conservados vencidos a `now` de los archivos vivos del actor (014b CA-6, CA-7, CA-9) y devuelve
   * cuántos borró. Un archivo en la papelera no es accesible: su original espera a que vuelva o cae con su purga.
   */
  async purgeExpiredOriginals(actor: Actor, now: Date): Promise<number> {
    let expired: readonly FileVersion[];
    try {
      expired = await this.transactions.withActor(actor, () =>
        this.versions.listExpiredKept(actor, now),
      );
    } catch (error) {
      this.logger.error({
        event: 'version.prune_failed',
        userId: actor.id,
        errorName: errorName(error),
      });
      return 0;
    }
    return this.pruneAll(actor, expired, 'kept_expired');
  }

  /** Cada versión en su propia transacción; devuelve cuántas borró. */
  private async pruneAll(
    actor: Actor,
    versions: readonly FileVersion[],
    reason: PruneReason,
  ): Promise<number> {
    let pruned = 0;
    for (const version of versions) {
      if (await this.pruneOne(actor, version, reason)) pruned += 1;
    }
    return pruned;
  }

  private async surplusOf(actor: Actor, fileId: string): Promise<readonly FileVersion[]> {
    const { retainedVersions } = await this.planLimits.limitsFor(actor);
    const versions = await this.transactions.withActor(actor, async () => {
      if ((await this.nodes.findAccessibleById(actor, fileId)) === null) return [];
      return this.versions.list(actor, fileId);
    });
    return VersionRetention.surplus(versions, retainedVersions);
  }

  private async pruneOne(
    actor: Actor,
    version: FileVersion,
    reason: PruneReason,
  ): Promise<boolean> {
    try {
      if (!(await this.deleteVersion(actor, version))) return false;
      await this.recordPruned(actor, version, reason);
      return true;
    } catch (error) {
      this.logger.error({
        event: 'version.prune_failed',
        fileId: version.fileId,
        versionId: version.id,
        errorName: errorName(error),
      });
      return false;
    }
  }

  /**
   * `false` si otra poda ya borró la fila: entonces no se resta el espacio otra vez. Un original conservado ya no cuenta
   * en el espacio y no se resta (014b CA-8, RN-7).
   */
  private deleteVersion(actor: Actor, version: FileVersion): Promise<boolean> {
    return this.transactions.withActor(actor, async () => {
      await this.quotas.lockUsage(actor);
      await this.objects.purgeObject(version.objectKey.value);
      if (!(await this.versions.delete(actor, version))) return false;
      if (version.countsInQuota) await this.quotas.addUsedBytes(actor, -version.sizeBytes);
      return true;
    });
  }

  private async recordPruned(
    actor: Actor,
    version: FileVersion,
    reason: PruneReason,
  ): Promise<void> {
    const ids = { fileId: version.fileId, versionId: version.id };
    this.logger.info({ event: 'version.pruned', ...ids, versionNumber: version.number, reason });
    await recordAudit(
      this.audit,
      this.logger,
      {
        action: AuditAction.FILE_VERSION_PRUNED,
        actor,
        targetUserId: actor.id,
        resourceId: version.fileId,
        attributes: {
          versionId: version.id,
          versionNumber: version.number,
          sizeBytes: Number(version.sizeBytes),
        },
      },
      ids,
    );
  }
}
