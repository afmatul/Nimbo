// API pública del módulo `identity`. Otros módulos importan solo desde aquí (Art. VIII.3, CA-5).
export { IdentityModule } from './identity.module';
export { IDENTITY_THROTTLERS } from './presentation/identity-ip-throttler.guard';
export { CLIENT_ACCOUNT_VERIFIED } from './domain/client-account-verified.event';
export type { ClientAccountVerifiedEvent } from './domain/client-account-verified.event';
