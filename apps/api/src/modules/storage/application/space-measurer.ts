import { Inject, Injectable } from '@nestjs/common';

import type { Actor } from '../../../shared';
import { SpaceBreakdown } from '../domain/space-breakdown';

import { I_SPACE_REPOSITORY } from './ports/i-space.repository.port';
import type { ISpaceRepository } from './ports/i-space.repository.port';
import { I_TRASH_REPOSITORY } from './ports/i-trash.repository.port';
import type { ITrashRepository } from './ports/i-trash.repository.port';

/**
 * Mide el espacio de una cuenta (plan 007 §2, D-2, D-11): versiones de los archivos vivos propios por categoría más las
 * raíces de la papelera propia, así nada se cuenta dos veces. Lo usan el resumen y la conciliación (DRY). No abre
 * transacción: corre **dentro** de la `withActor(actor)` del llamador.
 */
@Injectable()
export class SpaceMeasurer {
  constructor(
    @Inject(I_SPACE_REPOSITORY) private readonly spaces: ISpaceRepository,
    @Inject(I_TRASH_REPOSITORY) private readonly trash: ITrashRepository,
  ) {}

  async measure(actor: Actor): Promise<SpaceBreakdown> {
    const bytesByKind = await this.spaces.liveBytesByKind(actor);
    const { totalBytes } = await this.trash.trashSummary(actor);
    return SpaceBreakdown.fromBytesByKind(bytesByKind, totalBytes);
  }
}
