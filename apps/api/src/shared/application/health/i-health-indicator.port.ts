import type { HealthCheckName, HealthCheckStatus } from '@nimbo/contracts';

/**
 * Puerto de salud (T1, DF-49): cada dependencia externa aporta un indicador. Devuelve `up`/`down`
 * o rechaza; `HealthService` nunca serializa el error (CA-22).
 */
export interface IHealthIndicator {
  readonly name: HealthCheckName;
  check(): Promise<HealthCheckStatus>;
}

/** Token de la lista de indicadores que la raíz de composición registra vía `HealthModule.forRoot`. */
export const I_HEALTH_INDICATORS = Symbol('I_HEALTH_INDICATORS');
