import { Controller, Get } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import request from 'supertest';

import { HealthModule } from '../../../src/shared';
import { createTestApp } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Controlador de prueba: escribe una bitácora dentro del ciclo de la petición. */
@Controller('correlation-probe')
class CorrelationProbeController {
  constructor(private readonly logger: PinoLogger) {}

  @Get()
  probe(): { ok: true } {
    this.logger.info({ event: 'probe.handled' }, 'Dentro del manejador');
    return { ok: true };
  }
}

describe('x-correlation-id (CA-13)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp({
      modules: [HealthModule],
      controllers: [CorrelationProbeController],
    });
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(() => {
    testApp.logs.clear();
  });

  it('CA-13: sin cabecera → la respuesta trae un UUID v4 y todas las bitácoras de la petición lo llevan', async () => {
    const response = await request(testApp.app.getHttpServer()).get('/api/v1/correlation-probe');

    expect(response.status).toBe(200);
    const correlationId = String(response.headers['x-correlation-id']);
    expect(correlationId).toMatch(UUID_V4);
    const events = testApp.logs.withCorrelationId(correlationId).map((line) => line.event);
    expect(events).toEqual(expect.arrayContaining(['probe.handled', 'http.request']));
    const requestLines = testApp.logs.lines().filter((line) => line.event === 'http.request');
    expect(requestLines.every((line) => line.correlationId === correlationId)).toBe(true);
  });

  it('CA-13: con cabecera válida → la respuesta y las bitácoras usan ese mismo valor', async () => {
    const response = await request(testApp.app.getHttpServer())
      .get('/api/v1/correlation-probe')
      .set('x-correlation-id', 'cliente-42');

    expect(response.status).toBe(200);
    expect(response.headers['x-correlation-id']).toBe('cliente-42');
    const events = testApp.logs.withCorrelationId('cliente-42').map((line) => line.event);
    expect(events).toEqual(expect.arrayContaining(['probe.handled', 'http.request']));
  });

  it('CA-13: con cabecera inválida → se ignora, se genera una nueva y la respuesta es 200', async () => {
    const response = await request(testApp.app.getHttpServer())
      .get('/api/v1/correlation-probe')
      .set('x-correlation-id', 'con espacios');

    expect(response.status).toBe(200);
    expect(response.headers['x-correlation-id']).toMatch(UUID_V4);
  });

  it('CA-31: toda respuesta lleva `x-nimbo-version`', async () => {
    const response = await request(testApp.app.getHttpServer()).get('/api/v1/health/live');

    expect(response.status).toBe(200);
    expect(response.headers['x-nimbo-version']).toBe('test');
  });
});
