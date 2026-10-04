const SEPARATOR = '/';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function segmentsOf(value: string): string[] {
  if (!value.startsWith(SEPARATOR) || !value.endsWith(SEPARATOR)) {
    throw new TypeError('La ruta de una carpeta empieza y termina con «/».');
  }
  const segments = value.slice(1, -1).split(SEPARATOR);
  if (!segments.every((segment) => UUID.test(segment))) {
    throw new TypeError('La ruta de una carpeta solo lleva identificadores UUID.');
  }
  return segments;
}

/**
 * Camino materializado de una carpeta (`carpeta.ruta`, E-R): `/<id raíz>/…/<id propio>/`, solo con UUID (nunca
 * nombres). Permite detectar ciclos por prefijo (CA-8), medir la profundidad (CA-9) y mover un subárbol (CA-7).
 */
export class FolderPath {
  private constructor(
    readonly value: string,
    private readonly segments: readonly string[],
  ) {
    Object.freeze(this);
  }

  /** Ruta de la carpeta `id` dentro de `parent`; `null` es la raíz del propietario. */
  static childOf(parent: FolderPath | null, id: string): FolderPath {
    return FolderPath.of(`${parent?.value ?? SEPARATOR}${id}${SEPARATOR}`);
  }

  /** Reconstruye una ruta leída de la BD. Lanza si está mal formada. */
  static of(value: string): FolderPath {
    return new FolderPath(value, Object.freeze(segmentsOf(value)));
  }

  /** Niveles desde la raíz: una carpeta en la raíz tiene profundidad 1 (`carpeta.profundidad`). */
  get depth(): number {
    return this.segments.length;
  }

  /** Id de la carpeta dueña de esta ruta (último tramo). */
  get folderId(): string {
    return this.segments[this.segments.length - 1] as string;
  }

  /** Ids de las carpetas ancestro, desde la raíz y sin esta (migas, CA-5). */
  ancestorIds(): string[] {
    return this.segments.slice(0, -1);
  }

  /** `other` es esta misma carpeta o una descendiente (CA-8). */
  contains(other: FolderPath): boolean {
    return other.value.startsWith(this.value);
  }

  equals(other: FolderPath): boolean {
    return this.value === other.value;
  }

  /**
   * Profundidad del nivel más hondo del subárbol de esta carpeta si pasara a `newParent` (`null` = raíz).
   * `subtreeMaxDepth` es la profundidad actual de su descendiente más hondo (la propia si no tiene).
   */
  subtreeDepthUnder(newParent: FolderPath | null, subtreeMaxDepth: number): number {
    const height = subtreeMaxDepth - this.depth + 1;
    return (newParent?.depth ?? 0) + height;
  }

  /** Esta ruta tras mover la carpeta de ruta `moved` (que la contiene) a `newParent` (`null` = raíz). */
  rebase(moved: FolderPath, newParent: FolderPath | null): FolderPath {
    if (!moved.contains(this)) {
      throw new TypeError('Solo se reubica una ruta que está dentro de la carpeta movida.');
    }
    const ownTail = this.segments.slice(moved.depth - 1).join(SEPARATOR);
    return FolderPath.of(`${newParent?.value ?? SEPARATOR}${ownTail}${SEPARATOR}`);
  }

  toString(): string {
    return this.value;
  }
}
