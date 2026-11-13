// API pública del módulo `identity`. Otros módulos importan solo desde aquí (Art. VIII.3, CA-5).
export { IdentityModule } from './identity.module';
export { IdentityReadersModule } from './identity-readers.module';
export { VerifiedClientLister } from './application/verified-client-lister';
export { AccountContactReader } from './application/account-contact-reader';
export { PendingPlanRegistry } from './application/pending-plan-registry';
export { UserDirectoryAdapter } from './infrastructure/adapters/user-directory.adapter';
export { ShareeDirectoryAdapter } from './infrastructure/adapters/sharee-directory.adapter';
export { IDENTITY_THROTTLERS } from './presentation/identity-ip-throttler.guard';
export { CLIENT_ACCOUNT_VERIFIED } from './domain/client-account-verified.event';
export type { ClientAccountVerifiedEvent } from './domain/client-account-verified.event';
export { AccountAdministration } from './application/account-administration';
export { AccountDirectory } from './application/account-directory';
export type {
  AccountListRequest,
  AccountView,
  AccountViewPage,
} from './application/account-directory';
export { InternalAccountEnrollment } from './application/internal-account-enrollment';
export type {
  EnrolledAccount,
  EnrollInternalCommand,
  Enrollment,
  InitialAdminCommand,
} from './application/internal-account-enrollment';
export type {
  AccountStatistics,
  ClientIdentity,
} from './application/ports/i-account-directory.repository.port';
// Para el backoffice (011 T-10): `ParseUUIDPipe` de `:id` y validación del alta con los códigos de `identity` (plan §4),
// y la bitácora `backoffice.actor.inactive`.
export {
  AccountNotFoundError,
  ActorNotActiveError,
  IdentityInvalidInputError,
} from './domain/errors';
