// API pública del módulo `sharing`. Otros módulos importan solo desde aquí (Art. VIII.3, CA-5).
// `identity` implementa `IShareeDirectory` (012, DF-84); la raíz monta `SharingModule.forRoot(env, storage)`.
export { I_SHAREE_DIRECTORY } from './application/ports/i-sharee-directory.port';
export type { IShareeDirectory, Sharee } from './application/ports/i-sharee-directory.port';
export { SharingModule } from './sharing.module';
export type { SharingEnv } from './sharing.module';
// El distintivo «Compartido» del explorador: implementa `ISharedNodeReader` de `storage`; lo enlaza la raíz.
export { SqlSharedNodeReader } from './infrastructure/persistence/sql-shared-node.reader';
