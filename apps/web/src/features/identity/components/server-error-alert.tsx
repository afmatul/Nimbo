import { AlertCircle } from 'lucide-react';
import type { JSX, Ref } from 'react';

import type { ApiClientError } from '../../../lib/api-error';
import { messageForCode } from '../../../lib/error-catalog';

/** Título del error al pedir o reenviar el enlace de verificación. */
export const SEND_LINK_ERROR_TITLE = 'No pudimos enviar el enlace.';

/**
 * Estado error-servidor (spec §11, mockup `registro--error-servidor`): recuadro de error con ícono, título
 * opcional y el mensaje del catálogo. El código para soporte se muestra aparte solo si el mensaje no lo trae.
 */
export function ServerErrorAlert({
  error,
  title,
  ref,
}: {
  readonly error: ApiClientError;
  readonly title?: string;
  readonly ref?: Ref<HTMLDivElement>;
}): JSX.Element {
  const message = messageForCode(error.code, {
    correlationId: error.correlationId,
    retryAfterSeconds: error.retryAfterSeconds,
  });
  const showCode = error.correlationId !== '' && !message.includes(error.correlationId);

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      data-state="error-servidor"
      className="flex items-start gap-2 rounded-md border border-destructive bg-destructive/5 px-4 py-3 text-left text-sm text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="space-y-1">
        <p>
          {title === undefined ? null : (
            <>
              <strong className="font-semibold">{title}</strong>{' '}
            </>
          )}
          {message}
        </p>
        {showCode ? <p>Código: {error.correlationId}</p> : null}
      </div>
    </div>
  );
}
