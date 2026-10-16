/**
 * Frontera pública de `storage` en la web (017 plan §2): lo que otros módulos y los envoltorios de ruta pueden usar.
 * Lo demás es interno.
 */
export { MyFiles, type FirstFileAction, type MyFilesProps } from './components/my-files';
export { StorageAppLayout } from './components/storage-app-layout';
export { useFileDownload } from './hooks/use-file-download';
export { locationPath, returnFocusOf, returnPathOf, type RouteSearch } from './routes';
