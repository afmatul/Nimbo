import { EventEmitter } from 'node:events';

import type { Request, Response } from 'express';
import { Registry } from 'prom-client';

import { HttpMetricsMiddleware, HTTP_REQUEST_DURATION_SECONDS } from './http-metrics.middleware';

const FILE_ID = '3f8c2a4e-9d1b-4c7a-8e2f-1a2b3c4d5e6f';
const EMAIL = 'ana@cliente.test';

class FakeResponse extends EventEmitter {
  statusCode = 200;
}

interface FakeRequestShape {
  readonly method: string;
  readonly path: string;
  readonly baseUrl?: string;
  readonly route?: { readonly path: string };
}

const fakeRequest = (shape: FakeRequestShape): Request =>
  ({
    method: shape.method,
    path: shape.path,
    baseUrl: shape.baseUrl ?? '',
    route: shape.route,
  }) as unknown as Request;

/** Atiende una petición fingida: `next` la deja pasar y el `finish` de la respuesta cierra la medición. */
const serve = (
  middleware: HttpMetricsMiddleware,
  shape: FakeRequestShape,
  status: number,
): { readonly next: jest.Mock } => {
  const response = new FakeResponse();
  const next = jest.fn();
  response.statusCode = status;
  middleware.use(fakeRequest(shape), response as unknown as Response, next);
  response.emit('finish');
  return { next };
};

const exposition = (registry: Registry): Promise<string> =>
  registry.getSingleMetricAsString(HTTP_REQUEST_DURATION_SECONDS);

describe('HttpMetricsMiddleware (022 T-02)', () => {
  let registry: Registry;
  let middleware: HttpMetricsMiddleware;

  beforeEach(() => {
    registry = new Registry();
    middleware = new HttpMetricsMiddleware(registry);
  });

  it('CA-1: registra cada petición con la plantilla de ruta (método incluido), su código y una duración', async () => {
    const { next } = serve(
      middleware,
      { method: 'GET', path: `/api/v1/files/${FILE_ID}`, route: { path: '/api/v1/files/:fileId' } },
      200,
    );

    expect(next).toHaveBeenCalledTimes(1);
    const text = await exposition(registry);
    expect(text).toContain(
      'nimbo_http_request_duration_seconds_count{route="GET /api/v1/files/:fileId",status="200"} 1',
    );
  });

  it('CA-1: cuenta también las peticiones sin ruta y sus 4xx, con la etiqueta `<sin patrón>`', async () => {
    serve(middleware, { method: 'POST', path: '/api/v1/no-existe' }, 404);

    const text = await exposition(registry);
    expect(text).toContain(
      'nimbo_http_request_duration_seconds_count{route="POST <sin patrón>",status="404"} 1',
    );
  });

  it('CA-1: el comodín que Nest registra para los no encontrados cuenta como `<sin patrón>`, no como plantilla', async () => {
    serve(
      middleware,
      { method: 'GET', path: '/api/v1/no-existe', route: { path: '/api/v1{/*splat}' } },
      404,
    );

    const text = await exposition(registry);
    expect(text).toContain(
      'nimbo_http_request_duration_seconds_count{route="GET <sin patrón>",status="404"} 1',
    );
    expect(text).not.toContain('{/*splat}');
  });

  it('CA-5: nunca usa la URL real; un identificador o un correo en la ruta o la consulta no aparecen en ninguna serie', async () => {
    serve(
      middleware,
      {
        method: 'GET',
        path: `/api/v1/files/${FILE_ID}`,
        route: { path: '/api/v1/files/:fileId' },
      },
      200,
    );
    serve(middleware, { method: 'GET', path: `/api/v1/usuarios/${EMAIL}` }, 404);

    const text = await exposition(registry);
    expect(text).not.toContain(FILE_ID);
    expect(text).not.toContain(EMAIL);
    expect(text).not.toContain('?');
  });
});
