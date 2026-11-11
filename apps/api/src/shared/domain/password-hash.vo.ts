const REDACTED = '[REDACTED]';

/**
 * Hash de contraseña en formato PHC, opaco para el dominio. `toString` y `toJSON` lo ocultan para
 * que un log o una respuesta serializada nunca lo filtren (CA-19); quien lo necesita llama `reveal()`.
 */
export class PasswordHash {
  private constructor(private readonly phc: string) {}

  static fromPhc(phc: string): PasswordHash {
    if (phc.length === 0) {
      throw new TypeError('El hash de contraseña no puede estar vacío.');
    }
    return new PasswordHash(phc);
  }

  /** Solo para el hasher (verificar) y el repositorio (persistir). */
  reveal(): string {
    return this.phc;
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }
}
