import type { HealthReadyResponse } from '@nimbo/contracts';
import { Gauge } from 'prom-client';
import type { Registry } from 'prom-client';

import { READY_TIMEOUT_MS } from '../../application/health/health.service';

export const DEPENDENCY_UP = 'nimbo_dependency_up';

const ONLYOFFICE = 'onlyoffice';
/** ONLYOFFICE responde `true` en `/healthcheck` cuando acepta documentos (como `OnlyOfficeEditor.isAvailable`). */
const HEALTHCHECK_PATH = '/healthcheck';
const HEALTHY_BODY = 'true';
const UP = 1;
const DOWN = 0;

/**
 * Sonda propia de ONLYOFFICE para las métricas (022 plan §2, PD-113). No es un `IHealthIndicator` ni entra en
 * `ready`: con ONLYOFFICE caído el `api` sigue listo (RN-4). Repite el `GET /healthcheck` de `OnlyOfficeEditor`
 * (segunda aparición, Art. VI.2) con el límite de `ready`. Nunca registra la URL.
 */
export class OnlyOfficeProbe {
  constructor(private readonly internalUrl: string) {}

  async isUp(): Promise<boolean> {
    try {
      const response = await fetch(`${this.internalUrl}${HEALTHCHECK_PATH}`, {
        signal: AbortSignal.timeout(READY_TIMEOUT_MS),
        redirect: 'error',
      });
      return response.ok && (await response.text()).trim() === HEALTHY_BODY;
    } catch {
      return false;
    }
  }
}

/** Solo el `api` declara `ONLYOFFICE_INTERNAL_URL`; sin ella no hay sonda ni serie de ONLYOFFICE (S-7). */
export const onlyOfficeProbeFor = (
  env: Readonly<Record<string, unknown>>,
): OnlyOfficeProbe | null => {
  const url = env.ONLYOFFICE_INTERNAL_URL;
  return typeof url === 'string' && url !== '' ? new OnlyOfficeProbe(url) : null;
};

/** Lo que el recolector necesita de `HealthService` (permite un doble en pruebas). */
export interface ReadinessSource {
  ready(): Promise<HealthReadyResponse>;
}

/**
 * `nimbo_dependency_up{dependency}` en cada recolección (CA-3, CA-15). Postgres, Redis y MinIO salen de
 * `HealthService.ready()`, con los mismos indicadores y límite (DRY), así que cada proceso publica lo que comprueba.
 * ONLYOFFICE sale de su sonda propia, si el proceso la tiene. Las etiquetas son un conjunto cerrado (CA-5).
 */
export class DependencyMetricsCollector {
  private readonly gauge: Gauge<'dependency'>;

  constructor(
    registry: Registry,
    private readonly health: ReadinessSource,
    private readonly onlyOffice: OnlyOfficeProbe | null,
  ) {
    this.gauge = new Gauge({
      name: DEPENDENCY_UP,
      help: 'Disponibilidad de cada dependencia (1 arriba, 0 caída)',
      labelNames: ['dependency'],
      registers: [registry],
      collect: () => this.refresh(),
    });
  }

  private async refresh(): Promise<void> {
    const [{ checks }, onlyOfficeUp] = await Promise.all([
      this.health.ready(),
      this.onlyOffice?.isUp(),
    ]);
    for (const [dependency, status] of Object.entries(checks)) {
      this.gauge.set({ dependency }, status === 'up' ? UP : DOWN);
    }
    if (onlyOfficeUp !== undefined) {
      this.gauge.set({ dependency: ONLYOFFICE }, onlyOfficeUp ? UP : DOWN);
    }
  }
}
