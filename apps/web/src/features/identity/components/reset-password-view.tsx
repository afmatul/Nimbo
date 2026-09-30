'use client';

import { IDENTITY_ERROR_CODES } from '@nimbo/contracts';
import { Check, Loader2 } from 'lucide-react';
import { useState, type JSX } from 'react';

import { IdentityCard } from '../../../components/nimbo/identity-card';
import { buttonVariants } from '../../../components/ui/button';
import { messageForCode } from '../../../lib/error-catalog';
import { cn } from '../../../lib/utils';
import { useResetLink } from '../hooks/use-reset-link';
import { LOGIN_PATH } from '../routes';

import { LinkProblemCard, type LinkProblem } from './link-problem-card';
import { RESET_PASSWORD_HREF } from './login-alert';
import { ResetPasswordForm } from './reset-password-form';

const TITLE_ID = 'restablecer-contrasena';

type Outcome = 'exito' | LinkProblem;

function CheckingCard(): JSX.Element {
  return (
    <IdentityCard
      data-state="verificando"
      titleId={TITLE_ID}
      title="Comprobando tu enlace"
      icon={Loader2}
      iconClassName="motion-safe:animate-spin"
      tone="info"
      description={
        <p role="status" className="text-sm text-secondary-foreground">
          Verificando…
        </p>
      }
    />
  );
}

/** Como `verificar-correo--ya-verificado`, con «Iniciar sesión» y sin sesión (CA-19). */
function DoneCard(): JSX.Element {
  return (
    <IdentityCard
      data-state="exito"
      titleId={TITLE_ID}
      title="Contraseña restablecida"
      icon={Check}
      tone="success"
      description={
        <p role="status" className="text-sm text-secondary-foreground">
          Listo. Cambiamos tu contraseña y cerramos todas tus sesiones. Inicia sesión con la nueva.
        </p>
      }
    >
      <a href={LOGIN_PATH} className={cn(buttonVariants(), 'w-full')}>
        Iniciar sesión
      </a>
    </IdentityCard>
  );
}

function ResetLinkProblem({ problem }: { readonly problem: LinkProblem }): JSX.Element {
  const code =
    problem === 'enlace-expirado'
      ? IDENTITY_ERROR_CODES.RESET_LINK_EXPIRED
      : IDENTITY_ERROR_CODES.RESET_LINK_INVALID;
  return (
    <LinkProblemCard
      problem={problem}
      titleId={TITLE_ID}
      message={messageForCode(code)}
      requestHref={RESET_PASSWORD_HREF}
    />
  );
}

/**
 * Página del enlace de recuperación (spec 002 §11): comprueba `#token` una vez y, si sirve, pide la contraseña nueva.
 * El enlace puede vencer mientras se llena el formulario; entonces se muestra el mismo rechazo que al abrirlo (CA-20).
 */
export function ResetPasswordView({
  apiPublicUrl,
}: {
  readonly apiPublicUrl: string;
}): JSX.Element {
  const link = useResetLink(apiPublicUrl);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  if (outcome === 'exito') return <DoneCard />;
  if (outcome !== null) return <ResetLinkProblem problem={outcome} />;
  if (link.status === 'verificando') return <CheckingCard />;
  if (link.status !== 'valido') return <ResetLinkProblem problem={link.status} />;
  return (
    <ResetPasswordForm
      apiPublicUrl={apiPublicUrl}
      token={link.token}
      onDone={() => setOutcome('exito')}
      onLinkRejected={setOutcome}
    />
  );
}
