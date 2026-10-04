/** Catálogo cerrado de acciones auditables. 005 declara las de carga y descarga; cada spec agrega las suyas. */
export enum AuditAction {
  FILE_UPLOAD_COMPLETED = 'file.upload_completed',
  FILE_UPLOAD_REJECTED = 'file.upload_rejected',
  FILE_DOWNLOAD_URL_ISSUED = 'file.download_url_issued',
  /** Papelera (006, CA-24): `attributes { nodeType, itemCount, sizeBytes }`, nunca nombres. */
  NODE_TRASHED = 'node.trashed',
  NODE_RESTORED = 'node.restored',
  NODE_PURGED = 'node.purged',
  TRASH_EMPTIED = 'trash.emptied',
}

const AUDIT_ACTIONS: ReadonlySet<string> = new Set(Object.values(AuditAction));

export const isAuditAction = (value: unknown): value is AuditAction =>
  typeof value === 'string' && AUDIT_ACTIONS.has(value);
