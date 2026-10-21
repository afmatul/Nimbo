import { createHash } from 'node:crypto';

/** Espacio de nombres propio de las versiones de edición de Nimbo (uuid v4 fijo; no debe cambiar nunca). */
const EDITED_VERSION_NAMESPACE = '0d6c3a52-5f7e-4b1a-9c2d-8e4f6a1b3c5d';
const UUID_BYTES = 16;
const VERSION_BYTE = 6;
const VARIANT_BYTE = 8;
const VERSION_5 = 0x50;
const VARIANT_RFC_4122 = 0x80;
const LOW_NIBBLE = 0x0f;
const LOW_SIX_BITS = 0x3f;
/** Cortes de las cinco partes del texto de un uuid (8-4-4-4-12 dígitos hexadecimales). */
const GROUP_ENDS = [8, 12, 16, 20, 32] as const;

const bytesOf = (uuid: string): Buffer => Buffer.from(uuid.replaceAll('-', ''), 'hex');

const format = (bytes: Buffer): string => {
  const hex = bytes.toString('hex');
  return GROUP_ENDS.map((end, index) => hex.slice(GROUP_ENDS[index - 1] ?? 0, end)).join('-');
};

/** uuid versión 5 (RFC 4122 §4.3): SHA-1 del espacio de nombres y el nombre, con versión y variante fijadas. */
export const uuidV5 = (name: string, namespace: string): string => {
  const hash = createHash('sha1').update(bytesOf(namespace)).update(name, 'utf8').digest();
  const bytes = hash.subarray(0, UUID_BYTES);
  bytes[VERSION_BYTE] = ((bytes[VERSION_BYTE] ?? 0) & LOW_NIBBLE) | VERSION_5;
  bytes[VARIANT_BYTE] = ((bytes[VARIANT_BYTE] ?? 0) & LOW_SIX_BITS) | VARIANT_RFC_4122;
  return format(bytes);
};

/**
 * Id de la versión que deja una sesión de edición (plan 016 §2, DF-05): determinista, así un reintento del guardado
 * reutiliza la misma versión y su clave de objeto, y `uq_version_archivo_sesion_edicion` hace el resto (CA-10).
 */
export const editedVersionIdOf = (sessionId: string): string =>
  uuidV5(sessionId, EDITED_VERSION_NAMESPACE);
