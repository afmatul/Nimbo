import { Controller, Get } from '@nestjs/common';
import type { BackofficeMetricsResponse } from '@nimbo/contracts';

import { CurrentActor, Role, Roles } from '../../../shared';
import type { Actor } from '../../../shared';
import { MetricsService } from '../application/metrics.service';

import { toBackofficeMetricsResponse } from './metrics-response';

/**
 * Tablero de métricas (011 CA-12; plan §4): Administrador y Operador (CA-14). Delega en `MetricsService` y responde por
 * lista blanca: totales y conteos, nunca filas de una cuenta.
 */
@Roles(Role.ADMIN, Role.OPERATOR)
@Controller('backoffice/metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  async read(@CurrentActor() actor: Actor): Promise<BackofficeMetricsResponse> {
    return toBackofficeMetricsResponse(await this.metrics.read(actor));
  }
}
