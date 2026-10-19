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

/** La frase bajo el título (mockups `planes--cambiar-plan` y `planes--confirmar-personal-solo-lectura`). */
const introOf = (subscription: SubscriptionView | null): string => {
  if (subscription === null || subscription.expiresAt === null) {
    return 'Tu cuenta usa Personal. Elige un plan de pago para contratarlo.';
  }
  if (subscription.status === 'readOnly') {
    return 'Tu suscripción venció. Si eliges Personal, el cambio es inmediato y sin cobro; si eliges un plan de pago, se aplica cuando renueves tu plan.';
  }
  return `El cambio se aplica el ${longDayLabel(subscription.expiresAt)}, cuando termina tu periodo. Hasta entonces conservas ${subscription.plan.name} y sus límites. No hay cobro proporcional.`;
};

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
  const currentId = subscription?.plan.id ?? null;
  if (plan.id === currentId) {
    return (
      <p className="flex items-center justify-center gap-2 py-2 text-sm font-medium text-primary">
        <Check aria-hidden="true" className="size-4" />
        Es tu plan actual
      </p>
    );
  }
  if (subscription === null || subscription.expiresAt === null) {
    if (plan.priceCents === 0) return null;
    return (
      <Link href={subscribeHref(plan.slug)} className={buttonVariants({ className: 'w-full' })}>
        {`Contratar ${plan.name}`}
      </Link>
    );
  }
  if (subscription.pendingPlan?.id === plan.id) {
    return (
      <Button variant="outline" className="w-full" disabled>
        Cambio programado
      </Button>
    );
  }
  return (
    <Button variant="outline" className="w-full" onClick={() => onChoose(plan)}>
      {`Cambiar a ${plan.name}`}
    </Button>
  );
}

/**
 * «Cambiar de plan» (spec 010 CA-16 a CA-18, CA-21, CA-27; mockups `planes--*`): los planes activos con el actual marcado,
 * la comparativa y la confirmación. Desde Personal, un plan de pago lleva a contratar (009).
 */
export function PlanChangeList(props: PlanChangeListProps): React.JSX.Element {
  const { history, plans, usedBytes, pending, error, onSchedule, onDismissError } = props;
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
      {subscription?.status === 'readOnly' ? (
        <ReadOnlyBanner
          title="Tu suscripción venció."
          description="Puedes ver y descargar tus archivos, pero no subir ni editar. Renueva tu plan."
          renewHref={RENEW_PATH}
        />
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
      <div className="flex flex-wrap gap-4">
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            className="min-w-0 flex-1 basis-56"
            highlighted={plan.id === subscription?.plan.id}
            badge={
              plan.id === subscription?.plan.id ? (
                <Badge variant="secondary">Plan actual</Badge>
              ) : undefined
            }
            action={<PlanAction plan={plan} subscription={subscription} onChoose={setTarget} />}
          />
        ))}
      </div>
      <PlanComparisonTable plans={plans} />
      {subscription === null ? null : (
        <PlanChangeDialog
          subscription={subscription}
          target={target}
          card={history.paymentMethod}
          usedBytes={usedBytes}
          pending={pending}
          error={error}
          onConfirm={onSchedule}
          onClose={close}
        />
      )}
    </section>
  );
}
