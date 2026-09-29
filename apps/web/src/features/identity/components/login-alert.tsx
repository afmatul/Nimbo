import { IDENTITY_ERROR_CODES } from '@nimbo/contracts';
import { AlertCircle } from 'lucide-react';
import type { JSX, ReactNode } from 'react';

import { TextLink } from '../../../components/nimbo/text-link';
import { Alert } from '../../../components/ui/alert';
import type { ApiClientError } from '../../../lib/api-error';
import { messageForCode } from '../../../lib/error-catalog';

import { ServerErrorAlert } from './server-error-alert';

export const RESET_PASSWORD_HREF = '/recuperar-contrasena';

const LOGIN_ERROR_TITLE = 'No pudimos iniciar tu sesión.';

function AlertContent({
  message,
  children,
}: {
  readonly message: string;
  readonly children?: ReactNode;
}): JSX.Element {
  return (
    <div className="flex items-start gap-2 text-left">
      <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="space-y-2">
        <p>{message}</p>
        {children}
      </div>
    </div>
  );
}

/** Rechazo del inicio de sesión (spec 002 §11): alerta de 000b encima del formulario, con su acción correctiva. */
export function LoginAlert({ error }: { readonly error: ApiClientError }): JSX.Element {
  const message = messageForCode(error.code, {
    correlationId: error.correlationId,
    retryAfterSeconds: error.retryAfterSeconds,
    screen: 'login',
  });

  if (error.code === IDENTITY_ERROR_CODES.INVALID_CREDENTIALS) {
    return (
      <Alert variant="error" data-state="error">
        <AlertContent message={message}>
          <TextLink href={RESET_PASSWORD_HREF}>Restablecer contraseña</TextLink>
        </AlertContent>
      </Alert>
    );
  }
  return <ServerErrorAlert title={LOGIN_ERROR_TITLE} error={error} />;
}
