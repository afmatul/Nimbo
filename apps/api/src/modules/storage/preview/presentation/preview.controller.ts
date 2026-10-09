import { Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import type { PreviewUrlResponse } from '@nimbo/contracts';

import { CurrentActor, Role, Roles } from '../../../../shared';
import type { Actor } from '../../../../shared';
import { PreviewService } from '../application/preview.service';

import { previewFileIdPipe } from './preview-validation';

@Roles(Role.CLIENT)
@Controller('files')
export class PreviewController {
  constructor(private readonly preview: PreviewService) {}

  @Post(':fileId/preview-url')
  @HttpCode(HttpStatus.OK)
  async issueUrl(
    @CurrentActor() actor: Actor,
    @Param('fileId', previewFileIdPipe()) fileId: string,
  ): Promise<PreviewUrlResponse> {
    const { file, url, expiresAt } = await this.preview.issueUrl(actor, fileId);

    return {
      file: {
        id: file.id,
        name: file.name,
        sizeBytes: file.sizeBytes,
        kind: file.kind,
        folderId: file.folderId,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
      },
      url,
      expiresAt: expiresAt.toISOString(),
    };
  }
}
