'use client';

import type { JSX, ReactNode } from 'react';

import { messageForCode } from '../../../lib/error-catalog';
import { useVerifyEmail, type VerifyEmailViewState } from '../hooks/use-verify-email';

const LOGIN_HREF = '/iniciar-sesion';
const REQUEST_HREF = '/registro/pedir-enlace';

function planMessage(planName: string): string {
  return `Tu cuenta empieza en el plan Personal. Podrás activar ${planName} desde Plan y facturación cuando esté disponible.`;
}

function Shell({
  state,
  children,
}: {
  readonly state: VerifyEmailViewState['status'] | 'plan-de-pago-elegido';
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <section
      aria-labelledby="verificar-correo"
      data-state={state}
      className="mx-auto w-full max-w-lg space-y-4 px-4 py-10"
    >
      {children}
    </section>
  );
}

/** Estados de la página de verificación. El botón de éxito lleva a iniciar sesión mientras no exista 002. */
export function VerifyEmailView({ apiPublicUrl }: { readonly apiPublicUrl: string }): JSX.Element {
  const state = useVerifyEmail(apiPublicUrl);

  if (state.status === 'verificando') {
    return (
      <Shell state="verificando">
        <h1 id="verificar-correo" className="text-2xl font-semibold text-foreground">
          Verificando tu correo
        </h1>
        <p role="status" className="text-sm text-muted-foreground">
          Verificando…
        </p>
      </Shell>
    );
  }

  if (state.status === 'exito') {
    return (
      <Shell state={state.planName === null ? 'exito' : 'plan-de-pago-elegido'}>
        <h1 id="verificar-correo" className="text-2xl font-semibold text-foreground">
          ¡Listo! Tu correo está verificado.
        </h1>
        {state.planName !== null ? (
          <p className="text-sm text-foreground">{planMessage(state.planName)}</p>
        ) : null}
        <a
          href={LOGIN_HREF}
          className="inline-flex h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-button"
        >
          Iniciar sesión
        </a>
      </Shell>
    );
  }

  if (state.status === 'ya-verificado') {
    return (
      <Shell state="ya-verificado">
        <h1 id="verificar-correo" className="text-2xl font-semibold text-foreground">
          Correo verificado
        </h1>
        <p role="status" className="text-sm text-foreground">
          Tu correo ya está verificado. Inicia sesión.
        </p>
        <a
          href={LOGIN_HREF}
          className="inline-flex h-11 items-center text-sm font-medium text-primary"
        >
          Iniciar sesión
        </a>
      </Shell>
    );
  }

  const expired = state.status === 'enlace-expirado';
  return (
    <Shell state={state.status}>
      <h1 id="verificar-correo" className="text-2xl font-semibold text-foreground">
        {expired ? 'Enlace vencido' : 'Enlace no válido'}
      </h1>
      <p role="alert" className="text-sm text-destructive">
        {messageForCode(
          expired ? 'IDENTITY_VERIFICATION_LINK_EXPIRED' : 'IDENTITY_VERIFICATION_LINK_INVALID',
        )}
      </p>
      <a
        href={REQUEST_HREF}
        className="inline-flex h-11 items-center text-sm font-medium text-primary"
      >
        Pedir un enlace nuevo
      </a>
    </Shell>
  );
}
