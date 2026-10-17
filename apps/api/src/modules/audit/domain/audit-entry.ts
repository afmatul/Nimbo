import type { AuditActorRole } from './audit-actor';

export type AuditAttributeValue = string | number | boolean;

/** Atributos planos de un evento: identificadores, conteos y tipos; nunca nombres ni contenido (RN-4). */
export type AuditAttributes = Readonly<Record<string, AuditAttributeValue>>;

/**
 * Tipo del recurso afectado (`tipo_recurso`). Los de nodos y cargas coinciden con `contracts/audit` sin importarlo
 * (ADR-0008); `account` y `plan` son de las acciones internas (011) y no salen en «Mi actividad» como tipo.
 */
export type AuditResourceType = 'file' | 'folder' | 'upload' | 'account' | 'plan';

/** Datos de un evento de auditoría guardado (`evento_auditoria`, DF-12). */
export interface AuditEntryProps {
  readonly id: string;
  /** Texto y no `AuditAction`: el dominio no conoce el catálogo, que vive en `application` (RN-3). */
  readonly action: string;
  /** `null` cuando la cuenta del actor se eliminó (anonimizado, D-8; su rol se conserva) o si es el sistema (011). */
  readonly actorId: string | null;
  readonly actorRole: AuditActorRole;
  /** `null` solo en los cambios de catálogo y en el alta inicial (011, `ck_evento_destino`). */
  readonly targetUserId: string | null;
  readonly resourceType: AuditResourceType | null;
  readonly resourceId: string | null;
  readonly attributes: AuditAttributes;
  readonly occurredAt: Date;
  readonly correlationId: string | null;
}

/**
 * Evento de solo adición (RN-2): valor inmutable, sin Nest ni TypeORM. No decide quién lo ve: la visibilidad es la
 * consulta con RLS (Art. IX.2, DF-64).
 */
export type AuditEntry = AuditEntryProps;

export const createAuditEntry = (props: AuditEntryProps): AuditEntry =>
  Object.freeze({ ...props, attributes: Object.freeze({ ...props.attributes }) });
