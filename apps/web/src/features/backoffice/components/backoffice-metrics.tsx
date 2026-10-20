'use client';

import {
  formatBytes,
  type BackofficeMetricsResponse,
  type InternalRoleName,
} from '@nimbo/contracts';
import { HardDrive, Info, Users } from 'lucide-react';
import type * as React from 'react';

import { StateView } from '../../../components/nimbo/state-view';
import { formatCount } from '../../../lib/format-plan';
import { ForbiddenState } from '../../access/components/forbidden-state';
import { useSession } from '../../identity/session/session-provider';
import { useMetrics, type LoadMetrics } from '../hooks/use-metrics';
import { useSessionBackofficeApi } from '../hooks/use-session-backoffice-api';
import { capitalize, quantity } from '../quantity';

import { LoadingStatus, SkeletonLine } from './loading';
import { BarsTable, planRows, statusRows } from './metrics-tables';
import { PrivacyNotice } from './privacy-notice';
import { ProfileCard } from './profile-card';

/** Aviso propio de las métricas (decisión 7, RN-1). */
const METRICS_PRIVACY =
  'Son datos agregados: solo totales y conteos, sin información de ninguna cuenta ni de sus archivos.';

/** Quién ve las métricas (matriz §2, CA-12). */
export type MetricsViewer = Extract<InternalRoleName, 'ADMIN' | 'OPERATOR'>;

type Accounts = BackofficeMetricsResponse['accounts'];

function Kpi({
  icon: Icon,
  term,
  value,
  detail,
}: {
  readonly icon: typeof Users;
  readonly term: string;
  readonly value: string;
  readonly detail: string;
}): React.JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-card">
      <dt className="flex items-center gap-2 text-sm font-medium text-secondary-foreground">
        <Icon className="h-4 w-4" aria-hidden="true" />
        {term}
      </dt>
      <dd className="mt-2 text-3xl font-semibold tabular-nums text-foreground">{value}</dd>
      <dd className="mt-1 text-sm text-secondary-foreground">{detail}</dd>
    </div>
  );
}

/** Los dos totales (decisión 1): cuentas y espacio usado (suma de `usuario.espacio_usado`, bytes como texto). */
function Totals({ metrics }: { readonly metrics: BackofficeMetricsResponse }): React.JSX.Element {
  const { total, clients, internal } = metrics.accounts;
  const clientes = quantity(clients);
  const internas = quantity(internal);
  return (
    <dl className="mt-5 grid gap-4 sm:grid-cols-2">
      <Kpi
        icon={Users}
        term="Cuentas en total"
        value={formatCount(total)}
        detail={`${clientes.text} ${clientes.form('cliente', 'de clientes')} y ${internas.text} ${internas.form('interna', 'internas')}`}
      />
      <Kpi
        icon={HardDrive}
        term="Espacio total usado"
        value={formatBytes(Number(metrics.usedBytesTotal))}
        detail={`Lo que ocupan los archivos de ${clientes.phrase('cuenta de cliente', 'cuentas de clientes')}`}
      />
    </dl>
  );
}

/**
 * Por qué las dos tablas cuadran con el total (decisión 4): internas y clientes sin suscripción no tienen plan. El
 * texto concuerda con las cifras: «La 1 cuenta interna no tiene plan» (revisión I-2).
 */
function planNote(accounts: Accounts, withPlan: number): string {
  const withoutSubscription = accounts.clients - withPlan;
  const internas = quantity(accounts.internal);
  const sinSuscripcion = quantity(withoutSubscription);
  const missing = quantity(accounts.internal + withoutSubscription);
  const total = quantity(accounts.total);
  const who =
    withoutSubscription > 0
      ? `${internas.phrase('cuenta interna', 'cuentas internas')} y ${sinSuscripcion.text} ${sinSuscripcion.form('cliente sin suscripción', 'de clientes sin suscripción')}`
      : internas.phrase('cuenta interna', 'cuentas internas');
  return capitalize(
    `${who} no ${missing.form('tiene', 'tienen')} plan; con ${missing.form('ella', 'ellas')} ${total.form('suma', 'suman')} ${total.phrase('cuenta', 'cuentas')}.`,
  );
}

function PlansCard({
  metrics,
}: {
  readonly metrics: BackofficeMetricsResponse;
}): React.JSX.Element {
  const rows = planRows(metrics.byPlan);
  const withPlanCount = rows.reduce((sum, row) => sum + row.count, 0);
  const withPlan = quantity(withPlanCount);
  const inactive = rows.some((row) => row.muted === true)
    ? ' Incluye los planes inactivos que aún tienen cuentas.'
    : '';
  return (
    <ProfileCard
      id="por-plan"
      title="Cuentas por plan"
      subtitle={capitalize(
        `${withPlan.phrase('cuenta de cliente', 'cuentas de clientes')} con plan.${inactive}`,
      )}
    >
      <BarsTable
        caption="Cuentas por plan: número de cuentas de clientes y porcentaje de los clientes con plan"
        heads={['Plan', '% con plan']}
        rows={rows}
        totalLabel="Total con plan"
      />
      <p className="mt-3 flex items-start gap-2 text-sm text-secondary-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        {planNote(metrics.accounts, withPlanCount)}
      </p>
    </ProfileCard>
  );
}

function MetricsBody({
  metrics,
}: {
  readonly metrics: BackofficeMetricsResponse;
}): React.JSX.Element {
  const total = quantity(metrics.accounts.total);
  return (
    <>
      <Totals metrics={metrics} />
      <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">
        <ProfileCard
          id="por-estado"
          title="Cuentas por estado"
          subtitle={capitalize(`${total.phrase('cuenta', 'cuentas')}, de clientes e internas.`)}
        >
          <BarsTable
            caption="Cuentas por estado: número de cuentas y porcentaje del total"
            heads={['Estado', '% del total']}
            rows={statusRows(metrics.accounts.byStatus)}
            totalLabel="Total"
          />
        </ProfileCard>
        <PlansCard metrics={metrics} />
      </div>
    </>
  );
}

/** El esqueleto de un total: etiqueta, cifra y su explicación. */
function KpiSkeleton(): React.JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-card">
      <SkeletonLine className="w-2/5" />
      <SkeletonLine className="mt-2.5 h-7 w-2/5" />
      <SkeletonLine className="mt-2.5 w-3/5" />
    </div>
  );
}

/** El esqueleto de una tabla: título, su subtítulo y sus filas. */
function TableSkeleton({ rows }: { readonly rows: number }): React.JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-card">
      <SkeletonLine className="w-2/5" />
      <SkeletonLine className="mt-2.5 w-3/5" />
      {Array.from({ length: rows }, (_unused, index) => (
        <div key={index} className="mt-4 grid gap-2 border-t border-border pt-4">
          <SkeletonLine className="w-3/10" />
          <SkeletonLine className="w-4/5" />
        </div>
      ))}
    </div>
  );
}

/** Esqueleto de los totales y las tablas (oculto a lectores) y el estado anunciado (decisión 10). */
function MetricsLoading(): React.JSX.Element {
  return (
    <div aria-busy="true" className="mt-5">
      <div aria-hidden="true">
        <div className="grid gap-4 sm:grid-cols-2">
          <KpiSkeleton />
          <KpiSkeleton />
        </div>
        <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">
          <TableSkeleton rows={2} />
          <TableSkeleton rows={4} />
        </div>
      </div>
      <LoadingStatus text="Cargando las métricas…" />
    </div>
  );
}

export interface BackofficeMetricsProps {
  readonly load: LoadMetrics;
  /** Rol de la sesión: el de «Ir a mi inicio» en «sin permiso». */
  readonly role: MetricsViewer;
}

/**
 * Métricas agregadas para el Administrador y el Operador (011 HU-4, CA-12, CA-17; mockup `backoffice/metricas`): la
 * misma pantalla y los mismos datos en el área de cada rol, solo totales y conteos, nunca filas de una cuenta.
 */
export function BackofficeMetrics({ load, role }: BackofficeMetricsProps): React.JSX.Element {
  const { state, retry } = useMetrics(load);
  if (state.status === 'forbidden') return <ForbiddenState role={role} />;
  return (
    <div className="mx-auto w-full max-w-6xl">
      <h1 className="text-2xl font-semibold text-foreground">Métricas</h1>
      <p className="mt-1 text-sm text-secondary-foreground">Cómo se usa Nimbo, en totales.</p>
      <PrivacyNotice text={METRICS_PRIVACY} />
      {state.status === 'loading' ? <MetricsLoading /> : null}
      {state.status === 'ready' ? <MetricsBody metrics={state.metrics} /> : null}
      {state.status === 'error' ? (
        <StateView
          type="error"
          headingLevel="h2"
          className="mt-5"
          title="No pudimos cargar las métricas."
          description="Revisa tu conexión e inténtalo de nuevo."
          action={{ label: 'Reintentar', onClick: retry, variant: 'outline' }}
        />
      ) : null}
    </div>
  );
}

/** Las métricas conectadas a la API con la sesión en memoria (002); el rol es el de la sesión. */
export function SessionBackofficeMetrics({
  apiPublicUrl,
}: {
  readonly apiPublicUrl: string;
}): React.ReactNode {
  const { user } = useSession();
  const load = useSessionBackofficeApi(apiPublicUrl).getMetrics;
  if (user === null || (user.role !== 'ADMIN' && user.role !== 'OPERATOR')) return null;
  return <BackofficeMetrics load={load} role={user.role} />;
}
