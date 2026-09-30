'use client';

import { IDENTITY_ERROR_CODES, type SessionResponse } from '@nimbo/contracts';
import { Check, Info, Loader2 } from 'lucide-react';
import type { JSX } from 'react';

import { IdentityCard } from '../../../components/nimbo/identity-card';
import { Button, buttonVariants } from '../../../components/ui/button';
import { messageForCode } from '../../../lib/error-catalog';
import { cn } from '../../../lib/utils';
import { useVerifyEmail } from '../hooks/use-verify-email';
import { useEnterSession } from '../session/use-enter-session';

import { LinkProblemCard } from './link-problem-card';

const TITLE_ID = 'verificar-correo';
const LOGIN_HREF = '/iniciar-sesion';
const REQUEST_HREF = '/registro/pedir-enlace';
const ACTION_CLASS = cn(buttonVariants(), 'w-full');

function planMessage(planName: string): string {
  return `Tu cuenta empieza en el plan Personal. Podrás activar ${planName} desde Plan y facturación cuando esté disponible.`;
}

/** Tarjeta secundaria con el plan con el que nace la cuenta y, si se eligió uno de pago, el aviso de CA-28. */
function PlanCard({ planName }: { readonly planName: string | null }): JSX.Element {
  return (
    <div
      data-plan-card
      className="space-y-3 rounded-lg border border-border bg-muted p-4 text-left"
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-primary" />
        Plan Personal
      </p>
      {planName === null ? null : (
        <p className="flex items-start gap-2 rounded-md bg-accent px-3 py-2 text-sm text-foreground">
          <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>{planMessage(planName)}</span>
        </p>
      )}
    </div>
  );
}

/** Entra con la sesión que abrió la verificación, por el mismo camino que el inicio de sesión (002 CA-15). */
function EnterButton({ session }: { readonly session: SessionResponse }): JSX.Element {
  const enterSession = useEnterSession();
  return (
    <Button type="button" className="w-full" onClick={() => enterSession(session)}>
      Ir a Mis archivos
    </Button>
  );
}

/**
 * Estados de la página de verificación. Si la verificación abrió la sesión, el éxito ofrece «Ir a Mis archivos» (001
 * §7); si no la trajo, «Iniciar sesión».
 */
export function VerifyEmailView({ apiPublicUrl }: { readonly apiPublicUrl: string }): JSX.Element {
  const state = useVerifyEmail(apiPublicUrl);

  if (state.status === 'verificando') {
    return (
      <IdentityCard
        data-state="verificando"
        titleId={TITLE_ID}
        title="Verificando tu correo"
        icon={Loader2}
        iconClassName="motion-safe:animate-spin"
        tone="info"
        step={2}
        description={
          <p role="status" className="text-sm text-secondary-foreground">
            Verificando…
          </p>
        }
      />
    );
  }

  if (state.status === 'exito') {
    return (
      <IdentityCard
        data-state={state.planName === null ? 'exito' : 'plan-de-pago-elegido'}
        titleId={TITLE_ID}
        title="¡Listo! Tu correo está verificado."
        icon={Check}
        tone="success"
        step={3}
      >
        <PlanCard planName={state.planName} />
        {state.session === null ? (
          <a href={LOGIN_HREF} className={ACTION_CLASS}>
            Iniciar sesión
          </a>
        ) : (
          <EnterButton session={state.session} />
        )}
      </IdentityCard>
    );
  }

  if (state.status === 'ya-verificado') {
    return (
      <IdentityCard
        data-state="ya-verificado"
        titleId={TITLE_ID}
        title="Correo verificado"
        icon={Check}
        tone="success"
        description={
          <p role="status" className="text-sm text-secondary-foreground">
            Tu correo ya está verificado. Inicia sesión.
          </p>
        }
      >
        <a href={LOGIN_HREF} className={ACTION_CLASS}>
          Iniciar sesión
        </a>
      </IdentityCard>
    );
  }

  const message = messageForCode(
    state.status === 'enlace-expirado'
      ? IDENTITY_ERROR_CODES.VERIFICATION_LINK_EXPIRED
      : IDENTITY_ERROR_CODES.VERIFICATION_LINK_INVALID,
  );
  return (
    <LinkProblemCard
      problem={state.status}
      titleId={TITLE_ID}
      message={message}
      requestHref={REQUEST_HREF}
      step={2}
    />
  );
}
