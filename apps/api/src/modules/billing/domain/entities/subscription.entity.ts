import { BillingInvariantError } from '../errors/billing-invariant.error';
import { NoPaidSubscriptionError } from '../errors/no-paid-subscription.error';
import { NoPendingPlanChangeError } from '../errors/no-pending-plan-change.error';
import { PlanChangeInvalidError } from '../errors/plan-change-invalid.error';
import { PlanNotAvailableError } from '../errors/plan-not-available.error';
import { PERSONAL_PLAN_SLUG } from '../plan-slug';

import type { Plan } from './plan.entity';

/** RN-4: un plan de pago dura 30 días desde el pago. Una columna en `plan` espera a que dos planes duren distinto (S-1). */
export const PAID_PLAN_PERIOD_DAYS = 30;

const DAY_MS = 86_400_000;

/** Columna `suscripcion.estado` (spec 010 RN-5): la única fuente de la solo lectura. */
export type SubscriptionStatus = 'vigente' | 'solo_lectura';

/** Por qué no se ofrece renovar por adelantado (spec 010 CA-26, CA-28). */
export type RenewalUnavailableReason = 'ALREADY_RENEWED' | 'PLAN_CHANGE_PENDING';

/** El periodo que pagaría una renovación manual ahora y si se permite (la misma regla para la API y para la vista). */
export interface RenewalQuote {
  readonly available: boolean;
  readonly unavailableReason: RenewalUnavailableReason | null;
  readonly periodStartsAt: Date;
  readonly periodEndsAt: Date;
}

/** Una fila de `suscripcion` con el `slug` de su plan. */
export interface SubscriptionProps {
  readonly userId: string;
  readonly planId: string;
  readonly planSlug: string;
  readonly startedAt: Date;
  readonly expiresAt: Date | null;
  readonly status: SubscriptionStatus;
  readonly autoRenew: boolean;
  readonly pendingPlanId: string | null;
}

const periodEnd = (start: Date): Date => new Date(start.getTime() + PAID_PLAN_PERIOD_DAYS * DAY_MS);

const isPersonalPlan = (plan: Plan): boolean => plan.slug === PERSONAL_PLAN_SLUG;

/** CA-16 y CA-17: el cambio va a un plan de pago en venta o a Personal (que nunca se desactiva). */
const isChangeTarget = (plan: Plan): boolean => plan.isForSale || isPersonalPlan(plan);

/**
 * Suscripción de un cliente (M4; specs 009 y 010). Personal no vence; un plan de pago dura 30 días, se renueva con el
 * plan del siguiente ciclo y, si vence sin pago, queda en solo lectura con su mismo plan (RN-5). `startedAt` es el inicio
 * del último periodo pagado: si está en el futuro, el siguiente periodo ya se pagó por adelantado (CA-26).
 */
export class Subscription implements SubscriptionProps {
  readonly userId: string;
  readonly planId: string;
  readonly planSlug: string;
  readonly startedAt: Date;
  readonly expiresAt: Date | null;
  readonly status: SubscriptionStatus;
  readonly autoRenew: boolean;
  readonly pendingPlanId: string | null;

  private constructor(props: SubscriptionProps) {
    this.userId = props.userId;
    this.planId = props.planId;
    this.planSlug = props.planSlug;
    this.startedAt = props.startedAt;
    this.expiresAt = props.expiresAt;
    this.status = props.status;
    this.autoRenew = props.autoRenew;
    this.pendingPlanId = props.pendingPlanId;
  }

  static rehydrate(props: SubscriptionProps): Subscription {
    return new Subscription(props);
  }

  get isPersonal(): boolean {
    return this.planSlug === PERSONAL_PLAN_SLUG;
  }

  get isReadOnly(): boolean {
    return this.status === 'solo_lectura';
  }

  /** RN-4: el plan que cobra la siguiente renovación: el programado si hay uno; si no, el actual. */
  get nextCyclePlanId(): string {
    return this.pendingPlanId ?? this.planId;
  }

  /**
   * CA-3 y CA-5 (009): desde Personal a un plan en venta, por `PAID_PLAN_PERIOD_DAYS` desde `now`, vigente y con la
   * renovación automática encendida (010 RN-3). Una cuenta con plan de pago no contrata otro: programa un cambio.
   */
  subscribeTo(plan: Plan, now: Date): Subscription {
    if (!this.isPersonal || !plan.isForSale) throw new PlanNotAvailableError();
    return this.with({ ...this.periodWith(plan, now), autoRenew: true });
  }

  /** CA-2 y CA-7 (RN-5): vence sin pago; conserva plan, límites y periodo. */
  expire(): Subscription {
    this.paidExpiry();
    return this.with({ status: 'solo_lectura' });
  }

  /** Vigente y con `vence_en` cumplido: le toca la renovación automática o el vencimiento. Personal nunca (CA-15). */
  isDue(now: Date): boolean {
    return !this.isReadOnly && this.expiresAt !== null && this.expiresAt <= now;
  }

  /**
   * RN-1, RN-4 y CA-20: el periodo nuevo con el plan del siguiente ciclo, desde el `vence_en` anterior o, en solo
   * lectura, desde `now`; aplica el cambio programado y termina la solo lectura. Si el siguiente ciclo es Personal
   * (CA-21, CA-27), la cuenta pasa a Personal sin vencimiento.
   */
  renewWith(plan: Plan, now: Date): Subscription {
    const start = this.nextPeriodStart(now);
    if (plan.id !== this.nextCyclePlanId) {
      throw new BillingInvariantError('La renovación usa el plan del siguiente ciclo (RN-4).');
    }
    if (isPersonalPlan(plan))
      return this.with({ ...this.periodWith(plan, start), expiresAt: null });
    return this.with(this.periodWith(plan, start));
  }

  /** CA-6 (RN-3): solo cambia la renovación automática; el periodo pagado sigue igual. */
  setAutoRenew(enabled: boolean): Subscription {
    this.paidExpiry();
    return this.with({ autoRenew: enabled });
  }

  /**
   * CA-16 a CA-18 (RN-7): programa el cambio para el siguiente ciclo y reemplaza al anterior. En solo lectura, el cambio
   * a Personal se aplica de inmediato (CA-27).
   */
  scheduleChange(plan: Plan, now: Date): Subscription {
    this.paidExpiry();
    if (!isChangeTarget(plan) || plan.id === this.planId) throw new PlanChangeInvalidError();
    const scheduled = this.with({ pendingPlanId: plan.id });
    return this.isReadOnly && isPersonalPlan(plan) ? scheduled.renewWith(plan, now) : scheduled;
  }

  /** CA-19 y CA-29: quita el cambio programado; sin cambio, `404`. */
  cancelChange(): Subscription {
    this.paidExpiry();
    if (this.pendingPlanId === null) throw new NoPendingPlanChangeError();
    return this.with({ pendingPlanId: null });
  }

  /** CA-8, CA-10, CA-26 y CA-28: si se puede renovar a mano ahora y qué periodo pagaría. */
  renewalQuote(now: Date): RenewalQuote {
    const periodStartsAt = this.nextPeriodStart(now);
    const unavailableReason = this.renewalBlocker(now);
    return {
      available: unavailableReason === null,
      unavailableReason,
      periodStartsAt,
      periodEndsAt: periodEnd(periodStartsAt),
    };
  }

  /** En solo lectura siempre se puede pagar (y se aplica el cambio, CA-20); vigente, ni dos periodos ni con cambio. */
  private renewalBlocker(now: Date): RenewalUnavailableReason | null {
    if (this.isReadOnly) return null;
    if (this.startedAt > now) return 'ALREADY_RENEWED';
    return this.pendingPlanId === null ? null : 'PLAN_CHANGE_PENDING';
  }

  private nextPeriodStart(now: Date): Date {
    const expiry = this.paidExpiry();
    return this.isReadOnly ? now : expiry;
  }

  /** El `vence_en` de un plan de pago; con Personal, `BILLING_NO_PAID_SUBSCRIPTION` (CA-6, CA-11, CA-18). */
  private paidExpiry(): Date {
    if (this.isPersonal || this.expiresAt === null) throw new NoPaidSubscriptionError();
    return this.expiresAt;
  }

  private periodWith(plan: Plan, start: Date): Partial<SubscriptionProps> {
    return {
      planId: plan.id,
      planSlug: plan.slug,
      startedAt: start,
      expiresAt: periodEnd(start),
      status: 'vigente',
      pendingPlanId: null,
    };
  }

  private with(patch: Partial<SubscriptionProps>): Subscription {
    return new Subscription({ ...this, ...patch });
  }
}
