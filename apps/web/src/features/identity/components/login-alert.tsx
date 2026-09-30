import { IDENTITY_ERROR_CODES } from '@nimbo/contracts';
import { AlertCircle } from 'lucide-react';
import type { JSX, ReactNode } from 'react';

import { TextLink } from '../../../components/nimbo/text-link';
import { Alert } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import type { ApiClientError } from '../../../lib/api-error';
import { messageForCode } from '../../../lib/error-catalog';

import { LimitAlert } from './limit-alert';
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

function ResetPasswordLink(): JSX.Element {
  return <TextLink href={RESET_PASSWORD_HREF}>Restablecer contraseña</TextLink>;
}

/**
 * Rechazo del inicio de sesión (spec 002 §11): alerta de 000b encima del botón, con su acción correctiva. «Pedir un
 * enlace nuevo» la resuelve quien la muestra (`onRequestLink`).
 */
export function LoginAlert({
  error,
  onRequestLink,
}: {
  readonly error: ApiClientError;
  readonly onRequestLink: () => void;
}): JSX.Element {
  const message = messageForCode(error.code, {
    correlationId: error.correlationId,
    retryAfterSeconds: error.retryAfterSeconds,
    screen: 'login',
  });

  switch (error.code) {
    case IDENTITY_ERROR_CODES.INVALID_CREDENTIALS:
      return (
        <Alert variant="error" data-state="error">
          <AlertContent message={message}>
            <ResetPasswordLink />
          </AlertContent>
        </Alert>
      );
    case IDENTITY_ERROR_CODES.LOGIN_LOCKED:
      return (
        <Alert variant="warning" role="alert" data-state="bloqueado">
          <AlertContent message={message}>
            <ResetPasswordLink />
          </AlertContent>
        </Alert>
      );
    case IDENTITY_ERROR_CODES.TOO_MANY_REQUESTS:
      return (
        <div data-state="limite-ip">
          <LimitAlert message={message} />
        </div>
      );
    case IDENTITY_ERROR_CODES.EMAIL_NOT_VERIFIED:
      return (
        <Alert variant="warning" role="alert" data-state="no-verificado">
          <AlertContent message={message}>
            <Button type="button" variant="outline" onClick={onRequestLink}>
              Pedir un enlace nuevo
            </Button>
          </AlertContent>
        </Alert>
      );
    case IDENTITY_ERROR_CODES.ACCOUNT_SUSPENDED:
      return (
        <Alert variant="error" data-state="suspendida">
          <AlertContent message={message} />
        </Alert>
      );
    default:
      return <ServerErrorAlert title={LOGIN_ERROR_TITLE} error={error} />;
  }
}
