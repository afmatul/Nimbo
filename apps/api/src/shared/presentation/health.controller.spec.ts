import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('CA-20: `live()` devuelve `{ status: "ok" }` sin consultar dependencias', () => {
    const controller = new HealthController();

    expect(controller.live()).toEqual({ status: 'ok' });
  });
});
