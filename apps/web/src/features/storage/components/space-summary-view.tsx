'use client';

import { formatBytes, type SpaceSummaryResponse } from '@nimbo/contracts';
import { Check, CircleAlert, Trash2, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import type * as React from 'react';

import { AppLayout, DEFAULT_NAV_ITEMS } from '../../../components/nimbo/app-layout';
import { QuotaTrack, quotaStateOf, type QuotaTier } from '../../../components/nimbo/quota-bar';
import { StateView } from '../../../components/nimbo/state-view';
import { Alert } from '../../../components/ui/alert';
import { buttonVariants } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { longLastDayLabel } from '../../../lib/format-date';
import { SignOutButton } from '../../identity/components/sign-out-button';
import { MY_FILES_PATH, SPACE_PATH, TRASH_PATH } from '../routes';

import { extraQuotaNote } from './extra-quota-note';
import { SidebarQuota } from './sidebar-quota';
import { SpaceBreakdown } from './space-breakdown';
import type { SpaceSummaryState } from './space-provider';
import { SpaceSummarySkeleton } from './space-summary-skeleton';
import { retentionLabel } from './trash-summary';

export interface SpaceSummaryViewProps {
  readonly state: SpaceSummaryState;
  readonly onRetry: () => void;
}

const SPACE_NAV_ITEMS = DEFAULT_NAV_ITEMS.map((item) => ({
  ...item,
  active: item.href === SPACE_PATH,
}));

const TRASH_REMINDER =
  'Lo que está en la papelera sigue ocupando espacio hasta que se elimina definitivamente.';

/** Cuerpo del aviso: lo que queda (70–99 %) o que no se puede subir (100 %), y que la papelera ocupa espacio. */
function noticeBodyOf(summary: SpaceSummaryResponse, tier: QuotaTier): string {
  const lead =
    tier === 'full'
      ? `Usas ${formatBytes(summary.usedBytes)} de ${formatBytes(summary.quotaBytes)}. No podrás subir archivos hasta que liberes espacio.`
      : `Te quedan ${formatBytes(summary.availableBytes)}. Elimina archivos que ya no necesites para seguir subiendo.`;
  return `${lead} ${TRASH_REMINDER}`;
}

/** «Liberar espacio» lleva a Mis archivos (punto abierto del plan 007) y «Ver papelera» solo si ocupa algo. */
function NoticeActions({ trashBytes }: { readonly trashBytes: number }): React.JSX.Element {
  return (
    <div className="mt-3 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
      <Link href={MY_FILES_PATH} className={buttonVariants({ className: 'w-full sm:w-auto' })}>
        Liberar espacio
      </Link>
      {trashBytes > 0 ? (
        <Link
          href={TRASH_PATH}
          className={buttonVariants({ variant: 'outline', className: 'w-full sm:w-auto' })}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          {`Ver papelera (${formatBytes(trashBytes)})`}
        </Link>
      ) : null}
    </div>
  );
}

/** Aviso de tramo (CA-5): 70–89 % `warning` con `role="status"`; 90–100 % `alert`. Ícono y texto, nunca solo color. */
function QuotaNoticeAlert({
  summary,
}: {
  readonly summary: SpaceSummaryResponse;
}): React.JSX.Element | null {
  const { notice: title, tier } = quotaStateOf(summary);
  if (title === null) return null;
  const Icon = tier === 'warning' ? TriangleAlert : CircleAlert;
  return (
    <Alert
      variant={tier === 'warning' ? 'warning' : 'critical'}
      aria-labelledby="aviso-cuota"
      className="flex items-start gap-3"
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <h2 id="aviso-cuota" className="font-semibold">
          {title}
        </h2>
        <p className="mt-0.5 text-foreground">{noticeBodyOf(summary, tier)}</p>
        <NoticeActions trashBytes={summary.breakdown.trashBytes} />
      </div>
    </Alert>
  );
}

function Stat({
  label,
  bytes,
}: {
  readonly label: string;
  readonly bytes: number;
}): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3 sm:block">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-base font-semibold tabular-nums sm:mt-0.5">{formatBytes(bytes)}</dd>
    </div>
  );
}

/** Cifra grande «4,8 GB de 15 GB» con el porcentaje al lado (mockup `resumen-espacio`). */
function UsageFigure({
  summary,
  percent,
}: {
  readonly summary: SpaceSummaryResponse;
  readonly percent: number;
}): React.JSX.Element {
  return (
    <div className="mt-3.5 flex flex-wrap items-baseline justify-between gap-3">
      <p
        data-usage-figure=""
        className="text-2xl font-bold tracking-tight tabular-nums sm:text-3xl"
      >
        {formatBytes(summary.usedBytes)}{' '}
        <span className="text-base font-medium tracking-normal text-secondary-foreground">
          de {formatBytes(summary.quotaBytes)}
        </span>
      </p>
      <span className="text-base font-semibold tabular-nums">{percent} %</span>
    </div>
  );
}

/** Con un extra vigente la cuota ya no es solo la del plan: se rotula «Cuota total» (011b CA-5). */
function quotaLabelOf(summary: SpaceSummaryResponse): string {
  return summary.extraQuotaBytes > 0 ? 'Cuota total' : 'Cuota del plan';
}

/**
 * «Espacio usado» (CA-1): cifra grande, barra del tramo y Usado · Disponible · Cuota del plan en texto. El texto del
 * tramo va solo en el aviso de arriba (no se repite aquí); sin aviso, «Tienes espacio de sobra.». Con un extra vigente,
 * la cuota es la total, se rotula «Cuota total» y una nota dice cuánto extra y hasta qué día (011b CA-5).
 */
function UsageCard({ summary }: { readonly summary: SpaceSummaryResponse }): React.JSX.Element {
  const { percent, notice } = quotaStateOf(summary);
  const extraNote = extraQuotaNote(summary, longLastDayLabel);
  return (
    <Card role="region" aria-labelledby="medidor-titulo" className="p-5 lg:col-span-2">
      <h2 id="medidor-titulo" className="text-base font-semibold">
        Espacio usado
      </h2>
      <UsageFigure summary={summary} percent={percent} />
      <QuotaTrack label="Espacio usado" usage={summary} className="mt-3 h-2.5" />
      {notice === null ? (
        <p className="mt-2.5 text-sm text-secondary-foreground">Tienes espacio de sobra.</p>
      ) : null}
      <dl className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
        <Stat label="Usado" bytes={summary.usedBytes} />
        <Stat label="Disponible" bytes={summary.availableBytes} />
        <Stat label={quotaLabelOf(summary)} bytes={summary.quotaBytes} />
      </dl>
      {extraNote === null ? null : (
        <p className="mt-3 text-sm text-secondary-foreground">{extraNote}</p>
      )}
    </Card>
  );
}

function PlanFact({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  return (
    <li className="flex items-start gap-2.5">
      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <span>{children}</span>
    </li>
  );
}

/**
 * «Tu plan» (CA-1, CA-6, D-20): nombre y límites que entrega la API; sin precio, «Ampliar» ni «Ver planes» (spec 007 §6).
 * El almacenamiento es la cuota del plan, sin el extra vigente (011b CA-5).
 */
function PlanCard({ summary }: { readonly summary: SpaceSummaryResponse }): React.JSX.Element {
  const strong = 'font-semibold text-foreground tabular-nums';
  return (
    <Card role="region" aria-labelledby="plan-titulo" className="p-5">
      <h2 id="plan-titulo" className="text-base font-semibold">
        Tu plan
      </h2>
      <p className="mt-3.5 text-xl font-bold text-foreground">{summary.planName}</p>
      <ul className="mt-3.5 grid gap-2.5 text-sm text-secondary-foreground">
        <PlanFact>
          <strong className={strong}>{formatBytes(summary.baseQuotaBytes)}</strong> de
          almacenamiento
        </PlanFact>
        <PlanFact>
          Hasta <strong className={strong}>{formatBytes(summary.maxFileBytes)}</strong> por archivo
        </PlanFact>
        <PlanFact>
          La papelera guarda lo eliminado{' '}
          <strong className={strong}>{retentionLabel(summary.trashRetentionDays)}</strong>
        </PlanFact>
      </ul>
    </Card>
  );
}

function SpaceBody({ state, onRetry }: SpaceSummaryViewProps): React.JSX.Element {
  if (state.status === 'loading') return <SpaceSummarySkeleton />;
  if (state.status === 'error') {
    return (
      <StateView
        type="error"
        headingLevel="h2"
        title="No pudimos calcular tu espacio."
        description="Tus archivos siguen guardados. Inténtalo de nuevo en unos segundos."
        action={{ label: 'Reintentar', onClick: onRetry, variant: 'outline' }}
      />
    );
  }
  return (
    <>
      <QuotaNoticeAlert summary={state.summary} />
      <div className="grid gap-4 lg:grid-cols-3">
        <UsageCard summary={state.summary} />
        <PlanCard summary={state.summary} />
      </div>
      <SpaceBreakdown summary={state.summary} />
    </>
  );
}

/**
 * Resumen de espacio (spec 007, mockup `storage/resumen-espacio`): aviso de tramo, medidor, plan y desglose; cargando
 * y error con «Reintentar» sin bloquear la navegación (CA-8). Recibe el estado de `useSpace()` por props.
 */
export function SpaceSummaryView({ state, onRetry }: SpaceSummaryViewProps): React.JSX.Element {
  return (
    <AppLayout navItems={SPACE_NAV_ITEMS} quotaCard={<SidebarQuota state={state} linked={false} />}>
      <div className="space-y-4">
        <div className="flex justify-end">
          <SignOutButton />
        </div>
        <section className="flex flex-col gap-5" aria-labelledby="espacio-titulo">
          <header>
            <h1
              id="espacio-titulo"
              className="text-xl font-semibold tracking-tight text-foreground"
            >
              Espacio de almacenamiento
            </h1>
            <p className="mt-1 text-sm text-secondary-foreground">
              Cuánto usas de tu plan y en qué se va.
            </p>
          </header>
          <SpaceBody state={state} onRetry={onRetry} />
        </section>
      </div>
    </AppLayout>
  );
}
