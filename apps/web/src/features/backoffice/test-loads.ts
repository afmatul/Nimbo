import { IDENTITY_ERROR_CODES } from '@nimbo/contracts';

import { ApiClientError } from '../../lib/api-error';

/**
 * Doble de una llamada al backoffice: responde en orden cada resultado (un `Error` rechaza) y después queda pendiente
 * para siempre (estado cargando).
 */
export function loadOf<Req, Res>(
  ...results: readonly (Res | Error)[]
): jest.Mock<Promise<Res>, [Req]> {
  const load = jest.fn((_request: Req) => new Promise<Res>(() => undefined));
  for (const result of results) {
    load.mockImplementationOnce(() =>
      result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
    );
  }
  return load;
}

/** Error HTTP como lo entrega `auth-fetch`. */
export function apiError(status: number, code: string): ApiClientError {
  return new ApiClientError({ status, code, message: code, correlationId: 'corr-1' });
}

/** Lo que responde un doble fijo: la respuesta, un rechazo o nada (cargando). */
export type Outcome<Res> = Res | Error | 'pending';

/** Responde siempre lo mismo (o queda pendiente): sirve para revisar los estados uno por uno. */
export function always<Req, Res>(outcome: Outcome<Res>): (request: Req) => Promise<Res> {
  return () => {
    if (outcome === 'pending') return new Promise<Res>(() => undefined);
    return outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome);
  };
}

/** `409 IDENTITY_ENROLLMENT_CONFLICT` con el correo y el código de empleado en uso (011 CA-6). */
export function enrollmentConflict(): ApiClientError {
  return new ApiClientError({
    status: 409,
    code: IDENTITY_ERROR_CODES.ENROLLMENT_CONFLICT,
    message: 'x',
    correlationId: 'corr-1',
    fields: [
      { field: 'email', reason: 'EMAIL_IN_USE', message: 'x' },
      { field: 'employeeCode', reason: 'EMPLOYEE_CODE_IN_USE', message: 'x' },
    ],
  });
}
