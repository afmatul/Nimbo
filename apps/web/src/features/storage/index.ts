/**
 * Frontera pública de `storage` en la web (017 plan §2): lo que otros módulos y los envoltorios de ruta pueden usar.
 * Lo demás es interno.
 */
export { createStorageApi } from './api';
export { CHIP_TYPE_BY_KIND } from './file-type';
export { MoveFolderTree } from './components/move-folder-tree';
export { MyFiles, type FirstFileAction, type MyFilesProps } from './components/my-files';
export { ThumbnailProvider, type ThumbnailRenderer } from './components/node-thumbnail';
export { StorageAppLayout } from './components/storage-app-layout';
export { useFileDownload } from './hooks/use-file-download';
export type { LoadFolderContents } from './hooks/use-folder-contents';
export { TREE_ROOT, useFolderTree, type FolderTree } from './hooks/use-folder-tree';
export { useTreeFocus } from './hooks/use-tree-focus';
export {
  MY_FILES_PATH,
  locationPath,
  returnFocusOf,
  returnPathOf,
  type RouteSearch,
} from './routes';
