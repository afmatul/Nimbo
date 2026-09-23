import type { Response } from 'express';

import type { HealthService } from '../application/health/health.service';

import { HealthController } from './health.controller';

const fakeService = (result: Awaited<ReturnType<HealthService['ready']>>): HealthService =>
  ({ ready: () => Promise.resolve(result) }) as unknown as HealthService;

const fakeResponse = (): { res: Response; status: () => number | undefined } => {
  let code: number | undefined;
  const res = {
    status: (value: number): Response => {
      code = value;
      return res;
    },
  } as unknown as Response;
  return { res, status: () => code };
};

describe('HealthController', () => {
  it('CA-20: `live()` devuelve `{ status: "ok" }` sin consultar dependencias', () => {
    const service = { ready: jest.fn() } as unknown as HealthService;
    const controller = new HealthController(service);

    expect(controller.live()).toEqual({ status: 'ok' });
    expect(service.ready).not.toHaveBeenCalled();
  });

  it('CA-21: `ready()` responde 200 con el cuerpo del servicio cuando todo está `up`', async () => {
    const body = { status: 'ok' as const, checks: { redis: 'up' as const } };
    const controller = new HealthController(fakeService(body));
    const { res, status } = fakeResponse();

    await expect(controller.ready(res)).resolves.toEqual(body);
    expect(status()).toBe(200);
  });

  it('CA-22: `ready()` responde 503 con el mismo cuerpo cuando algo está `down`', async () => {
    const body = { status: 'error' as const, checks: { redis: 'down' as const } };
    const controller = new HealthController(fakeService(body));
    const { res, status } = fakeResponse();

    await expect(controller.ready(res)).resolves.toEqual(body);
    expect(status()).toBe(503);
  });
});
