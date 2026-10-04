import {
  NODE_NAME_MAX_LENGTH,
  firstFreeName,
  nameComparisonKey,
  parseNodeName,
  withCopySuffix,
  type NodeNameIssue,
  type NodeNameParseResult,
} from './node-name';

/** Largo máximo del nombre, en puntos de código (`archivo.nombre varchar(255)`). Regla de dominio, no configuración. */
export const FILE_NAME_MAX_LENGTH = NODE_NAME_MAX_LENGTH;

/** Regla incumplida por un nombre. Coincide con los `reason` de campo de `contracts/storage` (sin importarlo, ADR-0008). */
export type FileNameIssue = NodeNameIssue;

export type FileNameParseResult = NodeNameParseResult<FileName>;

const EXTENSION_SEPARATOR = '.';

/** Posición del punto de la extensión, o -1: un punto inicial («.bashrc») o final («nota.») no marca extensión. */
function extensionDot(value: string): number {
  const dot = value.lastIndexOf(EXTENSION_SEPARATOR);
  return dot > 0 && dot < value.length - 1 ? dot : -1;
}

/**
 * Nombre de un archivo (VO inmutable): reglas comunes de `node-name.ts` (NFC, sin espacios en los extremos, 1–255
 * puntos de código, sin separadores ni caracteres de control, distinto de `.` y `..`). Nunca forma parte de una clave
 * de objeto.
 */
export class FileName {
  private constructor(readonly value: string) {
    Object.freeze(this);
  }

  static parse(raw: string): FileNameParseResult {
    return parseNodeName(raw, (value) => new FileName(value));
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
    return nameComparisonKey(this.value) === nameComparisonKey(other.value);
  }

  /**
   * Nombre con el que se guarda (D-4): este mismo si está libre; si no, «base (n).ext» (o «base (n)») con el
   * primer `n ≥ 1` libre. `taken` son los nombres ocupados; la comparación no distingue mayúsculas.
   */
  firstFree(taken: Iterable<string>): FileName {
    const free = firstFreeName(this.value, taken, (n) => this.withCopyNumber(n));
    return free === this.value ? this : new FileName(free);
  }

  toString(): string {
    return this.value;
  }

  /** «base (n).ext»; recorta la base si hace falta para no pasar de 255 puntos de código. */
  private withCopyNumber(n: number): string {
    const dot = extensionDot(this.value);
    const base = dot === -1 ? this.value : this.value.slice(0, dot);
    const tail = dot === -1 ? '' : this.value.slice(dot);
    return withCopySuffix(base, tail, n);
  }
}
