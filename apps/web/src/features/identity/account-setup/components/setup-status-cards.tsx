'use client';

import { IDENTITY_ERROR_CODES } from '@nimbo/contracts';
import { AlertCircle, Check, Clock, Loader2 } from 'lucide-react';
import type { JSX } from 'react';

import { IdentityCard } from '../../../../components/nimbo/identity-card';
import { buttonVariants } from '../../../../components/ui/button';
import { messageForCode } from '../../../../lib/error-catalog';
import { cn } from '../../../../lib/utils';
import { RESET_PASSWORD_HREF } from '../../components/login-alert';
import { LOGIN_PATH } from '../../routes';
import type { SetupLinkProblem } from '../hooks/use-account-setup-link';
import { useFocusOnMount } from '../hooks/use-focus-on-mount';

export const SETUP_TITLE_ID = 'crear-contrasena';

/** Salida principal de un estado final; recibe el foco al aparecer. */
function FocusedAction({
  href,
  label,
}: {
  readonly href: string;
  readonly label: string;
}): JSX.Element {
  const ref = useFocusOnMount<HTMLAnchorElement>();
  return (
    <a ref={ref} href={href} className={cn(buttonVariants(), 'w-full')}>
      {label}
    </a>
  );
}

export function SetupCheckingCard(): JSX.Element {
  return (
    <IdentityCard
      data-state="verificando"
      titleId={SETUP_TITLE_ID}
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

/** Éxito: la cuenta interna ya tiene contraseña; el alta no abre sesión (011 CA-5). */
export function SetupDoneCard(): JSX.Element {
  return (
    <IdentityCard
      data-state="exito"
      titleId={SETUP_TITLE_ID}
      title="Contraseña creada"
      icon={Check}
      tone="success"
      description={
        <p role="status" className="text-sm text-secondary-foreground">
          Listo. Ya puedes iniciar sesión con tu correo y la contraseña que elegiste.
        </p>
      }
    >
      <FocusedAction href={LOGIN_PATH} label="Iniciar sesión" />
    </IdentityCard>
  );
}

const PROBLEM_COPY = {
  'enlace-vencido': {
    title: 'Enlace vencido',
    icon: Clock,
    tone: 'warning',
    code: IDENTITY_ERROR_CODES.SETUP_LINK_EXPIRED,
    action: { href: RESET_PASSWORD_HREF, label: '¿Olvidaste tu contraseña?' },
  },
  'enlace-invalido': {
    title: 'Enlace no válido',
    icon: AlertCircle,
    tone: 'danger',
    code: IDENTITY_ERROR_CODES.SETUP_LINK_INVALID,
    action: { href: LOGIN_PATH, label: 'Iniciar sesión' },
  },
} as const;

/**
 * Enlace de alta vencido o no válido. No se pide otro enlace (reenviar el alta está fuera de alcance): la cuenta nace
 * verificada, así que el vencido lleva a recuperar la contraseña (Q-3) y el inválido, a iniciar sesión.
 */
export function SetupLinkProblemCard({
  problem,
}: {
  readonly problem: SetupLinkProblem;
}): JSX.Element {
  const copy = PROBLEM_COPY[problem];
  return (
    <IdentityCard
      data-state={problem}
      titleId={SETUP_TITLE_ID}
      title={copy.title}
      icon={copy.icon}
      tone={copy.tone}
      description={
        <p role="alert" className="text-sm text-secondary-foreground">
          {messageForCode(copy.code)}
        </p>
      }
    >
      <FocusedAction href={copy.action.href} label={copy.action.label} />
    </IdentityCard>
  );
}
