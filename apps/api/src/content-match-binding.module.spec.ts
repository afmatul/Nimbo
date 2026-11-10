import { Test } from '@nestjs/testing';

import { ContentMatchBindingModule } from './content-match-binding.module';
import { SqlContentMatchReader } from './modules/intelligence';
import { I_CONTENT_MATCH_READER } from './modules/storage';
import type { IContentMatchReader } from './modules/storage';

describe('ContentMatchBindingModule', () => {
  it('018b D-1: enlaza I_CONTENT_MATCH_READER con SqlContentMatchReader de `intelligence`', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ContentMatchBindingModule],
    }).compile();
    const reader = moduleRef.get<IContentMatchReader>(I_CONTENT_MATCH_READER);

    expect(reader).toBeInstanceOf(SqlContentMatchReader);
    await moduleRef.close();
  });
});
