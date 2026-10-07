/**
 * Reglas de nombre comunes a archivos y carpetas (RN-5). `FileName` y `FolderName` las comparten; solo difieren en
 * cómo arman «nombre (n)» (el archivo conserva su extensión al final).
 */

/** Largo máximo del nombre, en puntos de código (`nombre varchar(255)`). Regla de dominio, no configuración. */
export const NODE_NAME_MAX_LENGTH = 255;

/** Regla incumplida por un nombre. Coincide con los `reason` de campo de `contracts/storage` (sin importarlo, ADR-0008). */
export type NodeNameIssue = 'REQUIRED' | 'INVALID_NAME' | 'NAME_TOO_LONG';

export type NodeNameParseResult<T> =
  { readonly ok: true; readonly name: T } | { readonly ok: false; readonly reason: NodeNameIssue };

const PATH_SEPARATORS = new Set(['/', '\\']);
const RESERVED_NAMES = new Set(['.', '..']);
const LAST_C0_CONTROL = 0x1f;
const FIRST_DEL_OR_C1_CONTROL = 0x7f;
const LAST_C1_CONTROL = 0x9f;

/** Separador de ruta, NUL o carácter de control (C0, DEL y C1). */
function isForbiddenCharacter(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return (
    PATH_SEPARATORS.has(character) ||
    code <= LAST_C0_CONTROL ||
    (code >= FIRST_DEL_OR_C1_CONTROL && code <= LAST_C1_CONTROL)
  );
}

function issueOf(name: string): NodeNameIssue | null {
  if (name === '') return 'REQUIRED';
  const characters = Array.from(name);
  if (RESERVED_NAMES.has(name) || characters.some(isForbiddenCharacter)) return 'INVALID_NAME';
  return characters.length > NODE_NAME_MAX_LENGTH ? 'NAME_TOO_LONG' : null;
}

/**
 * Normaliza (NFC, sin espacios en los extremos) y valida: 1–255 puntos de código, sin `/`, `\`, NUL ni caracteres de
 * control, y distinto de `.` y `..`. Solo llama a `create` con un valor válido.
 */
export function parseNodeName<T>(
  raw: string,
  create: (value: string) => T,
): NodeNameParseResult<T> {
  const value = raw.normalize('NFC').trim();
  const reason = issueOf(value);
  return reason === null ? { ok: true, name: create(value) } : { ok: false, reason };
}

/** Clave de comparación: los nombres se comparan sin distinguir mayúsculas (`lower(nombre)` en BD). */
export function nameComparisonKey(value: string): string {
  return value.normalize('NFC').toLowerCase();
}

/**
 * `value` si está libre entre `taken`; si no, `candidateFor(n)` con el primer `n ≥ 1` libre. La comparación no
 * distingue mayúsculas.
 */
export function firstFreeName(
  value: string,
  taken: Iterable<string>,
  candidateFor: (n: number) => string,
): string {
  const occupied = new Set(Array.from(taken, nameComparisonKey));
  if (!occupied.has(nameComparisonKey(value))) return value;
  for (let n = 1; ; n += 1) {
    const candidate = candidateFor(n);
    if (!occupied.has(nameComparisonKey(candidate))) return candidate;
  }
}

/** «base (n)tail»; recorta la base si hace falta para no pasar de 255 puntos de código. */
export function withCopySuffix(base: string, tail: string, n: number): string {
  const suffix = ` (${String(n)})${tail}`;
  const room = NODE_NAME_MAX_LENGTH - Array.from(suffix).length;
  const fittedBase = Array.from(base).slice(0, room).join('').trimEnd();
  return `${fittedBase}${suffix}`;
}
