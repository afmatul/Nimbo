import { Inject, Injectable } from '@nestjs/common';
import type { RestoreOutcome } from '@nimbo/contracts';
import type { EntityManager } from 'typeorm';

import { TransactionContext } from '../../../../shared';
import type { Actor } from '../../../../shared';
import type {
  ISupportTrashRepository,
  SupportRestoreRequest,
  SupportRestoreResult,
  SupportTrashQuery,
} from '../../application/ports/i-support-trash.repository.port';
import type { TrashItemRef, TrashPage } from '../../application/ports/i-trash.repository.port';
import { FolderDepthExceededError, NodeNotFoundError } from '../../domain/errors';
import type { StorageNode } from '../../domain/storage-node';

import { ArchivoOrmEntity } from './archivo.orm-entity';
import { CarpetaOrmEntity } from './carpeta.orm-entity';
import { toFile, toFolder } from './node-mappers';
import type { Condition } from './node-sql';
import { afterCursor, selectTrashEntries, trashPageOf } from './trash-entries';

/** Raíz de la papelera del cliente con retención vigente: lo vencido es de la purga y Soporte ya no lo ve (RN-3). */
const rootInForce = (alias: string): string =>
  `${alias}.propietario_id = :ownerId AND ${alias}.eliminado_en IS NOT NULL ` +
  `AND ${alias}.eliminado_con_carpeta_id IS NULL AND ${alias}.purgar_en > now()`;

/**
 * Raíces de la papelera de `ownerId`. El tamaño es `tamano_bytes` (la versión actual; el de una carpeta, la suma de lo
 * que arrastró): Soporte no lee `version_archivo` (RN-3), así que no es la suma de versiones que ve el cliente.
 */
const supportRootsSql = (ownerId: string): Condition => ({
  sql:
    `SELECT 'file'::text AS tipo, a.id, a.nombre, a.tipo AS clase, a.carpeta_id AS padre_id, a.eliminado_en, ` +
    `a.purgar_en, a.tamano_bytes AS tamano FROM archivo a WHERE ${rootInForce('a')} UNION ALL ` +
    `SELECT 'folder'::text, c.id, c.nombre, NULL, c.carpeta_padre_id, c.eliminado_en, c.purgar_en, ` +
    '(SELECT COALESCE(SUM(h.tamano_bytes), 0) FROM archivo h WHERE h.eliminado_con_carpeta_id = c.id) ' +
    `FROM carpeta c WHERE ${rootInForce('c')}`,
  parameters: { ownerId },
});

/** Fila de `restaurar_raiz_papelera` (plan 011b §3); los bytes llegan como texto, como los entrega `pg`. */
interface RestoreRow {
  readonly resultado: RestoreOutcome | 'depth_exceeded';
  readonly nombre_original: string;
  readonly elementos: number;
  readonly bytes: string;
}

/**
 * `ISupportTrashRepository` sobre Postgres (plan 011b §2). Excepción a `accessibleNodes` (architecture §6.5): el actor
 * es `SUPPORT`, que no tiene nodos accesibles; el dueño se filtra **en el SQL** y la RLS (`*_metadatos_internos`) es
 * la segunda barrera. La restauración solo va por la función: `nimbo_app` no tiene `UPDATE` para Soporte.
 */
@Injectable()
export class TypeOrmSupportTrashRepository implements ISupportTrashRepository {
  constructor(@Inject(TransactionContext) private readonly context: TransactionContext) {}

  async listRoots(actor: Actor, query: SupportTrashQuery): Promise<TrashPage> {
    const rows = await selectTrashEntries(this.manager(actor), {
      roots: supportRootsSql(query.ownerId),
      ownerParameter: 'ownerId',
      filter: afterCursor(query.cursor),
      take: query.limit + 1,
    });
    return trashPageOf(rows, query.limit);
  }

  async restoreRoot(actor: Actor, request: SupportRestoreRequest): Promise<SupportRestoreResult> {
    const { ownerId, item, maxDepth } = request;
    const [row] = (await this.manager(actor).query(
      'SELECT * FROM restaurar_raiz_papelera($1, $2, $3, $4)',
      [ownerId, item.type, item.id, maxDepth],
    )) as RestoreRow[];
    if (row === undefined) throw new NodeNotFoundError();
    if (row.resultado === 'depth_exceeded') throw new FolderDepthExceededError(maxDepth, 'restore');
    return {
      node: await this.restoredNode(actor, ownerId, item),
      outcome: row.resultado,
      originalName: row.nombre_original,
      itemCount: row.elementos,
      sizeBytes: BigInt(row.bytes),
    };
  }

  /** El nodo tal como quedó, leído con la política de metadatos de Soporte (sin contenido ni versiones). */
  private async restoredNode(
    actor: Actor,
    ownerId: string,
    item: TrashItemRef,
  ): Promise<StorageNode> {
    const where = { id: item.id, propietarioId: ownerId };
    const manager = this.manager(actor);
    if (item.type === 'file') return toFile(await manager.findOneByOrFail(ArchivoOrmEntity, where));
    return toFolder(await manager.findOneByOrFail(CarpetaOrmEntity, where));
  }

  private manager(actor: Actor): EntityManager {
    return this.context.requireActorScope(actor);
  }
}
