/**
 * @jest-environment node
 */
import { renderToStaticMarkup } from 'react-dom/server';

import StatusPage from './page';

type FetchResponseStub = Pick<Response, 'ok' | 'status' | 'json'> & {
  headers: Pick<Headers, 'get'>;
};

function stubFetch(handler: () => Promise<FetchResponseStub>): jest.SpyInstance {
  return jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(handler as unknown as typeof globalThis.fetch);
}

function response(status: number, body: unknown, version?: string): FetchResponseStub {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: { get: (name: string) => (name === 'x-nimbo-version' ? (version ?? null) : null) },
  };
}

async function renderPage(): Promise<string> {
  return renderToStaticMarkup(await StatusPage());
}

describe('StatusPage', () => {
  beforeEach(() => {
    process.env['APP_ENV'] = 'test';
    process.env['API_INTERNAL_URL'] = 'http://api.test:3000';
  });

  it('CA-33: con `ready` en 200 muestra «Nimbo», el ambiente y «API: disponible»', async () => {
    const fetchSpy = stubFetch(() =>
      Promise.resolve(
        response(200, { status: 'ok', checks: { postgres: 'up', redis: 'up', minio: 'up' } }),
      ),
    );

    const html = await renderPage();

    expect(html).toContain('Nimbo');
    expect(html).toContain('Ambiente: test');
    expect(html).toContain('API: disponible');
    expect(html).not.toContain('no disponible');
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://api.test:3000/api/v1/health/ready',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('CA-33: con `ready` en 503 muestra «API: no disponible…» sin exponer detalles', async () => {
    stubFetch(() => Promise.resolve(response(503, { status: 'error', checks: { redis: 'down' } })));

    const html = await renderPage();

    expect(html).toContain('API: no disponible. Revisa el estado de los servicios.');
    expect(html).not.toContain('redis');
    expect(html).not.toContain('api.test');
  });

  it('CA-33: si `fetch` falla (API apagada) muestra «API: no disponible…»', async () => {
    stubFetch(() => Promise.reject(new Error('ECONNREFUSED api.test:3000')));

    const html = await renderPage();

    expect(html).toContain('API: no disponible. Revisa el estado de los servicios.');
    expect(html).not.toContain('ECONNREFUSED');
  });

  it('CA-31: muestra `x-nimbo-version` cuando la API la envía', async () => {
    stubFetch(() =>
      Promise.resolve(response(200, { status: 'ok', checks: { redis: 'up' } }, 'sha-abc1234')),
    );

    const html = await renderPage();

    expect(html).toContain('sha-abc1234');
  });
});
