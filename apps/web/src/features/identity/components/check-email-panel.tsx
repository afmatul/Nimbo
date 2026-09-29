'use client';

import type { JSX, ReactNode } from 'react';

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
    <section
      aria-labelledby="revisa-correo"
      className="mx-auto w-full max-w-lg space-y-4 px-4 py-10"
    >
      <h1 id="revisa-correo" className="text-2xl font-semibold text-foreground">
        Revisa tu correo
      </h1>
      <p className="text-sm text-foreground">
        Te enviamos un enlace a {email} para verificar tu correo. Ábrelo en las próximas 24 horas.
        ¿No llegó? Revisa la carpeta de spam o pide otro enlace.
      </p>
      {children}
      <Button type="button" variant="outline" onClick={onChangeEmail}>
        Cambiar correo
      </Button>
    </section>
  );
}
