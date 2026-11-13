import { Inject, Injectable } from '@nestjs/common';

import { settleEach } from '../../../shared';
import type { Actor, Settlement } from '../../../shared';

import { FileService } from './file.service';
import { FolderService } from './folder.service';
import type { NodeRef } from './ports/i-node-badge-readers.port';
import { TrashService } from './trash.service';
import { WritableAccountPolicy } from './writable-account.policy';

/** Mover varios nodos a una carpeta (`null` es la raíz). */
export interface BatchMoveCommand {
  readonly items: readonly NodeRef[];
  readonly targetFolderId: string | null;
}

/**
 * Lotes del explorador sobre nodos propios: cada elemento pasa por la operación individual (`FileService.move`,
 * `FolderService.move`, `TrashService`), con sus reglas de propiedad, solo lectura, cuota y bloqueos; un error de
 * dominio solo marca ese elemento (`settleEach`). Mover no renombra solo: un nombre repetido falla con
 * `STORAGE_NAME_CONFLICT`, como «Preguntar» en el movimiento individual. Enviar a la papelera sigue abierto en solo
 * lectura, como `DELETE` individual.
 */
@Injectable()
export class NodeBatchService {
  constructor(
    @Inject(FileService) private readonly files: Pick<FileService, 'move'>,
    @Inject(FolderService) private readonly folders: Pick<FolderService, 'move'>,
    @Inject(TrashService) private readonly bin: Pick<TrashService, 'trashFile' | 'trashFolder'>,
    @Inject(WritableAccountPolicy)
    private readonly writable: Pick<WritableAccountPolicy, 'assertWritable'>,
  ) {}

  /** En solo lectura todo el lote es `403 STORAGE_ACCOUNT_READ_ONLY`, como el movimiento individual (ADR-0032). */
  async move(
    actor: Actor,
    { items, targetFolderId }: BatchMoveCommand,
  ): Promise<Settlement<NodeRef>> {
    await this.writable.assertWritable(actor);
    return settleEach(items, (item) =>
      item.type === 'file'
        ? this.files.move(actor, item.id, { folderId: targetFolderId, onConflict: 'ask' })
        : this.folders.move(actor, item.id, targetFolderId),
    );
  }

  trash(actor: Actor, items: readonly NodeRef[]): Promise<Settlement<NodeRef>> {
    return settleEach(items, (item) =>
      item.type === 'file'
        ? this.bin.trashFile(actor, item.id)
        : this.bin.trashFolder(actor, item.id),
    );
  }
}
