import type { AuditRecord, IAuditLogger } from '../../audit';

import type { StorageLogger } from './storage-logger';

/**
 * Auditoría de mejor esfuerzo, después del commit (D-11): si `record` falla, se anota `audit.record_failed` con los
 * identificadores dados y la operación sigue (no se revierte el archivo ni se niega la URL).
 */
export async function recordAudit(
  audit: IAuditLogger,
  logger: StorageLogger,
  entry: AuditRecord,
  logIds: Readonly<Record<string, string>>,
): Promise<void> {
  try {
    await audit.record(entry);
  } catch {
    logger.error({ event: 'audit.record_failed', action: entry.action, ...logIds });
  }
}
