import type { HealthCheckName, HealthCheckStatus } from '@nimbo/contracts';

import { HealthService, READY_TIMEOUT_MS } from './health.service';
import type { IHealthIndicator } from './i-health-indicator.port';

const up = (name: HealthCheckName): IHealthIndicator => ({
  name,
  check: (): Promise<HealthCheckStatus> => Promise.resolve('up'),
});
const failing = (name: HealthCheckName, message: string): IHealthIndicator => ({
  name,
  check: (): Promise<HealthCheckStatus> => Promise.reject(new Error(message)),
});
const hanging = (name: HealthCheckName): IHealthIndicator => ({
  name,
  check: (): Promise<HealthCheckStatus> => new Promise(() => undefined),
});

const fakeLogger = (): { warn: jest.Mock; lines: () => unknown[] } => {
  const warn = jest.fn();
  return { warn, lines: () => warn.mock.calls.map((call: unknown[]) => call[0]) };
};

describe('HealthService.ready', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('CA-21: todos los indicadores `up` → `{ status: "ok", checks }` y sin bitácora', async () => {
    const logger = fakeLogger();
    const service = new HealthService([up('postgres'), up('redis'), up('minio')], logger);

    const result = await service.ready();

    expect(result).toEqual({
      status: 'ok',
      checks: { postgres: 'up', redis: 'up', minio: 'up' },
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('CA-22: un indicador que rechaza → `down`, `status: "error"` y bitácora `health.ready` sin el mensaje del error', async () => {
    const logger = fakeLogger();
    const service = new HealthService(
      [up('postgres'), failing('redis', 'ECONNREFUSED 127.0.0.1:6379'), up('minio')],
      logger,
    );

    const result = await service.ready();

    expect(result).toEqual({
      status: 'error',
      checks: { postgres: 'up', redis: 'down', minio: 'up' },
    });
    expect(JSON.stringify(result)).not.toContain('ECONNREFUSED');
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.lines()[0]).toEqual({ event: 'health.ready', checks: result.checks });
    expect(JSON.stringify(logger.lines())).not.toContain('ECONNREFUSED');
  });

  it('CA-22: un indicador que tarda más del límite → `down` sin esperar más que el límite', async () => {
    jest.useFakeTimers();
    const service = new HealthService([up('postgres'), hanging('redis')], fakeLogger());
    let settled: unknown;

    const pending = service.ready().then((result) => {
      settled = result;
    });
    await jest.advanceTimersByTimeAsync(READY_TIMEOUT_MS - 1);
    expect(settled).toBeUndefined();
    await jest.advanceTimersByTimeAsync(101);
    await pending;

    expect(settled).toEqual({ status: 'error', checks: { postgres: 'up', redis: 'down' } });
  });

  it('CA-21: `checks` contiene solo los indicadores registrados (el worker solo reporta redis)', async () => {
    const service = new HealthService([up('redis')], fakeLogger());

    await expect(service.ready()).resolves.toEqual({ status: 'ok', checks: { redis: 'up' } });
  });

  it('CA-22: un indicador que devuelve `down` sin lanzar también marca `error`', async () => {
    const downIndicator: IHealthIndicator = {
      name: 'minio',
      check: (): Promise<HealthCheckStatus> => Promise.resolve('down'),
    };
    const service = new HealthService([downIndicator], fakeLogger());

    await expect(service.ready()).resolves.toEqual({ status: 'error', checks: { minio: 'down' } });
  });
});
