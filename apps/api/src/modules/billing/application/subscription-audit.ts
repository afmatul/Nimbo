import type { Actor } from '../../../shared';
import type { AuditAction, IAuditLogger } from '../../audit';

/** Atributos de los eventos de la suscripción (010 plan §2): planes, montos y banderas; nunca datos de tarjeta. */
export type SubscriptionAuditAttributes = Readonly<Record<string, string | number | boolean>>;

/**
 * Un evento de la suscripción del cliente (spec 010 CA-6, CA-22) en la misma transacción del cambio (011
 * `recordInTransaction`): si no se audita, no se cambia. El afectado es el dueño y no hay recurso.
 */
export const recordSubscriptionEvent = (
  audit: IAuditLogger,
  actor: Actor,
  event: { readonly action: AuditAction; readonly attributes?: SubscriptionAuditAttributes },
): Promise<void> =>
  audit.recordInTransaction({
    action: event.action,
    actor,
    targetUserId: actor.id,
    attributes: event.attributes ?? {},
  });
