/** Integridad del candidato (plan 021 §2 y §6): aísla la decodificación y comparación de `sharp`. */
export interface IIntegrityValidator {
  /** Sin escrituras: formato y metadatos preservados; en PNG también píxeles idénticos. */
  validate(original: Buffer, candidate: Buffer): Promise<boolean>;
}

export const I_INTEGRITY_VALIDATOR = Symbol('IIntegrityValidator');
