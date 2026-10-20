'use client';

import type { PlanAdminView } from '@nimbo/contracts';
import { AlertCircle, ClipboardList, Info, Plus } from 'lucide-react';
import Link from 'next/link';
import type * as React from 'react';

import { Button, buttonVariants } from '../../../components/ui/button';
import { ForbiddenState } from '../../access/components/forbidden-state';
import { INTERNAL_PATHS } from '../../access/home-path';
import type { BackofficeApi } from '../api';
import { usePlanForm } from '../hooks/use-plan-form';
import { usePlans } from '../hooks/use-plans';
import { useSessionBackofficeApi } from '../hooks/use-session-backoffice-api';
import type { PlanFormValues } from '../plan-form-values';

import { PlanFormFields, PLAN_FIELD_IDS } from './plan-form-fields';

/** El resumen de los campos que el servidor rechazó (decisión 12): con enlace a cada campo. */
function ProblemSummary({
  errors,
  count,
}: {
  readonly errors: Readonly<Record<string, string>>;
  readonly count: number;
}): React.JSX.Element {
  const fields = Object.keys(errors);
  return (
    <div role="alert" className="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
        {`Revisa ${String(count)} ${count === 1 ? 'campo' : 'campos'} para crear el plan. Todavía no creamos nada.`}
      </p>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {fields.map((field) => (
          <li key={field}>
            <a
              href={`#${PLAN_FIELD_IDS[field as keyof typeof PLAN_FIELD_IDS] ?? field}`}
              className="text-destructive underline underline-offset-2"
            >
              {errors[field]}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** «Partir de un plan activo (opcional)»: llena el formulario con sus valores (decisión 10). */
function CopyFrom({
  plans,
  onPick,
  locked,
}: {
  readonly plans: readonly PlanAdminView[];
  readonly onPick: (plan: PlanAdminView) => void;
  readonly locked: boolean;
}): React.JSX.Element {
  const active = plans.filter((plan) => plan.deactivatedAt === null && !plan.isDefault);
  return (
    <div>
      <label htmlFor="copiar" className="text-sm font-semibold text-foreground">
        Partir de un plan activo (opcional)
      </label>
      <p id="copiar-ayuda" className="mt-0.5 text-sm text-secondary-foreground">
        Llena el formulario con sus valores y cambia solo lo que necesites. El plan de origen no
        cambia.
      </p>
      <select
        id="copiar"
        aria-describedby="copiar-ayuda"
        disabled={locked || active.length === 0}
        onChange={(event) => {
          const plan = active.find((item) => item.id === event.target.value);
          if (plan !== undefined) onPick(plan);
        }}
        className="mt-1.5 h-11 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-sm"
      >
        <option value="">Empezar de cero</option>
        {active.map((plan) => (
          <option key={plan.id} value={plan.id}>
            {plan.name}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Los valores de un plan, para llenar el formulario (decisión 10). */
function valuesOf(plan: PlanAdminView): Partial<PlanFormValues> {
  const gib = 1024 ** 3;
  const mib = 1024 ** 2;
  return {
    name: `${plan.name} 2027`,
    description: plan.description ?? '',
    price: (plan.priceCents / 100).toFixed(2),
    quota: String(Math.round(Number(plan.quotaBytes) / gib)),
    quotaUnit: 'GB',
    maxFile: String(Math.round(Number(plan.maxFileBytes) / mib)),
    maxFileUnit: 'MB',
    maxEditors: String(plan.maxEditors),
    agentQueries: String(plan.agentQueriesPerMonth),
    retainedVersions: String(plan.retainedVersions),
    trashRetentionDays: String(plan.trashRetentionDays),
  };
}

/**
 * El plan nuevo (011 CA-9, CA-11; mockup `backoffice/catalogo`): un plan no se edita, así que crearlo es la única
 * forma de cambiar la oferta (RN-4). Al crearlo, se ofrece a contrataciones nuevas y queda en la auditoría.
 */
export function NewPlanView({ api }: { readonly api: BackofficeApi }): React.JSX.Element {
  const catalog = usePlans(api.listPlans);
  const form = usePlanForm(api.createPlan);
  const locked = form.phase.status === 'submitting';
  const errorCount = Object.keys(form.errors).length;
  if (catalog.state.status === 'forbidden') return <ForbiddenState role="ADMIN" />;
  return (
    <div className="mx-auto w-full max-w-3xl">
      <Link
        href={INTERNAL_PATHS.adminPlans}
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-foreground hover:underline"
      >
        Volver al catálogo
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-foreground">Nuevo plan</h1>
      <p className="mt-1 text-sm text-secondary-foreground">
        Se ofrecerán a contrataciones nuevas en cuanto lo crees.
      </p>
      {form.phase.status === 'created' ? (
        <CreatedNotice plan={form.phase.plan} />
      ) : (
        <form
          className="mt-5 grid gap-5 rounded-lg border border-border bg-card p-5 shadow-card"
          noValidate
          onSubmit={(event) => void form.submit(event)}
        >
          <CopyFrom
            plans={catalog.state.status === 'ready' ? catalog.state.plans : []}
            locked={locked}
            onPick={(plan) => form.form.reset(valuesOf(plan))}
          />
          <p className="text-sm text-secondary-foreground">Los demás campos son obligatorios.</p>
          {form.phase.status === 'editing' &&
          form.phase.problem?.kind === 'fields' &&
          errorCount > 0 ? (
            <ProblemSummary errors={form.errors} count={errorCount} />
          ) : null}
          <PlanFormFields form={form.form} errors={form.errors} locked={locked} />
          <p className="flex items-start gap-2 rounded-md border border-border bg-muted p-3.5 text-sm text-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              <strong className="block font-semibold">
                Después de crearlo, el precio y los límites no cambian.
              </strong>
              Revísalos bien: para cambiarlos más adelante tendrás que crear otro plan.
            </span>
          </p>
          <p className="flex items-start gap-2 text-sm text-secondary-foreground">
            <ClipboardList className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>La creación queda registrada en la auditoría.</span>
          </p>
          <div className="flex flex-col gap-3 sm:flex-row-reverse sm:items-center sm:justify-end">
            <Button type="submit" loading={locked}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Crear plan
            </Button>
            <Link
              href={INTERNAL_PATHS.adminPlans}
              className={buttonVariants({ variant: 'outline' })}
            >
              Cancelar
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}

/** El aviso de que el plan ya existe (decisión 13). */
function CreatedNotice({ plan }: { readonly plan: PlanAdminView }): React.JSX.Element {
  return (
    <div className="mt-5 grid gap-3">
      <p className="flex items-start gap-2.5 rounded-lg border border-success/40 bg-success/10 px-4 py-3 text-sm text-foreground">
        <Plus className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          <strong className="block font-semibold">
            {`Creamos el plan ${plan.name}. Ya se ofrece a contrataciones nuevas.`}
          </strong>
          Un plan no se edita: si un día quieres cambiar su precio o sus límites, crea otro y
          desactiva este.
        </span>
      </p>
      <Link
        href={INTERNAL_PATHS.adminPlans}
        className={buttonVariants({ variant: 'outline' })}
        aria-label="Volver al catálogo de planes"
      >
        Volver al catálogo
      </Link>
    </div>
  );
}

/** El plan nuevo conectado a la API con la sesión en memoria (002). */
export function SessionNewPlanView({
  apiPublicUrl,
}: {
  readonly apiPublicUrl: string;
}): React.JSX.Element {
  return <NewPlanView api={useSessionBackofficeApi(apiPublicUrl)} />;
}
