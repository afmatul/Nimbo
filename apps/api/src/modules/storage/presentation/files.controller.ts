import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { listFilesQuerySchema } from '@nimbo/contracts';
import type { DownloadUrlResponse, ListFilesQuery, ListFilesResponse } from '@nimbo/contracts';

import { CurrentActor, Role, Roles, ZodValidationPipe } from '../../../shared';
import type { Actor } from '../../../shared';
import { toFileSummary } from '../application/file-summary';
import { FileService } from '../application/file.service';

import { nodeIdPipe, storageQueryValidationError } from './storage-validation';

/**
 * Archivos del actor (plan §5): listado paginado de la raíz y URL de descarga de 300 s. Solo `CLIENT` (CA-17). Mapea
 * `File` a `FileSummary` (sin clave de objeto ni ids de versión) y las fechas a ISO 8601.
 */
@Roles(Role.CLIENT)
@Controller('files')
export class FilesController {
  constructor(private readonly files: FileService) {}

  @Get()
  async list(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(listFilesQuerySchema, storageQueryValidationError))
    query: ListFilesQuery,
  ): Promise<ListFilesResponse> {
    const { cursor, limit } = query;
    const page = await this.files.list(actor, cursor === undefined ? { limit } : { cursor, limit });
    return { items: page.items.map(toFileSummary), nextCursor: page.nextCursor };
  }

  @Post(':fileId/download-url')
  @HttpCode(HttpStatus.OK)
  async downloadUrl(
    @CurrentActor() actor: Actor,
    @Param('fileId', nodeIdPipe()) fileId: string,
  ): Promise<DownloadUrlResponse> {
    const { url, expiresAt } = await this.files.getDownloadUrl(actor, fileId);
    return { url, expiresAt: expiresAt.toISOString() };
  }
}
