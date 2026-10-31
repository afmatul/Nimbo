import type { Readable } from 'node:stream';

import { Inject, Injectable } from '@nestjs/common';

import { I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, ITransactionRunner } from '../../../shared';
import type { File } from '../domain/file';
import type { FileKind } from '../domain/file-kind';
import type { FileVersion } from '../domain/file-version';

import { objectByteReader } from './object-byte-reader';
import { OptimizedVersionRegistrar } from './optimized-version.registrar';
import type { OptimizedVersionInput, OptimizedVersionOutcome } from './optimized-version.registrar';
import { I_FILE_TYPE_DETECTOR } from './ports/i-file-type-detector.port';
import type { IFileTypeDetector } from './ports/i-file-type-detector.port';
import { I_NODE_REPOSITORY } from './ports/i-node.repository.port';
import type { FileVersionRef, INodeRepository } from './ports/i-node.repository.port';
import { I_OBJECT_STORAGE } from './ports/i-object-storage.port';
import type { IObjectStorage } from './ports/i-object-storage.port';
import { I_VERSION_REPOSITORY } from './ports/i-version.repository.port';
import type { IVersionRepository } from './ports/i-version.repository.port';

/**
 * Lo que `optimizer` necesita de un archivo para decidir si lo optimiza (plan 021 §2). Sin nombre ni clave de objeto.
 * `mime` es el **real** de la versión vigente según su firma (CA-4); `null` si no corresponde a su extensión.
 */
export interface OptimizableFile {
  readonly id: string;
  readonly ownerId: string;
  readonly kind: FileKind;
  readonly mime: string | null;
  readonly extension: string;
  readonly sizeBytes: bigint;
  readonly currentVersionId: string;
}

const toOptimizableFile = (file: File, mime: string | null): OptimizableFile => ({
  id: file.id,
  ownerId: file.ownerId,
  kind: file.kind,
  mime,
  extension: file.name.extension(),
  sizeBytes: file.sizeBytes,
  currentVersionId: file.currentVersionId,
});

/** El archivo propio y vivo con su versión vigente, resueltos en la misma transacción. */
interface OwnedCurrent {
  readonly file: File;
  readonly current: FileVersion;
}

/**
 * Fachada de `storage` para `optimizer` (plan 021 §2, PD-130; mismo patrón que `EditableFileGateway` e
 * `IndexableFileGateway`). Solo el archivo **propio y vivo** (RN-5: un Editor lo ve, pero no lo optimiza), por
 * `accessibleNodes(actor)` dentro de `withActor`; ajeno, en la papelera o inexistente es `null`. Lee la versión vigente
 * por su cuenta, como las otras dos fachadas: el lector común (PD-124) queda fuera de 021. El contenido sale como flujo,
 * sin URL ni clave de MinIO. El registro lo hace `OptimizedVersionRegistrar`.
 * Recuperar un registro ya efectivo lee solo metadatos propios, también en papelera, para resolver un reintento.
 */
@Injectable()
export class OptimizableFileGateway {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_NODE_REPOSITORY) private readonly nodes: INodeRepository,
    @Inject(I_VERSION_REPOSITORY) private readonly versions: IVersionRepository,
    @Inject(I_OBJECT_STORAGE) private readonly objects: IObjectStorage,
    @Inject(I_FILE_TYPE_DETECTOR) private readonly detector: IFileTypeDetector,
    @Inject(OptimizedVersionRegistrar) private readonly registrar: OptimizedVersionRegistrar,
  ) {}

  /** El archivo propio y vivo con el MIME real de su versión vigente; `null` si es ajeno, está en la papelera o no existe. */
  async findOwnedImage(actor: Actor, fileId: string): Promise<OptimizableFile | null> {
    const owned = await this.transactions.withActor(actor, () => this.ownedCurrent(actor, fileId));
    if (owned === null) return null;
    const { file, current } = owned;
    const detected = await this.detector.detect(
      objectByteReader(this.objects, current.objectKey.value, current.sizeBytes),
      file.name.extension(),
    );
    return toOptimizableFile(file, detected.ok ? detected.mime : null);
  }

  /**
   * El archivo propio y vivo **sin leer su contenido** (`mime: null`): lo que la consulta periódica del estado necesita
   * para saber si la última estimación sigue describiendo la versión vigente (plan 021 §4).
   */
  async findOwned(actor: Actor, fileId: string): Promise<OptimizableFile | null> {
    const file = await this.transactions.withActor(actor, () => this.ownedFile(actor, fileId));
    return file === null ? null : toOptimizableFile(file, null);
  }

  /** Contenido de `ref` si sigue siendo la versión vigente del archivo propio y vivo; `null` si no o si el objeto ya no está. */
  async openCurrent(actor: Actor, ref: FileVersionRef): Promise<Readable | null> {
    const owned = await this.transactions.withActor(actor, () =>
      this.ownedCurrent(actor, ref.fileId),
    );
    if (owned?.current.id !== ref.versionId) return null;
    return this.objects.getObjectStream(owned.current.objectKey.value);
  }

  /**
   * `FOR SHARE` sobre el archivo propio si `ref` sigue siendo su versión vigente (CA-11): corre **dentro** de la
   * transacción `withActor` del llamador, que confirma la optimización sabiendo que ninguna versión nueva la reemplaza
   * hasta su commit. `false` si ya no es la vigente, es ajeno o se purgó. Mismo bloqueo que la indexación (019).
   */
  lockCurrentVersion(actor: Actor, ref: FileVersionRef): Promise<boolean> {
    return this.nodes.lockCurrentVersion(actor, ref);
  }

  /** Registra el resultado de una optimización; `actor` es la cuenta propietaria (CA-11, CA-12, CA-15). */
  registerOptimizedVersion(
    actor: Actor,
    input: OptimizedVersionInput,
  ): Promise<OptimizedVersionOutcome> {
    return this.registrar.register(actor, input);
  }

  /** CA-12: recupera el registro tras perder su confirmación, incluso si el origen ya no es current; sin contenido. */
  findRegisteredOptimization(
    actor: Actor,
    ref: FileVersionRef,
  ): Promise<Extract<OptimizedVersionOutcome, { status: 'duplicate' }> | null> {
    return this.transactions.withActor(actor, async () => {
      const file = await this.nodes.findOwnedFile(actor, ref.fileId);
      if (file?.ownerId !== actor.id) return null;
      const version = await this.versions.find(actor, ref.fileId, ref.versionId);
      return version?.origin === 'optimizacion'
        ? { status: 'duplicate', versionId: version.id, sizeBytes: version.sizeBytes }
        : null;
    });
  }

  private async ownedFile(actor: Actor, fileId: string): Promise<File | null> {
    const file = await this.nodes.findAccessibleById(actor, fileId);
    return file?.ownerId === actor.id ? file : null;
  }

  private async ownedCurrent(actor: Actor, fileId: string): Promise<OwnedCurrent | null> {
    const file = await this.ownedFile(actor, fileId);
    if (file === null) return null;
    const current = await this.versions.find(actor, file.id, file.currentVersionId);
    return current === null ? null : { file, current };
  }
}
