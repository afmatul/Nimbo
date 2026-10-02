import { z } from 'zod';

import { STORAGE_FIELD_MESSAGES, type StorageFieldIssueReason } from './error-codes';
import { FILE_NAME_MAX_LENGTH, FILES_PAGE_DEFAULT, FILES_PAGE_MAX } from './parameters';

/** Piezas comunes de los esquemas de `storage` (archivos, carpetas y papelera). Interno: `index.ts` no lo exporta. */

type FieldMessages = Readonly<Record<StorageFieldIssueReason, string>>;

/** Campo validado por `field`: entra y sale como `T`. */
export type Field<T> = z.ZodEffects<z.ZodType<T>, T, T>;

/** Respuesta ante un nombre repetido (005 CA-6): no existe «Reemplazar». */
export const ON_CONFLICT_OPTIONS = ['ask', 'keep_both'] as const;
export type OnConflict = (typeof ON_CONFLICT_OPTIONS)[number];

const ON_CONFLICT_MESSAGE = 'Elige «Conservar ambos» o «Cancelar» y vuelve a intentarlo.';

const PATH_SEPARATORS = new Set(['/', '\\']);
const RESERVED_NAMES = new Set(['.', '..']);
const LAST_C0_CONTROL = 0x1f;
const FIRST_DEL_OR_C1_CONTROL = 0x7f;
const LAST_C1_CONTROL = 0x9f;

/** Identificador UUID (nodos, cargas). */
export const uuidSchema = z.string().uuid();

/** Separador de ruta, NUL o carácter de control (C0, DEL y C1). */
function isForbiddenCharacter(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return (
    PATH_SEPARATORS.has(character) ||
    code <= LAST_C0_CONTROL ||
    (code >= FIRST_DEL_OR_C1_CONTROL && code <= LAST_C1_CONTROL)
  );
}

/** Mismas reglas que `node-name.ts` del dominio de `api` (RN-5), que no importa este paquete (ADR-0008). */
function nameReason(value: unknown): StorageFieldIssueReason | null {
  if (typeof value !== 'string') return 'REQUIRED';
  const name = value.normalize('NFC').trim();
  if (name === '') return 'REQUIRED';
  const characters = Array.from(name);
  if (RESERVED_NAMES.has(name) || characters.some(isForbiddenCharacter)) return 'INVALID_NAME';
  return characters.length > FILE_NAME_MAX_LENGTH ? 'NAME_TOO_LONG' : null;
}

/** Carpeta destino obligatoria: un UUID o `null` (la raíz). */
function folderReason(value: unknown): StorageFieldIssueReason | null {
  if (value === undefined) return 'REQUIRED';
  return value === null || uuidSchema.safeParse(value).success ? null : 'INVALID_FOLDER';
}

function cursorReason(value: unknown): StorageFieldIssueReason | null {
  return value === undefined || (typeof value === 'string' && value !== '')
    ? null
    : 'INVALID_CURSOR';
}

function clampLimit(value: unknown): number {
  const parsed = Number(value);
  if (value === undefined || !Number.isFinite(parsed)) return FILES_PAGE_DEFAULT;
  return Math.min(Math.max(Math.trunc(parsed), 1), FILES_PAGE_MAX);
}

/**
 * Campo cuyo `reason` decide `reasonOf`, para que `fields[].reason` salga del conjunto cerrado (CA-7); el mensaje
 * sale de `messages`.
 */
export function field<T>(
  reasonOf: (value: unknown) => StorageFieldIssueReason | null,
  messages: FieldMessages = STORAGE_FIELD_MESSAGES,
): Field<T> {
  return z.custom<T>().superRefine((value: unknown, ctx) => {
    const reason = reasonOf(value);
    if (reason === null) return;
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: messages[reason], params: { reason } });
  });
}

/** Campo opcional que solo admite un valor de `options`; cualquier otro (texto distinto, lista, vacío) es `reason`. */
export function optionField<const T extends string>(
  options: readonly T[],
  reason: StorageFieldIssueReason,
): Field<T> {
  const allowed: ReadonlySet<unknown> = new Set(options);
  return field<T>((value) => (allowed.has(value) ? null : reason));
}

/** Nombre de archivo o carpeta; el servicio lo normaliza con su VO. */
export const nameField = (messages: FieldMessages = STORAGE_FIELD_MESSAGES): Field<string> =>
  field<string>(nameReason, messages);

/** Carpeta destino: UUID o `null` (raíz); ausente es `REQUIRED` salvo que el esquema la haga opcional. */
export const folderField: Field<string | null> = field<string | null>(folderReason);

/** `onConflict` ausente es `ask` (preguntar con «Conservar ambos» / «Cancelar»). */
export const onConflictField = z
  .enum(ON_CONFLICT_OPTIONS, { message: ON_CONFLICT_MESSAGE })
  .default('ask');

/** Consulta paginada: `limit` fuera de rango se ajusta; el cursor es opaco y lo decodifica la API. */
export const pageQuerySchema = z.object({
  cursor: field<string>(cursorReason).optional(),
  limit: z.unknown().transform(clampLimit),
});

export const timestamp = z.string().datetime();
export const byteCount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
