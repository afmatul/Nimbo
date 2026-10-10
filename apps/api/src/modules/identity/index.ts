// API pública del módulo `identity`. Otros módulos importan solo desde aquí (Art. VIII.3, CA-5).
export { IdentityModule } from './identity.module';
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
