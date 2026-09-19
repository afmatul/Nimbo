import { Module } from '@nestjs/common';

import { HealthModule, SharedModule } from './shared';

/** Raíz de composición de `api`. T-20 registra los indicadores de salud; T-21 la cola `ping`. */
@Module({
  imports: [SharedModule, HealthModule.forRoot({ indicators: [] })],
})
export class AppModule {}
