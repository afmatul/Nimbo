import { Test } from '@nestjs/testing';

import { ExtractorRegistry } from '../../application/extractor-registry';
import {
  I_TEXT_EXTRACTORS,
  type ITextExtractor,
} from '../../application/ports/i-text-extractor.port';

import { EXTRACTOR_PROVIDERS, ghostscriptConfigProvider } from './extractors.providers';
import { PdfExtractor } from './pdf.extractor';

const PDF = Buffer.from('%PDF-1.7\n%%EOF', 'latin1');

const compile = (bin: string | null) =>
  Test.createTestingModule({
    providers: [...EXTRACTOR_PROVIDERS, ghostscriptConfigProvider(bin)],
  }).compile();

describe('EXTRACTOR_PROVIDERS', () => {
  it('CA-1, CA-2, CA-3, CA-6: arma el registro con `.docx`, `.pdf` y texto; imágenes y «otros» no son indexables', async () => {
    const registry = (await compile('gs')).get(ExtractorRegistry);

    expect(registry.supports('docx')).toBe(true);
    expect(registry.supports('pdf')).toBe(true);
    expect(registry.supports('texto')).toBe(true);
    expect(registry.supports('imagen')).toBe(false);
    expect(registry.supports('otro')).toBe(false);
  });

  it('sin Ghostscript (api): sabe que el PDF es indexable, pero extraer falla sin llamar a ningún binario', async () => {
    const moduleRef = await compile(null);
    const extractors = moduleRef.get<readonly ITextExtractor[]>(I_TEXT_EXTRACTORS);

    expect(moduleRef.get(ExtractorRegistry).supports('pdf')).toBe(true);
    expect(extractors.some((extractor) => extractor instanceof PdfExtractor)).toBe(true);
    await expect(moduleRef.get(PdfExtractor).extract(PDF)).rejects.toThrow(
      /Ghostscript no está configurado/,
    );
  });
});
