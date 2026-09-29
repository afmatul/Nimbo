import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

// 32 bytes = 256 bits (≥ 128 de RN-4); en base64url sin relleno son siempre 43 caracteres.
const TOKEN_BYTES = 32;
const WELL_FORMED = /^[A-Za-z0-9_-]{43}$/;

/**
 * Token opaco de los enlaces de cuenta. Solo se persiste `sha256(valor)`: al no ser adivinable,
 * un hash simple basta y un HMAC con pimienta solo agregaría un secreto que administrar (plan §6.2).
 */
export class OpaqueToken {
  private constructor(readonly value: string) {}

  static generate(): OpaqueToken {
    return new OpaqueToken(randomBytes(TOKEN_BYTES).toString('base64url'));
  }

  static hashOf(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  /** Descarta valores imposibles antes de consultar la BD (CA-11 b). */
  static isWellFormed(value: string): boolean {
    return WELL_FORMED.test(value);
  }

  /** Comparación en tiempo constante tras buscar por hash (D-19); longitudes distintas no lanzan. */
  static matchesHash(value: string, storedHash: string): boolean {
    const computed = Buffer.from(OpaqueToken.hashOf(value), 'utf8');
    const stored = Buffer.from(storedHash, 'utf8');
    return computed.length === stored.length && timingSafeEqual(computed, stored);
  }

  hash(): string {
    return OpaqueToken.hashOf(this.value);
  }

  toString(): string {
    return this.value;
  }
}
