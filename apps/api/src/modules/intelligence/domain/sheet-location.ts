import { CERTAIN_CONFIDENCE, SourceLocation, type SourceLocationType } from './source-location';

/** Ubicación en un `.xlsx` (CA-6): la hoja, por su nombre visible. Un fragmento nunca cruza de hoja. */
export class SheetLocation extends SourceLocation {
  protected readonly type: SourceLocationType = 'xlsx';

  private constructor(
    readonly sheetName: string,
    confidence: number,
  ) {
    super(confidence);
    if (sheetName.length === 0) throw new RangeError('La hoja debe tener nombre');
    Object.freeze(this);
  }

  static sheet(sheetName: string, confidence = CERTAIN_CONFIDENCE): SheetLocation {
    return new SheetLocation(sheetName, confidence);
  }

  groupKey(): string {
    return `${this.type}:${this.sheetName}`;
  }

  protected exactLabel(): string {
    return `Hoja «${this.sheetName}»`;
  }

  protected fields(): Readonly<Record<string, string>> {
    return { hoja: this.sheetName };
  }

  protected extendTo(_next: this, confidence: number): SheetLocation {
    return new SheetLocation(this.sheetName, confidence);
  }
}
