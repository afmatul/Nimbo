import { Module } from '@nestjs/common';
import type { DynamicModule, Type } from '@nestjs/common';

import { HealthService } from './application/health/health.service';
import { I_HEALTH_INDICATORS } from './application/health/i-health-indicator.port';
import type { IHealthIndicator } from './application/health/i-health-indicator.port';
import { EnvModule } from './infrastructure/config/env.module';
import { HealthController } from './presentation/health.controller';

export interface HealthModuleOptions {
  /** La raíz de composición elige: `api` los tres indicadores, `worker` solo Redis (plan 000 §6.2). */
  readonly indicators: readonly Type<IHealthIndicator>[];
}

/** Salud del proceso (T1): `live` sin dependencias, `ready` agregando los indicadores registrados. */
@Module({})
export class HealthModule {
  static forRoot(options: HealthModuleOptions): DynamicModule {
    const indicators = [...options.indicators];
    return {
      module: HealthModule,
      imports: [EnvModule],
      controllers: [HealthController],
      providers: [
        ...indicators,
        {
          provide: I_HEALTH_INDICATORS,
          useFactory: (...instances: IHealthIndicator[]): IHealthIndicator[] => instances,
          inject: indicators,
        },
        HealthService,
      ],
    };
  }
}
