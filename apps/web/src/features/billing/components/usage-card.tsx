import type { Plan } from '@nimbo/contracts';
import { TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import type * as React from 'react';

import { QuotaTrack, quotaAmountsOf, quotaStateOf } from '../../../components/nimbo/quota-bar';
import { Card } from '../../../components/ui/card';
import { formatCount, formatPlanBytes } from '../../../lib/format-plan';
import type { SpaceSummaryState } from '../../storage/components/space-provider';
import { SPACE_PATH } from '../../storage/routes';

function Fact({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): React.JSX.Element {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">{value}</dd>
    </div>
  );
}

/** Fila «Almacenamiento» con la misma lectura que `/espacio` (007); cargando o con error, solo el texto. */
function StorageRow({ space }: { readonly space: SpaceSummaryState }): React.JSX.Element {
  if (space.status !== 'ready') {
    const text = space.status === 'loading' ? 'Calculando…' : 'No pudimos calcular tu espacio.';
    return <p className="text-sm text-secondary-foreground">Almacenamiento: {text}</p>;
  }
  const { summary } = space;
  const { notice } = quotaStateOf(summary);
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-foreground">Almacenamiento</span>
        <span className="tabular-nums text-secondary-foreground">{quotaAmountsOf(summary)}</span>
      </div>
      <QuotaTrack label="Almacenamiento" usage={summary} className="h-2" />
      {notice === null ? null : (
        <p className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/20 p-3 text-sm text-warning-foreground">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {notice}{' '}
            <Link href={SPACE_PATH} className="font-semibold underline">
              Ver espacio
            </Link>
          </span>
        </p>
      )}
    </div>
  );
}

/**
 * «Consumo del plan» (spec 009 CA-7; mockup `billing/suscripcion/`, «Consumo del ciclo»): el almacenamiento real de
 * `/espacio` y los límites del plan. Las consultas al agente y las versiones llegan con sus specs (sin datos inventados).
 */
export function UsageCard({
  plan,
  space,
}: {
  readonly plan: Plan;
  readonly space: SpaceSummaryState;
}): React.JSX.Element {
  return (
    <Card role="region" aria-labelledby="consumo-titulo" className="flex flex-col gap-4 p-6">
      <h2 id="consumo-titulo" className="text-base font-semibold text-foreground">
        Consumo del plan
      </h2>
      <StorageRow space={space} />
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
