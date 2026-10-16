import {
  billingHistoryResponseSchema,
  invoiceDownloadResponseSchema,
  type BillingHistoryResponse,
  type InvoiceDownloadResponse,
} from '@nimbo/contracts';

import type { AuthFetch } from '../identity/session/auth-fetch';

import { billingEndpoint } from './billing-endpoint';

const HISTORY_PATH = '/billing/history';

const downloadPath = (invoiceId: string): string =>
  `/billing/invoices/${encodeURIComponent(invoiceId)}/download`;

/** `GET /billing/history` con la sesión (spec 009 CA-7): plan actual y pagos del cliente. */
export async function fetchBillingHistory(
  apiPublicUrl: string,
  authFetch: AuthFetch,
): Promise<BillingHistoryResponse> {
  return billingHistoryResponseSchema.parse(
    await authFetch(billingEndpoint(apiPublicUrl, HISTORY_PATH)),
  );
}

/** `GET /billing/invoices/:id/download` (CA-8): enlace de 5 minutos; un `404` llega como `ApiClientError`. */
export async function requestInvoiceDownload(
  apiPublicUrl: string,
  authFetch: AuthFetch,
  invoiceId: string,
): Promise<InvoiceDownloadResponse> {
  return invoiceDownloadResponseSchema.parse(
    await authFetch(billingEndpoint(apiPublicUrl, downloadPath(invoiceId))),
  );
}
