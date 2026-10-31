import { z } from 'zod';

import { STORAGE_FIELD_MESSAGES, type StorageFieldIssueReason } from './error-codes';
import { folderRefSchema, folderSummarySchema } from './folder-schemas';
import { FILE_NAME_MAX_LENGTH } from './parameters';
import { field, optionField, pageQuerySchema, timestamp } from './schema-fields';
import { fileSummarySchema } from './schemas';

/** Esquemas de la búsqueda por nombre, tipo y fecha (spec 018, plan §4). */

/** Filtro de tipo: las categorías del resumen de espacio (007 CA-2), espejo de `FileCategory` de `api` (RN-3). */
export const SEARCH_TYPES = ['documents', 'images', 'other'] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

/** Mensajes de campo de `GET /search`: el texto buscado no es un nombre que se sube ni se renombra (CA-6). */
export const STORAGE_SEARCH_FIELD_MESSAGES: Readonly<Record<StorageFieldIssueReason, string>> = {
  ...STORAGE_FIELD_MESSAGES,
  REQUIRED: 'Escribe qué quieres buscar.',
  NAME_TOO_LONG: `Usa ${String(FILE_NAME_MAX_LENGTH)} caracteres o menos y vuelve a buscar.`,
};

/** Texto de 1 a 255 caracteres tras normalizar y recortar (RN-5), el largo máximo de un nombre. */
function queryTextReason(value: unknown): StorageFieldIssueReason | null {
  if (typeof value !== 'string') return 'REQUIRED';
  const text = value.normalize('NFC').trim();
  if (text === '') return 'REQUIRED';
  return Array.from(text).length > FILE_NAME_MAX_LENGTH ? 'NAME_TOO_LONG' : null;
}

const dateReason = (value: unknown): StorageFieldIssueReason | null =>
  timestamp.safeParse(value).success ? null : 'INVALID_DATE';

const queryText = field<string>(queryTextReason, STORAGE_SEARCH_FIELD_MESSAGES).transform((value) =>
  value.trim(),
);

/**
 * `GET /search`: `q` obligatorio; `type` opcional; `from` inclusivo y `to` exclusivo (instantes ISO 8601), como
 * `GET /audit/my-events`. Un `to` que no es posterior a `from` es `INVALID_RANGE` (CA-9).
 */
export const searchQuerySchema = pageQuerySchema
  .extend({
    q: queryText,
    type: optionField(SEARCH_TYPES, 'INVALID_TYPE').optional(),
    from: field<string>(dateReason).optional(),
    to: field<string>(dateReason).optional(),
  })
  .superRefine(({ from, to }, ctx) => {
    if (from !== undefined && to !== undefined && Date.parse(from) >= Date.parse(to)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: STORAGE_FIELD_MESSAGES.INVALID_RANGE,
        params: { reason: 'INVALID_RANGE' },
        path: ['to'],
      });
    }
  });

/**
 * Lo que la búsqueda agrega al `NodeSummary` (CA-2, CA-13): la carpeta que contiene el resultado y que el actor ve
 * (`null` = «Mis archivos», o una carpeta que no ve, y entonces el padre del resumen también va en `null`) y si el
 * nodo es de otra cuenta (012).
 */
const searchExtras = { location: folderRefSchema.nullable(), shared: z.boolean() };

/** Resultado: un `NodeSummary` del explorador más su ubicación (CA-2). */
export const searchHitSchema = z.discriminatedUnion('type', [
  folderSummarySchema.extend({ type: z.literal('folder'), ...searchExtras }),
  fileSummarySchema.extend({ type: z.literal('file'), ...searchExtras }),
]);

/** Página de resultados: carpetas y luego archivos, del modificado más reciente al más antiguo; sin total (RN-6). */
export const searchResponseSchema = z
  .object({ items: z.array(searchHitSchema), nextCursor: z.string().min(1).nullable() })
  .strict();

export type SearchQuery = z.output<typeof searchQuerySchema>;
export type SearchHit = z.infer<typeof searchHitSchema>;
export type SearchResponse = z.infer<typeof searchResponseSchema>;
