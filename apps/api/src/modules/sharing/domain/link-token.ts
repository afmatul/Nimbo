import { createHash, randomBytes } from 'node:crypto';

// 32 bytes = 256 bits (013 §5); en base64url sin relleno son siempre 43 caracteres.
const TOKEN_BYTES = 32;
const WELL_FORMED = /^[A-Za-z0-9_-]{43}$/;

/**
 * Token de un enlace público (013 RN-3). Solo se persiste `sha256(valor)` en `token_hash`: al no ser adivinable, un hash
 * simple basta. Segunda copia de `OpaqueToken` de `identity` (Art. VI.2: se extrae a `shared` con la tercera, PD-155);
 * sin `matchesHash`, porque la búsqueda por hash la hace `enlace_por_token()`.
 */
export class LinkToken {
  private constructor(private readonly value: string) {}

  static generate(): LinkToken {
    return new LinkToken(randomBytes(TOKEN_BYTES).toString('base64url'));
  }

  static hashOf(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  /** Descarta valores imposibles antes de consultar la BD (013 CA-11). */
  static isWellFormed(value: string): boolean {
    return WELL_FORMED.test(value);
  }

  hash(): string {
    return LinkToken.hashOf(this.value);
  }

  toString(): string {
    return this.value;
  }
}
