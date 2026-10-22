import {
  CERTAIN_CONFIDENCE,
  SourceLocation,
  rangeLabel,
  requireInteger,
  type SourceLocationType,
} from './source-location';

const LINE_WORDS = ['Línea', 'Líneas'] as const;

/** Ubicación en un `.txt`/`.md` (CA-3): rango de líneas, desde 1. Todo el archivo es una sola unidad de agrupación. */
export class TextLocation extends SourceLocation {
  protected readonly type: SourceLocationType = 'texto';

  private constructor(
    readonly lines: Readonly<{ from: number; to: number }>,
    confidence: number,
  ) {
    super(confidence);
    requireInteger(lines.from, 1, 'La línea');
    Object.freeze(this);
  }

  static line(line: number, confidence = CERTAIN_CONFIDENCE): TextLocation {
    return new TextLocation({ from: line, to: line }, confidence);
  }

  groupKey(): string {
    return this.type;
  }

  protected exactLabel(): string {
    return rangeLabel(LINE_WORDS, this.lines.from, this.lines.to);
  }

  protected fields(): Readonly<Record<string, number>> {
    return { lineaDesde: this.lines.from, lineaHasta: this.lines.to };
  }

  protected extendTo(next: this, confidence: number): TextLocation {
    return new TextLocation({ from: this.lines.from, to: next.lines.to }, confidence);
  }
}
