import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

import { TransactionContext } from '../../../../shared';
import type { Actor } from '../../../../shared';
import { ownedNodes } from '../../../access';
import type { IShareRepository } from '../../application/ports/i-share.repository.port';
import { UserShare } from '../../domain/user-share';
import type { SharedNodeRef, ShareLevel, ShareNodeType } from '../../domain/user-share';

import { ComparticionOrmEntity } from './comparticion.orm-entity';

/** Tabla de cada tipo de nodo, como la nombra `tipo_nodo` de los fragmentos de `access`. */
const NODE_TABLES: Readonly<Record<ShareNodeType, 'archivo' | 'carpeta'>> = {
  file: 'archivo',
  folder: 'carpeta',
};

/**
 * Alta solo si el nodo de ese tipo es propio y vivo (`ownedNodes`, dentro de la consulta): un `nodeType` que no es el
 * del nodo no escribe nada en lugar de chocar con la FK. La RLS (`WITH CHECK`) lo vuelve a exigir.
 */
const insertSql = (ownedSql: string): string => `
  INSERT INTO comparticion (id, propietario_id, destinatario_id, archivo_id, carpeta_id, nivel, creado_en,
                            actualizado_en)
  SELECT :id::uuid, :owner_id::uuid, :recipient_id::uuid, :file_id::uuid, :folder_id::uuid, :level,
         :now::timestamptz, :now::timestamptz
   WHERE :node_id::uuid IN (SELECT o.nodo_id FROM (${ownedSql}) o WHERE o.tipo_nodo = :node_table)
  RETURNING id`;

/** Columnas `archivo_id`/`carpeta_id` del nodo: exactamente una (`ck_comparticion_nodo`). */
const nodeColumns = (
  node: SharedNodeRef,
): Pick<ComparticionOrmEntity, 'archivoId' | 'carpetaId'> =>
  node.type === 'file'
    ? { archivoId: node.id, carpetaId: null }
    : { archivoId: null, carpetaId: node.id };

/** Sin `archivo_id`, la fila tiene `carpeta_id` (`ck_comparticion_nodo`). */
const nodeOf = (row: ComparticionOrmEntity): SharedNodeRef =>
  row.archivoId === null
    ? { type: 'folder', id: row.carpetaId as string }
    : { type: 'file', id: row.archivoId };

/** `nivel` solo admite `VIEWER` o `EDITOR` (`ck_comparticion_nivel`). */
const toShare = (row: ComparticionOrmEntity): UserShare =>
  UserShare.rehydrate({
    id: row.id,
    ownerId: row.propietarioId,
    recipientId: row.destinatarioId,
    node: nodeOf(row),
    level: row.nivel as ShareLevel,
    createdAt: row.creadoEn,
  });

/** Consulta con parámetros con nombre (los del fragmento de `access` y los propios). */
const queryNamed = async <T>(
  manager: EntityManager,
  sql: string,
  parameters: Readonly<Record<string, unknown>>,
): Promise<T[]> => {
  const [escaped, values] = manager.connection.driver.escapeQueryWithParameters(
    sql,
    parameters,
    {},
  );
  return (await manager.query(escaped, values)) as T[];
};

/**
 * `IShareRepository` sobre Postgres (plan 012 §2). Todo con el `EntityManager` de `withActor` (`requireActorScope`):
 * las filas del propietario las acota además la consulta (`propietario_id`, `ownedNodes`).
 */
@Injectable()
export class TypeOrmShareRepository implements IShareRepository {
  constructor(@Inject(TransactionContext) private readonly context: TransactionContext) {}

  async findDirect(
    actor: Actor,
    node: SharedNodeRef,
    recipientId: string,
  ): Promise<UserShare | null> {
    const row = await this.context.requireActorScope(actor).findOne(ComparticionOrmEntity, {
      where: {
        propietarioId: actor.id,
        destinatarioId: recipientId,
        ...(node.type === 'file' ? { archivoId: node.id } : { carpetaId: node.id }),
      },
    });
    return row === null ? null : toShare(row);
  }

  async insert(actor: Actor, share: UserShare): Promise<boolean> {
    const snapshot = share.toSnapshot();
    const owned = ownedNodes(actor);
    const columns = nodeColumns(snapshot.node);
    const rows = await queryNamed(this.context.requireActorScope(actor), insertSql(owned.sql), {
      ...owned.parameters,
      id: snapshot.id,
      owner_id: snapshot.ownerId,
      recipient_id: snapshot.recipientId,
      file_id: columns.archivoId,
      folder_id: columns.carpetaId,
      level: snapshot.level,
      now: snapshot.createdAt,
      node_id: snapshot.node.id,
      node_table: NODE_TABLES[snapshot.node.type],
    });
    return rows.length === 1;
  }

  async updateLevel(actor: Actor, share: UserShare): Promise<void> {
    await this.context
      .requireActorScope(actor)
      .update(
        ComparticionOrmEntity,
        { id: share.id, propietarioId: actor.id },
        { nivel: share.level, actualizadoEn: () => 'now()' },
      );
  }
}
