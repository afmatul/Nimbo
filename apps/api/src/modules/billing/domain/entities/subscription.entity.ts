import { PlanNotAvailableError } from '../errors/plan-not-available.error';
import { PERSONAL_PLAN_SLUG } from '../plan-slug';

import type { Plan } from './plan.entity';

/** RN-4: un plan de pago dura 30 días desde el pago. Una columna en `plan` espera a que dos planes duren distinto (S-1). */
export const PAID_PLAN_PERIOD_DAYS = 30;

const DAY_MS = 86_400_000;

/** Una fila de `suscripcion` con el `slug` de su plan (la 009 no tiene `estado` ni `plan_pendiente_id`: son de la 010). */
export interface SubscriptionProps {
  readonly userId: string;
  readonly planId: string;
  readonly planSlug: string;
  readonly startedAt: Date;
  readonly expiresAt: Date | null;
}

/** Suscripción de un cliente (M4; spec 009). Personal no vence; un plan de pago vence a los 30 días. */
export class Subscription implements SubscriptionProps {
  readonly userId: string;
  readonly planId: string;
  readonly planSlug: string;
  readonly startedAt: Date;
  readonly expiresAt: Date | null;

  private constructor(props: SubscriptionProps) {
    this.userId = props.userId;
    this.planId = props.planId;
    this.planSlug = props.planSlug;
    this.startedAt = props.startedAt;
    this.expiresAt = props.expiresAt;
  }

  static rehydrate(props: SubscriptionProps): Subscription {
    return new Subscription(props);
  }

  get isPersonal(): boolean {
    return this.planSlug === PERSONAL_PLAN_SLUG;
  }

  /**
   * CA-3 y CA-5: desde Personal a un plan en venta, por `PAID_PLAN_PERIOD_DAYS` desde `now`. Una cuenta que ya tiene un
   * plan de pago no contrata otro (el cambio es de la 010); tampoco un plan desactivado o gratuito (RN-6).
   */
  subscribeTo(plan: Plan, now: Date): Subscription {
    if (!this.isPersonal || !plan.isForSale) throw new PlanNotAvailableError();
    return new Subscription({
      userId: this.userId,
      planId: plan.id,
      planSlug: plan.slug,
      startedAt: now,
      expiresAt: new Date(now.getTime() + PAID_PLAN_PERIOD_DAYS * DAY_MS),
    });
  }
}
