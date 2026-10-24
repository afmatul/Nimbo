import {
  CERTAIN_CONFIDENCE,
  SourceLocation,
  requireInteger,
  type SourceLocationType,
} from './source-location';

/** Ubicación en un `.pdf` (CA-2): una página, desde 1. Un fragmento nunca cruza de página. */
export class PdfLocation extends SourceLocation {
  protected readonly type: SourceLocationType = 'pdf';

  private constructor(
    readonly pageNumber: number,
    confidence: number,
  ) {
    super(confidence);
    requireInteger(pageNumber, 1, 'La página');
    Object.freeze(this);
  }

  static page(pageNumber: number, confidence = CERTAIN_CONFIDENCE): PdfLocation {
    return new PdfLocation(pageNumber, confidence);
  }

  groupKey(): string {
    return `${this.type}:${this.pageNumber}`;
  }

  protected exactLabel(): string {
    return `Página ${this.pageNumber}`;
  }

  protected fields(): Readonly<Record<string, number>> {
    return { pagina: this.pageNumber };
  }

  protected extendTo(_next: this, confidence: number): PdfLocation {
    return new PdfLocation(this.pageNumber, confidence);
  }
}
