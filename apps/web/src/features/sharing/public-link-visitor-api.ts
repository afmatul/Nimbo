import {
  downloadUrlSchema,
  publicLinkDetailsSchema,
  type DownloadUrlResponse,
  type PublicLinkDetails,
} from '@nimbo/contracts';
import type { ZodType } from 'zod';

import { requestJson } from '../../lib/api-client';
import { toApiClientError } from '../../lib/api-error';

/**
 * Lo que pide la página pública (013b CA-9): el navegador va directo a `API_PUBLIC_URL`, sin cookies ni
 * `Authorization`, así la página responde igual con o sin sesión (CA-10). Un error llega como `ApiClientError` con su
 * `code` y, en un `429`, `retryAfterSeconds`.
 */
export interface PublicLinkVisitorApi {
  /** `POST /public-links/open`: la ficha, sin contraseña (013 S-7). */
  open(token: string): Promise<PublicLinkDetails>;
  /** `POST /public-links/download`: la URL firmada de 5 minutos; una contraseña vacía no se envía. */
  download(token: string, password?: string): Promise<DownloadUrlResponse>;
}

/** `POST` JSON sin credenciales; el token viaja solo en el cuerpo. Fuera del contrato → genérico. */
async function postVisitor<T>(url: string, body: unknown, schema: ZodType<T>): Promise<T> {
  const raw = await requestJson(url, {
    method: 'POST',
    credentials: 'omit',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw toApiClientError(parsed.error);
  return parsed.data;
}

const downloadBody = (token: string, password?: string) =>
  password === undefined || password === '' ? { token } : { token, password };

export function createPublicLinkVisitorApi(apiPublicUrl: string): PublicLinkVisitorApi {
  const base = `${apiPublicUrl.replace(/\/$/, '')}/public-links`;
  return {
    open: (token) => postVisitor(`${base}/open`, { token }, publicLinkDetailsSchema),
    download: (token, password) =>
      postVisitor(`${base}/download`, downloadBody(token, password), downloadUrlSchema),
  };
}
