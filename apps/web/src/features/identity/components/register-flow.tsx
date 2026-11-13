'use client';

import { useState, type JSX } from 'react';

import { SIGNUP_STEP, SignupSteps } from '../../../components/nimbo/signup-steps';
import { saveChosenPlan } from '../chosen-plan-storage';
import type { RegisterPhase } from '../hooks/use-register-form';

import { CheckEmailPanel } from './check-email-panel';
import type { CatalogPlan } from './plan-picker';
import { RegisterForm } from './register-form';
import { ResendLinkButton } from './resend-link-button';

export interface RegisterFlowProps {
  readonly apiPublicUrl: string;
  readonly plans: readonly CatalogPlan[];
  readonly unavailable?: boolean;
  /** Plan elegido en el catálogo público (`/registro?plan=…`), por `slug`. */
  readonly initialPlanSlug?: string | undefined;
}

interface Draft {
  readonly fullName: string;
  readonly email: string;
  readonly planId: string | undefined;
}

/** Registro y «Revisa tu correo». El plan de pago se guarda en el navegador al enviar (D-24). */
export function RegisterFlow({
  apiPublicUrl,
  plans,
  unavailable = false,
  initialPlanSlug,
}: RegisterFlowProps): JSX.Element {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [sentEmail, setSentEmail] = useState<string | null>(null);
  const [phase, setPhase] = useState<RegisterPhase>('account');
  const initialPlanId = plans.find((plan) => plan.slug === initialPlanSlug)?.id;

  if (sentEmail !== null) {
    return (
      <CheckEmailPanel email={sentEmail} onChangeEmail={() => setSentEmail(null)}>
        <ResendLinkButton apiPublicUrl={apiPublicUrl} email={sentEmail} />
      </CheckEmailPanel>
    );
  }

  return (
    <section
      aria-labelledby="crear-cuenta"
      className="mx-auto w-full max-w-lg space-y-6 px-4 py-10"
    >
      <SignupSteps current={SIGNUP_STEP[phase]} />
      <div className="space-y-1">
        <h1 id="crear-cuenta" className="text-2xl font-semibold text-foreground">
          Crea tu cuenta
        </h1>
        <p className="text-sm text-secondary-foreground">
          Te enviaremos un enlace para confirmar tu correo.
        </p>
      </div>
      <RegisterForm
        apiPublicUrl={apiPublicUrl}
        plans={plans}
        unavailable={unavailable}
        defaultFullName={draft?.fullName ?? ''}
        defaultEmail={draft?.email ?? ''}
        defaultPlanId={draft?.planId ?? initialPlanId}
        onStepChange={setPhase}
        onSuccess={(result) => {
          const chosen = plans.find((plan) => plan.id === result.planId);
          if (chosen !== undefined && !chosen.free) {
            saveChosenPlan(
              globalThis.localStorage,
              { planId: chosen.id, planName: chosen.name },
              new Date(),
            );
          }
          setDraft(result);
          setPhase('account');
          setSentEmail(result.email);
        }}
      />
    </section>
  );
}
