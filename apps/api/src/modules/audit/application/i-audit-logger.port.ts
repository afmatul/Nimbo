import type { AuditActor } from '../domain/audit-actor';

import type { AuditAction } from './audit-action';

/**
 * Un hecho auditable. `occurredAt` y `correlationId` no viajan aquí: los pone `AuditService` (reloj y contexto).
 * Los atributos son planos y nunca llevan nombres de archivo, URL, claves ni contenido; lo que el catálogo no permite
 * se descarta (CA-4).
 */
export interface AuditRecord {
  readonly action: AuditAction;
  readonly actor: AuditActor;
  /** `null` solo en los cambios de catálogo y en el alta inicial (011 plan §3, `ck_evento_destino`). */
  readonly targetUserId: string | null;
  readonly resourceId?: string;
  readonly attributes?: Readonly<Record<string, string | number | boolean>>;
}

/** Registro de auditoría persistente (spec 004 D-5): dos garantías de escritura sobre el mismo evento. */
export interface IAuditLogger {
  /**
   * Mejor esfuerzo, después del commit (005, 006): abre su propia transacción con `actor` y **nunca lanza**. Si no
   * puede guardar, anota `audit.record_failed` y quien llama sigue sin revertir su operación (CA-3, CA-5).
   */
  record(entry: AuditRecord): Promise<void>;
  /**
   * Síncrona (011): se une a la transacción vigente del **mismo** actor (`withActor` reentrante) y lanza si no puede
   * guardar (`UnknownAuditActionError` ante una acción fuera del catálogo), así el llamador revierte su acción; si esa
   * transacción se revierte, el evento también. Fuera de un `withActor` del llamador abre la suya, sin garantía
   * conjunta. Con `SYSTEM_ACTOR` escribe con `run`, que se une al `run` del llamador (011 CA-7, T1).
   */
  recordInTransaction(entry: AuditRecord): Promise<void>;
}

export const I_AUDIT_LOGGER: unique symbol = Symbol('IAuditLogger');
