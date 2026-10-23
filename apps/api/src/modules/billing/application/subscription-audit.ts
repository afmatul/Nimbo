import type { Actor } from '../../../shared';
import { AuditAction } from '../../audit';
import type { IAuditLogger } from '../../audit';
import type { Plan } from '../domain/entities/plan.entity';
import type { Subscription } from '../domain/entities/subscription.entity';

/** Atributos de los eventos de la suscripción (010 plan §2): planes, montos y banderas; nunca datos de tarjeta. */
export type SubscriptionAuditAttributes = Readonly<Record<string, string | number | boolean>>;

/** Un evento de la suscripción por registrar. */
export interface SubscriptionEvent {
  readonly action: AuditAction;
  readonly attributes?: SubscriptionAuditAttributes;
}

/**
 * Un evento de la suscripción del cliente (spec 010 CA-6, CA-22) en la misma transacción del cambio (011
 * `recordInTransaction`): si no se audita, no se cambia. El afectado es el dueño y no hay recurso.
 */
export const recordSubscriptionEvent = (
  audit: IAuditLogger,
  actor: Actor,
  event: SubscriptionEvent,
): Promise<void> =>
  audit.recordInTransaction({
    action: event.action,
    actor,
    targetUserId: actor.id,
    attributes: event.attributes ?? {},
  });

/**
 * CA-22: lo que deja aplicar un cambio de plan, en la renovación, en la pasada a Personal o en la bajada inmediata en
 * solo lectura (CA-27): el plan aplicado, si cambió, y la salida de la solo lectura, si terminó.
 */
export const planChangeEvents = (
  before: Subscription,
  after: Subscription,
  plan: Plan,
): readonly SubscriptionEvent[] => [
  ...(after.planId === before.planId
    ? []
    : [
        {
          action: AuditAction.SUBSCRIPTION_PLAN_CHANGE_APPLIED,
          attributes: { planSlug: plan.slug },
        },
      ]),
  ...(before.isReadOnly && !after.isReadOnly
    ? [{ action: AuditAction.SUBSCRIPTION_READ_ONLY_EXITED }]
    : []),
];
