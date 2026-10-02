import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  createFolderSchema,
  folderContentsQuerySchema,
  moveFolderSchema,
  renameFolderSchema,
} from '@nimbo/contracts';
import type {
  CreateFolderInput,
  FolderContentsQuery,
  FolderContentsResponse,
  FolderSummary,
  MoveFolderInput,
  RenameFolderInput,
} from '@nimbo/contracts';

import { CurrentActor, Role, Roles, ZodValidationPipe } from '../../../shared';
import type { Actor } from '../../../shared';
import { FolderService } from '../application/folder.service';
import { toFolderRef, toFolderSummary, toNodeSummary } from '../application/node-summary';
import { NodeOrder } from '../domain/node-order';

import {
  nodeIdPipe,
  storageNodeValidationError,
  storageQueryValidationError,
} from './storage-validation';

/**
 * Carpetas del actor (plan 006 §4, DF-15): abrir con migas, crear, renombrar y mover. Solo `CLIENT` (CA-23). Un
 * `:folderId` que no es UUID es el mismo 404 que uno inexistente o ajeno (CA-5, CA-22). Mapea `Folder` a
 * `FolderSummary`, sin ruta ni profundidad.
 */
@Roles(Role.CLIENT)
@Controller('folders')
export class FoldersController {
  constructor(private readonly folders: FolderService) {}

  /** Sin `folderId`, la raíz; sin `sort` ni `dir`, el orden de 006 (007 D-6). Reemplaza a `GET /files`. */
  @Get('contents')
  async contents(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(folderContentsQuerySchema, storageQueryValidationError))
    query: FolderContentsQuery,
  ): Promise<FolderContentsResponse> {
    const { folderId, cursor, limit, sort, dir } = query;
    const result = await this.folders.contents(actor, {
      folderId: folderId ?? null,
      order: NodeOrder.of(sort, dir),
      limit,
      ...(cursor === undefined ? {} : { cursor }),
    });
    return {
      folder: result.folder === null ? null : toFolderRef(result.folder),
      breadcrumbs: result.breadcrumbs.map(toFolderRef),
      items: result.page.items.map(toNodeSummary),
      nextCursor: result.page.nextCursor,
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(createFolderSchema, storageNodeValidationError))
    body: CreateFolderInput,
  ): Promise<FolderSummary> {
    return toFolderSummary(await this.folders.create(actor, body));
  }

  @Patch(':folderId')
  async rename(
    @CurrentActor() actor: Actor,
    @Param('folderId', nodeIdPipe()) folderId: string,
    @Body(new ZodValidationPipe(renameFolderSchema, storageNodeValidationError))
    body: RenameFolderInput,
  ): Promise<FolderSummary> {
    return toFolderSummary(await this.folders.rename(actor, folderId, body.name));
  }

  @Post(':folderId/move')
  @HttpCode(HttpStatus.OK)
  async move(
    @CurrentActor() actor: Actor,
    @Param('folderId', nodeIdPipe()) folderId: string,
    @Body(new ZodValidationPipe(moveFolderSchema, storageNodeValidationError))
    body: MoveFolderInput,
  ): Promise<FolderSummary> {
    return toFolderSummary(await this.folders.move(actor, folderId, body.parentId));
  }
}
