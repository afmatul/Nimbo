const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PREFIX = 'u';
const SEPARATOR = '/';

function uuidSegment(value: string, role: string): string {
  const segment = value.toLowerCase();
  if (!UUID_PATTERN.test(segment)) throw new Error(`Segmento de clave de objeto inválido: ${role}`);
  return segment;
}

/**
 * Clave de un objeto en MinIO: `u/{propietario}/{archivo}/{version}`, solo UUID (VO inmutable). Nunca lleva el
 * nombre del archivo, nunca sale de la API y nunca entra en una bitácora.
 */
export class ObjectKey {
  private constructor(readonly value: string) {
    Object.freeze(this);
  }

  static of(ownerId: string, fileId: string, versionId: string): ObjectKey {
    const segments = [
      uuidSegment(ownerId, 'propietario'),
      uuidSegment(fileId, 'archivo'),
      uuidSegment(versionId, 'versión'),
    ];
    return new ObjectKey([PREFIX, ...segments].join(SEPARATOR));
  }

  equals(other: ObjectKey): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
