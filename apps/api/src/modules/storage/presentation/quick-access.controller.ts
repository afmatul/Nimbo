import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import type { QuickAccessItem, QuickAccessList } from '@nimbo/contracts';

import { CurrentActor, Role, Roles } from '../../../shared';
import type { Actor } from '../../../shared';
import { QuickAccessService } from '../application/quick-access.service';
import type { StorageNode } from '../domain/storage-node';

import { nodeIdPipe, NodeTypePipe } from './storage-validation';

type NodeType = StorageNode['type'];

/**
 * Accesos rápidos de la barra lateral (spec 006 CA-27 y CA-28, plan §9.2). Solo `CLIENT`. Un `:nodeType` que no es
 * `files|folders` o un `:nodeId` que no es UUID es el mismo 404 que un nodo inexistente, ajeno o en la papelera (CA-22).
 */
@Roles(Role.CLIENT)
@Controller('quick-access')
export class QuickAccessController {
  constructor(private readonly quickAccess: QuickAccessService) {}

  @Get()
  async list(@CurrentActor() actor: Actor): Promise<QuickAccessList> {
    const list = await this.quickAccess.list(actor);
    return {
      pinned: [...list.pinned],
      recent: [...list.recent],
      hasMoreRecent: list.hasMoreRecent,
    };
  }

  /** CA-28: idempotente; `422 STORAGE_QUICK_ACCESS_LIMIT` solo si no estaba fijado y el tope está lleno. */
  @Put('pins/:nodeType/:nodeId')
  @HttpCode(HttpStatus.OK)
  pin(
    @CurrentActor() actor: Actor,
    @Param('nodeType', new NodeTypePipe()) type: NodeType,
    @Param('nodeId', nodeIdPipe()) id: string,
  ): Promise<QuickAccessItem> {
    return this.quickAccess.pin(actor, { type, id });
  }

  @Delete('pins/:nodeType/:nodeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unpin(
    @CurrentActor() actor: Actor,
    @Param('nodeType', new NodeTypePipe()) type: NodeType,
    @Param('nodeId', nodeIdPipe()) id: string,
  ): Promise<void> {
    await this.quickAccess.unpin(actor, { type, id });
  }

  /** CA-27: abrir una carpeta o pedir la descarga de un archivo; sin cuerpo. */
  @Post('recents/:nodeType/:nodeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async recordOpen(
    @CurrentActor() actor: Actor,
    @Param('nodeType', new NodeTypePipe()) type: NodeType,
    @Param('nodeId', nodeIdPipe()) id: string,
  ): Promise<void> {
    await this.quickAccess.recordOpen(actor, { type, id });
  }
}
