import type { FolderRef, NodeSummary } from '@nimbo/contracts';

/**
 * Último estado de lo renombrado o movido en esta vista, por `id` (006 CA-4, CA-7). Se aplica sobre el listado y las
 * cargas de la pestaña para mostrar el cambio sin volver a pedir la carpeta.
 */
export type OrganizedNodes = ReadonlyMap<string, NodeSummary>;

/** Carpeta donde está el elemento; `null` es la raíz. */
export function locationOf(node: NodeSummary): string | null {
  return node.type === 'folder' ? node.parentId : node.folderId;
}

/**
 * Suma al final lo que llegó a `folderId` en esta vista y el listado aún no trae (p. ej. movido desde una carpeta
 * desglosada, 006 CA-26).
 */
export function withArrivals(
  nodes: readonly NodeSummary[],
  organized: OrganizedNodes,
  folderId: string | null,
): readonly NodeSummary[] {
  const listed = new Set(nodes.map((node) => node.id));
  const arrived = [...organized.values()].filter(
    (node) => locationOf(node) === folderId && !listed.has(node.id),
  );
  return [...nodes, ...arrived];
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
