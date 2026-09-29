export interface LegalAcceptanceProps {
  readonly termsVersion: string;
  readonly privacyVersion: string;
  readonly acceptedAt: Date;
}

/**
 * Versiones de Términos y Privacidad aceptadas y cuándo. La aplicación la arma con las versiones
 * vigentes de `contracts` y el reloj, porque el dominio no importa `contracts` (ADR-0008).
 */
export class LegalAcceptance {
  private readonly acceptedAtMs: number;

  private constructor(
    readonly termsVersion: string,
    readonly privacyVersion: string,
    acceptedAt: Date,
  ) {
    this.acceptedAtMs = acceptedAt.getTime();
  }

  static of(props: LegalAcceptanceProps): LegalAcceptance {
    return new LegalAcceptance(props.termsVersion, props.privacyVersion, props.acceptedAt);
  }

  /** Copia: `Date` es mutable y la aceptación no debe cambiar después de creada. */
  get acceptedAt(): Date {
    return new Date(this.acceptedAtMs);
  }
}
