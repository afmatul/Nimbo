import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

import { TransactionContext } from '../../../../shared';
import type { Actor } from '../../../../shared';
import { ownedNodes } from '../../../access';
import type {
  AccessGrants,
  DirectGrant,
  InheritedGrant,
  IShareRepository,
  ReceivedGrant,
} from '../../application/ports/i-share.repository.port';
import { UserShare } from '../../domain/user-share';
import type { SharedNodeRef, ShareLevel, ShareNodeType } from '../../domain/user-share';

import { ComparticionOrmEntity } from './comparticion.orm-entity';
import { queryNamed } from './query-named';

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

/**
 * La `ruta` donde están los antepasados del nodo propio y vivo: la de la carpeta misma o la de la carpeta del archivo
 * (`NULL` si el archivo está en la raíz). Sin fila, no hay un nodo de ese tipo con ese id.
 */
const NODE_PATH_SQL: Readonly<Record<ShareNodeType, (ownedSql: string) => string>> = {
  folder: (ownedSql) => `
    SELECT k.ruta FROM carpeta k
     WHERE k.id = :node_id::uuid
       AND k.id IN (SELECT o.nodo_id FROM (${ownedSql}) o WHERE o.tipo_nodo = 'carpeta')`,
  file: (ownedSql) => `
    SELECT k.ruta FROM archivo a LEFT JOIN carpeta k ON k.id = a.carpeta_id
     WHERE a.id = :node_id::uuid
       AND a.id IN (SELECT o.nodo_id FROM (${ownedSql}) o WHERE o.tipo_nodo = 'archivo')`,
};

/**
 * RN-4: accesos heredados por `carpeta.ruta` (`/<id>/…/<id>/`): las comparticiones de las carpetas que la forman,
 * salvo el nodo mismo, de la raíz hacia adentro. Las carpetas de la `ruta` de un nodo vivo también están vivas (006).
 */
const INHERITED_SQL = `
  SELECT c.destinatario_id, c.nivel, c.creado_en, k.id AS carpeta_id, k.nombre AS carpeta_nombre
    FROM comparticion c JOIN carpeta k ON k.id = c.carpeta_id
   WHERE c.propietario_id = :owner_id::uuid
     AND k.id = ANY (string_to_array(btrim(:path::text, '/'), '/')::uuid[])
     AND k.id <> :node_id::uuid
   ORDER BY k.profundidad, c.creado_en, c.id`;

interface InheritedRow {
  readonly destinatario_id: string;
  readonly nivel: ShareLevel;
  readonly creado_en: Date;
  readonly carpeta_id: string;
  readonly carpeta_nombre: string;
}

/** Lo que identifica la búsqueda de heredados: dueño, nodo y la `ruta` de sus antepasados. */
interface InheritedQuery {
  readonly ownerId: string;
  readonly nodeId: string;
  readonly path: string;
}

const toInherited = (row: InheritedRow): InheritedGrant => ({
  granteeId: row.destinatario_id,
  level: row.nivel,
  createdAt: row.creado_en,
  folder: { id: row.carpeta_id, name: row.carpeta_nombre },
});

const toDirect = (row: ComparticionOrmEntity): DirectGrant => ({
  shareId: row.id,
  granteeId: row.destinatarioId,
  level: row.nivel as ShareLevel,
  createdAt: row.creadoEn,
});

/** Filtro de `comparticion` por su nodo (la columna que no es nula). */
const nodeWhere = (node: SharedNodeRef): { archivoId: string } | { carpetaId: string } =>
  node.type === 'file' ? { archivoId: node.id } : { carpetaId: node.id };

/** Columnas `archivo_id`/`carpeta_id` del nodo: exactamente una (`ck_comparticion_nodo`). */
const nodeColumns = (
  node: SharedNodeRef,
): Pick<ComparticionOrmEntity, 'archivoId' | 'carpetaId'> =>
  node.type === 'file'
    ? { archivoId: node.id, carpetaId: null }
    : { archivoId: null, carpetaId: node.id };

/** Sin `archivo_id`, la fila tiene `carpeta_id` (`ck_comparticion_nodo`). */
const nodeOf = (row: Pick<ComparticionOrmEntity, 'archivoId' | 'carpetaId'>): SharedNodeRef =>
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

/** Quién borra la fila: el propietario (revocar, CA-10) o el destinatario (Salir, CA-23). */
type DeletingParty = 'owner' | 'recipient';

const PARTY_COLUMNS: Readonly<Record<DeletingParty, 'propietario_id' | 'destinatario_id'>> = {
  owner: 'propietario_id',
  recipient: 'destinatario_id',
};

/**
 * CA-22: los accesos directos del actor cuyo nodo está en `nodos_compartidos()`, así «vivo y de un propietario activo»
 * no se repite aquí. Los nombres salen de `archivo`/`carpeta` por las políticas del destinatario (migración B).
 */
const RECEIVED_SQL = `
  WITH compartidos AS (SELECT nodo_id, tipo_nodo FROM nodos_compartidos())
  SELECT c.id, c.propietario_id, c.archivo_id, c.carpeta_id, c.nivel, c.creado_en,
         COALESCE(a.nombre, k.nombre) AS nombre
    FROM comparticion c
    LEFT JOIN archivo a ON a.id = c.archivo_id
    LEFT JOIN carpeta k ON k.id = c.carpeta_id
   WHERE c.destinatario_id = :actor_id::uuid
     AND (c.archivo_id IN (SELECT nodo_id FROM compartidos WHERE tipo_nodo = 'archivo')
          OR c.carpeta_id IN (SELECT nodo_id FROM compartidos WHERE tipo_nodo = 'carpeta'))
   ORDER BY c.creado_en DESC, c.id DESC`;

interface ReceivedRow {
  readonly id: string;
  readonly propietario_id: string;
  readonly archivo_id: string | null;
  readonly carpeta_id: string | null;
  readonly nivel: ShareLevel;
  readonly creado_en: Date;
  readonly nombre: string;
}

const toReceived = (row: ReceivedRow): ReceivedGrant => ({
  shareId: row.id,
  node: nodeOf({ archivoId: row.archivo_id, carpetaId: row.carpeta_id }),
  name: row.nombre,
  ownerId: row.propietario_id,
  level: row.nivel,
  createdAt: row.creado_en,
});

/**
 * Borra el acceso `:share_id` solo si la columna de `party` es el actor (dentro de la consulta; RLS lo repite). Va en
 * un CTE para que el driver devuelva las filas como en un `SELECT` (un `DELETE` suelto da `[filas, cuántas]`).
 */
const deleteSql = (party: DeletingParty): string => `
  WITH borrada AS (
    DELETE FROM comparticion
     WHERE id = :share_id::uuid AND ${PARTY_COLUMNS[party]} = :actor_id::uuid
    RETURNING id, propietario_id, destinatario_id, archivo_id, carpeta_id, nivel, creado_en)
  SELECT * FROM borrada`;

interface DeletedRow {
  readonly id: string;
  readonly propietario_id: string;
  readonly destinatario_id: string;
  readonly archivo_id: string | null;
  readonly carpeta_id: string | null;
  readonly nivel: ShareLevel;
  readonly creado_en: Date;
}

const fromDeleted = (row: DeletedRow): UserShare =>
  UserShare.rehydrate({
    id: row.id,
    ownerId: row.propietario_id,
    recipientId: row.destinatario_id,
    node: nodeOf({ archivoId: row.archivo_id, carpetaId: row.carpeta_id }),
    level: row.nivel,
    createdAt: row.creado_en,
  });

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
      where: { propietarioId: actor.id, destinatarioId: recipientId, ...nodeWhere(node) },
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

  async listAccess(actor: Actor, node: SharedNodeRef): Promise<AccessGrants | null> {
    const manager = this.context.requireActorScope(actor);
    const owned = ownedNodes(actor);
    const [located] = await queryNamed<{ ruta: string | null }>(
      manager,
      NODE_PATH_SQL[node.type](owned.sql),
      { ...owned.parameters, node_id: node.id },
    );
    if (located === undefined) return null;
    const direct = await manager.find(ComparticionOrmEntity, {
      where: { propietarioId: actor.id, ...nodeWhere(node) },
      order: { creadoEn: 'ASC', id: 'ASC' },
    });
    const inherited =
      located.ruta === null
        ? []
        : await this.listInherited(manager, {
            ownerId: actor.id,
            nodeId: node.id,
            path: located.ruta,
          });
    return { direct: direct.map(toDirect), inherited };
  }

  revoke(actor: Actor, shareId: string): Promise<UserShare | null> {
    return this.deleteAs(actor, 'owner', shareId);
  }

  async listReceived(actor: Actor): Promise<ReceivedGrant[]> {
    const rows = await queryNamed<ReceivedRow>(
      this.context.requireActorScope(actor),
      RECEIVED_SQL,
      { actor_id: actor.id },
    );
    return rows.map(toReceived);
  }

  async findReceived(actor: Actor, shareId: string): Promise<UserShare | null> {
    const row = await this.context.requireActorScope(actor).findOne(ComparticionOrmEntity, {
      where: { id: shareId, destinatarioId: actor.id },
    });
    return row === null ? null : toShare(row);
  }

  leave(actor: Actor, shareId: string): Promise<UserShare | null> {
    return this.deleteAs(actor, 'recipient', shareId);
  }

  private async deleteAs(
    actor: Actor,
    party: DeletingParty,
    shareId: string,
  ): Promise<UserShare | null> {
    const [row] = await queryNamed<DeletedRow>(
      this.context.requireActorScope(actor),
      deleteSql(party),
      { share_id: shareId, actor_id: actor.id },
    );
    return row === undefined ? null : fromDeleted(row);
  }

  private async listInherited(
    manager: EntityManager,
    query: InheritedQuery,
  ): Promise<InheritedGrant[]> {
    const rows = await queryNamed<InheritedRow>(manager, INHERITED_SQL, {
      owner_id: query.ownerId,
      node_id: query.nodeId,
      path: query.path,
    });
    return rows.map(toInherited);
  }
}
