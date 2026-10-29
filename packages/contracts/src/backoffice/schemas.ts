import { z } from 'zod';

import { EMAIL_MAX_LENGTH, isValidEmail } from '../identity';
import { roleSchema } from '../shared';
import { FILE_KINDS } from '../storage';

import { addReason, byteText, timestamp } from './fields';
import { BACKOFFICE_PAGE_SIZE } from './parameters';

/** Esquemas del backoffice (spec 011, plan §4): cuentas, métricas y metadatos de archivos; respuestas estrictas. */

const PAGE_PATTERN = /^[1-9][0-9]*$/;
const FIRST_PAGE = 1;

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

/** Número de página desde 1; ausente es la primera (DF-66). */
const pageField = z.unknown().transform((value, ctx): number => {
  if (value === undefined) return FIRST_PAGE;
  const page = typeof value === 'number' ? String(value) : value;
  if (typeof page !== 'string' || !PAGE_PATTERN.test(page)) return addReason(ctx, 'INVALID_PAGE');
  const parsed = Number(page);
  return Number.isSafeInteger(parsed) ? parsed : addReason(ctx, 'INVALID_PAGE');
});

const normalizeEmail = (value: string): string => value.trim().toLowerCase();

/** Inicio del correo (Q-5): recortado y en minúsculas; vacío no filtra. */
const emailPrefixField = z.unknown().transform((value, ctx): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > EMAIL_MAX_LENGTH) {
    return addReason(ctx, 'INVALID_EMAIL');
  }
  const prefix = normalizeEmail(value);
  return prefix === '' ? undefined : prefix;
});

/** Correo exacto de un cliente (CA-13): obligatorio y válido. */
const exactEmailField = z.unknown().transform((value, ctx): string => {
  const email = typeof value === 'string' ? normalizeEmail(value) : '';
  if (email === '') return addReason(ctx, 'REQUIRED');
  return isValidEmail(email) ? email : addReason(ctx, 'INVALID_EMAIL');
});

/** `GET /backoffice/accounts?email&page` (CA-1). Responde `400 BACKOFFICE_INVALID_QUERY` con `fields`. */
export const listAccountsQuerySchema = z.object({ email: emailPrefixField, page: pageField });

/** `GET /backoffice/client-files?email&page` (CA-13). */
export const clientFilesQuerySchema = z.object({ email: exactEmailField, page: pageField });

/** Estado de una cuenta en el contrato (`usuario.estado`: `activa`, `suspendida`). */
export const ACCOUNT_STATUSES = ['active', 'suspended'] as const;

/**
 * Una cuenta en la lista y en la ficha (CA-1). En internas `planName` y `usedBytes` son `null` («—»): no tienen
 * suscripción ni cuota. `isSelf` marca la cuenta del Administrador que consulta (CA-4). Sin datos de archivos.
 */
export const accountListItemSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string().email(),
    fullName: z.string().min(1),
    role: roleSchema,
    status: z.enum(ACCOUNT_STATUSES),
    emailVerified: z.boolean(),
    planName: z.string().min(1).nullable(),
    usedBytes: byteText.nullable(),
    createdAt: timestamp,
    isSelf: z.boolean(),
  })
  .strict();

/** Página por número con su total (los mockups muestran «Página N de M», DF-66). */
function pageOf<T extends z.ZodTypeAny>(item: T) {
  return {
    items: z.array(item).max(BACKOFFICE_PAGE_SIZE),
    page: z.number().int().min(FIRST_PAGE),
    pageSize: z.literal(BACKOFFICE_PAGE_SIZE),
    total: count,
  };
}

export const accountListResponseSchema = z.object(pageOf(accountListItemSchema)).strict();

/** Conteo de clientes por plan; los inactivos aparecen solo si aún tienen clientes (CA-12). */
const planCountSchema = z
  .object({
    planId: z.string().uuid(),
    name: z.string().min(1),
    deactivatedAt: timestamp.nullable(),
    clientCount: count,
  })
  .strict();

/** `GET /backoffice/metrics` (CA-12): solo totales y conteos, nunca filas de una cuenta. */
export const backofficeMetricsResponseSchema = z
  .object({
    accounts: z
      .object({
        total: count,
        clients: count,
        internal: count,
        byStatus: z.object({ active: count, suspended: count }).strict(),
      })
      .strict(),
    usedBytesTotal: byteText,
    byPlan: z.array(planCountSchema),
  })
  .strict();

/** Metadatos de un archivo de un cliente (CA-13): sin contenido, texto, URL, clave de objeto ni versiones. */
const clientFileSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1),
    kind: z.enum(FILE_KINDS),
    sizeBytes: byteText,
    createdAt: timestamp,
    updatedAt: timestamp,
    trashedAt: timestamp.nullable(),
  })
  .strict();

/** `GET /backoffice/client-files` (CA-13): el cliente encontrado y una página de sus archivos. */
export const clientFilesResponseSchema = z
  .object({
    client: z
      .object({ id: z.string().uuid(), fullName: z.string().min(1), email: z.string().email() })
      .strict(),
    ...pageOf(clientFileSchema),
  })
  .strict();

export type AccountStatusName = (typeof ACCOUNT_STATUSES)[number];
export type ListAccountsQuery = z.output<typeof listAccountsQuerySchema>;
export type ClientFilesQuery = z.output<typeof clientFilesQuerySchema>;
export type AccountListItem = z.infer<typeof accountListItemSchema>;
export type AccountListResponse = z.infer<typeof accountListResponseSchema>;
export type BackofficeMetricsResponse = z.infer<typeof backofficeMetricsResponseSchema>;
export type ClientFileMetadata = z.infer<typeof clientFileSchema>;
export type ClientFilesResponse = z.infer<typeof clientFilesResponseSchema>;
