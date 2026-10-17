'use client';

import { useState, type JSX } from 'react';

import { useAccountSetupLink, type SetupLinkProblem } from '../hooks/use-account-setup-link';

import { AccountSetupForm } from './account-setup-form';
import { SetupCheckingCard, SetupDoneCard, SetupLinkProblemCard } from './setup-status-cards';

type Outcome = 'exito' | SetupLinkProblem;

/**
 * «Crear tu contraseña» (011 CA-5, CA-7; patrón de `restablecer-contrasena`, P-15): comprueba `#token` una vez y, si
 * sirve, pide la primera contraseña. Si el enlace vence mientras se llena, se muestra el mismo rechazo que al abrirlo.
 */
export function AccountSetupView({ apiPublicUrl }: { readonly apiPublicUrl: string }): JSX.Element {
  const link = useAccountSetupLink(apiPublicUrl);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  if (outcome === 'exito') return <SetupDoneCard />;
  if (outcome !== null) return <SetupLinkProblemCard problem={outcome} />;
  if (link.status === 'verificando') return <SetupCheckingCard />;
  if (link.status !== 'valido') return <SetupLinkProblemCard problem={link.status} />;
  return (
    <AccountSetupForm
      apiPublicUrl={apiPublicUrl}
      token={link.token}
      onDone={() => setOutcome('exito')}
      onLinkRejected={setOutcome}
    />
  );
}
