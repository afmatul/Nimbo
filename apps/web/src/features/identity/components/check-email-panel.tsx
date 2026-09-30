'use client';

import { RESET_LINK_TTL_MINUTES } from '@nimbo/contracts';
import { Mail } from 'lucide-react';
import type { JSX, ReactNode } from 'react';

import { IdentityCard } from '../../../components/nimbo/identity-card';
import { TextLink } from '../../../components/nimbo/text-link';
import { Button } from '../../../components/ui/button';
import { LOGIN_PATH } from '../routes';

const MINUTES_PER_HOUR = 60;

interface VerificationVariant {
  readonly variant?: 'verification';
  readonly onChangeEmail: () => void;
}

/** Recuperación de contraseña (spec 002 §11): sin pasos del registro ni «Cambiar correo». */
interface PasswordResetVariant {
  readonly variant: 'password-reset';
}

export type CheckEmailPanelProps = (VerificationVariant | PasswordResetVariant) & {
  readonly email: string;
  readonly children?: ReactNode;
};

function EmailAddress({ email }: { readonly email: string }): JSX.Element {
  return <strong className="font-medium text-foreground">{email}</strong>;
}

function resetLinkLifetime(): string {
  const hours = RESET_LINK_TTL_MINUTES / MINUTES_PER_HOUR;
  return hours === 1 ? '1 hora' : `${String(hours)} horas`;
}

/** Variante de la recuperación: el mensaje neutro de CA-18, igual exista o no la cuenta. */
function PasswordResetPanel({
  email,
  children,
}: {
  readonly email: string;
  readonly children?: ReactNode;
}): JSX.Element {
  return (
    <IdentityCard
      data-state="revisa-tu-correo"
      titleId="revisa-correo"
      title="Revisa tu correo"
      icon={Mail}
      tone="info"
      description={
        <p role="status" className="text-sm text-secondary-foreground">
          Si hay una cuenta con <EmailAddress email={email} />, te enviamos un enlace para
          restablecer tu contraseña. Vence en {resetLinkLifetime()}.
        </p>
      }
    >
      {children}
      <p className="border-t border-border pt-4 text-center text-sm text-muted-foreground">
        ¿Recordaste tu contraseña? <TextLink href={LOGIN_PATH}>Iniciar sesión</TextLink>
      </p>
    </IdentityCard>
  );
}

/**
 * «Revisa tu correo». En el registro: el correo escrito, 24 horas y «Cambiar correo»; en la recuperación, la variante
 * `password-reset`. Sin casillas de código ni sesión.
 */
export function CheckEmailPanel(props: CheckEmailPanelProps): JSX.Element {
  const { email, children } = props;
  if (props.variant === 'password-reset') {
    return <PasswordResetPanel email={email}>{children}</PasswordResetPanel>;
  }

  return (
    <IdentityCard
      titleId="revisa-correo"
      title="Revisa tu correo"
      icon={Mail}
      tone="info"
      step={2}
      description={
        <p className="text-sm text-secondary-foreground">
          Te enviamos un enlace a <EmailAddress email={email} /> para verificar tu correo. Ábrelo en
          las próximas 24 horas. ¿No llegó? Revisa la carpeta de spam o pide otro enlace.
        </p>
      }
    >
      {children}
      <p className="border-t border-border pt-4 text-center text-sm text-muted-foreground">
        ¿Correo equivocado?{' '}
        <Button
          type="button"
          variant="link"
          className="px-1 underline"
          onClick={props.onChangeEmail}
        >
          Cambiar correo
        </Button>
      </p>
    </IdentityCard>
  );
}
