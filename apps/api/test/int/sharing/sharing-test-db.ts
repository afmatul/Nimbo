import { randomBytes, randomUUID } from 'node:crypto';

import type { Queryable } from '../storage/storage-test-db';

/** Nodo compartido: exactamente uno de los dos (`ck_comparticion_nodo`). */
export type SharedNode = { readonly fileId: string } | { readonly folderId: string };

export interface ShareRow {
  readonly ownerId: string;
  readonly granteeId: string;
  readonly node: SharedNode;
  readonly level?: string;
  /** Por omisión, `now()` de la base. */
  readonly createdAt?: Date;
}

/** Inserta una fila de `comparticion` (como el propietario dentro de `withActor`, o como el dueño) y devuelve su id. */
export const insertShare = async (runner: Queryable, share: ShareRow): Promise<string> => {
  const id = randomUUID();
  await runner.query(
    `INSERT INTO comparticion (id, propietario_id, destinatario_id, archivo_id, carpeta_id, nivel, creado_en)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, now()))`,
    [
      id,
      share.ownerId,
      share.granteeId,
      'fileId' in share.node ? share.node.fileId : null,
      'folderId' in share.node ? share.node.folderId : null,
      share.level ?? 'VIEWER',
      share.createdAt ?? null,
    ],
  );
  return id;
};

export interface PublicLinkRow {
  readonly ownerId: string;
  readonly fileId: string;
  /** Por omisión, uno al azar de `randomTokenHash`. */
  readonly tokenHash?: string;
  /** Por omisión, `now()` de la base. */
  readonly createdAt?: Date;
  /** Por omisión, siete días después de `now()`. */
  readonly expiresAt?: Date;
}

/** Un `token_hash` válido de relleno: 64 caracteres hexadecimales en minúscula, como el SHA-256 del token. */
export const randomTokenHash = (): string => randomBytes(32).toString('hex');

/** Inserta una fila de `enlace_publico` (como el propietario dentro de `withActor`) y devuelve su id y su hash. */
export const insertPublicLink = async (
  runner: Queryable,
  link: PublicLinkRow,
): Promise<{ id: string; tokenHash: string }> => {
  const id = randomUUID();
  const tokenHash = link.tokenHash ?? randomTokenHash();
  await runner.query(
    `INSERT INTO enlace_publico (id, archivo_id, propietario_id, token_hash, creado_en, vence_en)
     VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now()),
             COALESCE($6::timestamptz, now() + interval '7 days'))`,
    [id, link.fileId, link.ownerId, tokenHash, link.createdAt ?? null, link.expiresAt ?? null],
  );
  return { id, tokenHash };
};
