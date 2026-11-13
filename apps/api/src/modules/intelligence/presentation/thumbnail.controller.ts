import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import type { FileThumbnailResponse } from '@nimbo/contracts';

import { CurrentActor, Role, Roles } from '../../../shared';
import type { Actor } from '../../../shared';
import { NodeNotFoundError } from '../../storage';
import { ThumbnailService } from '../application/thumbnail.service';

/** `:fileId` que no es UUID: el mismo 404 que un archivo inexistente, ajeno o en la papelera (sin oráculo). */
const fileIdPipe = (): ParseUUIDPipe =>
  new ParseUUIDPipe({ exceptionFactory: () => new NodeNotFoundError() });

/**
 * Extracto de texto de un `.docx` para su miniatura (`GET /files/:fileId/thumbnail`). Solo `CLIENT`: un rol interno
 * recibe `SHARED_FORBIDDEN` antes de tocar el archivo (nunca ve contenido). Sin auditoría: no es una descarga.
 */
@Roles(Role.CLIENT)
@Controller('files/:fileId/thumbnail')
export class ThumbnailController {
  constructor(private readonly thumbnails: ThumbnailService) {}

  @Get()
  async get(
    @CurrentActor() actor: Actor,
    @Param('fileId', fileIdPipe()) fileId: string,
  ): Promise<FileThumbnailResponse> {
    return { text: await this.thumbnails.excerptOf(actor, fileId) };
  }
}
