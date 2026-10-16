import { formatGtq, type BillingHistoryResponse, type Plan } from '@nimbo/contracts';
import Link from 'next/link';
import type * as React from 'react';

import { Badge } from '../../../components/ui/badge';
import { buttonVariants } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { longDayLabel } from '../../../lib/format-date';
import { formatCount, formatPlanBytes } from '../../../lib/format-plan';

const PLANS_HREF = '/planes';

type Subscription = NonNullable<BillingHistoryResponse['subscription']>;
type PaymentMethod = BillingHistoryResponse['paymentMethod'];

const editorsLabel = (maxEditors: number): string =>
  maxEditors > 0
    ? `${formatCount(maxEditors)} editores simultáneos por documento`
    : 'Edición .docx solo lectura';

/** «350 GB · 1 GB por archivo · 5 editores simultáneos por documento» (mockup). */
const limitsLine = (plan: Plan): string =>
  [
    formatPlanBytes(plan.quotaBytes),
    `${formatPlanBytes(plan.maxFileBytes)} por archivo`,
    editorsLabel(plan.maxEditors),
  ].join(' · ');

/** «Visa ···· 4242»: marca con mayúscula inicial y solo los últimos 4 (RN-9). */
export const paymentMethodLabel = (method: PaymentMethod): string =>
  method === null
    ? '—'
    : `${method.brand.charAt(0).toUpperCase()}${method.brand.slice(1)} ···· ${method.last4}`;

const priceLabel = (priceCents: number): string =>
  priceCents > 0 ? formatGtq(priceCents) : 'Gratis';

function Fact({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): React.JSX.Element {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-foreground">{value}</dd>
    </div>
  );
}

function PlanHeading({ plan }: { readonly plan: Plan }): React.JSX.Element {
  return (
    <div className="min-w-0 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="plan-actual-titulo" className="text-xl font-semibold text-foreground">
          Nimbo {plan.name}
        </h2>
        <Badge variant="secondary">Plan actual</Badge>
      </div>
      <p className="text-3xl font-bold tracking-tight tabular-nums text-foreground">
        {priceLabel(plan.priceCents)}
        {plan.priceCents > 0 ? (
          <span className="ml-2 text-sm font-normal text-secondary-foreground">al mes</span>
        ) : null}
      </p>
      <p className="text-sm text-secondary-foreground">{limitsLine(plan)}</p>
    </div>
  );
}

/**
 * Plan vigente (spec 009 CA-7; mockup `billing/suscripcion/`): nombre, precio, límites, vencimiento, importe y tarjeta.
 * «Cambiar de plan» y «Próximo cobro» son de la 010; «Ver comparativa» lleva al catálogo de la 008.
 */
export function CurrentPlanCard({
  subscription,
  paymentMethod,
}: {
  readonly subscription: Subscription;
  readonly paymentMethod: PaymentMethod;
}): React.JSX.Element {
  const { plan, expiresAt } = subscription;
  return (
    <Card role="region" aria-labelledby="plan-actual-titulo" className="flex flex-col gap-5 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PlanHeading plan={plan} />
        <Link
          href={PLANS_HREF}
          className={buttonVariants({ variant: 'outline', className: 'w-full sm:w-auto' })}
        >
          Ver comparativa
        </Link>
      </div>
      <dl className="grid gap-4 border-t border-border pt-4 sm:grid-cols-3">
        <Fact
          label="Activo hasta"
          value={expiresAt === null ? 'Sin vencimiento' : longDayLabel(expiresAt)}
        />
        <Fact label="Importe" value={priceLabel(plan.priceCents)} />
        <Fact label="Método" value={paymentMethodLabel(paymentMethod)} />
      </dl>
      <dl className="grid gap-4 border-t border-border pt-4 sm:grid-cols-3">
        <Fact label="Tamaño máximo por archivo" value={formatPlanBytes(plan.maxFileBytes)} />
        <Fact
          label="Retención en papelera"
          value={`${formatCount(plan.trashRetentionDays)} días`}
        />
        <Fact
          label="Edición colaborativa de .docx"
          value={plan.maxEditors > 0 ? 'Activa' : 'Solo lectura'}
        />
      </dl>
    </Card>
  );
}
