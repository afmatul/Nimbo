/** Tipo de procedencia guardado en `fragmento.procedencia.tipo` (DF-07, DF-79): el tipo de archivo del que sale. */
export type SourceLocationType = 'docx' | 'pdf' | 'texto' | 'xlsx' | 'pptx';

/**
 * Forma de `fragmento.procedencia` (jsonb, DF-07): `{ tipo, …campos de la ubicación, confianza }`. Las claves van en
 * español como el resto del E-R; `confianza` es 1 cuando la ubicación es exacta.
 */
export type SourceLocationJson = Readonly<
  { tipo: SourceLocationType; confianza: number } & Record<string, string | number>
>;

/** Confianza de una ubicación fijada con certeza (RN-3). */
export const CERTAIN_CONFIDENCE = 1;

const UNCERTAIN_SUFFIX = ' (ubicación aproximada)';

/** Exige un entero ≥ `min`; las ubicaciones nacen de los extractores y un valor inválido es un error de programación. */
export function requireInteger(value: number, min: number, field: string): number {
  if (!Number.isInteger(value) || value < min) {
    throw new RangeError(`${field} debe ser un entero mayor o igual que ${min}`);
  }
  return value;
}

function requireConfidence(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > CERTAIN_CONFIDENCE) {
    throw new RangeError('La confianza de una ubicación va de 0 a 1');
  }
  return value;
}

/**
 * Procedencia de un segmento o fragmento (diagrama M6, DF-79; VO inmutable). Cada subclase fija su unidad de ubicación:
 * dos ubicaciones con igual `groupKey()` pueden unirse en un fragmento (`mergeWith`) sin mezclar ubicaciones (RN-3);
 * con distinta, nunca.
 */
export abstract class SourceLocation {
  protected constructor(readonly confidence: number) {
    requireConfidence(confidence);
  }

  /** Unidad que un fragmento no puede cruzar: sección, página, hoja, diapositiva o el archivo de texto entero. */
  abstract groupKey(): string;

  /** Texto de la cita en español, sin contenido del archivo salvo el nombre de la hoja. */
  label(): string {
    return this.isCertain() ? this.exactLabel() : `${this.exactLabel()}${UNCERTAIN_SUFFIX}`;
  }

  isCertain(): boolean {
    return this.confidence === CERTAIN_CONFIDENCE;
  }

  /** Ubicación que abarca esta y `next` (contiguas, misma unidad). La confianza resultante es la menor de ambas. */
  mergeWith(next: SourceLocation): SourceLocation {
    if (next.groupKey() !== this.groupKey()) {
      throw new RangeError('No se unen ubicaciones distintas en un fragmento (RN-3)');
    }
    // Igual `groupKey()` implica igual subclase: la clave empieza por el tipo de la ubicación.
    return this.extendTo(next as this, Math.min(this.confidence, next.confidence));
  }

  toJson(): SourceLocationJson {
    return { tipo: this.type, ...this.fields(), confianza: this.confidence };
  }

  protected abstract readonly type: SourceLocationType;
  protected abstract exactLabel(): string;
  protected abstract fields(): Readonly<Record<string, string | number>>;
  protected abstract extendTo(next: this, confidence: number): SourceLocation;
}

/** «párrafo 3» o «párrafos 3–5»; igual para líneas. */
export function rangeLabel(
  [singular, plural]: readonly [string, string],
  from: number,
  to: number,
): string {
  return from === to ? `${singular} ${from}` : `${plural} ${from}–${to}`;
}
