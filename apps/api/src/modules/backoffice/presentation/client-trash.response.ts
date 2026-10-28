import type { ClientTrashResponse, RestoreResponse } from '@nimbo/contracts';

import { toNodeSummary, toTrashItem } from '../../storage';
import type { SupportRestoreResult } from '../../storage';
import type { ClientTrashView } from '../application/client-trash.service';

/**
 * `GET /backoffice/client-trash` (011b CA-10): el cliente y sus raíces con el mismo elemento que ve en su papelera
 * (006), sin contenido, versiones, claves de objeto ni URLs.
 */
export function toClientTrashResponse({ client, page }: ClientTrashView): ClientTrashResponse {
  return {
    client: { id: client.id, fullName: client.fullName, email: client.email },
    items: page.items.map(toTrashItem),
    nextCursor: page.nextCursor,
  };
}

/** CA-11: la misma respuesta que la restauración del cliente; la cantidad y los bytes solo van a la auditoría. */
export const toClientRestoreResponse = (result: SupportRestoreResult): RestoreResponse => ({
  item: toNodeSummary(result.node),
  outcome: result.outcome,
  originalName: result.originalName,
});
