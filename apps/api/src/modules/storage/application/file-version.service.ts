import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { I_DOMAIN_EVENT_PUBLISHER } from '../../../shared';
import type { Actor, IDomainEventPublisher } from '../../../shared';
import type { File } from '../domain/file';
import type { FileVersion } from '../domain/file-version';
import { FILE_VERSION_CREATED } from '../domain/file-version-created.event';
import type { FileVersionCreatedEvent } from '../domain/file-version-created.event';

import { I_NODE_REPOSITORY } from './ports/i-node.repository.port';
import type { INodeRepository } from './ports/i-node.repository.port';
import { I_QUOTA_REPOSITORY } from './ports/i-quota.repository.port';
import type { IQuotaRepository } from './ports/i-quota.repository.port';
import { I_VERSION_REPOSITORY } from './ports/i-version.repository.port';
import type { IVersionRepository } from './ports/i-version.repository.port';
import type { StorageLogger } from './storage-logger';
import { VersionPruner } from './version-pruner';

/** Lo que registra una versión: el archivo vivo, ya resuelto por quien llama, y cómo construir la versión. */
export interface RegisterVersionCommand {
  readonly file: File;
  /**
   * Recibe el número que le toca (RN-4) y devuelve la versión con su origen: así `register` no conoce a quien llama
   * (reemplazo y restauración en 014, edición en 016, optimización en 021; CA-5, OCP).
   */
  readonly buildVersion: (number: number) => FileVersion;
  /**
   * Días que se conserva la versión actual como original (014b RN-3, `PlanLimits.trashRetentionDays` que lee el
   * llamador fuera de la transacción). Obligatorio si y solo si la versión es una `optimizacion`.
   */
  readonly keepPreviousForDays?: number;
}

/** El archivo con su nueva versión actual y la versión registrada. */
export interface RegisteredVersion {
  readonly file: File;
  readonly version: FileVersion;
}

/**
 * Única escritura de versiones de `storage` (plan 014 §1, ADR-0012). `register` corre **dentro** de la transacción
 * `withActor` del llamador; `afterCommit` corre después de su commit: anuncia la versión vigente con
 * `storage.file-version-created` (019 RN-11, ADR-0019) y dispara la poda. Una transacción revertida no llega a
 * `afterCommit`, así que no anuncia nada.
 */
@Injectable()
export class FileVersionService {
  constructor(
    @Inject(I_QUOTA_REPOSITORY) private readonly quotas: IQuotaRepository,
    @Inject(I_VERSION_REPOSITORY) private readonly versions: IVersionRepository,
    @Inject(I_NODE_REPOSITORY) private readonly nodes: INodeRepository,
    @Inject(VersionPruner) private readonly pruner: VersionPruner,
    @Inject(I_DOMAIN_EVENT_PUBLISHER) private readonly events: IDomainEventPublisher,
    @Inject(PinoLogger) private readonly logger: StorageLogger,
  ) {}

  /**
   * `lockUsage` (serializa por propietario, CA-4) → `MAX + 1` → `INSERT version_archivo` → puntero de `archivo` →
   * `espacio_usado += bytes` (RN-3). El `UNIQUE (archivo_id, numero)` es la red de seguridad de la numeración. Una
   * `optimizacion` conserva además la versión actual como original y resta sus bytes en el mismo `addUsedBytes`
   * (014b RN-1): el cambio neto es negativo, así que no hace falta cuota libre (CA-2).
   */
  async register(actor: Actor, command: RegisterVersionCommand): Promise<RegisteredVersion> {
    await this.quotas.lockUsage(actor);
    const number = await this.versions.nextNumber(actor, command.file.id);
    const version = command.buildVersion(number);
    const kept = await this.conserveOriginal(actor, command, version);
    const file = command.file.withCurrentVersion(version);
    await this.versions.insert(actor, version);
    await this.nodes.updateCurrentVersion(actor, file);
    await this.quotas.addUsedBytes(actor, version.sizeBytes - (kept?.sizeBytes ?? 0n));
    this.logger.info({
      event: 'version.registered',
      fileId: file.id,
      versionId: version.id,
      versionNumber: version.number,
      origin: version.origin,
      ...(kept !== null && { keptVersionId: kept.id }),
    });
    return { file, version };
  }

  /** Con una `optimizacion`, la versión actual pasa a original conservado (014b CA-1, CA-3); si no, `null`. */
  private async conserveOriginal(
    actor: Actor,
    { file, keepPreviousForDays }: RegisterVersionCommand,
    version: FileVersion,
  ): Promise<FileVersion | null> {
    if ((version.origin === 'optimizacion') !== (keepPreviousForDays !== undefined)) {
      throw new TypeError('Solo una optimización conserva el original, y siempre con sus días.');
    }
    if (keepPreviousForDays === undefined) return null;
    const current = await this.versions.find(actor, file.id, file.currentVersionId);
    if (current === null) throw new TypeError('El archivo no tiene su versión actual.');
    const kept = current.conserveAsOriginal(version, keepPreviousForDays);
    if (!(await this.versions.markKept(actor, kept))) {
      throw new TypeError('El original no se pudo conservar: el contador divergiría.');
    }
    return kept;
  }

  /** Tras el commit de `register`: anuncia la versión y poda lo que exceda la retención; nunca lanza (CA-14). */
  afterCommit(actor: Actor, registered: RegisteredVersion): Promise<void> {
    this.announce(registered);
    return this.pruner.prune(actor, registered.file.id);
  }

  /**
   * Anuncia, tras el commit, la versión vigente de `registered` (019 RN-11). Lo usa sola la carga de un archivo nuevo,
   * que no pasa por `register` ni tiene nada que podar. Nunca lanza (`IDomainEventPublisher`).
   */
  announce({ file, version }: RegisteredVersion): void {
    const event: FileVersionCreatedEvent = {
      fileId: file.id,
      versionId: version.id,
      ownerId: file.ownerId,
      kind: file.kind,
    };
    this.events.publish(FILE_VERSION_CREATED, event);
  }
}
