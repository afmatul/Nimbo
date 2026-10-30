import { DocxLocation } from './docx-location';
import { PdfLocation } from './pdf-location';
import { SheetLocation } from './sheet-location';
import { SlideLocation } from './slide-location';
import type { SourceLocation, SourceLocationType } from './source-location';
import { TextLocation } from './text-location';

type JsonObject = Readonly<Record<string, unknown>>;
type Builder = (json: JsonObject, confidence: number) => SourceLocation;

function numberField(json: JsonObject, key: string): number {
  const value = json[key];
  if (typeof value !== 'number') throw new RangeError(`${key} debe ser un número`);
  return value;
}

function stringField(json: JsonObject, key: string): string {
  const value = json[key];
  if (typeof value !== 'string') throw new RangeError(`${key} debe ser un texto`);
  return value;
}

/** `[desde, hasta]` de un rango guardado; `hasta` menor que `desde` no es una ubicación. */
function rangeFields(json: JsonObject, fromKey: string, toKey: string): readonly [number, number] {
  const from = numberField(json, fromKey);
  const to = numberField(json, toKey);
  if (to < from) throw new RangeError(`${toKey} no puede ser menor que ${fromKey}`);
  return [from, to];
}

function docx(json: JsonObject, confidence: number): SourceLocation {
  const section = numberField(json, 'seccion');
  const [from, to] = rangeFields(json, 'parrafoDesde', 'parrafoHasta');
  const first = DocxLocation.paragraph(section, from, confidence);
  return first.mergeWith(DocxLocation.paragraph(section, to, confidence));
}

function text(json: JsonObject, confidence: number): SourceLocation {
  const [from, to] = rangeFields(json, 'lineaDesde', 'lineaHasta');
  return TextLocation.line(from, confidence).mergeWith(TextLocation.line(to, confidence));
}

/** Una por tipo, con las claves que escribe `toJson()` de cada subclase (019). */
const BUILDERS: Readonly<Record<SourceLocationType, Builder>> = {
  pdf: (json, confidence) => PdfLocation.page(numberField(json, 'pagina'), confidence),
  docx,
  texto: text,
  xlsx: (json, confidence) => SheetLocation.sheet(stringField(json, 'hoja'), confidence),
  pptx: (json, confidence) => SlideLocation.slide(numberField(json, 'numero'), confidence),
};

function isJsonObject(json: unknown): json is JsonObject {
  return typeof json === 'object' && json !== null && !Array.isArray(json);
}

function builderFor(json: JsonObject): Builder | undefined {
  const type = json['tipo'];
  return typeof type === 'string' && Object.hasOwn(BUILDERS, type)
    ? BUILDERS[type as SourceLocationType]
    : undefined;
}

/**
 * Rehidrata `fragmento.procedencia` (plan 020 D-5, RN-6): la inversa de `SourceLocation.toJson()`. Vive aparte de
 * `source-location.ts` para no crear un ciclo con las subclases. Devuelve `undefined` si el JSON no es una ubicación
 * válida: quien recupera descarta ese fragmento y lo cuenta en la bitácora, nunca lo cita con una ubicación inventada.
 */
export function sourceLocationFromJson(json: unknown): SourceLocation | undefined {
  if (!isJsonObject(json)) return undefined;
  const build = builderFor(json);
  if (build === undefined) return undefined;
  try {
    return build(json, numberField(json, 'confianza'));
  } catch (error) {
    if (error instanceof RangeError) return undefined;
    throw error;
  }
}
