import { Module } from '@nestjs/common';
import type { DynamicModule, Type } from '@nestjs/common';
import type { Registry } from 'prom-client';

import { HealthService } from './application/health/health.service';
import { I_HEALTH_INDICATORS } from './application/health/i-health-indicator.port';
import type { IHealthIndicator } from './application/health/i-health-indicator.port';
import { ENV } from './infrastructure/config/env.module';
import type { SharedEnvBase } from './infrastructure/config/env.schema';
import {
  DependencyMetricsCollector,
  onlyOfficeProbeFor,
} from './infrastructure/metrics/dependency-metrics.collector';
import { METRICS_REGISTRY, MetricsModule } from './infrastructure/metrics/metrics.module';
import { HealthController } from './presentation/health.controller';

export interface HealthModuleOptions {
  /** La raíz de composición elige: `api` los tres indicadores, `worker` solo Redis (plan 000 §6.2). */
  readonly indicators: readonly Type<IHealthIndicator>[];
}

/**
 * Salud del proceso (T1): `live` sin dependencias, `ready` agregando los indicadores registrados. Registra también el
 * recolector de disponibilidad de dependencias (022 plan §2), que reutiliza `ready` y suma la sonda de ONLYOFFICE sin
 * meterla en `ready` (RN-4). `MetricsModule` es el mismo que importa `SharedModule`: un solo registro por aplicación.
 */
@Module({})
export class HealthModule {
  static forRoot(options: HealthModuleOptions): DynamicModule {
    const indicators = [...options.indicators];
    return {
      module: HealthModule,
      imports: [MetricsModule],
      controllers: [HealthController],
      providers: [
        ...indicators,
        {
          provide: I_HEALTH_INDICATORS,
          useFactory: (...instances: IHealthIndicator[]): IHealthIndicator[] => instances,
          inject: indicators,
        },
        HealthService,
        {
          provide: DependencyMetricsCollector,
          useFactory: (registry: Registry, health: HealthService, env: SharedEnvBase) =>
            new DependencyMetricsCollector(registry, health, onlyOfficeProbeFor(env)),
          inject: [METRICS_REGISTRY, HealthService, ENV],
        },
      ],
    };
  }
}
