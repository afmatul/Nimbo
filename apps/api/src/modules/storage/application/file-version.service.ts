import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import type { Actor } from '../../../shared';
import type { File } from '../domain/file';
import type { FileVersion } from '../domain/file-version';

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
}

/** El archivo con su nueva versión actual y la versión registrada. */
export interface RegisteredVersion {
  readonly file: File;
  readonly version: FileVersion;
}

/**
 * Única escritura de versiones de `storage` (plan 014 §1, ADR-0012). `register` corre **dentro** de la transacción
 * `withActor` del llamador; `afterCommit` corre después de su commit y dispara la poda. No indexa ni publica eventos
 * (`FileVersionCreated` llega con 019, D-11).
 */
@Injectable()
export class FileVersionService {
  constructor(
    @Inject(I_QUOTA_REPOSITORY) private readonly quotas: IQuotaRepository,
    @Inject(I_VERSION_REPOSITORY) private readonly versions: IVersionRepository,
    @Inject(I_NODE_REPOSITORY) private readonly nodes: INodeRepository,
    @Inject(VersionPruner) private readonly pruner: VersionPruner,
    @Inject(PinoLogger) private readonly logger: StorageLogger,
  ) {}

  /**
   * `lockUsage` (serializa por propietario, CA-4) → `MAX + 1` → `INSERT version_archivo` → puntero de `archivo` →
   * `espacio_usado += bytes` (RN-3). El `UNIQUE (archivo_id, numero)` es la red de seguridad de la numeración.
   */
  async register(actor: Actor, command: RegisterVersionCommand): Promise<RegisteredVersion> {
    await this.quotas.lockUsage(actor);
    const number = await this.versions.nextNumber(actor, command.file.id);
    const version = command.buildVersion(number);
    const file = command.file.withCurrentVersion(version);
    await this.versions.insert(actor, version);
    await this.nodes.updateCurrentVersion(actor, file);
    await this.quotas.addUsedBytes(actor, version.sizeBytes);
    this.logger.info({
      event: 'version.registered',
      fileId: file.id,
      versionId: version.id,
      versionNumber: version.number,
      origin: version.origin,
    });
    return { file, version };
  }

  /** Tras el commit de `register`: poda lo que exceda la retención del plan; nunca lanza (CA-14). */
  afterCommit(actor: Actor, fileId: string): Promise<void> {
    return this.pruner.prune(actor, fileId);
  }
}
