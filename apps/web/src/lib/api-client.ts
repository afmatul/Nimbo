import { errorResponseSchema } from '@nimbo/contracts';

import { ApiClientError, genericErrorMessage } from './api-error';

const CORRELATION_HEADER = 'x-correlation-id';
const GENERIC_CODE = 'INTERNAL_ERROR';
const NO_CONTENT = 204;

function retryAfterSeconds(header: string | null, now: number): number | undefined {
  if (header === null || header.trim() === '') return undefined;
  if (/^\d+$/.test(header)) return Number(header);
  const at = Date.parse(header);
  if (Number.isNaN(at)) return undefined;
  return Math.max(0, Math.ceil((at - now) / 1000));
}

function generic(correlationId: string, status?: number): ApiClientError {
  return new ApiClientError({
    code: GENERIC_CODE,
    message: genericErrorMessage(correlationId),
    correlationId,
    status,
  });
}

/**
 * `fetch` JSON con `x-correlation-id`. Un 2xx devuelve el cuerpo (un 204, `undefined`). Un error válido expone `status`,
 * `code`, `fields`, `details`, `correlationId` y `Retry-After`. Red caída (sin `status`) o cuerpo inválido → genérico.
 */
export async function requestJson(url: string, init: RequestInit = {}): Promise<unknown> {
  const correlationId = crypto.randomUUID();
  const headers = new Headers(init.headers);
  headers.set(CORRELATION_HEADER, correlationId);
  headers.set('accept', 'application/json');

  let response: Response;
  try {
    response = await fetch(url, { ...init, headers, cache: 'no-store' });
  } catch {
    throw generic(correlationId);
  }

  if (response.status === NO_CONTENT) return undefined;

  const echoed = response.headers.get(CORRELATION_HEADER) ?? correlationId;
  const retryAfter = retryAfterSeconds(response.headers.get('retry-after'), Date.now());

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw generic(echoed, response.status);
  }

  if (response.ok) return body;

  const parsed = errorResponseSchema.safeParse(body);
  if (!parsed.success) throw generic(echoed, response.status);

  return Promise.reject(
    new ApiClientError({
      code: parsed.data.code,
      message: parsed.data.message,
      correlationId: parsed.data.correlationId,
      fields: parsed.data.fields ?? [],
      details: parsed.data.details ?? {},
      retryAfterSeconds: retryAfter,
      status: response.status,
    }),
  );
}
