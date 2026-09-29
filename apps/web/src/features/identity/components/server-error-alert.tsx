import type { JSX, Ref } from 'react';

import type { ApiClientError } from '../../../lib/api-error';
import { messageForCode } from '../../../lib/error-catalog';

/** Estado error-servidor (spec §11): mensaje del catálogo y, si lo hay, el código para soporte. */
export function ServerErrorAlert({
  error,
  ref,
}: {
  readonly error: ApiClientError;
  readonly ref?: Ref<HTMLDivElement>;
}): JSX.Element {
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      data-state="error-servidor"
      className="text-sm text-destructive"
    >
      <p>
        {messageForCode(error.code, {
          correlationId: error.correlationId,
          retryAfterSeconds: error.retryAfterSeconds,
        })}
      </p>
      {error.correlationId !== '' ? <p>Código: {error.correlationId}</p> : null}
    </div>
  );
}
