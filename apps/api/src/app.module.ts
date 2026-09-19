import { Module } from '@nestjs/common';

import { HealthModule } from './shared';

/** Raíz de composición de `api`. T-16 agrega `SharedModule`; T-20 registra los indicadores de salud. */
@Module({
  imports: [HealthModule],
})
export class AppModule {}
