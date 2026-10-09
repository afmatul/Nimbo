import type { DynamicModule } from '@nestjs/common';

import { StorageModule } from '..';

import { PREVIEW_CONFIG } from './application/preview-config';
import { PreviewService } from './application/preview.service';
import { PreviewController } from './presentation/preview.controller';
import { PreviewModule } from './preview.module';

describe('PreviewModule', () => {
  it('CA-11: registra preview usando exactamente el descriptor de storage recibido', () => {
    const storageModule = {
      module: StorageModule,
    } satisfies DynamicModule;

    const config = {
      previewUrlPerMinute: 120,
    };

    const descriptor = PreviewModule.register({
      storageModule,
      config,
    });

    expect(descriptor.imports).toEqual([storageModule]);
    expect(descriptor.imports?.[0]).toBe(storageModule);
    expect(descriptor.controllers).toEqual([PreviewController]);
    expect(descriptor.providers).toEqual([
      {
        provide: PREVIEW_CONFIG,
        useValue: config,
      },
      PreviewService,
    ]);
  });
});
