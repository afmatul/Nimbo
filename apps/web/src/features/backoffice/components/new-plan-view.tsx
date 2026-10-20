'use client';

import type { PlanAdminView } from '@nimbo/contracts';
import { AlertCircle, ClipboardList, Info, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import type * as React from 'react';

import { Button, buttonVariants } from '../../../components/ui/button';
import { ForbiddenState } from '../../access/components/forbidden-state';
import { INTERNAL_PATHS } from '../../access/home-path';
import { ServerErrorAlert } from '../../identity/components/server-error-alert';
import type { BackofficeApi } from '../api';
import { usePlanDeactivation } from '../hooks/use-plan-deactivation';
import { usePlanForm, type PlanFieldErrors } from '../hooks/use-plan-form';
import { usePlans } from '../hooks/use-plans';
import { useSessionBackofficeApi } from '../hooks/use-session-backoffice-api';
import {
  amountAndUnit,
  MAX_FILE_UNITS,
  QUOTA_UNITS,
  type PlanFormValues,
} from '../plan-form-values';

import { BackLink } from './back-link';
import { PlanDeactivateDialog, PlanDeactivatedNotice } from './plan-deactivate-dialog';
import { PlanFormFields, PLAN_FIELD_IDS } from './plan-form-fields';

/** El resumen de los campos que el servidor rechazó (decisión 12): con enlace a cada campo. */
function ProblemSummary({
  errors,
  count,
}: {
  readonly errors: PlanFieldErrors;
  readonly count: number;
}): React.JSX.Element {
  return (
    <div role="alert" className="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
        {`Revisa ${String(count)} ${count === 1 ? 'campo' : 'campos'} para crear el plan. Todavía no creamos nada.`}
      </p>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {Object.entries(errors).map(([field, message]) => (
          <li key={field}>
            <a
              href={`#${PLAN_FIELD_IDS[field as keyof typeof PLAN_FIELD_IDS] ?? field}`}
              className="text-destructive underline underline-offset-2"
            >
              {message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** El selector del plan de origen (decisión 10); al volver a «Empezar de cero» se limpia el origen. */
function PlanPicker({
  active,
  locked,
  onPick,
}: {
  readonly active: readonly PlanAdminView[];
  readonly locked: boolean;
  readonly onPick: (plan: PlanAdminView | null) => void;
}): React.JSX.Element {
  return (
    <select
      id="copiar"
      aria-describedby="copiar-ayuda"
      disabled={locked || active.length === 0}
      onChange={(event) => {
        const plan = active.find((item) => item.id === event.target.value);
        onPick(plan ?? null);
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
  );
}

/** «Partir de un plan activo (opcional)»: llena el formulario con sus valores (decisión 10). */
function CopyFrom({
  plans,
  onPick,
  locked,
}: {
  readonly plans: readonly PlanAdminView[];
  readonly onPick: (plan: PlanAdminView | null) => void;
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
      <PlanPicker active={active} locked={locked} onPick={onPick} />
    </div>
  );
}

/** Los valores de un plan, para llenar el formulario (decisión 10): la unidad que da un entero. */
function valuesOf(plan: PlanAdminView): Partial<PlanFormValues> {
  const quota = amountAndUnit(Number(plan.quotaBytes), QUOTA_UNITS);
  const maxFile = amountAndUnit(Number(plan.maxFileBytes), MAX_FILE_UNITS);
  return {
    // El nombre se deja vacío: tiene que ser distinto del plan de origen (su ayuda lo dice).
    name: '',
    description: plan.description ?? '',
    price: (plan.priceCents / 100).toFixed(2),
    // Si el valor no sale entero en ninguna unidad, el campo queda vacío para que lo escriba la persona (H-8).
    quota: quota?.amount ?? '',
    quotaUnit: quota?.unit ?? 'GB',
    maxFile: maxFile?.amount ?? '',
    maxFileUnit: maxFile?.unit ?? 'GB',
    maxEditors: String(plan.maxEditors),
    agentQueries: String(plan.agentQueriesPerMonth),
    retainedVersions: String(plan.retainedVersions),
    trashRetentionDays: String(plan.trashRetentionDays),
  };
}

/** Los dos avisos del formulario: el de inmutabilidad y el de la auditoría (decisiones 4 y 11). */
function PlanFormNotes(): React.JSX.Element {
  return (
    <>
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
    </>
  );
}

/** Los botones del formulario: crear y cancelar. */
function PlanFormActions({ locked }: { readonly locked: boolean }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3 sm:flex-row-reverse sm:items-center sm:justify-end">
      <Button type="submit" loading={locked}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        Crear plan
      </Button>
      <Link href={INTERNAL_PATHS.adminPlans} className={buttonVariants({ variant: 'outline' })}>
        Cancelar
      </Link>
    </div>
  );
}

interface PlanFormProps {
  readonly form: ReturnType<typeof usePlanForm>['form'];
  readonly errors: PlanFieldErrors;
  readonly locked: boolean;
  readonly plans: readonly PlanAdminView[];
  readonly onPick: (plan: PlanAdminView | null) => void;
  readonly onSubmit: (event: React.BaseSyntheticEvent) => Promise<void>;
}

/** El formulario de un plan nuevo (mockup `backoffice/catalogo`, decisiones 9 y 12). */
function NewPlanForm({
  form,
  errors,
  locked,
  plans,
  onPick,
  onSubmit,
}: PlanFormProps): React.JSX.Element {
  const count = Object.keys(errors).length;
  return (
    <form
      className="mt-5 grid gap-5 rounded-lg border border-border bg-card p-5 shadow-card"
      noValidate
      onSubmit={(event) => void onSubmit(event)}
    >
      <CopyFrom plans={plans} locked={locked} onPick={onPick} />
      <p className="text-sm text-secondary-foreground">Los demás campos son obligatorios.</p>
      {count > 0 ? <ProblemSummary errors={errors} count={count} /> : null}
      <PlanFormFields form={form} errors={errors} locked={locked} />
      <PlanFormNotes />
      <PlanFormActions locked={locked} />
    </form>
  );
}

interface SourcePlanOfferProps {
  readonly source: PlanAdminView;
  readonly api: BackofficeApi;
}

/** «Desactivar el plan de origen» tras crear uno a partir de otro (decisión 13). */
function SourcePlanOffer({ source, api }: SourcePlanOfferProps): React.JSX.Element {
  const deactivation = usePlanDeactivation({ api, onDeactivated: () => undefined });
  if (deactivation.forbidden) return <ForbiddenState role="ADMIN" />;
  if (deactivation.done !== null) return <PlanDeactivatedNotice plan={deactivation.done} />;
  return (
    <>
      <p className="flex items-start gap-2.5 text-sm text-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{`Si lo reemplaza, desactiva ${source.name}.`}</span>
      </p>
      <Button
        variant="outline"
        onClick={() => deactivation.ask(source)}
        loading={deactivation.pending}
      >
        {`Desactivar ${source.name}`}
      </Button>
      {deactivation.failure === null ? null : (
        <ServerErrorAlert
          title="No pudimos desactivar el plan de origen."
          error={deactivation.failure}
        />
      )}
      <PlanDeactivateDialog deactivation={deactivation} />
    </>
  );
}

interface CreatedNoticeProps {
  readonly plan: PlanAdminView;
  readonly source: PlanAdminView | null;
  readonly api: BackofficeApi;
}

/** El aviso de que el plan ya existe (decisión 13). */
function CreatedNotice({ plan, source, api }: CreatedNoticeProps): React.JSX.Element {
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
      {source === null ? null : <SourcePlanOffer source={source} api={api} />}
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

/** El encabezado de la pantalla (mockup `backoffice/catalogo`). */
function NewPlanHeader(): React.JSX.Element {
  return (
    <>
      <BackLink href={INTERNAL_PATHS.adminPlans} label="Volver al catálogo" />
      <h1 className="mt-2 text-2xl font-semibold text-foreground">Nuevo plan</h1>
      <p className="mt-1 text-sm text-secondary-foreground">
        Se ofrecerán a contrataciones nuevas en cuanto lo crees.
      </p>
    </>
  );
}

interface NewPlanOutcomeProps {
  readonly form: ReturnType<typeof usePlanForm>;
  readonly plans: readonly PlanAdminView[];
  readonly source: PlanAdminView | null;
  readonly api: BackofficeApi;
  readonly onPick: (plan: PlanAdminView | null) => void;
}

/** Lo que se ve según cómo va el alta: el plan nuevo, el error del servidor o el formulario. */
function NewPlanOutcome({
  form,
  plans,
  source,
  api,
  onPick,
}: NewPlanOutcomeProps): React.JSX.Element {
  const { phase, form: fields, errors, submit } = form;
  if (phase.status === 'created') {
    return <CreatedNotice plan={phase.plan} source={source} api={api} />;
  }
  return (
    <>
      {phase.status === 'editing' && phase.problem?.kind === 'server' ? (
        <ServerErrorAlert title="No pudimos crear el plan." error={phase.problem.error} />
      ) : null}
      <NewPlanForm
        form={fields}
        errors={errors}
        locked={phase.status === 'submitting'}
        plans={plans}
        onPick={onPick}
        onSubmit={submit}
      />
    </>
  );
}

/**
 * El plan nuevo (011 CA-9, CA-11; mockup `backoffice/catalogo`): un plan no se edita, así que crearlo es la única
 * forma de cambiar la oferta (RN-4). Al crearlo, se ofrece a contrataciones nuevas y queda en la auditoría.
 */
export function NewPlanView({ api }: { readonly api: BackofficeApi }): React.JSX.Element {
  const catalog = usePlans(api.listPlans);
  const form = usePlanForm(api.createPlan);
  const [source, setSource] = useState<PlanAdminView | null>(null);
  if (catalog.state.status === 'forbidden' || form.phase.status === 'forbidden') {
    return <ForbiddenState role="ADMIN" />;
  }
  return (
    <div className="mx-auto w-full max-w-3xl">
      <NewPlanHeader />
      <NewPlanOutcome
        form={form}
        plans={catalog.state.status === 'ready' ? catalog.state.plans : []}
        source={source}
        api={api}
        onPick={(plan) => {
          // Volver a «Empezar de cero» quita el origen, pero no borra lo escrito (H-1).
          setSource(plan);
          if (plan !== null) form.form.reset(valuesOf(plan));
        }}
      />
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
