import type { Segment } from '../../domain/segment';

import { PlainTextExtractor } from './plain-text.extractor';

const extractor = new PlainTextExtractor();

const cited = (segments: readonly Segment[]): [string, string][] =>
  segments.map((segment) => [segment.text, segment.location.label()]);

describe('PlainTextExtractor', () => {
  it('lee `.txt` y `.md` (tipo `texto`)', () => {
    expect(extractor.kind).toBe('texto');
  });

  it('CA-3: una línea = un segmento con su número; las líneas en blanco cuentan pero no se emiten', async () => {
    const content = Buffer.from('# Título\n\nprimera\r\nsegunda\rtercera\n', 'utf8');

    expect(cited(await extractor.extract(content))).toEqual([
      ['# Título', 'Línea 1'],
      ['primera', 'Línea 3'],
      ['segunda', 'Línea 4'],
      ['tercera', 'Línea 5'],
    ]);
  });

  it('CA-3: quita el BOM de UTF-8', async () => {
    const content = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('año', 'utf8')]);

    expect(cited(await extractor.extract(content))).toEqual([['año', 'Línea 1']]);
  });

  it('un archivo vacío no da segmentos', async () => {
    expect(await extractor.extract(Buffer.alloc(0))).toEqual([]);
  });

  it.each([
    ['UTF-8 inválido', Buffer.from([0x61, 0xff, 0x62])],
    ['con NUL (binario)', Buffer.from('texto\u0000binario', 'utf8')],
  ])('CA-5: %s → `formato_no_soportado`', async (_case, content) => {
    await expect(extractor.extract(content)).rejects.toMatchObject({
      name: 'NotIndexableError',
      reason: 'formato_no_soportado',
    });
  });
});
