/** Catálogo cerrado de acciones auditables. 005 declara las de carga y descarga; cada spec agrega las suyas. */
export enum AuditAction {
  /** Carga y descarga (005, CA-20): `attributes` con `sizeBytes` (más `mode` y, si se rechaza, `reason`), nunca nombres. */
  FILE_UPLOAD_COMPLETED = 'file.upload_completed',
  FILE_UPLOAD_REJECTED = 'file.upload_rejected',
  FILE_DOWNLOAD_URL_ISSUED = 'file.download_url_issued',
  /** Papelera (006, CA-24): `attributes { nodeType, itemCount, sizeBytes }`, nunca nombres. */
  NODE_TRASHED = 'node.trashed',
  NODE_RESTORED = 'node.restored',
  NODE_PURGED = 'node.purged',
  TRASH_EMPTIED = 'trash.emptied',
  /** Versiones (014, CA-19): `attributes { versionNumber, sizeBytes }` y, al restaurar, `restoredFromNumber`. */
  FILE_VERSION_RESTORED = 'file.version_restored',
  FILE_VERSION_PRUNED = 'file.version_pruned',
  /** Cuentas (011): recurso y afectado son la cuenta; el alta interna guarda solo `role`, nunca nombre ni correo. */
  ACCOUNT_SUSPENDED = 'account.suspended',
  ACCOUNT_REACTIVATED = 'account.reactivated',
  ACCOUNT_INTERNAL_CREATED = 'account.internal_created',
  /** Alta inicial por comando (011 CA-7): actor de sistema y sin afectado. */
  ACCOUNT_BOOTSTRAP_ADMIN = 'account.bootstrap_admin',
  /** Soporte o Administración consultó los metadatos de un cliente (011 CA-13): recurso y afectado, la cuenta. */
  CLIENT_FILES_VIEWED = 'client.files_viewed',
  /** Catálogo (011): recurso `plan`, sin afectado (ningún cliente los ve). */
  PLAN_CREATED = 'plan.created',
  PLAN_DEACTIVATED = 'plan.deactivated',
  /**
   * Suscripción del cliente (010 §5, CA-6, CA-22): sin recurso, el afectado es el dueño; `trigger` dice si fue a mano o
   * en la pasada automática y `planSlug` el plan. Nunca datos de tarjeta ni la referencia del instrumento.
   */
  SUBSCRIPTION_AUTO_RENEW_CHANGED = 'subscription.auto_renew_changed',
  SUBSCRIPTION_RENEWED = 'subscription.renewed',
  SUBSCRIPTION_RENEWAL_REJECTED = 'subscription.renewal_rejected',
  SUBSCRIPTION_READ_ONLY_ENTERED = 'subscription.read_only_entered',
  SUBSCRIPTION_READ_ONLY_EXITED = 'subscription.read_only_exited',
  SUBSCRIPTION_PLAN_CHANGE_SCHEDULED = 'subscription.plan_change_scheduled',
  SUBSCRIPTION_PLAN_CHANGE_CANCELLED = 'subscription.plan_change_cancelled',
  SUBSCRIPTION_PLAN_CHANGE_APPLIED = 'subscription.plan_change_applied',
  SUBSCRIPTION_PLAN_CHANGE_DISCARDED = 'subscription.plan_change_discarded',
}

const AUDIT_ACTIONS: ReadonlySet<string> = new Set(Object.values(AuditAction));

export const isAuditAction = (value: unknown): value is AuditAction =>
  typeof value === 'string' && AUDIT_ACTIONS.has(value);
