import { z } from 'zod';

/** Dependencias que `api` reporta en `/health/ready`; `worker` solo reporta `redis` (plan 000 §5). */
export const HEALTH_CHECK_NAMES = ['postgres', 'redis', 'minio'] as const;
export type HealthCheckName = (typeof HEALTH_CHECK_NAMES)[number];

export const HEALTH_CHECK_STATUSES = ['up', 'down'] as const;
export type HealthCheckStatus = (typeof HEALTH_CHECK_STATUSES)[number];

export const healthLiveResponseSchema = z.object({ status: z.literal('ok') }).strict();
export type HealthLiveResponse = z.infer<typeof healthLiveResponseSchema>;

/**
 * `checks` es parcial por diseño: cada proceso incluye solo los indicadores que registra
 * (`api`: postgres, redis, minio; `worker`: redis). Una sola definición para ambos (Art. VI).
 */
export const healthReadyResponseSchema = z
  .object({
    status: z.enum(['ok', 'error']),
    checks: z
      .object({
        postgres: z.enum(HEALTH_CHECK_STATUSES),
        redis: z.enum(HEALTH_CHECK_STATUSES),
        minio: z.enum(HEALTH_CHECK_STATUSES),
      })
      .partial()
      .strict(),
  })
  .strict();

export interface HealthReadyResponse {
  readonly status: 'ok' | 'error';
  readonly checks: Partial<Record<HealthCheckName, HealthCheckStatus>>;
}
