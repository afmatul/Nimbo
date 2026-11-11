import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { runOptimizationBodySchema } from '@nimbo/contracts';
import type {
  OptimizationResponse,
  OptimizationStatus,
  RunOptimizationBody,
} from '@nimbo/contracts';

import { CurrentActor, Role, Roles, ZodValidationPipe } from '../../../shared';
import type { Actor } from '../../../shared';
import { NodeNotFoundError } from '../../storage';
import { OptimizationService } from '../application/optimization.service';
import type { OptimizationView } from '../application/optimization.service';
import { EstimateStaleError } from '../domain/errors';

/** `:fileId` que no es UUID: el mismo 404 que un archivo inexistente, ajeno o en la papelera (CA-19, sin oráculo). */
const fileIdPipe = (): ParseUUIDPipe =>
  new ParseUUIDPipe({ exceptionFactory: () => new NodeNotFoundError() });

/**
 * Ahorro respecto del original con el resultado real o, si todavía no hay, la estimación; `null` si no ahorra. El
 * porcentaje lleva un decimal (por mil entero, sin pasar `bigint` a coma flotante antes de dividir).
 */
function savingsOf(original: bigint, after: bigint | null) {
  if (after === null || after >= original) return { savedBytes: null, savedPercent: null };
  const saved = original - after;
  return { savedBytes: Number(saved), savedPercent: Number((saved * 1000n) / original) / 10 };
}

/** La vista del servicio en el contrato (plan 021 §4): bytes como número, fechas en ISO y sin datos internos. */
export function toOptimizationStatus({
  job,
  pollAfterMs,
  keepOriginalDays,
}: OptimizationView): OptimizationStatus {
  const data = job.snapshot();
  return {
    id: data.id,
    state: data.state,
    reason: data.reason,
    originalBytes: Number(data.originalBytes),
    estimatedBytes: data.estimatedBytes === null ? null : Number(data.estimatedBytes),
    resultBytes: data.resultBytes === null ? null : Number(data.resultBytes),
    ...savingsOf(data.originalBytes, data.resultBytes ?? data.estimatedBytes),
    keepOriginalDays,
    pollAfterMs,
    updatedAt: data.updatedAt.toISOString(),
  };
}

/**
 * Calcular el ahorro de una imagen y consultar su optimización (plan 021 §4). Solo `CLIENT`: un rol interno recibe
 * `SHARED_FORBIDDEN` antes de tocar el archivo (CA-20). No expone nombres, claves de objeto ni URLs.
 */
@Roles(Role.CLIENT)
@Controller('files/:fileId/optimization')
export class OptimizerController {
  constructor(private readonly optimizations: OptimizationService) {}

  /** CA-1 a CA-5: `202` con la optimización en curso, la estimación vigente o `no_disponible(tamano)`. */
  @Post('estimate')
  @HttpCode(HttpStatus.ACCEPTED)
  async estimate(
    @CurrentActor() actor: Actor,
    @Param('fileId', fileIdPipe()) fileId: string,
  ): Promise<OptimizationStatus> {
    return toOptimizationStatus(await this.optimizations.estimate(actor, fileId));
  }

  @Post('run')
  @HttpCode(HttpStatus.ACCEPTED)
  async run(
    @CurrentActor() actor: Actor,
    @Param('fileId', fileIdPipe()) fileId: string,
    @Body(new ZodValidationPipe(runOptimizationBodySchema, () => new EstimateStaleError()))
    body: RunOptimizationBody,
  ): Promise<OptimizationStatus> {
    return toOptimizationStatus(await this.optimizations.run(actor, { fileId, ...body }));
  }

  /** La última optimización del archivo, o `null` si no hay una vigente (RN-9, RN-10). */
  @Get()
  async status(
    @CurrentActor() actor: Actor,
    @Param('fileId', fileIdPipe()) fileId: string,
  ): Promise<OptimizationResponse> {
    const view = await this.optimizations.status(actor, fileId);
    return { optimization: view === null ? null : toOptimizationStatus(view) };
  }
}
