import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { IndexingRetryResponse, IndexingStatusResponse } from '@nimbo/contracts';

import { CurrentActor, Role, Roles } from '../../../shared';
import type { Actor } from '../../../shared';
import { NodeNotFoundError } from '../../storage';
import { IndexStatusService } from '../application/index-status.service';

/** `:fileId` que no es UUID: el mismo 404 que un archivo inexistente, ajeno o en la papelera (CA-18, sin oráculo). */
const fileIdPipe = (): ParseUUIDPipe =>
  new ParseUUIDPipe({ exceptionFactory: () => new NodeNotFoundError() });

/**
 * Estado de indexación de un archivo y «Reintentar» (plan 019 §4). Solo `CLIENT`: un rol interno recibe
 * `SHARED_FORBIDDEN` antes de tocar el archivo (CA-20). No expone fragmentos ni texto.
 */
@Roles(Role.CLIENT)
@Controller('files/:fileId/indexing')
export class IndexingController {
  constructor(private readonly status: IndexStatusService) {}

  @Get()
  async get(
    @CurrentActor() actor: Actor,
    @Param('fileId', fileIdPipe()) fileId: string,
  ): Promise<IndexingStatusResponse> {
    const { state, reason, updatedAt, canRetry } = await this.status.get(actor, fileId);
    return { state, reason, updatedAt: updatedAt?.toISOString() ?? null, canRetry };
  }

  /** CA-13: `202`, la versión vuelve a `pendiente` y el `worker` la reprocesa. */
  @Post('retry')
  @HttpCode(HttpStatus.ACCEPTED)
  async retry(
    @CurrentActor() actor: Actor,
    @Param('fileId', fileIdPipe()) fileId: string,
  ): Promise<IndexingRetryResponse> {
    await this.status.retry(actor, fileId);
    return { state: 'pendiente' };
  }
}
