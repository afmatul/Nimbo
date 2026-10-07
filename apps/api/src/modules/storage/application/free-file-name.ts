import type { Actor } from '../../../shared';
import { NameConflictError } from '../domain/errors';
import type { FileName } from '../domain/file-name.vo';

import type { INodeRepository } from './ports/i-node.repository.port';

/** Nombre pedido para un archivo en `folderId` (`null` = raíz); `exceptId` es el archivo que cambia, si ya existe. */
export interface FreeFileNameRequest {
  readonly name: FileName;
  readonly folderId: string | null;
  readonly keepBoth: boolean;
  readonly exceptId?: string;
}

/**
 * Regla de nombre repetido de 005 (CA-6) en una carpeta: el nombre pedido si está libre; si no, con `keep_both` el
 * primer «base (n).ext» libre y con `ask` un 409 con esa sugerencia. Corre en la transacción del llamador.
 */
export async function freeFileName(
  nodes: INodeRepository,
  actor: Actor,
  request: FreeFileNameRequest,
): Promise<FileName> {
  const { name, folderId, keepBoth, exceptId } = request;
  const taken = await nodes.findTakenNames(actor, name, folderId, exceptId);
  const free = name.firstFree(taken);
  if (!keepBoth && !free.sameAs(name)) throw new NameConflictError(free.value);
  return free;
}
