import { requestJson } from './api-client';
import { ApiClientError } from './api-error';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      'content-type': 'application/json',
      ...Object.fromEntries(new Headers(init.headers)),
    },
  });
}

describe('requestJson', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it('envía x-correlation-id y devuelve el cuerpo en un 2xx', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'accepted' }, { status: 202 }));

    await expect(
      requestJson('http://localhost/api/v1/auth/register', { method: 'POST' }),
    ).resolves.toEqual({
      status: 'accepted',
    });

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const headers = new Headers(init?.headers);
    expect(headers.get('x-correlation-id')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('un error válido expone code, fields, correlationId y Retry-After', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          code: 'IDENTITY_INVALID_INPUT',
          message: 'Revisa los campos marcados y corrígelos para continuar.',
          correlationId: 'corr-1',
          fields: [
            {
              field: 'email',
              reason: 'INVALID_EMAIL',
              message: 'Escribe un correo válido, por ejemplo nombre@dominio.com.',
            },
          ],
        },
        { status: 422, headers: { 'retry-after': '90' } },
      ),
    );

    const error = await requestJson('http://localhost/api/v1/auth/register').catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({
      code: 'IDENTITY_INVALID_INPUT',
      correlationId: 'corr-1',
      retryAfterSeconds: 90,
      fields: [{ field: 'email', reason: 'INVALID_EMAIL' }],
    });
  });

  it('red caída o cuerpo no válido → error genérico con correlationId', async () => {
    fetchMock.mockRejectedValue(new TypeError('failed'));
    const network = await requestJson('http://localhost/api/v1/auth/register').catch(
      (caught: unknown) => caught,
    );
    expect(network).toBeInstanceOf(ApiClientError);
    expect((network as ApiClientError).message).toContain(
      (network as ApiClientError).correlationId,
    );
    expect((network as ApiClientError).code).toBe('INTERNAL_ERROR');

    fetchMock.mockResolvedValue(
      new Response('no-json', { status: 500, headers: { 'x-correlation-id': 'desde-api' } }),
    );
    const invalid = await requestJson('http://localhost/api/v1/auth/register').catch(
      (caught: unknown) => caught,
    );
    expect(invalid).toMatchObject({ correlationId: 'desde-api', code: 'INTERNAL_ERROR' });
  });
});
