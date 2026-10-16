import { JwtService } from '@nestjs/jwt';

import type { OnlyOfficeConnection } from '../application/editing-config';

import { OnlyOfficeEditor } from './onlyoffice-editor';

const CONNECTION: OnlyOfficeConnection = {
  jwtSecret: 'secreto-de-prueba-de-onlyoffice-con-32-caracteres',
  publicUrl: 'http://docs.nimbo.test',
  internalUrl: 'http://onlyoffice.interno.test',
  callbackBaseUrl: 'http://api.nimbo.test',
};
const SESSION_ID = '2f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f';
const USER_ID = '7a8b9c0d-1e2f-4c5d-8e6f-2f0c1d2e3a4b';

const reply = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('OnlyOfficeEditor.dropUser (016 CA-16, ADR-0004)', () => {
  const jwt = new JwtService();
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('CA-16: pide al servicio de comandos sacar a la cuenta, con el comando firmado en HS256', async () => {
    fetchMock.mockResolvedValue(reply({ error: 0 }));

    const dropped = await new OnlyOfficeEditor(jwt, CONNECTION).dropUser(SESSION_ID, USER_ID);

    expect(dropped).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://onlyoffice.interno.test/command');
    expect(init).toMatchObject({ method: 'POST', redirect: 'error' });
    const { token } = JSON.parse(init.body as string) as { token: string };
    expect(
      jwt.verify(token, { secret: CONNECTION.jwtSecret, algorithms: ['HS256'] }),
    ).toMatchObject({ c: 'drop', key: SESSION_ID, users: [USER_ID] });
  });

  it.each([
    ['el servicio responde un error', () => Promise.resolve(reply({ error: 1 }))],
    ['la respuesta no es 2xx', () => Promise.resolve(reply({ error: 0 }, 502))],
    ['la red falla', () => Promise.reject(new TypeError('fetch failed'))],
  ])('devuelve `false` sin lanzar si %s', async (_, response) => {
    fetchMock.mockImplementation(response);

    await expect(new OnlyOfficeEditor(jwt, CONNECTION).dropUser(SESSION_ID, USER_ID)).resolves.toBe(
      false,
    );
  });

  it('sin conexión configurada no llama a nadie y devuelve `false`', async () => {
    await expect(new OnlyOfficeEditor(jwt, null).dropUser(SESSION_ID, USER_ID)).resolves.toBe(
      false,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
