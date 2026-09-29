/**
 * Correo normalizado (D-16): solo recorta y pasa a minúsculas. No quita puntos ni «+» porque esas
 * reglas dependen del proveedor y dos buzones distintos quedarían fusionados. El formato completo
 * lo valida antes el esquema de `contracts`.
 */
export class EmailAddress {
  private constructor(readonly value: string) {}

  static of(raw: string): EmailAddress {
    return new EmailAddress(raw.trim().toLowerCase());
  }

  /** Parte local (antes del primer «@»); la política de contraseña la compara con la contraseña. */
  localPart(): string {
    const at = this.value.indexOf('@');
    return at === -1 ? this.value : this.value.slice(0, at);
  }

  equals(other: EmailAddress): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
