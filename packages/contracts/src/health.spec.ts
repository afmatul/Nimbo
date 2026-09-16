import { healthLiveResponseSchema, healthReadyResponseSchema } from './health';

describe('healthReadyResponseSchema', () => {
  it('CA-21: acepta la respuesta de `api` con los tres indicadores en `up`', () => {
    const result = healthReadyResponseSchema.safeParse({
      status: 'ok',
      checks: { postgres: 'up', redis: 'up', minio: 'up' },
    });

    expect(result.success).toBe(true);
  });

  it('CA-22: acepta `status: error` con un indicador en `down`', () => {
    const result = healthReadyResponseSchema.safeParse({
      status: 'error',
      checks: { postgres: 'up', redis: 'down', minio: 'up' },
    });

    expect(result.success).toBe(true);
  });

  it('CA-23: acepta `checks` parcial (el worker solo reporta `redis`)', () => {
    const result = healthReadyResponseSchema.safeParse({ status: 'ok', checks: { redis: 'up' } });

    expect(result.success).toBe(true);
  });

  it('rechaza un `status` fuera de `ok | error`', () => {
    const result = healthReadyResponseSchema.safeParse({ status: 'x', checks: {} });

    expect(result.success).toBe(false);
  });

  it('rechaza un indicador desconocido o un estado distinto de `up | down`', () => {
    expect(
      healthReadyResponseSchema.safeParse({ status: 'ok', checks: { mongo: 'up' } }).success,
    ).toBe(false);
    expect(
      healthReadyResponseSchema.safeParse({ status: 'ok', checks: { redis: 'degraded' } }).success,
    ).toBe(false);
  });
});

describe('healthLiveResponseSchema', () => {
  it('CA-20: acepta exactamente `{ status: "ok" }`', () => {
    expect(healthLiveResponseSchema.safeParse({ status: 'ok' }).success).toBe(true);
    expect(healthLiveResponseSchema.safeParse({ status: 'error' }).success).toBe(false);
  });
});
