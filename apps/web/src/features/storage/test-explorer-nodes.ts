import type { ExplorerFile, ExplorerFolder, FileSummary, FolderSummary } from '@nimbo/contracts';

/**
 * Carpeta como la devuelve el servidor al crear, renombrar o mover (`ExplorerFolder`): sin compartir salvo que la
 * prueba diga otra cosa.
 */
export function explorerFolder(
  folder: FolderSummary,
  overrides: Partial<ExplorerFolder> = {},
): ExplorerFolder {
  return { ...folder, type: 'folder', shared: false, ...overrides };
}

/**
 * Archivo como lo devuelve el servidor al renombrar o mover (`ExplorerFile`): sin compartir e indexado salvo que la
 * prueba diga otra cosa.
 */
export function explorerFile(
  file: FileSummary,
  overrides: Partial<ExplorerFile> = {},
): ExplorerFile {
  return { ...file, type: 'file', shared: false, indexStatus: 'indexed', ...overrides };
}
