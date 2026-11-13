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
  ExplorerFolder,
  FolderContentsQuery,
  FolderContentsResponse,
  MoveFolderInput,
  RenameFolderInput,
} from '@nimbo/contracts';

import { CurrentActor, Role, Roles, ZodValidationPipe } from '../../../shared';
import type { Actor } from '../../../shared';
import { ExplorerBadgeService } from '../application/explorer-badge.service';
import { FolderService } from '../application/folder.service';
import { toExplorerFolder, toExplorerNode, toFolderRef } from '../application/node-summary';
import type { Folder } from '../domain/folder';
import { NodeOrder } from '../domain/node-order';

import {
  nodeIdPipe,
  storageNodeValidationError,
  storageQueryValidationError,
} from './storage-validation';

/**
 * Carpetas del actor (plan 006 §4, DF-15): abrir con migas, crear, renombrar y mover. Solo `CLIENT` (CA-23). Un
 * `:folderId` que no es UUID es el mismo 404 que uno inexistente o ajeno (CA-5, CA-22). Mapea `Folder` a
 * `ExplorerFolder` (sin ruta ni profundidad, con sus distintivos), igual en el listado y al crear, renombrar o mover.
 */
@Roles(Role.CLIENT)
@Controller('folders')
export class FoldersController {
  constructor(
    private readonly folders: FolderService,
    private readonly badges: ExplorerBadgeService,
  ) {}

  /**
   * Sin `folderId`, la raíz; sin `sort` ni `dir`, el orden de 006 (007 D-6). Reemplaza a `GET /files`. Cada elemento
   * lleva sus distintivos (compartido, indexación) de `ExplorerBadgeService`.
   */
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
    const badges = await this.badges.badgesOf(actor, result.page.items);
    return {
      folder: result.folder === null ? null : toFolderRef(result.folder),
      breadcrumbs: result.breadcrumbs.map(toFolderRef),
      items: result.page.items.map((node) => toExplorerNode(node, badges)),
      nextCursor: result.page.nextCursor,
      accessLevel: result.accessLevel,
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(createFolderSchema, storageNodeValidationError))
    body: CreateFolderInput,
  ): Promise<ExplorerFolder> {
    return this.present(actor, await this.folders.create(actor, body));
  }

  @Patch(':folderId')
  async rename(
    @CurrentActor() actor: Actor,
    @Param('folderId', nodeIdPipe()) folderId: string,
    @Body(new ZodValidationPipe(renameFolderSchema, storageNodeValidationError))
    body: RenameFolderInput,
  ): Promise<ExplorerFolder> {
    return this.present(actor, await this.folders.rename(actor, folderId, body.name));
  }

  @Post(':folderId/move')
  @HttpCode(HttpStatus.OK)
  async move(
    @CurrentActor() actor: Actor,
    @Param('folderId', nodeIdPipe()) folderId: string,
    @Body(new ZodValidationPipe(moveFolderSchema, storageNodeValidationError))
    body: MoveFolderInput,
  ): Promise<ExplorerFolder> {
    return this.present(actor, await this.folders.move(actor, folderId, body.parentId));
  }

  private async present(actor: Actor, folder: Folder): Promise<ExplorerFolder> {
    return toExplorerFolder(folder, await this.badges.badgesOf(actor, [folder]));
  }
}
