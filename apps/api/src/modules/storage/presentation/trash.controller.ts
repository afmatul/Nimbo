import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { listTrashQuerySchema } from '@nimbo/contracts';
import type {
  ListTrashQuery,
  ListTrashResponse,
  RestoreResponse,
  TrashItem,
  TrashSummary,
} from '@nimbo/contracts';

import { CurrentActor, Role, Roles, ZodValidationPipe } from '../../../shared';
import type { Actor } from '../../../shared';
import { toNodeSummary } from '../application/node-summary';
import { toTrashItem } from '../application/trash-item';
import { TrashService } from '../application/trash.service';
import type { RestoreResult } from '../application/trash.service';

import { nodeIdPipe, storageQueryValidationError } from './storage-validation';

const toRestoreResponse = (result: RestoreResult): RestoreResponse => ({
  item: toNodeSummary(result.node),
  outcome: result.outcome,
  originalName: result.originalName,
});

/**
 * Papelera del actor (plan 006 §4): eliminar archivos y carpetas, listar, resumir y restaurar. Solo `CLIENT`
 * (CA-23). Un `:id` que no es UUID es el mismo 404 que uno inexistente, ajeno o purgado (CA-16, CA-22).
 */
@Roles(Role.CLIENT)
@Controller()
export class TrashController {
  constructor(private readonly trash: TrashService) {}

  /** CA-10: la interfaz muestra «Movimos…» con «Ver papelera». */
  @Delete('files/:fileId')
  async trashFile(
    @CurrentActor() actor: Actor,
    @Param('fileId', nodeIdPipe()) fileId: string,
  ): Promise<TrashItem> {
    return toTrashItem(await this.trash.trashFile(actor, fileId));
  }

  /** CA-11: un solo elemento con el tamaño de todo su contenido. */
  @Delete('folders/:folderId')
  async trashFolder(
    @CurrentActor() actor: Actor,
    @Param('folderId', nodeIdPipe()) folderId: string,
  ): Promise<TrashItem> {
    return toTrashItem(await this.trash.trashFolder(actor, folderId));
  }

  @Get('trash')
  async list(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(listTrashQuerySchema, storageQueryValidationError))
    query: ListTrashQuery,
  ): Promise<ListTrashResponse> {
    const { cursor, limit } = query;
    const page = await this.trash.list(actor, {
      limit,
      ...(cursor === undefined ? {} : { cursor }),
    });
    return { items: page.items.map(toTrashItem), nextCursor: page.nextCursor };
  }

  @Get('trash/summary')
  async summary(@CurrentActor() actor: Actor): Promise<TrashSummary> {
    const overview = await this.trash.summary(actor);
    return { ...overview, totalBytes: Number(overview.totalBytes) };
  }

  @Post('trash/files/:fileId/restore')
  @HttpCode(HttpStatus.OK)
  async restoreFile(
    @CurrentActor() actor: Actor,
    @Param('fileId', nodeIdPipe()) fileId: string,
  ): Promise<RestoreResponse> {
    return toRestoreResponse(await this.trash.restoreFile(actor, fileId));
  }

  @Post('trash/folders/:folderId/restore')
  @HttpCode(HttpStatus.OK)
  async restoreFolder(
    @CurrentActor() actor: Actor,
    @Param('folderId', nodeIdPipe()) folderId: string,
  ): Promise<RestoreResponse> {
    return toRestoreResponse(await this.trash.restoreFolder(actor, folderId));
  }
}
