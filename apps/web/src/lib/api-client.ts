import { errorResponseSchema } from '@nimbo/contracts';

import { ApiClientError, genericErrorMessage } from './api-error';

const CORRELATION_HEADER = 'x-correlation-id';
const GENERIC_CODE = 'INTERNAL_ERROR';
const NO_CONTENT = 204;
const UNREADABLE = Symbol('unreadable');

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

const readJson = (response: Response): Promise<unknown> => response.json().catch(() => UNREADABLE);

const echoedCorrelationId = (response: Response, sent: string): string =>
  response.headers.get(CORRELATION_HEADER) ?? sent;

/** Respuesta recibida y el `x-correlation-id` con que se pidió. */
export interface SentRequest {
  readonly response: Response;
  readonly correlationId: string;
}

/** `fetch` sin caché con `x-correlation-id` y el `accept` dado. Red caída (o abortada) → genérico sin `status`. */
export async function sendRequest(
  url: string,
  init: RequestInit,
  accept: string,
): Promise<SentRequest> {
  const correlationId = crypto.randomUUID();
  const headers = new Headers(init.headers);
  headers.set(CORRELATION_HEADER, correlationId);
  headers.set('accept', accept);
  try {
    return { response: await fetch(url, { ...init, headers, cache: 'no-store' }), correlationId };
  } catch {
    throw generic(correlationId);
  }
}

/**
 * Error de una respuesta no-2xx: expone `status`, `code`, `fields`, `details`, `correlationId` y `Retry-After`. Un
 * cuerpo que no es `ErrorResponse` → genérico con el `x-correlation-id` que devolvió la API.
 */
export async function errorFromResponse(
  response: Response,
  correlationId: string,
): Promise<ApiClientError> {
  const parsed = errorResponseSchema.safeParse(await readJson(response));
  const echoed = echoedCorrelationId(response, correlationId);
  if (!parsed.success) return generic(echoed, response.status);
  return new ApiClientError({
    code: parsed.data.code,
    message: parsed.data.message,
    correlationId: parsed.data.correlationId,
    fields: parsed.data.fields ?? [],
    details: parsed.data.details ?? {},
    retryAfterSeconds: retryAfterSeconds(response.headers.get('retry-after'), Date.now()),
    status: response.status,
  });
}

/**
 * `fetch` JSON con `x-correlation-id`. Un 2xx devuelve el cuerpo (un 204, `undefined`); un error, el de
 * `errorFromResponse`. Red caída (sin `status`) o cuerpo 2xx inválido → genérico.
 */
export async function requestJson(url: string, init: RequestInit = {}): Promise<unknown> {
  const { response, correlationId } = await sendRequest(url, init, 'application/json');
  if (response.status === NO_CONTENT) return undefined;
  if (!response.ok) return Promise.reject(await errorFromResponse(response, correlationId));

  const body = await readJson(response);
  const echoed = echoedCorrelationId(response, correlationId);
  if (body === UNREADABLE) throw generic(echoed, response.status);
  return body;
}
