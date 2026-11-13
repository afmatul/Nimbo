import type { Plan, SubscriptionView } from '@nimbo/contracts';
import { Lock } from 'lucide-react';
import Link from 'next/link';
import type * as React from 'react';

import { Badge } from '../../../components/ui/badge';
import { buttonVariants } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { formatCount, formatPlanBytes } from '../../../lib/format-plan';
import { CHANGE_PLAN_PATH } from '../routes';

import { expiryInstantLabel, expiryLabel, priceLabel } from './subscription-copy';

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

/** «Plan actual», o «Vencida» con candado en solo lectura (mockup `vencida`). */
function PlanBadge({ readOnly }: { readonly readOnly: boolean }): React.JSX.Element {
  if (!readOnly) return <Badge variant="secondary">Plan actual</Badge>;
  return (
    <Badge variant="warning" className="gap-1">
      <Lock aria-hidden="true" className="size-3" />
      Vencida
    </Badge>
  );
}

function PlanHeading({
  plan,
  readOnly,
}: {
  readonly plan: Plan;
  readonly readOnly: boolean;
}): React.JSX.Element {
  return (
    <div className="min-w-0 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="plan-actual-titulo" className="text-xl font-semibold text-foreground">
          Nimbo {plan.name}
        </h2>
        <PlanBadge readOnly={readOnly} />
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
 * Plan actual (spec 009 CA-7; 010 CA-25, CA-18; mockups de `billing/suscripcion/`): nombre, precio, límites,
 * vencimiento e importe. «Cambiar de plan» lleva al cambio de la 010; desde Personal, «Ver planes» lleva a contratar
 * (009). La tarjeta del cobro está en «Próximo cobro» y en «Método de pago».
 */
export function CurrentPlanCard({
  subscription,
}: {
  readonly subscription: SubscriptionView;
}): React.JSX.Element {
  const { plan } = subscription;
  const readOnly = subscription.status === 'readOnly';
  const paid = subscription.expiresAt !== null;
  return (
    <Card role="region" aria-labelledby="plan-actual-titulo" className="flex flex-col gap-5 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PlanHeading plan={plan} readOnly={readOnly} />
        <Link
          href={CHANGE_PLAN_PATH}
          className={buttonVariants({ variant: 'outline', className: 'w-full sm:w-auto' })}
        >
          {paid ? 'Cambiar de plan' : 'Ver planes'}
        </Link>
      </div>
      <dl className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
        <Fact
          label={readOnly ? 'Venció el' : 'Activo hasta'}
          value={readOnly ? expiryInstantLabel(subscription) : expiryLabel(subscription)}
        />
        <Fact label="Importe" value={priceLabel(plan.priceCents)} />
      </dl>
    </Card>
  );
}
