import {
  accountLimitsSchema,
  accountListItemSchema,
  accountListResponseSchema,
  backofficeMetricsResponseSchema,
  clientFilesResponseSchema,
  clientTrashResponseSchema,
  planAdminListResponseSchema,
  planAdminViewSchema,
  restoreResponseSchema,
  type AccountLimits,
  type AccountListItem,
  type AdjustQuotaRequest,
  type AdjustValidityRequest,
  type AccountListResponse,
  type BackofficeMetricsResponse,
  type ClientFilesResponse,
  type ClientTrashResponse,
  type CreatePlanRequest,
  type EnrollInternalAccountRequest,
  type PlanAdminListResponse,
  type PlanAdminView,
  type RestoreClientNodeRequest,
  type RestoreResponse,
} from '@nimbo/contracts';

import type { AuthFetch } from '../identity/session/auth-fetch';
import { parseResponse } from '../storage/storage-http';

const CLIENT_FILES_PATH = '/backoffice/client-files';
const ACCOUNTS_PATH = '/backoffice/accounts';
const METRICS_PATH = '/backoffice/metrics';
const PLANS_PATH = '/backoffice/plans';
const CLIENT_TRASH_PATH = '/backoffice/client-trash';

/** Correo exacto de un cliente y, si hay, el cursor de la siguiente página de su papelera (011b CA-10). */
export interface ClientTrashRequest {
  readonly email: string;
  readonly cursor?: string;
}

/** Raíz de la papelera de un cliente que Soporte restaura, con el motivo (011b CA-11). */
export interface RestoreClientNodeCall extends RestoreClientNodeRequest {
  readonly nodeId: string;
}

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
  /** `GET /backoffice/client-trash` (011b CA-10): el cliente y una página de las raíces de su papelera. */
  listClientTrash(request: ClientTrashRequest): Promise<ClientTrashResponse>;
  /** `POST /backoffice/client-trash/:nodeId/restore` (011b CA-11): restaura una raíz; el motivo queda en la auditoría. */
  restoreClientNode(request: RestoreClientNodeCall): Promise<RestoreResponse>;
  /** `GET /backoffice/accounts`: una página de cuentas, de la más reciente. */
  listAccounts(request: AccountsRequest): Promise<AccountListResponse>;
  /** `GET /backoffice/accounts/:id`: la ficha de una cuenta. */
  getAccount(id: string): Promise<AccountListItem>;
  /** `POST /backoffice/accounts/:id/suspension` (CA-2). */
  suspendAccount(id: string): Promise<AccountListItem>;
  /** `DELETE /backoffice/accounts/:id/suspension` (CA-3). */
  reactivateAccount(id: string): Promise<AccountListItem>;
  /** `GET /backoffice/accounts/:id/limits` (011b CA-1, HU-5): cuota, extra y vencimiento de un cliente. */
  getAccountLimits(id: string): Promise<AccountLimits>;
  /** `PUT /backoffice/accounts/:id/quota` (011b CA-1): el extra que reemplaza al anterior, hasta el día elegido. */
  adjustQuota(id: string, request: AdjustQuotaRequest): Promise<AccountLimits>;
  /** `DELETE /backoffice/accounts/:id/quota` (011b CA-4): quita el extra. */
  removeQuota(id: string): Promise<AccountLimits>;
  /** `PUT /backoffice/accounts/:id/validity` (011b CA-6): el último día de la vigencia nueva. */
  adjustValidity(id: string, request: AdjustValidityRequest): Promise<AccountLimits>;
  /** `POST /backoffice/accounts`: alta de una cuenta interna (CA-5). */
  enrollAccount(request: EnrollInternalAccountRequest): Promise<AccountListItem>;
  /** `GET /backoffice/metrics`: solo totales y conteos (CA-12), para ADMIN y OPERATOR. */
  getMetrics(): Promise<BackofficeMetricsResponse>;
  /** `GET /backoffice/plans`: todos los planes, activos y desactivados, con su conteo de cuentas (CA-8). */
  listPlans(): Promise<PlanAdminListResponse>;
  /** `POST /backoffice/plans` (CA-9): crea un plan activo; el `slug` lo deriva el servidor. */
  createPlan(request: CreatePlanRequest): Promise<PlanAdminView>;
  /** `POST /backoffice/plans/:id/deactivation` (CA-10): desactiva un plan; no se reactiva. */
  deactivatePlan(id: string): Promise<PlanAdminView>;
}

function clientFilesUrl(base: string, { email, page }: ClientFilesRequest): string {
  const params = new URLSearchParams({ email, page: String(page) });
  return `${base}${CLIENT_FILES_PATH}?${params.toString()}`;
}

function clientTrashUrl(base: string, { email, cursor }: ClientTrashRequest): string {
  const params = new URLSearchParams({ email });
  if (cursor !== undefined) params.set('cursor', cursor);
  return `${base}${CLIENT_TRASH_PATH}?${params.toString()}`;
}

/** Papelera de un cliente para Soporte (011b plan §4): la lista de raíces y la restauración con motivo. */
function clientTrashCalls(base: string, authFetch: AuthFetch) {
  return {
    listClientTrash: async (request: ClientTrashRequest): Promise<ClientTrashResponse> =>
      parseResponse(
        await authFetch(clientTrashUrl(base, request), { method: 'GET' }),
        clientTrashResponseSchema,
      ),
    restoreClientNode: async ({
      nodeId,
      ...body
    }: RestoreClientNodeCall): Promise<RestoreResponse> =>
      parseResponse(
        await authFetch(
          `${base}${CLIENT_TRASH_PATH}/${encodeURIComponent(nodeId)}/restore`,
          jsonBody('POST', body),
        ),
        restoreResponseSchema,
      ),
  };
}

function accountsUrl(base: string, { email, page }: AccountsRequest): string {
  const params = new URLSearchParams({ page: String(page) });
  if (email !== undefined) params.set('email', email);
  return `${base}${ACCOUNTS_PATH}?${params.toString()}`;
}

const accountUrl = (base: string, id: string): string =>
  `${base}${ACCOUNTS_PATH}/${encodeURIComponent(id)}`;

/** Petición con cuerpo JSON: el alta, el plan nuevo y los ajustes de la 011b. */
const jsonBody = (method: 'POST' | 'PUT', body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

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
      call(`${base}${ACCOUNTS_PATH}`, jsonBody('POST', request)),
  };
}

/** Límites, cuota y vigencia de un cliente (011b plan §4): la respuesta es siempre `AccountLimits`. */
function limitsCalls(base: string, authFetch: AuthFetch) {
  const call = async (url: string, init: RequestInit): Promise<AccountLimits> =>
    parseResponse(await authFetch(url, init), accountLimitsSchema);
  return {
    getAccountLimits: (id: string) => call(`${accountUrl(base, id)}/limits`, { method: 'GET' }),
    adjustQuota: (id: string, request: AdjustQuotaRequest) =>
      call(`${accountUrl(base, id)}/quota`, jsonBody('PUT', request)),
    removeQuota: (id: string) => call(`${accountUrl(base, id)}/quota`, { method: 'DELETE' }),
    adjustValidity: (id: string, request: AdjustValidityRequest) =>
      call(`${accountUrl(base, id)}/validity`, jsonBody('PUT', request)),
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
    createPlan: async (request: CreatePlanRequest): Promise<PlanAdminView> =>
      parseResponse(
        await authFetch(`${base}${PLANS_PATH}`, jsonBody('POST', request)),
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
    ...clientTrashCalls(base, authFetch),
    ...planCalls(base, authFetch),
    ...accountCalls(base, authFetch),
    ...limitsCalls(base, authFetch),
  };
}
