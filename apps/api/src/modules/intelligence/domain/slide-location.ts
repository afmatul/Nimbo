import {
  CERTAIN_CONFIDENCE,
  SourceLocation,
  requireInteger,
  type SourceLocationType,
} from './source-location';

/** Ubicación en un `.pptx` (CA-6): número de diapositiva según el orden de `presentation.xml`, desde 1. */
export class SlideLocation extends SourceLocation {
  protected readonly type: SourceLocationType = 'pptx';

  private constructor(
    readonly slideNumber: number,
    confidence: number,
  ) {
    super(confidence);
    requireInteger(slideNumber, 1, 'La diapositiva');
    Object.freeze(this);
  }

  static slide(slideNumber: number, confidence = CERTAIN_CONFIDENCE): SlideLocation {
    return new SlideLocation(slideNumber, confidence);
  }

  groupKey(): string {
    return `${this.type}:${this.slideNumber}`;
  }

  protected exactLabel(): string {
    return `Diapositiva ${this.slideNumber}`;
  }

  protected fields(): Readonly<Record<string, number>> {
    return { numero: this.slideNumber };
  }

  protected extendTo(_next: this, confidence: number): SlideLocation {
    return new SlideLocation(this.slideNumber, confidence);
  }
}
