import {
  firstFreeName,
  nameComparisonKey,
  parseNodeName,
  withCopySuffix,
  type NodeNameParseResult,
} from './node-name';

/**
 * Nombre de una carpeta (VO inmutable), con las mismas reglas que el de un archivo (RN-5). A diferencia de
 * `FileName`, un punto no marca extensión: «base (n)» siempre va al final.
 */
export class FolderName {
  private constructor(readonly value: string) {
    Object.freeze(this);
  }

  static parse(raw: string): NodeNameParseResult<FolderName> {
    return parseNodeName(raw, (value) => new FolderName(value));
  }

  /** Para valores ya validados (p. ej. leídos de la BD). Lanza si el nombre no es válido. */
  static of(raw: string): FolderName {
    const result = FolderName.parse(raw);
    if (!result.ok) throw new Error(`Nombre de carpeta inválido: ${result.reason}`);
    return result.name;
  }

  sameAs(other: FolderName): boolean {
    return nameComparisonKey(this.value) === nameComparisonKey(other.value);
  }

  /** Este nombre si está libre entre `taken`; si no, «base (n)» con el primer `n ≥ 1` libre (CA-14). */
  firstFree(taken: Iterable<string>): FolderName {
    const free = firstFreeName(this.value, taken, (n) => withCopySuffix(this.value, '', n));
    return free === this.value ? this : new FolderName(free);
  }

  toString(): string {
    return this.value;
  }
}
