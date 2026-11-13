/** Eventos por página de `GET /audit/my-events`: fijo, no hay `limit` (D-8, CA-9). */
export const AUDIT_PAGE_SIZE = 20;

/** Longitud máxima del motivo escrito de Soporte (`note`, D-6). */
export const AUDIT_NOTE_MAX_LENGTH = 500;

/** Origen de un evento: lo hizo el propio afectado («Yo») o el personal de Nimbo (D-8, CA-10). */
export const AUDIT_ORIGINS = ['self', 'staff'] as const;
export type AuditOrigin = (typeof AUDIT_ORIGINS)[number];

/**
 * Quién disparó la acción: el cliente (`manual`), un ciclo programado (`scheduled`: la purga de la papelera, CA-7, y la
 * renovación automática de la suscripción, 010) o alguien con el enlace público del propietario (`public_link`: la
 * descarga y el bloqueo, 013 CA-18, ADR-0039 regla 5).
 */
export const AUDIT_TRIGGERS = ['manual', 'scheduled', 'public_link'] as const;
export type AuditTrigger = (typeof AUDIT_TRIGGERS)[number];

/**
 * Acciones que la API audita: espejo del `AuditAction` de `api` (una prueba de `api` exige que sean iguales). La web
 * da a cada una su texto en «Mi actividad»; una acción nueva sin texto no compila ni pasa las pruebas de `web`.
 */
export const AUDIT_ACTIONS = [
  'file.upload_completed',
  'file.upload_rejected',
  'file.download_url_issued',
  'node.trashed',
  'node.restored',
  'node.purged',
  'trash.emptied',
  'file.version_restored',
  'file.version_pruned',
  'account.suspended',
  'account.reactivated',
  'account.internal_created',
  'account.bootstrap_admin',
  'account.quota_adjusted',
  'account.validity_adjusted',
  'client.files_viewed',
  'plan.created',
  'plan.deactivated',
  'subscription.auto_renew_changed',
  'subscription.renewed',
  'subscription.renewal_rejected',
  'subscription.read_only_entered',
  'subscription.read_only_exited',
  'subscription.plan_change_scheduled',
  'subscription.plan_change_cancelled',
  'subscription.plan_change_applied',
  'subscription.plan_change_discarded',
  'file.version_created',
  'edit.session_opened',
  'edit.save_failed',
  'file.indexed',
  'file.index_unindexable',
  'file.index_failed',
  'file.index_retried',
  'share.granted',
  'share.level_changed',
  'share.revoked',
  'public_link.created',
  'public_link.revoked',
  'public_link.downloaded',
  'public_link.locked',
  'file.optimized',
  'file.optimization_discarded',
  'file.optimization_failed',
] as const;
export type AuditActionName = (typeof AUDIT_ACTIONS)[number];
