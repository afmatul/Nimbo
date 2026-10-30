import { buildZip, declareUncompressedSize } from '../../../../../test/support/docx-fixture';
import { buildPptx } from '../../../../../test/support/pptx-fixture';
import type { Segment } from '../../domain/segment';

import { OOXML_MAX_UNCOMPRESSED_BYTES } from './ooxml-reader';
import { PptxExtractor } from './pptx.extractor';

const extractor = new PptxExtractor();

const cited = (segments: readonly Segment[]): [string, string][] =>
  segments.map((segment) => [segment.text, segment.location.label()]);

describe('PptxExtractor (CA-6)', () => {
  it('lee `.pptx`', () => {
    expect(extractor.kind).toBe('pptx');
  });

  it('CA-6, RN-2: una diapositiva = un segmento; párrafos y formas separados por salto de línea', async () => {
    const pptx = buildPptx([{ shapes: [['Título'], ['Primer punto', 'Segundo punto & más']] }]);

    expect(cited(await extractor.extract(pptx))).toEqual([
      ['Título\nPrimer punto\nSegundo punto & más', 'Diapositiva 1'],
    ]);
  });

  it('CA-6: numera por el orden de `presentation.xml`, no por el nombre del archivo', async () => {
    const pptx = buildPptx(
      [
        { shapes: [['Archivo uno']] },
        { shapes: [['Archivo dos']] },
        { shapes: [['Archivo tres']] },
      ],
      [2, 0, 1],
    );

    expect(cited(await extractor.extract(pptx))).toEqual([
      ['Archivo tres', 'Diapositiva 1'],
      ['Archivo uno', 'Diapositiva 2'],
      ['Archivo dos', 'Diapositiva 3'],
    ]);
  });

  it('CA-6: sin imágenes ni notas del orador; las tablas sí son texto', async () => {
    const pptx = buildPptx([
      {
        shapes: [['Resultados']],
        table: [['Mes', 'Monto']],
        pictureDescription: 'Logotipo de la empresa',
        notes: 'Recordar mencionar el bono',
      },
    ]);

    expect((await extractor.extract(pptx)).map((segment) => segment.text)).toEqual([
      'Resultados\nMes\nMonto',
    ]);
  });

  it('una diapositiva sin texto no crea segmento, pero conserva la numeración de las siguientes', async () => {
    const pptx = buildPptx([
      { shapes: [], pictureDescription: 'Solo una foto' },
      { shapes: [['', '  ']] },
      { shapes: [['Cierre']] },
    ]);

    expect(cited(await extractor.extract(pptx))).toEqual([['Cierre', 'Diapositiva 3']]);
  });

  it.each([
    ['no es un zip', Buffer.from('esto no es un pptx')],
    ['zip sin `ppt/presentation.xml`', buildZip({ 'word/document.xml': '<w:document/>' })],
    [
      'presentación sin relaciones',
      buildZip({ 'ppt/presentation.xml': '<p:presentation><p:sldIdLst/></p:presentation>' }),
    ],
    ['XML dañado', buildZip({ 'ppt/presentation.xml': '<p:presentation></p:sld>' })],
  ])('CA-5: %s → `formato_no_soportado`', async (_case, content) => {
    await expect(extractor.extract(content)).rejects.toMatchObject({
      name: 'NotIndexableError',
      reason: 'formato_no_soportado',
    });
  });

  it('CA-7: una presentación que declara más bytes descomprimidos que el tope es `demasiado_grande` (bomba)', async () => {
    const bomb = declareUncompressedSize(
      buildPptx([{ shapes: [['x']] }]),
      OOXML_MAX_UNCOMPRESSED_BYTES + 1,
    );

    await expect(extractor.extract(bomb)).rejects.toMatchObject({
      name: 'NotIndexableError',
      reason: 'demasiado_grande',
    });
  });
});
