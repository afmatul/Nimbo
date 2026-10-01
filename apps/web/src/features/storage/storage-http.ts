import type { ZodType } from 'zod';

import { ApiClientError } from '../../lib/api-error';
import type { AuthFetch } from '../identity/session/auth-fetch';

import { StorageRequestError } from './storage-request-error';

/** Peticiones a la API de `storage` por `auth-fetch`; devuelven el cuerpo sin validar. */
export interface StorageHttp {
  get(path: string): Promise<unknown>;
  post(path: string, body?: unknown): Promise<unknown>;
  delete(path: string): Promise<unknown>;
}

/** Una respuesta 2xx que no cumple el contrato se trata como falla del servidor (se rechaza), no como corte de red. */
const UNEXPECTED_RESPONSE_STATUS = 500;
const UNEXPECTED_RESPONSE_CODE = 'INTERNAL_ERROR';

/**
 * Error HTTP → `StorageRequestError` con `status`, `code`, `details` y `fields`. Sin respuesta (red caída) se deja pasar
 * tal cual para que el manager lo trate como corte (005 CA-8).
 */
function toStorageError(caught: unknown): unknown {
  if (caught instanceof ApiClientError && caught.status !== undefined) {
    return new StorageRequestError(caught.status, caught.code, caught.details, caught.fields);
  }
  return caught;
}

export function parseResponse<T>(raw: unknown, schema: ZodType<T>): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new StorageRequestError(UNEXPECTED_RESPONSE_STATUS, UNEXPECTED_RESPONSE_CODE);
  }
  return parsed.data;
}

export function createStorageHttp(apiPublicUrl: string, authFetch: AuthFetch): StorageHttp {
  const base = apiPublicUrl.replace(/\/$/, '');

  const call = async (path: string, init: RequestInit): Promise<unknown> => {
    try {
      return await authFetch(`${base}${path}`, init);
    } catch (caught) {
      throw toStorageError(caught);
    }
  };

  return {
    get: (path) => call(path, { method: 'GET' }),
    post: (path, body) =>
      call(
        path,
        body === undefined
          ? { method: 'POST' }
          : {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
            },
      ),
    delete: (path) => call(path, { method: 'DELETE' }),
  };
}
