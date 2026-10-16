import type { Readable } from 'node:stream';

import { Inject, Injectable } from '@nestjs/common';

import { I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, ITransactionRunner } from '../../../shared';
import type { File } from '../domain/file';

import { EditedVersionRegistrar } from './edited-version.registrar';
import type { EditedVersionInput, EditedVersionOutcome } from './edited-version.registrar';
import { I_NODE_REPOSITORY } from './ports/i-node.repository.port';
import type { INodeRepository } from './ports/i-node.repository.port';
import { I_OBJECT_STORAGE } from './ports/i-object-storage.port';
import type { IObjectStorage } from './ports/i-object-storage.port';
import { I_VERSION_REPOSITORY } from './ports/i-version.repository.port';
import type { IVersionRepository } from './ports/i-version.repository.port';

/** Lo que `editing` necesita de un archivo para decidir el modo (plan 016 §2). Sin nombre ni clave de objeto. */
export interface EditableFile {
  readonly id: string;
  readonly ownerId: string;
  /** `archivo.tipo`: solo `docx` se edita (RN-1). */
  readonly kind: string;
  readonly sizeBytes: bigint;
  readonly currentVersionId: string;
}

const toEditableFile = (file: File): EditableFile => ({
  id: file.id,
  ownerId: file.ownerId,
  kind: file.kind,
  sizeBytes: file.sizeBytes,
  currentVersionId: file.currentVersionId,
});

/**
 * Fachada de `storage` para `editing` (plan 016 §2; ADR-0012: la versión es de `storage`). Todo pasa por
 * `accessibleNodes(actor)` (`findAccessibleById`) dentro de `withActor`: un archivo ajeno, en la papelera o inexistente
 * es `null` (CA-2). El contenido sale como flujo de la versión vigente, sin URL ni clave de MinIO.
 */
@Injectable()
export class EditableFileGateway {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_NODE_REPOSITORY) private readonly nodes: INodeRepository,
    @Inject(I_VERSION_REPOSITORY) private readonly versions: IVersionRepository,
    @Inject(I_OBJECT_STORAGE) private readonly objects: IObjectStorage,
    @Inject(EditedVersionRegistrar) private readonly registrar: EditedVersionRegistrar,
  ) {}

  async find(actor: Actor, fileId: string): Promise<EditableFile | null> {
    const file = await this.transactions.withActor(actor, () =>
      this.nodes.findAccessibleById(actor, fileId),
    );
    return file === null ? null : toEditableFile(file);
  }

  /** Contenido de la versión vigente; `null` sin acceso o si el objeto ya no existe (una purga). */
  async openContent(actor: Actor, fileId: string): Promise<Readable | null> {
    const key = await this.transactions.withActor(actor, async () => {
      const file = await this.nodes.findAccessibleById(actor, fileId);
      if (file === null) return null;
      const current = await this.versions.find(actor, file.id, file.currentVersionId);
      return current?.objectKey.value ?? null;
    });
    return key === null ? null : this.objects.getObjectStream(key);
  }

  /** Registra la versión de una sesión de edición; `actor` es la cuenta propietaria (CA-9, CA-10, CA-14, CA-20). */
  registerEditedVersion(actor: Actor, input: EditedVersionInput): Promise<EditedVersionOutcome> {
    return this.registrar.register(actor, input);
  }
}
