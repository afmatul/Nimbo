import type { Actor } from '../../../../shared';
import type { AuditEntry } from '../../domain/audit-entry';
import type { AuditQuery } from '../../domain/audit-query';

/** Una página de la actividad propia: hasta `AUDIT_PAGE_SIZE` eventos y el cursor de la siguiente (`null` al final). */
export interface AuditPage {
  readonly entries: readonly AuditEntry[];
  readonly nextCursor: string | null;
}

/**
 * Persistencia de `evento_auditoria` (plan 004 §2; Art. V, regla b). Interno a `audit`. Todo método toma el
 * `EntityManager` de `requireActorScope(actor)`: se une a la transacción vigente de ese actor.
 */
export interface IAuditRepository {
  /** Inserta el evento a nombre de `actor` sin leerlo de vuelta (un interno no puede leer lo que escribe sobre otro). */
  insert(actor: Actor, entry: AuditEntry): Promise<void>;
  /**
   * Eventos donde `actor` es el afectado, del más reciente al más antiguo, con los filtros de `query` dentro del SQL.
   * Lanza `InvalidAuditQueryError` (`INVALID_CURSOR`) si el cursor no es válido.
   */
  listForTarget(actor: Actor, query: AuditQuery): Promise<AuditPage>;
}

export const I_AUDIT_REPOSITORY: unique symbol = Symbol('IAuditRepository');
