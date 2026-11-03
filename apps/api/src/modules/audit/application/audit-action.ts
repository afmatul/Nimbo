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
  /** Ajustes del Administrador (011b RN-4): recurso y afectado, la cuenta; el extra y su fin, o el `vence_en` nuevo. */
  ACCOUNT_QUOTA_ADJUSTED = 'account.quota_adjusted',
  ACCOUNT_VALIDITY_ADJUSTED = 'account.validity_adjusted',
  /** Soporte o Administración consultó los metadatos de un cliente (011 CA-13): recurso y afectado, la cuenta. */
  CLIENT_FILES_VIEWED = 'client.files_viewed',
  /** Catálogo (011): recurso `plan`, sin afectado (ningún cliente los ve). */
  PLAN_CREATED = 'plan.created',
  PLAN_DEACTIVATED = 'plan.deactivated',
  /**
   * Suscripción del cliente (010 §5, CA-6, CA-22): sin recurso, el afectado es el dueño; `trigger` dice si fue a mano (`manual`) o
   * en la pasada automática (`scheduled`) y `planSlug` el plan. Nunca datos de tarjeta ni la referencia del instrumento.
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
  /**
   * Edición (016 §5): `attributes` con `sessionId` y, según la acción, `versionId`, `versionNumber`, `sizeBytes` o
   * `reason`; nunca nombres de archivo, URLs ni tokens.
   */
  FILE_VERSION_CREATED = 'file.version_created',
  EDIT_SESSION_OPENED = 'edit.session_opened',
  EDIT_SAVE_FAILED = 'edit.save_failed',
  /**
   * Indexación (019 §5, D-6, CA-21): `attributes` con `versionId` y, según el resultado, `reason`, `durationMs` o
   * `fragmentCount`; nunca texto, nombres de archivo, extractos ni vectores. El reintento lleva como actor a quien lo pulsó.
   */
  FILE_INDEXED = 'file.indexed',
  FILE_INDEX_UNINDEXABLE = 'file.index_unindexable',
  FILE_INDEX_FAILED = 'file.index_failed',
  FILE_INDEX_RETRIED = 'file.index_retried',
  /**
   * Comparticiones (012 CA-19, plan §5): en la actividad del propietario, `attributes { nodeType, level }` y el nodo
   * como recurso; nunca nombres de archivo ni correos. Revocar y salir (CA-23) son `share.revoked`.
   */
  SHARE_GRANTED = 'share.granted',
  SHARE_LEVEL_CHANGED = 'share.level_changed',
  SHARE_REVOKED = 'share.revoked',
  /**
   * Enlaces públicos (013 CA-15, plan §5): en la actividad del propietario, el archivo como recurso; al generar,
   * `attributes { expiresInDays, protection }`, y al revocar o reemplazar, `{ reason }`. Nunca token, contraseña, IP,
   * nombre de archivo ni correo.
   */
  PUBLIC_LINK_CREATED = 'public_link.created',
  PUBLIC_LINK_REVOKED = 'public_link.revoked',
  /**
   * Descarga de un visitante (013 CA-10, CA-18, ADR-0039 regla 5): con el actor derivado del propietario («en nombre
   * de») y `attributes { trigger: 'public_link' }`, que la distingue de una descarga suya.
   */
  PUBLIC_LINK_DOWNLOADED = 'public_link.downloaded',
  /**
   * Bloqueo por contraseñas fallidas de un enlace desde una red (013 CA-13, CA-18): una vez por bloqueo, con el actor
   * derivado del propietario y `attributes { trigger: 'public_link' }`. Los fallos sueltos no se auditan; nunca IP.
   */
  PUBLIC_LINK_LOCKED = 'public_link.locked',
}

const AUDIT_ACTIONS: ReadonlySet<string> = new Set(Object.values(AuditAction));

export const isAuditAction = (value: unknown): value is AuditAction =>
  typeof value === 'string' && AUDIT_ACTIONS.has(value);
