// API pública del módulo `identity`. Otros módulos importan solo desde aquí (Art. VIII.3, CA-5).
// `IdentityModule` se agrega al componerse en T-45.
export { CLIENT_ACCOUNT_VERIFIED } from './domain/client-account-verified.event';
export type { ClientAccountVerifiedEvent } from './domain/client-account-verified.event';
