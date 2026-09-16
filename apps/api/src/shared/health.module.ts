import { Module } from '@nestjs/common';

import { HealthController } from './presentation/health.controller';

/** Versión mínima (solo `live`). T-19 agrega `forRoot({ indicators })` con `HealthService`. */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
