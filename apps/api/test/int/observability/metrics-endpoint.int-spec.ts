import { once } from 'node:events';
import type { Server } from 'node:http';

import { Controller, Get, Post, RequestMethod } from '@nestjs/common';
import type { INestApplication, Type } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { OnlyOfficeController } from '../../../src/modules/editing/presentation/onlyoffice.controller';
import { AgentController } from '../../../src/modules/intelligence/presentation/agent.controller';
import { EnvModule, Public } from '../../../src/shared';
import type { SharedEnvBase } from '../../../src/shared';
import { createLoggerModule } from '../../../src/shared/infrastructure/logging/logger.module';
import {
  attachMetricsRoute,
  MetricsModule,
  startMetricsServer,
} from '../../../src/shared/infrastructure/metrics/metrics.module';
import { createLogSinkModule, LogSink } from '../setup/log-sink';
import { createTestApp } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';

const FILE_ID = '3f8c2a4e-9d1b-4c7a-8e2f-1a2b3c4d5e6f';
const EMAIL = 'ana@cliente.test';
const DURATION_SERIES = 'nimbo_http_request_duration_seconds';
/** Las dos plantillas que excluye la regla 2 de latencia (RNF-01, plan 022 S-5). */
const RULE2_EXCLUDED_ROUTES = ['POST /api/v1/agent/ask', 'GET /api/v1/editing/content/:token'];

/** Rutas de prueba con la forma de las reales: nunca responden contenido. */
@Public()
@Controller('demo')
class DemoProbeController {
  @Get('items/:itemId')
  item(): { ok: true } {
    return { ok: true };
  }
}

@Public()
@Controller('agent')
class AgentAskProbeController {
  @Post('ask')
  ask(): { ok: true } {
    return { ok: true };
  }
}

@Public()
@Controller('editing')
class EditingContentProbeController {
  @Get('content/:token')
  content(): { ok: true } {
    return { ok: true };
  }
}

/** Plantilla que declara un controlador real, leída de sus metadatos (`MÉTODO /api/v1/ruta`). */
const routeOf = (controller: Type<unknown>, handler: string): string => {
  const base = Reflect.getMetadata(PATH_METADATA, controller) as string;
  const handlerFn = (controller.prototype as Record<string, unknown>)[handler] as object;
  const path = Reflect.getMetadata(PATH_METADATA, handlerFn) as string;
  const method = Reflect.getMetadata(METHOD_METADATA, handlerFn) as RequestMethod;
  return `${RequestMethod[method]} /api/v1/${base}/${path}`;
};

const scrape = async (server: Server): Promise<string> => {
  const response = await request(server).get('/metrics').expect(200);
  return response.text;
};

const closeServer = (server: Server): Promise<void> =>
  new Promise((resolve) => {
    server.close(() => resolve());
  });

describe('022 T-02: métricas HTTP y servidor privado del api (CA-1, CA-2, CA-5, CA-12)', () => {
  let testApp: TestApp;
  let privateServer: Server;

  beforeAll(async () => {
    testApp = await createTestApp({
      controllers: [DemoProbeController, AgentAskProbeController, EditingContentProbeController],
    });
    privateServer = startMetricsServer(testApp.app, 0);
    await once(privateServer, 'listening');
  });

  afterAll(async () => {
    await closeServer(privateServer);
    await testApp.close();
  });

  it('CA-1: el servidor privado expone las peticiones HTTP por plantilla de ruta y código, y los procesos', async () => {
    await request(testApp.app.getHttpServer()).get(`/api/v1/demo/items/${FILE_ID}`).expect(200);

    const text = await scrape(privateServer);
    expect(text).toMatch(
      /nimbo_http_request_duration_seconds_count\{route="GET \/api\/v1\/demo\/items\/:itemId",status="200"\} [1-9]/,
    );
    expect(text).toContain(`${DURATION_SERIES}_bucket{`);
    expect(text).toContain('process_cpu_user_seconds_total');
    expect(text).toContain('nodejs_heap_size_total_bytes');
  });

  it('CA-5: ni la URL real, ni el identificador, ni el correo ni la consulta aparecen en ninguna serie', async () => {
    await request(testApp.app.getHttpServer())
      .get(`/api/v1/demo/items/${FILE_ID}?correo=${EMAIL}`)
      .expect(200);
    await request(testApp.app.getHttpServer())
      .get(`/api/v1/usuarios/${EMAIL}/${FILE_ID}`)
      .expect(404);

    const text = await scrape(privateServer);
    expect(text).not.toContain(FILE_ID);
    expect(text).not.toContain(EMAIL);
    expect(text).not.toContain('usuarios');
    expect(text).not.toContain('?');
    expect(text).toContain('route="GET <sin patrón>",status="404"');
  });

  it('CA-12: las dos plantillas que excluye la regla 2 coinciden con las que emite el middleware y con los controladores reales', async () => {
    expect([routeOf(AgentController, 'ask'), routeOf(OnlyOfficeController, 'content')]).toEqual(
      RULE2_EXCLUDED_ROUTES,
    );

    await request(testApp.app.getHttpServer()).post('/api/v1/agent/ask').expect(201);
    await request(testApp.app.getHttpServer())
      .get('/api/v1/editing/content/token-de-prueba')
      .expect(200);

    const text = await scrape(privateServer);
    for (const route of RULE2_EXCLUDED_ROUTES) {
      expect(text).toContain(`route="${route}"`);
    }
  });

  it('CA-2: `/api/v1/metrics` y `/metrics` no existen en la app pública y responden 404', async () => {
    await request(testApp.app.getHttpServer()).get('/api/v1/metrics').expect(404);
    await request(testApp.app.getHttpServer()).get('/metrics').expect(404);
  });
});

/** Entorno mínimo de un `worker`: el arranque de sus métricas solo necesita el contrato común. */
const WORKER_ENV: SharedEnvBase = {
  NODE_ENV: 'test',
  APP_ENV: 'test',
  APP_VERSION: 'test',
  LOG_LEVEL: 'info',
  DATABASE_URL: 'postgres://nimbo@localhost:5432/nimbo',
  REDIS_URL: 'redis://localhost:6379',
};

describe('022 T-02: /metrics del worker en su puerto interno (CA-2)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        createLogSinkModule(new LogSink()),
        EnvModule.forRoot(WORKER_ENV),
        createLoggerModule(),
        MetricsModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication({ bodyParser: false, logger: false });
    attachMetricsRoute(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('CA-2: el worker responde `/metrics` fuera de `/api/v1` con el formato de Prometheus', async () => {
    const response = await request(app.getHttpServer()).get('/metrics').expect(200);

    expect(response.headers['content-type']).toMatch(/^text\/plain/);
    expect(response.text).toContain('process_cpu_user_seconds_total');
    await request(app.getHttpServer()).get('/api/v1/metrics').expect(404);
  });
});
