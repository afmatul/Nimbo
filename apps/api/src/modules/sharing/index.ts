// API pública del módulo `sharing`. Otros módulos importan solo desde aquí (Art. VIII.3, CA-5).
// `identity` implementa `IShareeDirectory` (012, DF-84); `sharing.module.ts` llega con la T-06.
export { I_SHAREE_DIRECTORY } from './application/ports/i-sharee-directory.port';
export type { IShareeDirectory, Sharee } from './application/ports/i-sharee-directory.port';
