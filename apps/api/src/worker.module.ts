import { Module } from '@nestjs/common';

import { HealthModule } from './shared';

/**
 * Raíz de composición del proceso `worker` (plan 000 §6.3, alternativa R-3): compone módulos de `api`,
 * no aloja lógica propia. T-22 agrega `SharedModule`, `HealthModule.forRoot({ indicators: [Redis] })` y `PingProcessor`.
 */
@Module({
  imports: [HealthModule.forRoot({ indicators: [] })],
})
export class WorkerModule {}
