import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { moveFileSchema, renameFileSchema } from '@nimbo/contracts';
import type {
  DownloadUrlResponse,
  FileDetailResponse,
  FileSummary,
  MoveFileInput,
  RenameFileInput,
} from '@nimbo/contracts';

import { CurrentActor, Role, Roles, ZodValidationPipe } from '../../../shared';
import type { Actor } from '../../../shared';
import { toFileSummary } from '../application/file-summary';
import { FileService } from '../application/file.service';

import { nodeIdPipe, storageNodeValidationError } from './storage-validation';

/**
 * Archivos del actor: la ficha con su `accessLevel` (012 CA-12), renombrar y mover (006 plan §4) y la URL de descarga
 * de 300 s (005 plan §5). El listado está en `GET /folders/contents`. Solo `CLIENT` (CA-17). Mapea `File` a `FileSummary` (sin clave de objeto ni ids de versión)
 * y las fechas a ISO 8601.
 */
@Roles(Role.CLIENT)
@Controller('files')
export class FilesController {
  constructor(private readonly files: FileService) {}

  @Get(':fileId')
  async detail(
    @CurrentActor() actor: Actor,
    @Param('fileId', nodeIdPipe()) fileId: string,
  ): Promise<FileDetailResponse> {
    const { file, accessLevel } = await this.files.getDetail(actor, fileId);
    return { file: toFileSummary(file), accessLevel };
  }

  @Patch(':fileId')
  async rename(
    @CurrentActor() actor: Actor,
    @Param('fileId', nodeIdPipe()) fileId: string,
    @Body(new ZodValidationPipe(renameFileSchema, storageNodeValidationError))
    body: RenameFileInput,
  ): Promise<FileSummary> {
    return toFileSummary(await this.files.rename(actor, fileId, body));
  }

  @Post(':fileId/move')
  @HttpCode(HttpStatus.OK)
  async move(
    @CurrentActor() actor: Actor,
    @Param('fileId', nodeIdPipe()) fileId: string,
    @Body(new ZodValidationPipe(moveFileSchema, storageNodeValidationError))
    body: MoveFileInput,
  ): Promise<FileSummary> {
    return toFileSummary(await this.files.move(actor, fileId, body));
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
