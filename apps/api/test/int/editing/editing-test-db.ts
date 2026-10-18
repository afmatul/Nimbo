import { randomUUID } from 'node:crypto';

import type { Queryable } from '../storage/storage-test-db';

/**
 * Estado y motivo de una `sesion_edicion` de *fixture*; por defecto, `activa`. Texto libre: las pruebas de esquema
 * insertan también valores que el `CHECK` debe rechazar.
 */
export interface EditSessionRowOptions {
  readonly openedBy?: string;
  readonly state?: string;
  readonly failure?: string | null;
}

/** Una `fallida` sin motivo explícito falló en el editor; las demás no tienen motivo. */
const defaultFailure = (state: string): string | null => (state === 'fallida' ? 'editor' : null);

/** Archivo de la sesión: su dueño, el archivo y la versión vigente al abrir. */
export interface EditedFileRow {
  readonly ownerId: string;
  readonly fileId: string;
  readonly versionId: string;
}

/** Inserta una `sesion_edicion` sobre `file` y devuelve su id (como el dueño o dentro de `withActor`). */
export const insertEditSession = async (
  runner: Queryable,
  file: EditedFileRow,
  options: EditSessionRowOptions = {},
): Promise<string> => {
  const id = randomUUID();
  const state = options.state ?? 'activa';
  const finished = state !== 'activa' && state !== 'guardando';
  await runner.query(
    `INSERT INTO sesion_edicion (id, archivo_id, propietario_id, abierta_por, version_base_id, estado, motivo_fallo,
                                 iniciada_en, finalizada_en)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $8)`,
    [
      id,
      file.fileId,
      file.ownerId,
      options.openedBy ?? file.ownerId,
      file.versionId,
      state,
      options.failure !== undefined ? options.failure : defaultFailure(state),
      finished ? new Date() : null,
    ],
  );
  return id;
};

/** Inserta la `participacion` de `userId` en la sesión, todavía conectado. */
export const insertParticipation = async (
  runner: Queryable,
  sessionId: string,
  userId: string,
): Promise<void> => {
  await runner.query(
    'INSERT INTO participacion (sesion_edicion_id, usuario_id, entro_en) VALUES ($1, $2, now())',
    [sessionId, userId],
  );
};
