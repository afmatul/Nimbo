'use client';

import type { BillingHistoryResponse, Plan, SubscriptionView } from '@nimbo/contracts';
import { ArrowLeft, Check } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { PlanCard } from '../../../components/nimbo/plan-card';
import { ReadOnlyBanner } from '../../../components/nimbo/read-only-banner';
import { Badge } from '../../../components/ui/badge';
import { Button, buttonVariants } from '../../../components/ui/button';
import { longDayLabel } from '../../../lib/format-date';
import { PLAN_AND_BILLING_PATH, RENEW_PATH, subscribeHref } from '../routes';

import { PlanChangeDialog } from './plan-change-dialog';
import { PlanComparisonTable } from './plan-comparison-table';
import { EXPIRED_BANNER } from './subscription-copy';

export interface PlanChangeListProps {
  readonly history: BillingHistoryResponse;
  /** Solo los planes activos (`GET /billing/plans`, PD-86). */
  readonly plans: readonly Plan[];
  readonly usedBytes: number | null;
  readonly pending: boolean;
  readonly error: string | null;
  readonly onSchedule: (plan: Plan) => void;
  readonly onDismissError: () => void;
}

/** Un plan de pago tiene vencimiento; Personal (o sin suscripción) no. */
type PaidSubscription = SubscriptionView & { readonly expiresAt: string };
const isPaid = (subscription: SubscriptionView | null): subscription is PaidSubscription =>
  subscription !== null && subscription.expiresAt !== null;

/** La frase bajo el título (mockups `planes--cambiar-plan` y `planes--confirmar-personal-solo-lectura`). */
const introOf = (subscription: SubscriptionView | null): string => {
  if (!isPaid(subscription)) {
    return 'Tu cuenta usa Personal. Elige un plan de pago para contratarlo.';
  }
  if (subscription.status === 'readOnly') {
    return 'Tu suscripción venció. Si eliges Personal, el cambio es inmediato y sin cobro; si eliges un plan de pago, se aplica cuando renueves tu plan.';
  }
  return `El cambio se aplica el ${longDayLabel(subscription.expiresAt)}, cuando termina tu periodo. Hasta entonces conservas ${subscription.plan.name} y sus límites. No hay cobro proporcional.`;
};

function CurrentPlanNote(): React.JSX.Element {
  return (
    <p className="flex items-center justify-center gap-2 py-2 text-sm font-medium text-primary">
      <Check aria-hidden="true" className="size-4" />
      Es tu plan actual
    </p>
  );
}

/** El pie de cada tarjeta: el actual, el ya programado, contratar desde Personal (CA-18) o cambiar. */
function PlanAction({
  plan,
  subscription,
  onChoose,
}: {
  readonly plan: Plan;
  readonly subscription: SubscriptionView | null;
  readonly onChoose: (plan: Plan) => void;
}): React.JSX.Element | null {
  if (plan.id === subscription?.plan.id) return <CurrentPlanNote />;
  if (!isPaid(subscription)) {
    if (plan.priceCents === 0) return null;
    return (
      <Link href={subscribeHref(plan.slug)} className={buttonVariants({ className: 'w-full' })}>
        {`Contratar ${plan.name}`}
      </Link>
    );
  }
  const scheduled = subscription.pendingPlan?.id === plan.id;
  return (
    <Button
      variant="outline"
      className="w-full"
      disabled={scheduled}
      onClick={() => onChoose(plan)}
    >
      {scheduled ? 'Cambio programado' : `Cambiar a ${plan.name}`}
    </Button>
  );
}

/** Aviso de vencida, vuelta a «Plan y facturación», título y lo que pasa al cambiar. */
function ListHeader({
  subscription,
}: {
  readonly subscription: SubscriptionView | null;
}): React.JSX.Element {
  return (
    <>
      {subscription?.status === 'readOnly' ? (
        <ReadOnlyBanner {...EXPIRED_BANNER} renewHref={RENEW_PATH} />
      ) : null}
      <Link
        href={PLAN_AND_BILLING_PATH}
        className="flex w-fit items-center gap-1 text-sm text-primary underline"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Volver a Plan y facturación
      </Link>
      <div className="space-y-1">
        <h1 id="cambiar-plan-titulo" className="text-2xl font-bold text-foreground">
          Cambiar de plan
        </h1>
        <p className="max-w-3xl text-sm text-secondary-foreground">{introOf(subscription)}</p>
      </div>
    </>
  );
}

/** Los planes activos con el actual marcado (CA-17: la lista no trae desactivados). */
function PlanCards({
  plans,
  subscription,
  onChoose,
}: {
  readonly plans: readonly Plan[];
  readonly subscription: SubscriptionView | null;
  readonly onChoose: (plan: Plan) => void;
}): React.JSX.Element {
  return (
    <div className="flex flex-wrap gap-4">
      {plans.map((plan) => {
        const current = plan.id === subscription?.plan.id;
        return (
          <PlanCard
            key={plan.id}
            plan={plan}
            className="min-w-0 flex-1 basis-56"
            highlighted={current}
            badge={current ? <Badge variant="secondary">Plan actual</Badge> : undefined}
            action={<PlanAction plan={plan} subscription={subscription} onChoose={onChoose} />}
          />
        );
      })}
    </div>
  );
}

/**
 * «Cambiar de plan» (spec 010 CA-16 a CA-18, CA-21, CA-27; mockups `planes--*`): los planes activos con el actual marcado,
 * la comparativa y la confirmación. Desde Personal, un plan de pago lleva a contratar (009).
 */
export function PlanChangeList(props: PlanChangeListProps): React.JSX.Element {
  const { history, plans, onSchedule, onDismissError, ...dialog } = props;
  const { subscription } = history;
  const [target, setTarget] = React.useState<Plan | null>(null);
  const close = (): void => {
    setTarget(null);
    onDismissError();
  };
  return (
    <section
      aria-labelledby="cambiar-plan-titulo"
      className="mx-auto flex w-full max-w-6xl flex-col gap-4"
    >
      <ListHeader subscription={subscription} />
      <PlanCards plans={plans} subscription={subscription} onChoose={setTarget} />
      <PlanComparisonTable plans={plans} />
      {subscription === null ? null : (
        <PlanChangeDialog
          subscription={subscription}
          target={target}
          card={history.paymentMethod}
          onConfirm={onSchedule}
          onClose={close}
          {...dialog}
        />
      )}
    </section>
  );
}
