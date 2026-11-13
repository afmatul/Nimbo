'use client';

import type { JSX } from 'react';

import { Button } from '../../../components/ui/button';
import {
  useRegisterForm,
  type RegisterPhase,
  type RegisterResult,
} from '../hooks/use-register-form';

import { PlanPicker, type CatalogPlan } from './plan-picker';
import { RegisterAccountFields } from './register-account-fields';
import { RegisterPlanStep } from './register-plan-step';
import { ServerErrorAlert } from './server-error-alert';

export interface RegisterFormProps {
  readonly apiPublicUrl: string;
  readonly plans: readonly CatalogPlan[];
  readonly unavailable?: boolean;
  readonly defaultFullName?: string;
  readonly defaultEmail?: string;
  readonly defaultPlanId?: string | undefined;
  readonly onSuccess: (result: RegisterResult) => void;
  /** El paso en curso cambió (para el indicador de pasos). */
  readonly onStepChange?: (phase: RegisterPhase) => void;
}

const SERVER_ERROR_TITLE = 'No pudimos crear tu cuenta.';

function StepActions({
  phase,
  finalStep,
  submitting,
  onBack,
}: {
  readonly phase: RegisterPhase;
  readonly finalStep: boolean;
  readonly submitting: boolean;
  readonly onBack: () => void;
}): JSX.Element {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row">
      {phase === 'plan' ? (
        <Button type="button" variant="outline" onClick={onBack} disabled={submitting}>
          Volver
        </Button>
      ) : null}
      {finalStep ? (
        <Button type="submit" loading={submitting}>
          {submitting ? 'Creando tu cuenta' : 'Crear cuenta'}
        </Button>
      ) : (
        <Button type="submit">Continuar</Button>
      )}
    </div>
  );
}

/**
 * Registro en dos pasos: «Cuenta» (datos) y «Plan» (catálogo); el `POST` lleva el `planSlug` del plan de pago elegido.
 * Sin catálogo no hay paso «Plan» y la cuenta empieza en Personal.
 */
export function RegisterForm(props: RegisterFormProps): JSX.Element {
  const { plans, unavailable = false } = props;
  const skipPlan = unavailable || plans.length === 0;
  const state = useRegisterForm({
    apiPublicUrl: props.apiPublicUrl,
    plans,
    skipPlan,
    defaults: { fullName: props.defaultFullName ?? '', email: props.defaultEmail ?? '' },
    defaultPlanId: props.defaultPlanId,
    onSuccess: props.onSuccess,
    onStepChange: props.onStepChange,
  });
  const { serverError, summaryRef } = state.errors;
  return (
    <form className="space-y-4" onSubmit={(event) => void state.next(event)} noValidate>
      {serverError ? (
        <ServerErrorAlert ref={summaryRef} title={SERVER_ERROR_TITLE} error={serverError} />
      ) : null}
      <div className="space-y-4" hidden={state.phase !== 'account'}>
        {unavailable ? <PlanPicker plans={[]} unavailable /> : null}
        <RegisterAccountFields form={state.form} />
      </div>
      {state.phase === 'plan' ? (
        <RegisterPlanStep
          plans={plans}
          planId={state.planId}
          onChange={state.setPlanId}
          error={state.errors.planError}
        />
      ) : null}
      <StepActions
        phase={state.phase}
        finalStep={skipPlan || state.phase === 'plan'}
        submitting={state.submitting}
        onBack={state.back}
      />
    </form>
  );
}
