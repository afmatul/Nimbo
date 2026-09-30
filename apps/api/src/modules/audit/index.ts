// API pública del módulo `audit`. Otros módulos importan solo desde aquí (Art. VIII.3, CA-5).
// 005 (D-11) declara el puerto y el adaptador provisional; 004 agrega la persistencia.
export { AuditAction } from './application/audit-action';
export { I_AUDIT_LOGGER } from './application/i-audit-logger.port';
export type { AuditRecord, IAuditLogger } from './application/i-audit-logger.port';
export { AuditModule } from './audit.module';
