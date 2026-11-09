import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

import { PasswordHash, TransactionContext } from '../../../../shared';
import type { Actor } from '../../../../shared';
import { ownedNodes } from '../../../access';
import type {
  IPublicLinkRepository,
  PublicLinkReplacement,
} from '../../application/ports/i-public-link.repository.port';
import { PublicLink } from '../../domain/public-link';

import { queryNamed } from './query-named';

/**
 * CA-4: dos generaciones simultáneas del mismo archivo se ponen en fila hasta el fin de la transacción, así la segunda
 * revoca el enlace de la primera en vez de chocar con `uq_enlace_publico_archivo_activo` (un 500).
 */
const LOCK_FILE_SQL =
  "SELECT pg_advisory_xact_lock(hashtextextended('sharing.public_link:' || :file_id::text, 0))";

/** El archivo propio y vivo, dentro de la consulta (RLS lo repite en `WITH CHECK`). */
const ownedFileSql = (ownedSql: string): string =>
  `:file_id::uuid IN (SELECT o.nodo_id FROM (${ownedSql}) o WHERE o.tipo_nodo = 'archivo')`;

const LINK_COLUMNS = 'id, archivo_id, propietario_id, token_hash, clave_hash, vence_en, creado_en';

/**
 * Revoca el enlace sin revocar del propietario que cumple `condition`. En un CTE para que el driver devuelva las filas
 * como en un `SELECT`. `nimbo_app` solo puede actualizar `revocado_en` (plan §3).
 */
const revokeWhereSql = (condition: string): string => `
  WITH revocado AS (
    UPDATE enlace_publico SET revocado_en = :now::timestamptz
     WHERE propietario_id = :owner_id::uuid AND revocado_en IS NULL AND ${condition}
    RETURNING ${LINK_COLUMNS})
  SELECT * FROM revocado`;

/** RN-3: el enlace sin revocar del archivo (vigente o vencido), si el archivo sigue propio y vivo. */
const revokeCurrentSql = (ownedSql: string): string =>
  revokeWhereSql(`archivo_id = :file_id::uuid AND ${ownedFileSql(ownedSql)}`);

/** CA-8: por su id, sin exigir el archivo vivo (se revoca también en la papelera, plan §3). */
const REVOKE_BY_ID_SQL = revokeWhereSql('id = :link_id::uuid');

/** CA-7: el enlace sin revocar de un archivo propio y vivo (a lo sumo uno, RN-3). */
const findCurrentSql = (ownedSql: string): string => `
  SELECT ${LINK_COLUMNS} FROM enlace_publico
   WHERE archivo_id = :file_id::uuid AND propietario_id = :owner_id::uuid AND revocado_en IS NULL
     AND ${ownedFileSql(ownedSql)}`;

/** ADR-0039 regla 3: el mismo filtro de disponibilidad que `enlace_por_token()`, con el reloj de la base. */
const FIND_AVAILABLE_SQL = `
  SELECT ${LINK_COLUMNS} FROM enlace_publico
   WHERE id = :link_id::uuid AND propietario_id = :owner_id::uuid AND revocado_en IS NULL AND vence_en > now()`;

const insertSql = (ownedSql: string): string => `
  INSERT INTO enlace_publico (id, archivo_id, propietario_id, token_hash, clave_hash, vence_en, creado_en)
  SELECT :id::uuid, :file_id::uuid, :owner_id::uuid, :token_hash, :password_hash::text, :expires_at::timestamptz,
         :now::timestamptz
   WHERE ${ownedFileSql(ownedSql)}
  RETURNING id`;

interface LinkRow {
  readonly id: string;
  readonly archivo_id: string;
  readonly propietario_id: string;
  readonly token_hash: string;
  readonly clave_hash: string | null;
  readonly vence_en: Date;
  readonly creado_en: Date;
}

const toLink = (row: LinkRow): PublicLink =>
  PublicLink.rehydrate({
    id: row.id,
    fileId: row.archivo_id,
    ownerId: row.propietario_id,
    tokenHash: row.token_hash,
    passwordHash: row.clave_hash === null ? null : PasswordHash.fromPhc(row.clave_hash),
    expiresAt: row.vence_en,
    createdAt: row.creado_en,
  });

/**
 * `IPublicLinkRepository` sobre Postgres (plan 013 §2). Todo con el `EntityManager` de `withActor`
 * (`requireActorScope`): las filas las acota además la consulta (`propietario_id`, `ownedNodes`).
 */
@Injectable()
export class TypeOrmPublicLinkRepository implements IPublicLinkRepository {
  constructor(@Inject(TransactionContext) private readonly context: TransactionContext) {}

  async replace(actor: Actor, link: PublicLink): Promise<PublicLinkReplacement | null> {
    const manager = this.context.requireActorScope(actor);
    const snapshot = link.toSnapshot();
    const owned = ownedNodes(actor);
    const scope = {
      ...owned.parameters,
      file_id: snapshot.fileId,
      owner_id: actor.id,
      now: snapshot.createdAt,
    };
    await queryNamed(manager, LOCK_FILE_SQL, { file_id: snapshot.fileId });
    const [previous] = await queryNamed<LinkRow>(manager, revokeCurrentSql(owned.sql), scope);
    const inserted = await this.insert(manager, link, { sql: owned.sql, scope });
    if (!inserted) return null;
    return { previous: previous === undefined ? null : toLink(previous) };
  }

  async findCurrent(actor: Actor, fileId: string): Promise<PublicLink | null> {
    const owned = ownedNodes(actor);
    const [row] = await queryNamed<LinkRow>(
      this.context.requireActorScope(actor),
      findCurrentSql(owned.sql),
      { ...owned.parameters, file_id: fileId, owner_id: actor.id },
    );
    return row === undefined ? null : toLink(row);
  }

  async revoke(actor: Actor, linkId: string, revokedAt: Date): Promise<PublicLink | null> {
    const [row] = await queryNamed<LinkRow>(
      this.context.requireActorScope(actor),
      REVOKE_BY_ID_SQL,
      { link_id: linkId, owner_id: actor.id, now: revokedAt },
    );
    return row === undefined ? null : toLink(row);
  }

  async findAvailable(actor: Actor, linkId: string): Promise<PublicLink | null> {
    const [row] = await queryNamed<LinkRow>(
      this.context.requireActorScope(actor),
      FIND_AVAILABLE_SQL,
      { link_id: linkId, owner_id: actor.id },
    );
    return row === undefined ? null : toLink(row);
  }

  /** `false`, sin escribir, si el archivo dejó de ser propio y vivo (la transacción del servicio revierte). */
  private async insert(
    manager: EntityManager,
    link: PublicLink,
    owned: { readonly sql: string; readonly scope: Readonly<Record<string, unknown>> },
  ): Promise<boolean> {
    const snapshot = link.toSnapshot();
    const rows = await queryNamed(manager, insertSql(owned.sql), {
      ...owned.scope,
      id: snapshot.id,
      token_hash: snapshot.tokenHash,
      password_hash: snapshot.passwordHash?.reveal() ?? null,
      expires_at: snapshot.expiresAt,
    });
    return rows.length === 1;
  }
}
