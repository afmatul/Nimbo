'use client';

import { Mail } from 'lucide-react';
import type { JSX, ReactNode } from 'react';

import { IdentityCard } from '../../../components/nimbo/identity-card';
import { Button } from '../../../components/ui/button';

export interface CheckEmailPanelProps {
  readonly email: string;
  readonly onChangeEmail: () => void;
  readonly children?: ReactNode;
}

/** «Revisa tu correo»: el correo escrito, 24 horas y «Cambiar correo». Sin casillas de código ni sesión. */
export function CheckEmailPanel({
  email,
  onChangeEmail,
  children,
}: CheckEmailPanelProps): JSX.Element {
  return (
    <IdentityCard
      titleId="revisa-correo"
      title="Revisa tu correo"
      icon={Mail}
      tone="info"
      step={2}
      description={
        <p className="text-sm text-secondary-foreground">
          Te enviamos un enlace a <strong className="font-medium text-foreground">{email}</strong>{' '}
          para verificar tu correo. Ábrelo en las próximas 24 horas. ¿No llegó? Revisa la carpeta de
          spam o pide otro enlace.
        </p>
      }
    >
      {children}
      <p className="border-t border-border pt-4 text-center text-sm text-muted-foreground">
        ¿Correo equivocado?{' '}
        <Button type="button" variant="link" className="px-1 underline" onClick={onChangeEmail}>
          Cambiar correo
        </Button>
      </p>
    </IdentityCard>
  );
}
