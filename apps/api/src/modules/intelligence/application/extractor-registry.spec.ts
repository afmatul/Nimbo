import type { FileKind } from '@nimbo/contracts';

import { NotIndexableError } from '../domain/errors';

import { ExtractorRegistry } from './extractor-registry';
import type { ITextExtractor } from './ports/i-text-extractor.port';

const extractorFor = (kind: FileKind): ITextExtractor => ({
  kind,
  extract: () => Promise.resolve([]),
});

describe('ExtractorRegistry', () => {
  const docx = extractorFor('docx');
  const text = extractorFor('texto');
  const registry = new ExtractorRegistry([docx, text]);

  it('CA-1, CA-3: dice que soporta los tipos registrados', () => {
    expect(registry.supports('docx')).toBe(true);
    expect(registry.supports('texto')).toBe(true);
  });

  it.each<FileKind>(['imagen', 'otro', 'pdf'])(
    'CA-6: `%s` no se soporta si no tiene extractor (no entra a la cola)',
    (kind) => {
      expect(registry.supports(kind)).toBe(false);
    },
  );

  it('entrega el extractor de cada tipo', () => {
    expect(registry.forKind('docx')).toBe(docx);
    expect(registry.forKind('texto')).toBe(text);
  });

  it('CA-5: un tipo sin extractor es `formato_no_soportado`', () => {
    const forImage = (): unknown => registry.forKind('imagen');

    expect(forImage).toThrow(NotIndexableError);
    expect(forImage).toThrow(expect.objectContaining({ reason: 'formato_no_soportado' }));
  });

  it('rechaza dos extractores para el mismo tipo', () => {
    expect(() => new ExtractorRegistry([docx, extractorFor('docx')])).toThrow(/docx/);
  });
});
