import type { FileIndexStatus, FileKind } from '@nimbo/contracts';

import type { Actor } from '../../../../shared';

/** Un nodo del explorador por tipo e id: los nodos ya salieron de la consulta con `accessibleNodes(actor)`. */
export interface NodeRef {
  readonly type: 'file' | 'folder';
  readonly id: string;
}

/**
 * Qué nodos del actor están compartidos (explorador, «Compartido»): tienen comparticiones o, si es archivo, un enlace
 * público vigente. Lo implementa `sharing`, dueño de esas tablas, y lo enlaza la raíz (Art. V.2 d: `sharing` ya
 * depende de `storage`). Solo mira lo que el actor posee: un nodo ajeno nunca sale. Corre dentro de `withActor`.
 */
export interface ISharedNodeReader {
  sharedIds(actor: Actor, nodes: readonly NodeRef[]): Promise<ReadonlySet<string>>;
}

export const I_SHARED_NODE_READER = Symbol('ISharedNodeReader');

/** Un archivo del explorador con lo que decide su estado: el tipo (¿se indexa?) y la versión vigente. */
export interface IndexedFileRef {
  readonly id: string;
  readonly kind: FileKind;
  readonly currentVersionId: string;
}

/**
 * Estado de indexación de la versión vigente de cada archivo (spec 019). Lo implementa `intelligence`, dueño de
 * `indexacion` y de «qué es indexable», y lo enlaza la raíz (Art. V.2 d). Devuelve un estado por cada archivo pedido.
 * Corre dentro de `withActor`: la RLS de `indexacion` es la segunda barrera.
 */
export interface IIndexStatusReader {
  statusesOf(
    actor: Actor,
    files: readonly IndexedFileRef[],
  ): Promise<ReadonlyMap<string, FileIndexStatus>>;
}

export const I_INDEX_STATUS_READER = Symbol('IIndexStatusReader');
