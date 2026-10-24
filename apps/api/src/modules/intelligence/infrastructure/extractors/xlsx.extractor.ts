import { Injectable } from '@nestjs/common';

import type { ITextExtractor } from '../../application/ports/i-text-extractor.port';
import { NotIndexableError } from '../../domain/errors';
import type { Segment } from '../../domain/segment';
import { SheetLocation } from '../../domain/sheet-location';

import {
  OoxmlPackage,
  attributeOf,
  childNamed,
  childrenNamed,
  elementText,
  relationshipsPathOf,
  rootNamed,
  type OoxmlRelationship,
  type XmlNode,
} from './ooxml-reader';

const WORKBOOK_PART = 'xl/workbook.xml';
const SHARED_STRINGS_PART = 'xl/sharedStrings.xml';
/** Excel, LibreOffice y Google escriben las hojas aquí; una hoja fuera de esta carpeta es `formato_no_soportado`. */
const WORKSHEET_PARTS = /^xl\/worksheets\/[^/]+\.xml$/;
/** Tipo de relación de una hoja de cálculo (sufijo común a OOXML transicional y estricto); los gráficos no. */
const WORKSHEET_RELATIONSHIP = /\/worksheet$/;
const CELL_SEPARATOR = '\t';
const ROW_SEPARATOR = '\n';

/** Hoja del libro con su nombre visible y la ruta de su parte. */
interface SheetRef {
  readonly name: string;
  readonly path: string;
}

const hasText = (text: string): boolean => text.trim().length > 0;

/** Texto enriquecido (`si` o `is`): su `t` directo o el de cada corrida `r`, sin la fonética (`rPh`). */
function richText(node: XmlNode | undefined): string {
  const runs = childrenNamed(node, 'r').map((run) => childNamed(run, 't'));
  return [...childrenNamed(node, 't'), ...runs].map((text) => elementText(text)).join('');
}

function sharedStrings(xlsx: OoxmlPackage): readonly string[] {
  const part = xlsx.optionalPart(SHARED_STRINGS_PART);
  const root = part === undefined ? undefined : rootNamed(part, 'sst');
  return childrenNamed(root, 'si').map((item) => richText(item));
}

/** Valor visible de una celda: cadena compartida, en línea o el valor tal cual (números, fórmulas, booleanos). */
function cellText(cell: XmlNode, shared: readonly string[]): string {
  const type = attributeOf(cell, 't');
  if (type === 'inlineStr') return richText(childNamed(cell, 'is'));
  const value = elementText(childNamed(cell, 'v'));
  if (type !== 's') return value;
  const text = shared[Number(value)];
  if (text === undefined) throw new NotIndexableError('formato_no_soportado');
  return text;
}

/** Texto de una hoja: celdas con texto separadas por tabulador, filas con texto separadas por salto de línea. */
function sheetText(xlsx: OoxmlPackage, sheet: SheetRef, shared: readonly string[]): string {
  const sheetData = childNamed(xlsx.root(sheet.path, 'worksheet'), 'sheetData');
  const rowText = (row: XmlNode): string =>
    childrenNamed(row, 'c')
      .map((cell) => cellText(cell, shared))
      .filter(hasText)
      .join(CELL_SEPARATOR);
  return childrenNamed(sheetData, 'row').map(rowText).filter(hasText).join(ROW_SEPARATOR);
}

/** Hoja de cálculo del elemento `sheet`, o `null` si es de gráfico; sin nombre o sin relación, el libro está dañado. */
function sheetRef(
  sheet: XmlNode,
  relationships: ReadonlyMap<string, OoxmlRelationship>,
): SheetRef | null {
  const name = attributeOf(sheet, 'name');
  const relationship = relationships.get(attributeOf(sheet, 'r:id') ?? '');
  if (!name || relationship === undefined) throw new NotIndexableError('formato_no_soportado');
  return WORKSHEET_RELATIONSHIP.test(relationship.type) ? { name, path: relationship.path } : null;
}

/** Hojas de cálculo en el orden del libro. */
function worksheetRefs(xlsx: OoxmlPackage): readonly SheetRef[] {
  const sheets = childNamed(xlsx.root(WORKBOOK_PART, 'workbook'), 'sheets');
  const relationships = xlsx.relationships(WORKBOOK_PART);
  return childrenNamed(sheets, 'sheet')
    .map((sheet) => sheetRef(sheet, relationships))
    .filter((sheet): sheet is SheetRef => sheet !== null);
}

/**
 * Extractor de `.xlsx` (CA-6, RN-2): cada hoja con texto es un segmento ubicado por su nombre, en el orden del libro;
 * nunca mezcla hojas. Resuelve las cadenas compartidas; los números salen como los guarda el archivo (sin formato) y
 * las celdas sin texto no dejan tabuladores de más.
 */
@Injectable()
export class XlsxExtractor implements ITextExtractor {
  readonly kind = 'xlsx';

  extract(content: Buffer): Promise<readonly Segment[]> {
    return Promise.resolve().then(() => this.read(content));
  }

  private read(content: Buffer): readonly Segment[] {
    const xlsx = OoxmlPackage.read(content, [
      WORKBOOK_PART,
      relationshipsPathOf(WORKBOOK_PART),
      SHARED_STRINGS_PART,
      WORKSHEET_PARTS,
    ]);
    const shared = sharedStrings(xlsx);
    return worksheetRefs(xlsx)
      .map((sheet) => ({ sheet, text: sheetText(xlsx, sheet, shared) }))
      .filter(({ text }) => hasText(text))
      .map(({ sheet, text }) => ({ text, location: SheetLocation.sheet(sheet.name) }));
  }
}
