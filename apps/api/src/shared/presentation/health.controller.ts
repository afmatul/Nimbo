import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { HealthLiveResponse, HealthReadyResponse } from '@nimbo/contracts';
import type { Response } from 'express';

import { HealthService } from '../application/health/health.service';

import { Public } from './auth/public.decorator';

/**
 * Salud del proceso (`design-model.md` T1). `live` nunca consulta dependencias (CA-20);
 * `ready` delega en `HealthService` y responde `503` con el mismo cuerpo cuando algo está `down` (CA-21, CA-22).
 * Pública (003 CA-3): los guards globales no piden token.
 */
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  live(): HealthLiveResponse {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response): Promise<HealthReadyResponse> {
    const result = await this.healthService.ready();
    res.status(result.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return result;
  }
}
