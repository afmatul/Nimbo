import { Inject, Injectable } from '@nestjs/common';
import type { HealthCheckStatus, HealthReadyResponse } from '@nimbo/contracts';
import { PinoLogger } from 'nestjs-pino';

import { I_HEALTH_INDICATORS } from './i-health-indicator.port';
import type { IHealthIndicator } from './i-health-indicator.port';

/** Cada indicador tiene este límite (CA-21: `ready` responde en < 2 s). */
export const READY_TIMEOUT_MS = 1500;

/** Lo mínimo que `HealthService` necesita de un logger (permite un doble en pruebas de aplicación). */
export interface HealthLogger {
  warn(payload: Record<string, unknown>): void;
}

const withTimeout = (check: Promise<HealthCheckStatus>): Promise<HealthCheckStatus> =>
  new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve('down');
    }, READY_TIMEOUT_MS);
    check
      .then((status) => {
        clearTimeout(timer);
        resolve(status);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve('down');
      });
  });

/** Agrega los indicadores en paralelo; cualquier rechazo o espera excesiva cuenta como `down`. */
@Injectable()
export class HealthService {
  constructor(
    @Inject(I_HEALTH_INDICATORS) private readonly indicators: readonly IHealthIndicator[],
    @Inject(PinoLogger) private readonly logger: HealthLogger,
  ) {}

  async ready(): Promise<HealthReadyResponse> {
    const statuses = await Promise.all(
      this.indicators.map(
        async (indicator) => [indicator.name, await withTimeout(indicator.check())] as const,
      ),
    );
    const checks: HealthReadyResponse['checks'] = Object.fromEntries(statuses);
    const status = statuses.every(([, value]) => value === 'up') ? 'ok' : 'error';
    if (status === 'error') {
      this.logger.warn({ event: 'health.ready', checks });
    }
    return { status, checks };
  }
}
