import {
  accountListItemSchema,
  accountListResponseSchema,
  clientFilesResponseSchema,
  type AccountListItem,
  type AccountListResponse,
  type ClientFilesResponse,
  type EnrollInternalAccountRequest,
} from '@nimbo/contracts';

import type { AuthFetch } from '../identity/session/auth-fetch';
import { parseResponse } from '../storage/storage-http';

const CLIENT_FILES_PATH = '/backoffice/client-files';
const ACCOUNTS_PATH = '/backoffice/accounts';

/** Correo exacto de un cliente y la página de sus archivos (011 CA-13, DF-66). */
export interface ClientFilesRequest {
  readonly email: string;
  readonly page: number;
}

/** Página de la lista de cuentas y, si hay, el inicio del correo buscado (011 CA-1, Q-5). */
export interface AccountsRequest {
  readonly email?: string;
  readonly page: number;
}

/** El backoffice en la API (011 plan §4): metadatos de archivos y cuentas. */
export interface BackofficeApi {
  /** `GET /backoffice/client-files`: el cliente y una página de los metadatos de sus archivos. */
  listClientFiles(request: ClientFilesRequest): Promise<ClientFilesResponse>;
  /** `GET /backoffice/accounts`: una página de cuentas, de la más reciente. */
  listAccounts(request: AccountsRequest): Promise<AccountListResponse>;
  /** `GET /backoffice/accounts/:id`: la ficha de una cuenta. */
  getAccount(id: string): Promise<AccountListItem>;
  /** `POST /backoffice/accounts/:id/suspension` (CA-2). */
  suspendAccount(id: string): Promise<AccountListItem>;
  /** `DELETE /backoffice/accounts/:id/suspension` (CA-3). */
  reactivateAccount(id: string): Promise<AccountListItem>;
  /** `POST /backoffice/accounts`: alta de una cuenta interna (CA-5). */
  enrollAccount(request: EnrollInternalAccountRequest): Promise<AccountListItem>;
}

function clientFilesUrl(base: string, { email, page }: ClientFilesRequest): string {
  const params = new URLSearchParams({ email, page: String(page) });
  return `${base}${CLIENT_FILES_PATH}?${params.toString()}`;
}

function accountsUrl(base: string, { email, page }: AccountsRequest): string {
  const params = new URLSearchParams({ page: String(page) });
  if (email !== undefined) params.set('email', email);
  return `${base}${ACCOUNTS_PATH}?${params.toString()}`;
}

const accountUrl = (base: string, id: string): string =>
  `${base}${ACCOUNTS_PATH}/${encodeURIComponent(id)}`;

/** Ficha y cambios de estado: la respuesta es siempre la cuenta (`AccountListItem`). */
function accountCalls(base: string, authFetch: AuthFetch) {
  const call = async (url: string, init: RequestInit): Promise<AccountListItem> =>
    parseResponse(await authFetch(url, init), accountListItemSchema);
  return {
    getAccount: (id: string) => call(accountUrl(base, id), { method: 'GET' }),
    suspendAccount: (id: string) => call(`${accountUrl(base, id)}/suspension`, { method: 'POST' }),
    reactivateAccount: (id: string) =>
      call(`${accountUrl(base, id)}/suspension`, { method: 'DELETE' }),
    enrollAccount: (request: EnrollInternalAccountRequest) =>
      call(`${base}${ACCOUNTS_PATH}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
      }),
  };
}

/**
 * Habla con la API por `auth-fetch`: un error HTTP llega como `ApiClientError` y una respuesta fuera del contrato
 * (p. ej. con algo más que metadatos, o una cuenta con datos de archivos) se rechaza como falla del servidor (RN-1).
 */
export function createBackofficeApi(apiPublicUrl: string, authFetch: AuthFetch): BackofficeApi {
  const base = apiPublicUrl.replace(/\/$/, '');
  return {
    listClientFiles: async (request) =>
      parseResponse(
        await authFetch(clientFilesUrl(base, request), { method: 'GET' }),
        clientFilesResponseSchema,
      ),
    listAccounts: async (request) =>
      parseResponse(
        await authFetch(accountsUrl(base, request), { method: 'GET' }),
        accountListResponseSchema,
      ),
    ...accountCalls(base, authFetch),
  };
}
