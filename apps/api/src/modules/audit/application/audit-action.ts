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
}

const AUDIT_ACTIONS: ReadonlySet<string> = new Set(Object.values(AuditAction));

export const isAuditAction = (value: unknown): value is AuditAction =>
  typeof value === 'string' && AUDIT_ACTIONS.has(value);
