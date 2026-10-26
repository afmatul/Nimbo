import {
  CERTAIN_CONFIDENCE,
  SourceLocation,
  rangeLabel,
  requireInteger,
  type SourceLocationType,
} from './source-location';

const PARAGRAPH_WORDS = ['párrafo', 'párrafos'] as const;
/** Sección de los párrafos anteriores al primer encabezado (D-3). */
export const DOCX_PREAMBLE_SECTION = 0;

/**
 * Ubicación en un `.docx` (D-3): sección = encabezado H1–H3 que la abre (0 antes del primero) y rango de párrafos
 * contados dentro de esa sección, desde 1.
 */
export class DocxLocation extends SourceLocation {
  protected readonly type: SourceLocationType = 'docx';

  private constructor(
    readonly section: number,
    readonly paragraphs: Readonly<{ from: number; to: number }>,
    confidence: number,
  ) {
    super(confidence);
    requireInteger(section, DOCX_PREAMBLE_SECTION, 'La sección');
    requireInteger(paragraphs.from, 1, 'El párrafo');
    Object.freeze(this);
  }

  static paragraph(
    section: number,
    paragraph: number,
    confidence = CERTAIN_CONFIDENCE,
  ): DocxLocation {
    return new DocxLocation(section, { from: paragraph, to: paragraph }, confidence);
  }

  groupKey(): string {
    return `${this.type}:${this.section}`;
  }

  protected exactLabel(): string {
    const section =
      this.section === DOCX_PREAMBLE_SECTION ? 'Inicio del documento' : `Sección ${this.section}`;
    return `${section}, ${rangeLabel(PARAGRAPH_WORDS, this.paragraphs.from, this.paragraphs.to)}`;
  }

  protected fields(): Readonly<Record<string, number>> {
    return {
      seccion: this.section,
      parrafoDesde: this.paragraphs.from,
      parrafoHasta: this.paragraphs.to,
    };
  }

  protected extendTo(next: this, confidence: number): DocxLocation {
    const paragraphs = { from: this.paragraphs.from, to: next.paragraphs.to };
    return new DocxLocation(this.section, paragraphs, confidence);
  }
}
