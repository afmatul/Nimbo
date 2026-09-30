import type { Actor } from '../../../shared';

import type { AuditAction } from './audit-action';

/**
 * Un hecho auditable. `occurredAt` y `correlationId` no viajan aquí: los pone el adaptador (reloj y contexto).
 * Los atributos son planos y nunca llevan nombres de archivo, URL, claves ni contenido.
 */
export interface AuditRecord {
  readonly action: AuditAction;
  readonly actor: Actor;
  readonly targetUserId: string;
  readonly resourceId?: string;
  readonly attributes?: Readonly<Record<string, string | number | boolean>>;
}

/**
 * Registro de auditoría. Contrato: mejor esfuerzo, después del commit; el adaptador provisional no lanza.
 * Quien llama no revierte su operación si el registro falla.
 */
export interface IAuditLogger {
  record(entry: AuditRecord): Promise<void>;
}

export const I_AUDIT_LOGGER: unique symbol = Symbol('IAuditLogger');
