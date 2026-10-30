import { zipSync } from 'fflate';

import {
  buildDocx,
  buildZip,
  declareUncompressedSize,
} from '../../../../../test/support/docx-fixture';
import type { Segment } from '../../domain/segment';

import { DocxExtractor } from './docx.extractor';
import { OOXML_MAX_UNCOMPRESSED_BYTES } from './ooxml-reader';

const extractor = new DocxExtractor();
const NOT_UTF8_XML = new Uint8Array([...Buffer.from('<a>'), 0xff, ...Buffer.from('</a>')]);

const cited = (segments: readonly Segment[]): [string, string][] =>
  segments.map((segment) => [segment.text, segment.location.label()]);

describe('DocxExtractor (D-3)', () => {
  it('lee `.docx`', () => {
    expect(extractor.kind).toBe('docx');
  });

  it('CA-1, D-3: los encabezados H1–H3 abren sección; los párrafos previos son la sección 0', async () => {
    const docx = buildDocx([
      { text: 'Portada' },
      { text: 'Resumen ejecutivo' },
      { heading: 1, text: 'Introducción' },
      { text: 'Primer párrafo' },
      { heading: 2, text: 'Alcance' },
      { text: 'Segundo párrafo' },
      { heading: 3, text: 'Detalle' },
    ]);

    expect(cited(await extractor.extract(docx))).toEqual([
      ['Portada', 'Inicio del documento, párrafo 1'],
      ['Resumen ejecutivo', 'Inicio del documento, párrafo 2'],
      ['Introducción', 'Sección 1, párrafo 1'],
      ['Primer párrafo', 'Sección 1, párrafo 2'],
      ['Alcance', 'Sección 2, párrafo 1'],
      ['Segundo párrafo', 'Sección 2, párrafo 2'],
      ['Detalle', 'Sección 3, párrafo 1'],
    ]);
  });

  it('D-3: un H4 no abre sección', async () => {
    const docx = buildDocx([
      { heading: 1, text: 'Uno' },
      { heading: 4, text: 'Menor' },
    ]);

    expect(cited(await extractor.extract(docx))).toEqual([
      ['Uno', 'Sección 1, párrafo 1'],
      ['Menor', 'Sección 1, párrafo 2'],
    ]);
  });

  it('D-3: el nivel de esquema 0–2 del párrafo también abre sección; el 3, no', async () => {
    const docx = buildDocx([
      { outlineLevel: 0, text: 'Capítulo' },
      { outlineLevel: 3, text: 'Nota' },
    ]);

    expect(cited(await extractor.extract(docx))).toEqual([
      ['Capítulo', 'Sección 1, párrafo 1'],
      ['Nota', 'Sección 1, párrafo 2'],
    ]);
  });

  it('CA-1: une las corridas de un párrafo y conserva tabuladores y saltos', async () => {
    const docx = buildDocx([{ text: ['Hola ', 'mundo', '\tcon tab\ny salto & más'] }]);

    expect((await extractor.extract(docx)).map((segment) => segment.text)).toEqual([
      'Hola mundo\tcon tab\ny salto & más',
    ]);
  });

  it('CA-1: no numera los párrafos vacíos y lee las celdas de las tablas en orden', async () => {
    const docx = buildDocx([
      { text: '' },
      { text: 'Antes de la tabla' },
      {
        table: [
          ['A1', 'B1'],
          ['A2', ''],
        ],
      },
    ]);

    expect(cited(await extractor.extract(docx))).toEqual([
      ['Antes de la tabla', 'Inicio del documento, párrafo 1'],
      ['A1', 'Inicio del documento, párrafo 2'],
      ['B1', 'Inicio del documento, párrafo 3'],
      ['A2', 'Inicio del documento, párrafo 4'],
    ]);
  });

  it('un documento sin texto no da segmentos', async () => {
    expect(await extractor.extract(buildDocx([{ text: '' }]))).toEqual([]);
  });

  it.each([
    ['no es un zip', Buffer.from('esto no es un docx')],
    ['zip sin `word/document.xml`', buildZip({ 'xl/workbook.xml': '<workbook/>' })],
    ['XML dañado', buildZip({ 'word/document.xml': '<w:document><w:body></w:document>' })],
    ['XML que no es UTF-8', Buffer.from(zipSync({ 'word/document.xml': NOT_UTF8_XML }))],
  ])('CA-5: %s → `formato_no_soportado`', async (_case, content) => {
    await expect(extractor.extract(content)).rejects.toMatchObject({
      name: 'NotIndexableError',
      reason: 'formato_no_soportado',
    });
  });

  it('CA-7: un paquete que declara más bytes descomprimidos que el tope es `demasiado_grande` (bomba)', async () => {
    const bomb = declareUncompressedSize(
      buildDocx([{ text: 'x' }]),
      OOXML_MAX_UNCOMPRESSED_BYTES + 1,
    );

    await expect(extractor.extract(bomb)).rejects.toMatchObject({
      name: 'NotIndexableError',
      reason: 'demasiado_grande',
    });
  });
});
