import { Subscription } from '../../domain/entities/subscription.entity';
import type { SubscriptionProps } from '../../domain/entities/subscription.entity';

import { PERSONAL_PLAN } from './plans';

/** Suscripción Personal vigente de un cliente de prueba, base de las pruebas de unidad de `billing` (009 y 010). */
const PERSONAL_SUBSCRIPTION: SubscriptionProps = {
  userId: '11111111-1111-4111-8111-111111111111',
  planId: PERSONAL_PLAN.id,
  planSlug: PERSONAL_PLAN.slug,
  startedAt: new Date('2026-09-01T00:00:00.000Z'),
  expiresAt: null,
  status: 'vigente',
  autoRenew: true,
  pendingPlanId: null,
};

/** Una suscripción de prueba a partir de la Personal vigente con los cambios de `patch`. */
export const aSubscription = (patch: Partial<SubscriptionProps> = {}): Subscription =>
  Subscription.rehydrate({ ...PERSONAL_SUBSCRIPTION, ...patch });
