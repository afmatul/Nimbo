import { randomUUID } from 'node:crypto';

import type { Queryable } from '../storage/storage-test-db';

/** Nodo compartido: exactamente uno de los dos (`ck_comparticion_nodo`). */
export type SharedNode = { readonly fileId: string } | { readonly folderId: string };

export interface ShareRow {
  readonly ownerId: string;
  readonly granteeId: string;
  readonly node: SharedNode;
  readonly level?: string;
}

/** Inserta una fila de `comparticion` (como el propietario dentro de `withActor`, o como el dueño) y devuelve su id. */
export const insertShare = async (runner: Queryable, share: ShareRow): Promise<string> => {
  const id = randomUUID();
  await runner.query(
    `INSERT INTO comparticion (id, propietario_id, destinatario_id, archivo_id, carpeta_id, nivel)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      id,
      share.ownerId,
      share.granteeId,
      'fileId' in share.node ? share.node.fileId : null,
      'folderId' in share.node ? share.node.folderId : null,
      share.level ?? 'VIEWER',
    ],
  );
  return id;
};
