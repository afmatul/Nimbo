import type { UploadOnConflict } from '@nimbo/contracts';

import type { Actor } from '../../../shared';
import { NameConflictError } from '../domain/errors';
import type { File } from '../domain/file';
import type { FileName } from '../domain/file-name.vo';
import { VersionRetention } from '../domain/version-retention';

import { freeFileName } from './free-file-name';
import type { INodeRepository } from './ports/i-node.repository.port';
import type { IVersionRepository } from './ports/i-version.repository.port';

/** Puertos que consulta la resolución del destino de una carga, en la transacción del llamador. */
export interface UploadTargetPorts {
  readonly nodes: INodeRepository;
  readonly versions: IVersionRepository;
}

/** Lo pedido en `POST /uploads`, ya validado, con la retención del plan del actor. */
export interface UploadTargetRequest {
  readonly name: FileName;
  /** Carpeta destino (`null` = raíz, 006 CA-6). */
  readonly folderId: string | null;
  readonly onConflict: UploadOnConflict;
  readonly retainedVersions: number;
}

/** Nombre previsto de la carga y, si reemplaza (014 CA-1), el archivo existente; si no, `null`. */
export interface UploadTarget {
  readonly name: FileName;
  readonly replaces: File | null;
}

/**
 * Destino de una carga (005 CA-6, 014 CA-1, CA-15): con `replace` y un archivo vivo con ese nombre, ese archivo y su
 * nombre; si no, la regla de nombre repetido de 005. Con `ask` y conflicto, el 409 dice qué versión podaría
 * «Reemplazar» (`wouldPruneVersion`), calculada con `VersionRetention` como la poda real.
 */
export async function resolveUploadTarget(
  ports: UploadTargetPorts,
  actor: Actor,
  request: UploadTargetRequest,
): Promise<UploadTarget> {
  const { name, folderId, onConflict } = request;
  if (onConflict === 'replace') {
    const existing = await ports.nodes.findLiveFileByName(actor, name, folderId);
    if (existing !== null) return { name: existing.name, replaces: existing };
  }
  try {
    const keepBoth = onConflict === 'keep_both';
    return {
      name: await freeFileName(ports.nodes, actor, { name, folderId, keepBoth }),
      replaces: null,
    };
  } catch (error) {
    if (!(error instanceof NameConflictError)) throw error;
    throw await withPruneHint(ports, actor, { request, conflict: error });
  }
}

/** El 409 con `wouldPruneVersion` si reemplazar el archivo que choca podaría una versión; si no, el mismo error. */
async function withPruneHint(
  ports: UploadTargetPorts,
  actor: Actor,
  context: { readonly request: UploadTargetRequest; readonly conflict: NameConflictError },
): Promise<NameConflictError> {
  const { request, conflict } = context;
  const existing = await ports.nodes.findLiveFileByName(actor, request.name, request.folderId);
  if (existing === null) return conflict;
  const versions = await ports.versions.list(actor, existing.id);
  const next = Math.max(0, ...versions.map((version) => version.number)) + 1;
  const pruned = VersionRetention.surplus(
    [...versions, { number: next }],
    request.retainedVersions,
  );
  const wouldPrune = pruned[0]?.number;
  return wouldPrune === undefined
    ? conflict
    : new NameConflictError(conflict.suggestedName, wouldPrune);
}
