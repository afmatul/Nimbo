import { Controller, Get } from '@nestjs/common';
import type { HealthLiveResponse } from '@nimbo/contracts';

/**
 * Salud del proceso (`design-model.md` T1). `live` nunca consulta dependencias (CA-20).
 * `ready` llega con T-20 delegando en `HealthService`.
 */
@Controller('health')
export class HealthController {
  @Get('live')
  live(): HealthLiveResponse {
    return { status: 'ok' };
  }
}
