import {
  accountSetupCheckRequestSchema,
  accountSetupCheckResponseSchema,
  accountSetupRequestSchema,
  accountSetupResponseSchema,
  type AccountSetupCheckResponse,
  type AccountSetupRequest,
  type AccountSetupResponse,
} from '@nimbo/contracts';
import type { ZodType } from 'zod';

import { requestJson } from '../../../lib/api-client';
import { toApiClientError } from '../../../lib/api-error';

/** `POST` JSON sin credenciales: el alta no abre sesión ni toca cookies (011 CA-5). Fuera del contrato → genérico. */
async function postAccountSetup<T>(url: string, body: unknown, schema: ZodType<T>): Promise<T> {
  const raw = await requestJson(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw toApiClientError(parsed.error);
  return parsed.data;
}

function accountSetupUrl(apiPublicUrl: string, path: string): string {
  return `${apiPublicUrl.replace(/\/$/, '')}/auth/account-setup${path}`;
}

/** Comprueba el enlace de alta sin consumirlo (011 CA-5). */
export function checkAccountSetupLink(
  apiPublicUrl: string,
  token: string,
): Promise<AccountSetupCheckResponse> {
  return postAccountSetup(
    accountSetupUrl(apiPublicUrl, '/check'),
    accountSetupCheckRequestSchema.parse({ token }),
    accountSetupCheckResponseSchema,
  );
}

/** Fija la primera contraseña y consume el enlace (011 CA-5). */
export function setFirstPassword(
  apiPublicUrl: string,
  input: AccountSetupRequest,
): Promise<AccountSetupResponse> {
  return postAccountSetup(
    accountSetupUrl(apiPublicUrl, ''),
    accountSetupRequestSchema.parse(input),
    accountSetupResponseSchema,
  );
}
