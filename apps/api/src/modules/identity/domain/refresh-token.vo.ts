import { OpaqueToken } from './opaque-token.vo';

const SEPARATOR = '.';
const SESSION_ID_FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Token de refresco `<sid>.<secreto>` (plan §6.2, DT-1): el `sid` permite leer la sesión por clave primaria y el
 * secreto es un `OpaqueToken` de 256 bits del que solo se guarda `secretHash`. Nunca se serializa el valor.
 */
export class RefreshToken {
  private constructor(
    readonly sessionId: string,
    private readonly secret: string,
  ) {}

  static issue(sessionId: string): RefreshToken {
    return new RefreshToken(sessionId, OpaqueToken.generate().toString());
  }

  /** Exactamente un uuid, un punto y un secreto bien formado; si no, `null` sin consultar nada (CA-9). */
  static parse(value: string): RefreshToken | null {
    const parts = value.split(SEPARATOR);
    if (parts.length !== 2) {
      return null;
    }
    const [sessionId = '', secret = ''] = parts;
    if (!SESSION_ID_FORMAT.test(sessionId) || !OpaqueToken.isWellFormed(secret)) {
      return null;
    }
    return new RefreshToken(sessionId, secret);
  }

  get value(): string {
    return `${this.sessionId}${SEPARATOR}${this.secret}`;
  }

  get secretHash(): string {
    return OpaqueToken.hashOf(this.secret);
  }

  toJSON(): { readonly sessionId: string } {
    return { sessionId: this.sessionId };
  }
}
