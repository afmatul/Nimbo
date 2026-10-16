// API pública del módulo `editing`. Otros módulos importan solo desde aquí (Art. VIII.3, CA-5).
export { EditingModule } from './editing.module';
export type { EditingDependencies, EditingEnv } from './editing.module';
export { I_USER_DIRECTORY } from './application/ports/i-user-directory.port';
export type { IUserDirectory } from './application/ports/i-user-directory.port';
