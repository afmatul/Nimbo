import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import type {
  DownloadUrlResponse,
  FileVersionSummary,
  FileVersionsResponse,
} from '@nimbo/contracts';

import { CurrentActor, Role, Roles } from '../../../shared';
import type { Actor } from '../../../shared';
import { toFileVersionSummary } from '../application/file-version-summary';
import { FileService } from '../application/file.service';
import { VersionHistoryService } from '../application/version-history.service';
import { VersionRestoreService } from '../application/version-restore.service';

import { nodeIdPipe, versionIdPipe } from './storage-validation';

/**
 * Versiones de un archivo (plan 014 §4): el historial, la restauración y la URL de descarga de 300 s de una versión
 * retenida. Solo
 * `CLIENT` (CA-18). Mapea a `FileVersionSummary`, sin clave de objeto ni nombres de usuario (CA-6, CA-19).
 */
@Roles(Role.CLIENT)
@Controller('files/:fileId/versions')
export class FileVersionsController {
  constructor(
    private readonly history: VersionHistoryService,
    private readonly files: FileService,
    private readonly restorer: VersionRestoreService,
  ) {}

  @Get()
  async list(
    @CurrentActor() actor: Actor,
    @Param('fileId', nodeIdPipe()) fileId: string,
  ): Promise<FileVersionsResponse> {
    const { entries, currentVersionId, retainedVersions } = await this.history.list(actor, fileId);
    return {
      items: entries.map((entry) => toFileVersionSummary(entry, currentVersionId)),
      retainedVersions,
    };
  }

  /** `201` con la versión nueva, que ya es la actual (CA-9). */
  @Post(':versionId/restore')
  async restore(
    @CurrentActor() actor: Actor,
    @Param('fileId', nodeIdPipe()) fileId: string,
    @Param('versionId', versionIdPipe()) versionId: string,
  ): Promise<FileVersionSummary> {
    const entry = await this.restorer.restore(actor, fileId, versionId);
    return toFileVersionSummary(entry, entry.version.id);
  }

  @Post(':versionId/download-url')
  @HttpCode(HttpStatus.OK)
  async downloadUrl(
    @CurrentActor() actor: Actor,
    @Param('fileId', nodeIdPipe()) fileId: string,
    @Param('versionId', versionIdPipe()) versionId: string,
  ): Promise<DownloadUrlResponse> {
    const { url, expiresAt } = await this.files.getDownloadUrl(actor, fileId, versionId);
    return { url, expiresAt: expiresAt.toISOString() };
  }
}
