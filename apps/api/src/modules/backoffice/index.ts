// API pública del módulo `backoffice`. Otros módulos importan solo desde aquí (Art. VIII.3, CA-5).
// `InitialAdminBootstrapper` sale solo para el comando `admin:bootstrap` (011 CA-7), que lo compone sin HTTP.
export { BackofficeModule } from './backoffice.module';
export { InitialAdminBootstrapper } from './application/initial-admin-bootstrapper';
