import { buildZip, declareUncompressedSize } from '../../../../../test/support/docx-fixture';
import { buildXlsx } from '../../../../../test/support/xlsx-fixture';
import type { Segment } from '../../domain/segment';

import { OOXML_MAX_UNCOMPRESSED_BYTES } from './ooxml-reader';
import { XlsxExtractor } from './xlsx.extractor';

const extractor = new XlsxExtractor();

const cited = (segments: readonly Segment[]): [string, string][] =>
  segments.map((segment) => [segment.text, segment.location.label()]);

const RELS_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const ONE_SHEET_WORKBOOK = `<workbook xmlns:r="${R_NS}"><sheets><sheet name="H" r:id="rId1"/></sheets></workbook>`;

/** Relaciones del libro con una sola hoja `rId1` del tipo y destino dados. */
const workbookRels = (type: string, target: string): string =>
  `<Relationships xmlns="${RELS_NS}"><Relationship Id="rId1" Type="${R_NS}/${type}" Target="${target}"/></Relationships>`;

describe('XlsxExtractor (CA-6)', () => {
  it('lee `.xlsx`', () => {
    expect(extractor.kind).toBe('xlsx');
  });

  it('CA-6, RN-2: una hoja = un segmento con su nombre; celdas con tabulador y filas con salto de línea', async () => {
    const xlsx = buildXlsx([
      {
        name: 'Ventas 2026',
        rows: [
          ['Mes', 'Monto'],
          ['Enero', 1500.5],
        ],
      },
    ]);

    expect(cited(await extractor.extract(xlsx))).toEqual([
      ['Mes\tMonto\nEnero\t1500.5', 'Hoja «Ventas 2026»'],
    ]);
  });

  it('CA-6: resuelve las cadenas compartidas y las cadenas en línea', async () => {
    const xlsx = buildXlsx([
      { name: 'Datos', rows: [['repetido', { inline: 'en línea & más' }, 'repetido']] },
    ]);

    expect((await extractor.extract(xlsx)).map((segment) => segment.text)).toEqual([
      'repetido\ten línea & más\trepetido',
    ]);
  });

  it('CA-6: nunca mezcla hojas, respeta el orden del libro y una hoja vacía no crea segmentos', async () => {
    const xlsx = buildXlsx([
      { name: 'Resumen', rows: [['Total', 42]] },
      { name: 'Vacía', rows: [] },
      { name: 'Solo blancos', rows: [[null, '  '], []] },
      { name: 'Detalle', rows: [['A'], [], ['B']] },
    ]);

    expect(cited(await extractor.extract(xlsx))).toEqual([
      ['Total\t42', 'Hoja «Resumen»'],
      ['A\nB', 'Hoja «Detalle»'],
    ]);
  });

  it('omite las celdas sin texto dentro de una fila', async () => {
    const xlsx = buildXlsx([{ name: 'Hoja1', rows: [['A', null, '', 'D']] }]);

    expect((await extractor.extract(xlsx)).map((segment) => segment.text)).toEqual(['A\tD']);
  });

  it('un libro sin texto no da segmentos', async () => {
    expect(await extractor.extract(buildXlsx([{ name: 'Hoja1', rows: [] }]))).toEqual([]);
  });

  it('una hoja de gráfico (chartsheet) no se lee ni rompe el libro', async () => {
    const xlsx = buildZip({
      'xl/workbook.xml': ONE_SHEET_WORKBOOK,
      'xl/_rels/workbook.xml.rels': workbookRels('chartsheet', 'chartsheets/sheet1.xml'),
    });

    expect(await extractor.extract(xlsx)).toEqual([]);
  });

  it('acepta destinos absolutos en las relaciones del libro', async () => {
    const xlsx = buildZip({
      'xl/workbook.xml': ONE_SHEET_WORKBOOK,
      'xl/_rels/workbook.xml.rels': workbookRels('worksheet', '/xl/worksheets/sheet1.xml'),
      'xl/worksheets/sheet1.xml':
        '<worksheet><sheetData><row><c><v>7</v></c></row></sheetData></worksheet>',
    });

    expect(cited(await extractor.extract(xlsx))).toEqual([['7', 'Hoja «H»']]);
  });

  it.each([
    ['no es un zip', Buffer.from('esto no es un xlsx')],
    ['zip sin `xl/workbook.xml`', buildZip({ 'word/document.xml': '<w:document/>' })],
    ['libro sin relaciones', buildZip({ 'xl/workbook.xml': ONE_SHEET_WORKBOOK })],
    [
      'hoja que apunta a una parte inexistente',
      buildZip({
        'xl/workbook.xml': ONE_SHEET_WORKBOOK,
        'xl/_rels/workbook.xml.rels': workbookRels('worksheet', 'worksheets/sheet1.xml'),
      }),
    ],
    [
      'cadena compartida fuera de rango',
      buildZip({
        'xl/workbook.xml': ONE_SHEET_WORKBOOK,
        'xl/_rels/workbook.xml.rels': workbookRels('worksheet', 'worksheets/sheet1.xml'),
        'xl/worksheets/sheet1.xml':
          '<worksheet><sheetData><row><c t="s"><v>7</v></c></row></sheetData></worksheet>',
      }),
    ],
    ['XML dañado', buildZip({ 'xl/workbook.xml': '<workbook><sheets></workbook>' })],
  ])('CA-5: %s → `formato_no_soportado`', async (_case, content) => {
    await expect(extractor.extract(content)).rejects.toMatchObject({
      name: 'NotIndexableError',
      reason: 'formato_no_soportado',
    });
  });

  it('CA-7: un libro que declara más bytes descomprimidos que el tope es `demasiado_grande` (bomba)', async () => {
    const bomb = declareUncompressedSize(
      buildXlsx([{ name: 'H', rows: [['x']] }]),
      OOXML_MAX_UNCOMPRESSED_BYTES + 1,
    );

    await expect(extractor.extract(bomb)).rejects.toMatchObject({
      name: 'NotIndexableError',
      reason: 'demasiado_grande',
    });
  });
});
