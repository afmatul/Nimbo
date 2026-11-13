import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { batchMoveRequestSchema, batchNodesRequestSchema } from '@nimbo/contracts';
import type {
  BatchDownloadResponse,
  BatchMoveRequest,
  BatchNodesRequest,
  BatchResult,
} from '@nimbo/contracts';

import {
  CurrentActor,
  Role,
  Roles,
  toBatchFailures,
  toBatchResult,
  ZodValidationPipe,
} from '../../../shared';
import type { Actor } from '../../../shared';
import { BatchDownloadService } from '../application/batch-download.service';
import { NodeBatchService } from '../application/node-batch.service';

import { storageNodeValidationError } from './storage-validation';

const batchPipe = (schema: typeof batchNodesRequestSchema | typeof batchMoveRequestSchema) =>
  new ZodValidationPipe(schema, storageNodeValidationError);

/**
 * Lotes del explorador (hasta `BATCH_MAX_ITEMS` elementos): mover, enviar a la papelera y descargar varios nodos. Solo
 * `CLIENT`. Cada elemento sigue la regla de su ruta individual y el resultado dice cuáles fallaron y con qué código;
 * siempre `200` si la petición es válida.
 */
@Roles(Role.CLIENT)
@Controller('nodes/batch')
export class NodesBatchController {
  constructor(
    private readonly batches: NodeBatchService,
    private readonly downloads: BatchDownloadService,
  ) {}

  @Post('move')
  @HttpCode(HttpStatus.OK)
  async move(
    @CurrentActor() actor: Actor,
    @Body(batchPipe(batchMoveRequestSchema)) body: BatchMoveRequest,
  ): Promise<BatchResult> {
    return toBatchResult(await this.batches.move(actor, body));
  }

  @Post('delete')
  @HttpCode(HttpStatus.OK)
  async delete(
    @CurrentActor() actor: Actor,
    @Body(batchPipe(batchNodesRequestSchema)) body: BatchNodesRequest,
  ): Promise<BatchResult> {
    return toBatchResult(await this.batches.trash(actor, body.items));
  }

  @Post('download')
  @HttpCode(HttpStatus.OK)
  async download(
    @CurrentActor() actor: Actor,
    @Body(batchPipe(batchNodesRequestSchema)) body: BatchNodesRequest,
  ): Promise<BatchDownloadResponse> {
    const { downloads, failed } = await this.downloads.download(actor, body.items);
    return { downloads: [...downloads], failed: toBatchFailures(failed) };
  }
}
