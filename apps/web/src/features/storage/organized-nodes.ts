import type { FolderRef, NodeSummary } from '@nimbo/contracts';

/**
 * Último estado de lo renombrado o movido en esta vista, por `id` (006 CA-4, CA-7). Se aplica sobre el listado y las
 * cargas de la pestaña para mostrar el cambio sin volver a pedir la carpeta.
 */
export type OrganizedNodes = ReadonlyMap<string, NodeSummary>;

/** Carpeta donde está el elemento; `null` es la raíz. */
function locationOf(node: NodeSummary): string | null {
  return node.type === 'folder' ? node.parentId : node.folderId;
}

/** Reemplaza cada elemento por su último estado y quita lo que ya no está en `folderId`. */
export function withOrganized(
  nodes: readonly NodeSummary[],
  organized: OrganizedNodes,
  folderId: string | null,
): readonly NodeSummary[] {
  return nodes.flatMap((node) => {
    const latest = organized.get(node.id) ?? node;
    return locationOf(latest) === folderId ? [latest] : [];
  });
}

/** Carpetas de primer nivel de la barra lateral con lo renombrado, lo que salió de la raíz y lo que llegó a ella. */
export function withOrganizedRootFolders(
  folders: readonly FolderRef[],
  organized: OrganizedNodes,
): readonly FolderRef[] {
  const listed = new Set(folders.map((folder) => folder.id));
  const arrived = [...organized.values()].filter(
    (node) => node.type === 'folder' && node.parentId === null && !listed.has(node.id),
  );
  return [...folders, ...arrived].flatMap((folder) => {
    const latest = organized.get(folder.id);
    if (latest === undefined) return [{ id: folder.id, name: folder.name }];
    return latest.type === 'folder' && latest.parentId === null
      ? [{ id: latest.id, name: latest.name }]
      : [];
  });
}
