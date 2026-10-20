'use client';

import type { PlanAdminView } from '@nimbo/contracts';
import { ClipboardList, PackageX } from 'lucide-react';
import type * as React from 'react';

import { StateView } from '../../../components/nimbo/state-view';
import { Button } from '../../../components/ui/button';
import { ForbiddenState } from '../../access/components/forbidden-state';
import type { BackofficeApi } from '../api';
import { usePlanDeactivation } from '../hooks/use-plan-deactivation';
import { usePlans, type Plans } from '../hooks/use-plans';
import { useSessionBackofficeApi } from '../hooks/use-session-backoffice-api';

import { LoadingStatus, SkeletonLine } from './loading';
import { PlanAdminCard } from './plan-admin-card';
import { PlanDeactivateDialog, PlanDeactivatedNotice } from './plan-deactivate-dialog';
import { PrivacyNotice } from './privacy-notice';

/** Aviso de privacidad del catálogo (mockup `backoffice/catalogo`, decisión 4). */
const CATALOG_PRIVACY =
  'Los planes no se editan: crea uno nuevo y desactiva el anterior. Así, quien ya tiene un plan conserva su precio y sus límites.';

/** Los cambios de catálogo quedan en la auditoría, sin cliente afectado (RN-2). */
const AUDIT_NOTE = 'Crear o desactivar un plan queda registrado en la auditoría.';

/** Borde y texto destructivos sobre la tarjeta: la acción de mayor riesgo se distingue antes de confirmarla. */
const DESTRUCTIVE_OUTLINE = 'border-destructive text-destructive hover:bg-destructive/5';

/** Tarjetas del esqueleto; distintas entre sí: sirven de `key`. */
const SKELETON_CARDS = ['w-2/5', 'w-1/3', 'w-3/5', 'w-2/3'];

/** Esqueleto de las tarjetas (oculto a lectores) y el estado anunciado (mockup `cargando`). */
function PlansLoading(): React.JSX.Element {
  return (
    <div aria-busy="true" className="mt-5">
      <div aria-hidden="true" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {SKELETON_CARDS.map((width) => (
          <div key={width} className="rounded-lg border border-border bg-card p-5 shadow-card">
            <SkeletonLine className={width} />
            <SkeletonLine className="mt-3 w-1/4" />
            <SkeletonLine className="mt-4 h-6 w-1/3" />
          </div>
        ))}
      </div>
      <LoadingStatus text="Cargando el catálogo…" />
    </div>
  );
}

/** Sin planes inactivos (mockup `default`): un recuadto, no la pantalla vacía completa. */
function NoInactivePlans(): React.JSX.Element {
  return (
    <p className="mt-3 flex items-start gap-2.5 rounded-lg border border-dashed border-border bg-card p-4 text-sm text-secondary-foreground">
      <PackageX className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        Ningún plan está inactivo. Cuando desactives uno, aparecerá aquí con las cuentas que lo
        conservan.
      </span>
    </p>
  );
}

interface SectionProps {
  readonly title: string;
  readonly subtitle: string;
  readonly plans: readonly PlanAdminView[];
  readonly onDeactivate: (plan: PlanAdminView) => void;
}

/** Una sección del catálogo (mockup `backoffice/catalogo`, decisión 2): la cabecera con el conteo y las tarjetas. */
function PlansSection({ title, subtitle, plans, onDeactivate }: SectionProps): React.JSX.Element {
  return (
    <section className="mt-6" aria-label={title}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-secondary-foreground">{subtitle}</p>
      </div>
      <ul className="mt-3 grid list-none gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {plans.map((plan) => (
          <li key={plan.id}>
            <PlanAdminCard
              plan={plan}
              action={
                plan.isDefault ? undefined : (
                  <DeactivateAction plan={plan} onDeactivate={onDeactivate} />
                )
              }
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** «Desactivar» al pie de la tarjeta (mockup `backoffice/catalogo`, decisión 8); el nombre va solo para lectores. */
function DeactivateAction({
  plan,
  onDeactivate,
}: {
  readonly plan: PlanAdminView;
  readonly onDeactivate: (plan: PlanAdminView) => void;
}): React.JSX.Element {
  return (
    <Button
      variant="outline"
      size="sm"
      className={`w-full ${DESTRUCTIVE_OUTLINE}`}
      onClick={() => onDeactivate(plan)}
    >
      Desactivar
      <span className="sr-only">{` el plan ${plan.name}`}</span>
    </Button>
  );
}

/** Los planes activos y los inactivos, con el recuadro de los segundos cuando no hay (decisiones 2 y 14). */
function PlansList({
  plans,
  onDeactivate,
}: {
  readonly plans: readonly PlanAdminView[];
  readonly onDeactivate: (plan: PlanAdminView) => void;
}): React.JSX.Element {
  const active = plans.filter((plan) => plan.deactivatedAt === null);
  const inactive = plans.filter((plan) => plan.deactivatedAt !== null);
  return (
    <>
      <ActivePlans plans={active} onDeactivate={onDeactivate} />
      <InactivePlans plans={inactive} />
    </>
  );
}

/** Los planes activos (mockup `backoffice/catalogo`, decisión 2). */
function ActivePlans({
  plans,
  onDeactivate,
}: {
  readonly plans: readonly PlanAdminView[];
  readonly onDeactivate: (plan: PlanAdminView) => void;
}): React.JSX.Element {
  return (
    <PlansSection
      title={`Planes activos (${String(plans.length)})`}
      subtitle="Se ofrecen a quien se registra o cambia de plan."
      plans={plans}
      onDeactivate={onDeactivate}
    />
  );
}

/** Los planes inactivos, con el recuadro cuando no hay (decisiones 2 y 14). */
function InactivePlans({ plans }: { readonly plans: readonly PlanAdminView[] }): React.JSX.Element {
  return (
    <section className="mt-8" aria-label={`Planes inactivos (${String(plans.length)})`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-base font-semibold text-foreground">
          {`Planes inactivos (${String(plans.length)})`}
        </h2>
        <p className="text-sm text-secondary-foreground">
          Ya no se ofrecen; quien los tiene los conserva.
        </p>
      </div>
      {plans.length === 0 ? (
        <NoInactivePlans />
      ) : (
        <ul className="mt-3 grid list-none gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan) => (
            <li key={plan.id}>
              <PlanAdminCard plan={plan} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PlansOutcome({
  plans,
  onDeactivate,
}: {
  readonly plans: Plans;
  readonly onDeactivate: (plan: PlanAdminView) => void;
}): React.ReactNode {
  const { state } = plans;
  if (state.status === 'loading') return <PlansLoading />;
  if (state.status === 'ready') {
    return <PlansList plans={state.plans} onDeactivate={onDeactivate} />;
  }
  if (state.status !== 'error') return null;
  return (
    <StateView
      type="error"
      headingLevel="h2"
      className="mt-5"
      title="No pudimos cargar el catálogo."
      description="Ningún plan cambió. Revisa tu conexión e inténtalo de nuevo."
      action={{ label: 'Reintentar', onClick: plans.retry, variant: 'outline' }}
    />
  );
}

/**
 * Catálogo de planes del Administrador (011 HU-3, CA-8, CA-10, CA-17; mockup `backoffice/catalogo`): los planes que se
 * ofrecen, con su precio, sus límites y cuántas cuentas los tienen; un plan no se edita, se desactiva (RN-4).
 */
export function AdminPlans({ api }: { readonly api: BackofficeApi }): React.JSX.Element {
  const plans = usePlans(api.listPlans);
  const deactivation = usePlanDeactivation({ api, onDeactivated: plans.replace });
  if (plans.state.status === 'forbidden' || deactivation.forbidden) {
    return <ForbiddenState role="ADMIN" />;
  }
  return (
    <div className="mx-auto w-full max-w-6xl">
      <h1 className="text-2xl font-semibold text-foreground">Catálogo de planes</h1>
      <p className="mt-1 text-sm text-secondary-foreground">
        Los planes que se ofrecen a los clientes, con su precio y sus límites.
      </p>
      <PrivacyNotice text={CATALOG_PRIVACY} />
      <p className="mt-3 flex items-start gap-2 text-sm text-secondary-foreground">
        <ClipboardList className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{AUDIT_NOTE}</span>
      </p>
      {deactivation.done === null ? null : <PlanDeactivatedNotice plan={deactivation.done} />}
      <PlansOutcome plans={plans} onDeactivate={deactivation.ask} />
      <PlanDeactivateDialog deactivation={deactivation} />
    </div>
  );
}

/** El catálogo conectado a la API con la sesión en memoria (002). */
export function SessionAdminPlans({
  apiPublicUrl,
}: {
  readonly apiPublicUrl: string;
}): React.JSX.Element {
  return <AdminPlans api={useSessionBackofficeApi(apiPublicUrl)} />;
}
