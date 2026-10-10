import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';

import { PREVIEW_CONFIG } from './application/preview-config';
import type { PreviewConfig } from './application/preview-config';
import { PreviewService } from './application/preview.service';
import { PreviewController } from './presentation/preview.controller';

export interface PreviewModuleOptions {
  readonly storageModule: DynamicModule;
  readonly config: PreviewConfig;
}

@Module({})
export class PreviewModule {
  static register(options: PreviewModuleOptions): DynamicModule {
    return {
      module: PreviewModule,
      imports: [options.storageModule],
      controllers: [PreviewController],
      providers: [
        {
          provide: PREVIEW_CONFIG,
          useValue: options.config,
        },
        PreviewService,
      ],
    };
  }
}
