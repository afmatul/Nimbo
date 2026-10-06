import { z } from 'zod';

import { roleSchema } from '../shared';

import { AUDIT_FIELD_MESSAGES, type AuditFieldIssueReason } from './error-codes';
import {
  AUDIT_NOTE_MAX_LENGTH,
  AUDIT_ORIGINS,
  AUDIT_TRIGGERS,
  type AuditOrigin,
} from './parameters';

/** Esquemas de la bitácora de auditoría (spec 004, plan §4). */

const RESOURCE_TYPES = ['file', 'folder', 'upload'] as const;

const timestamp = z.string().datetime();
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

/** Agrega el *issue* con su `reason` del conjunto cerrado y su mensaje. */
function addReason(ctx: z.RefinementCtx, reason: AuditFieldIssueReason, path?: string[]): void {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: AUDIT_FIELD_MESSAGES[reason],
    params: { reason },
    ...(path === undefined ? {} : { path }),
  });
}

/** Campo opcional de texto que `isValid` acepta; cualquier otro valor es `reason`. */
function textField<T extends string>(
  isValid: (value: string) => value is T,
  reason: AuditFieldIssueReason,
) {
  return z
    .custom<T>()
    .superRefine((value: unknown, ctx) => {
      if (typeof value !== 'string' || !isValid(value)) addReason(ctx, reason);
    })
    .optional();
}

const isTimestamp = (value: string): value is string => timestamp.safeParse(value).success;
const isCursor = (value: string): value is string => value !== '';
const isOrigin = (value: string): value is AuditOrigin =>
  (AUDIT_ORIGINS as readonly string[]).includes(value);

/**
 * Evento visible para su afectado. Lista blanca `strict`: no lleva nombres de archivo ni de carpeta, URLs, ni id,
 * correo o nombre del actor (CA-14). `note` es el motivo de Soporte, ausente si el evento no lo tiene (RN-6).
 * `trigger` distingue la purga programada de la pedida por el cliente; ausente si el evento no lo tiene (CA-7).
 */
export const auditEventResponseSchema = z
  .object({
    id: z.string().uuid(),
    occurredAt: timestamp,
    action: z.string().min(1),
    origin: z.enum(AUDIT_ORIGINS),
    actorRole: roleSchema,
    resourceType: z.enum(RESOURCE_TYPES).nullable(),
    itemCount: count.nullable(),
    sizeBytes: count.nullable(),
    note: z.string().max(AUDIT_NOTE_MAX_LENGTH).optional(),
    trigger: z.enum(AUDIT_TRIGGERS).optional(),
  })
  .strict();

/**
 * `GET /audit/my-events`: `from` inclusivo y `to` exclusivo (instantes ISO 8601), `origin` y cursor opaco; todo
 * opcional (CA-9, CA-10). Un `to` que no es posterior a `from` es `INVALID_RANGE`.
 */
export const listAuditEventsQuerySchema = z
  .object({
    from: textField(isTimestamp, 'INVALID_DATE'),
    to: textField(isTimestamp, 'INVALID_DATE'),
    origin: textField(isOrigin, 'INVALID_ORIGIN'),
    cursor: textField(isCursor, 'INVALID_CURSOR'),
  })
  .superRefine(({ from, to }, ctx) => {
    if (from !== undefined && to !== undefined && Date.parse(from) >= Date.parse(to)) {
      addReason(ctx, 'INVALID_RANGE', ['to']);
    }
  });

/** Página de eventos, del más reciente al más antiguo; `nextCursor` es `null` al final (CA-9). */
export const listAuditEventsResponseSchema = z
  .object({ items: z.array(auditEventResponseSchema), nextCursor: z.string().min(1).nullable() })
  .strict();

export type AuditResourceType = (typeof RESOURCE_TYPES)[number];
export type AuditEventResponse = z.infer<typeof auditEventResponseSchema>;
export type ListAuditEventsQuery = z.output<typeof listAuditEventsQuerySchema>;
export type ListAuditEventsResponse = z.infer<typeof listAuditEventsResponseSchema>;
