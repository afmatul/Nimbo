import { Inject, Injectable } from '@nestjs/common';

import { I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, ITransactionRunner } from '../../../shared';

import { I_NODE_REPOSITORY } from './ports/i-node.repository.port';
import type { INodeRepository } from './ports/i-node.repository.port';

/**
 * Lo que `sharing` necesita del archivo de un enlace público (plan 013 §2). Sin clave de objeto ni carpeta; el nombre
 * solo viaja en la ficha del visitante y nunca entra en una bitácora.
 */
export interface LinkedFile {
  readonly id: string;
  readonly name: string;
  readonly sizeBytes: bigint;
}

/**
 * Fachada de `storage` para los enlaces públicos de `sharing` (plan 013 §2, patrón `EditableFileGateway`). Usa
 * `findOwnedLiveFile` (`ownedNodes`), no `findAccessibleById`: solo el propietario publica, y lo que le compartieron
 * no cuenta. Una carpeta, un archivo ajeno, en la papelera o inexistente es `null` (CA-3).
 */
@Injectable()
export class LinkedFileGateway {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_NODE_REPOSITORY) private readonly nodes: INodeRepository,
  ) {}

  async findOwnedFile(actor: Actor, fileId: string): Promise<LinkedFile | null> {
    const file = await this.transactions.withActor(actor, () =>
      this.nodes.findOwnedLiveFile(actor, fileId),
    );
    return file === null ? null : { id: file.id, name: file.name.value, sizeBytes: file.sizeBytes };
  }
}
