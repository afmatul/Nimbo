import {
  accountListItemSchema,
  accountListResponseSchema,
  backofficeMetricsResponseSchema,
  clientFilesResponseSchema,
  planAdminListResponseSchema,
  planAdminViewSchema,
  type AccountListItem,
  type AccountListResponse,
  type BackofficeMetricsResponse,
  type ClientFilesResponse,
  type EnrollInternalAccountRequest,
  type PlanAdminListResponse,
  type PlanAdminView,
} from '@nimbo/contracts';

import type { AuthFetch } from '../identity/session/auth-fetch';
import { parseResponse } from '../storage/storage-http';

const CLIENT_FILES_PATH = '/backoffice/client-files';
const ACCOUNTS_PATH = '/backoffice/accounts';
const METRICS_PATH = '/backoffice/metrics';
const PLANS_PATH = '/backoffice/plans';

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

/** El backoffice en la API (011 plan §4): metadatos de archivos, cuentas y métricas. */
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
  /** `GET /backoffice/metrics`: solo totales y conteos (CA-12), para ADMIN y OPERATOR. */
  getMetrics(): Promise<BackofficeMetricsResponse>;
  /** `GET /backoffice/plans`: todos los planes, activos y desactivados, con su conteo de cuentas (CA-8). */
  listPlans(): Promise<PlanAdminListResponse>;
  /** `POST /backoffice/plans/:id/deactivation` (CA-10): desactiva un plan; no se reactiva. */
  deactivatePlan(id: string): Promise<PlanAdminView>;
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

/** Catálogo de planes del Administrador (011 CA-8, CA-10): la lista y la desactivación. */
function planCalls(base: string, authFetch: AuthFetch) {
  const planUrl = (id: string): string => `${base}${PLANS_PATH}/${encodeURIComponent(id)}`;
  return {
    listPlans: async (): Promise<PlanAdminListResponse> =>
      parseResponse(
        await authFetch(`${base}${PLANS_PATH}`, { method: 'GET' }),
        planAdminListResponseSchema,
      ),
    deactivatePlan: async (id: string): Promise<PlanAdminView> =>
      parseResponse(
        await authFetch(`${planUrl(id)}/deactivation`, { method: 'POST' }),
        planAdminViewSchema,
      ),
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
    getMetrics: async () =>
      parseResponse(
        await authFetch(`${base}${METRICS_PATH}`, { method: 'GET' }),
        backofficeMetricsResponseSchema,
      ),
    ...planCalls(base, authFetch),
    ...accountCalls(base, authFetch),
  };
}
