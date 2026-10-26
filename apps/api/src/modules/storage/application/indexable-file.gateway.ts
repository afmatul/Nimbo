import type { Readable } from 'node:stream';

import { Inject, Injectable } from '@nestjs/common';

import { I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, ITransactionRunner } from '../../../shared';
import type { File } from '../domain/file';
import type { FileKind } from '../domain/file-kind';

import { I_CLIENT_ACCOUNT_SCANNER } from './ports/i-client-account.scanner.port';
import type { IClientAccountScanner } from './ports/i-client-account.scanner.port';
import { I_NODE_REPOSITORY } from './ports/i-node.repository.port';
import type { FileVersionRef, IdPage, INodeRepository } from './ports/i-node.repository.port';
import { I_OBJECT_STORAGE } from './ports/i-object-storage.port';
import type { IObjectStorage } from './ports/i-object-storage.port';
import { I_VERSION_REPOSITORY } from './ports/i-version.repository.port';
import type { IVersionRepository } from './ports/i-version.repository.port';

/** Lo que `intelligence` necesita de un archivo para indexarlo (plan 019 §2). Sin nombre ni clave de objeto. */
export interface IndexableFile {
  readonly id: string;
  readonly ownerId: string;
  /** `archivo.tipo`: `ExtractorRegistry` decide si se indexa (CA-6). */
  readonly kind: FileKind;
  /** Tamaño de la versión vigente: el tope indexable lo compara (RN-7). */
  readonly sizeBytes: bigint;
  readonly currentVersionId: string;
}

const toIndexableFile = (file: File): IndexableFile => ({
  id: file.id,
  ownerId: file.ownerId,
  kind: file.kind,
  sizeBytes: file.sizeBytes,
  currentVersionId: file.currentVersionId,
});

const toIndexableOrNull = (file: File | null): IndexableFile | null =>
  file === null ? null : toIndexableFile(file);

/**
 * Fachada de `storage` para `intelligence` (plan 019 §2; mismo patrón que `EditableFileGateway`). Todo lo del cliente
 * pasa por `accessibleNodes(actor)` (`findAccessible`) u `ownedFiles(actor)` (lo demás: vivo o en la papelera, para
 * terminar de indexar aunque el archivo se elimine, PD-112) dentro de `withActor`. El contenido sale como flujo de la
 * versión vigente, sin URL ni clave de MinIO. `clientIds` es la única lectura sin actor y devuelve solo UUID (DF-62).
 */
@Injectable()
export class IndexableFileGateway {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_NODE_REPOSITORY) private readonly nodes: INodeRepository,
    @Inject(I_VERSION_REPOSITORY) private readonly versions: IVersionRepository,
    @Inject(I_OBJECT_STORAGE) private readonly objects: IObjectStorage,
    @Inject(I_CLIENT_ACCOUNT_SCANNER) private readonly accounts: IClientAccountScanner,
  ) {}

  /** El archivo vivo que el actor ve; `null` si es ajeno, está en la papelera o no existe (019 CA-18). */
  async findAccessible(actor: Actor, fileId: string): Promise<IndexableFile | null> {
    const file = await this.transactions.withActor(actor, () =>
      this.nodes.findAccessibleById(actor, fileId),
    );
    return toIndexableOrNull(file);
  }

  /** El archivo del actor (filtra por `propietario_id`), vivo o en la papelera; `null` si es ajeno o se purgó. */
  async findOwned(actor: Actor, fileId: string): Promise<IndexableFile | null> {
    const file = await this.transactions.withActor(actor, () =>
      this.nodes.findOwnedFile(actor, fileId),
    );
    return toIndexableOrNull(file);
  }

  /** Contenido de `ref` si sigue siendo la versión vigente del archivo del actor; `null` si no o si el objeto ya no está. */
  async openCurrent(actor: Actor, ref: FileVersionRef): Promise<Readable | null> {
    const key = await this.transactions.withActor(actor, () => this.currentObjectKey(actor, ref));
    return key === null ? null : this.objects.getObjectStream(key);
  }

  /**
   * `FOR SHARE` sobre el archivo si `ref` sigue siendo su versión vigente (019 plan §7 punto 2): corre **dentro** de la
   * transacción `withActor` del llamador, que guarda los fragmentos sabiendo que nadie la reemplaza hasta su commit.
   */
  lockCurrentVersion(actor: Actor, ref: FileVersionRef): Promise<boolean> {
    return this.nodes.lockCurrentVersion(actor, ref);
  }

  /** Archivos del actor (vivos o en la papelera) por id ascendente, para la conciliación (019 CA-23). */
  async listIndexable(actor: Actor, page: IdPage): Promise<readonly IndexableFile[]> {
    const files = await this.transactions.withActor(actor, () =>
      this.nodes.listOwnedFiles(actor, page),
    );
    return files.map(toIndexableFile);
  }

  /** UUID de las cuentas de cliente, por páginas; solo para `IndexReconciler`, que actúa luego como cada una. */
  clientIds(page: IdPage): Promise<readonly string[]> {
    return this.transactions.run(() => this.accounts.listClientIds(page.afterId, page.limit));
  }

  private async currentObjectKey(actor: Actor, ref: FileVersionRef): Promise<string | null> {
    const file = await this.nodes.findOwnedFile(actor, ref.fileId);
    if (file?.currentVersionId !== ref.versionId) return null;
    const current = await this.versions.find(actor, file.id, ref.versionId);
    return current?.objectKey.value ?? null;
  }
}
