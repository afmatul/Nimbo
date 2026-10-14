// API pública del módulo `audit`. Otros módulos importan solo desde aquí (Art. VIII.3, CA-5).
// 005 (D-11) declaró el puerto y el catálogo; 004 lo implementa con `AuditService`, que no se exporta (DF-60).
export { AuditAction } from './application/audit-action';
export { I_AUDIT_LOGGER } from './application/i-audit-logger.port';
export { SYSTEM_ACTOR } from './domain/audit-actor';
export type { AuditActor } from './domain/audit-actor';
export type { AuditRecord, IAuditLogger } from './application/i-audit-logger.port';
export { AuditHttpModule } from './audit-http.module';
export { AuditModule } from './audit.module';
