/** Largo máximo del nombre, en puntos de código (`archivo.nombre varchar(255)`). Regla de dominio, no configuración. */
export const FILE_NAME_MAX_LENGTH = 255;

/** Regla incumplida por un nombre. Coincide con los `reason` de campo de `contracts/storage` (sin importarlo, ADR-0008). */
export type FileNameIssue = 'REQUIRED' | 'INVALID_NAME' | 'NAME_TOO_LONG';

export type FileNameParseResult =
  | { readonly ok: true; readonly name: FileName }
  | { readonly ok: false; readonly reason: FileNameIssue };

const PATH_SEPARATORS = new Set(['/', '\\']);
const RESERVED_NAMES = new Set(['.', '..']);
const LAST_C0_CONTROL = 0x1f;
const FIRST_DEL_OR_C1_CONTROL = 0x7f;
const LAST_C1_CONTROL = 0x9f;
const EXTENSION_SEPARATOR = '.';

/** Separador de ruta, NUL o carácter de control (C0, DEL y C1). */
function isForbiddenCharacter(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return (
    PATH_SEPARATORS.has(character) ||
    code <= LAST_C0_CONTROL ||
    (code >= FIRST_DEL_OR_C1_CONTROL && code <= LAST_C1_CONTROL)
  );
}

function issueOf(name: string): FileNameIssue | null {
  if (name === '') return 'REQUIRED';
  const characters = Array.from(name);
  if (RESERVED_NAMES.has(name) || characters.some(isForbiddenCharacter)) return 'INVALID_NAME';
  return characters.length > FILE_NAME_MAX_LENGTH ? 'NAME_TOO_LONG' : null;
}

/** Clave de comparación: los nombres se comparan sin distinguir mayúsculas (CA-6, `lower(nombre)` en BD). */
function comparisonKey(value: string): string {
  return value.toLowerCase();
}

/** Posición del punto de la extensión, o -1: un punto inicial («.bashrc») o final («nota.») no marca extensión. */
function extensionDot(value: string): number {
  const dot = value.lastIndexOf(EXTENSION_SEPARATOR);
  return dot > 0 && dot < value.length - 1 ? dot : -1;
}

/**
 * Nombre de un archivo (VO inmutable): NFC, sin espacios en los extremos, 1–255 puntos de código, sin `/`, `\`,
 * NUL ni caracteres de control, y distinto de `.` y `..`. Nunca forma parte de una clave de objeto.
 */
export class FileName {
  private constructor(readonly value: string) {
    Object.freeze(this);
  }

  static parse(raw: string): FileNameParseResult {
    const value = raw.normalize('NFC').trim();
    const reason = issueOf(value);
    return reason === null ? { ok: true, name: new FileName(value) } : { ok: false, reason };
  }

  /** Para valores ya validados (p. ej. leídos de la BD). Lanza si el nombre no es válido. */
  static of(raw: string): FileName {
    const result = FileName.parse(raw);
    if (!result.ok) throw new Error(`Nombre de archivo inválido: ${result.reason}`);
    return result.name;
  }

  /** Extensión en minúsculas y sin punto; `''` si no tiene. */
  extension(): string {
    const dot = extensionDot(this.value);
    return dot === -1 ? '' : this.value.slice(dot + 1).toLowerCase();
  }

  sameAs(other: FileName): boolean {
    return comparisonKey(this.value) === comparisonKey(other.value);
  }

  /**
   * Nombre con el que se guarda (D-4): este mismo si está libre; si no, «base (n).ext» (o «base (n)») con el
   * primer `n ≥ 1` libre. `taken` son los nombres ocupados; la comparación no distingue mayúsculas.
   */
  firstFree(taken: Iterable<string>): FileName {
    const occupied = new Set(Array.from(taken, (name) => comparisonKey(name.normalize('NFC'))));
    if (!occupied.has(comparisonKey(this.value))) return this;
    for (let n = 1; ; n += 1) {
      const candidate = this.withCopyNumber(n);
      if (!occupied.has(comparisonKey(candidate.value))) return candidate;
    }
  }

  toString(): string {
    return this.value;
  }

  /** «base (n).ext»; recorta la base si hace falta para no pasar de 255 puntos de código. */
  private withCopyNumber(n: number): FileName {
    const dot = extensionDot(this.value);
    const base = dot === -1 ? this.value : this.value.slice(0, dot);
    const tail = dot === -1 ? '' : this.value.slice(dot);
    const suffix = ` (${String(n)})${tail}`;
    const room = FILE_NAME_MAX_LENGTH - Array.from(suffix).length;
    const fittedBase = Array.from(base).slice(0, room).join('').trimEnd();
    return new FileName(`${fittedBase}${suffix}`);
  }
}
