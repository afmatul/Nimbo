import { Test } from '@nestjs/testing';

import { ExtractorRegistry } from '../../application/extractor-registry';

import { EXTRACTOR_PROVIDERS } from './extractors.providers';

describe('EXTRACTOR_PROVIDERS', () => {
  it('CA-1, CA-3, CA-6: arma el registro con `.docx` y texto; imágenes y «otros» no son indexables', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [...EXTRACTOR_PROVIDERS],
    }).compile();
    const registry = moduleRef.get(ExtractorRegistry);

    expect(registry.supports('docx')).toBe(true);
    expect(registry.supports('texto')).toBe(true);
    expect(registry.supports('imagen')).toBe(false);
    expect(registry.supports('otro')).toBe(false);
  });
});
