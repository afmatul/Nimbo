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

describe('OnlyOfficeEditor.verifyCallback (016 CA-19, plan §4: se usa el payload del JWT)', () => {
  const jwt = new JwtService();
  const editor = new OnlyOfficeEditor(jwt, CONNECTION);
  const body = {
    key: SESSION_ID,
    status: 2,
    url: 'http://onlyoffice.interno.test/cache/x.docx',
    users: [USER_ID],
  };
  const signed = (
    payload: object,
    secret = CONNECTION.jwtSecret,
    algorithm: 'HS256' | 'HS512' = 'HS256',
  ) => jwt.sign(payload, { secret, algorithm });

  it.each([
    [1, 'editing'],
    [2, 'ready'],
    [3, 'failed'],
    [4, 'closed'],
    [6, 'ignored'],
    [7, 'ignored'],
  ] as const)('CA-9, CA-11: el estado %d de ONLYOFFICE es la señal `%s`', (status, kind) => {
    expect(editor.verifyCallback(signed({ ...body, status }))).toEqual({
      documentKey: SESSION_ID,
      kind,
      users: [USER_ID],
      downloadUrl: body.url,
    });
  });

  it('acepta la forma de la cabecera (`{ payload }`) y un aviso sin usuarios ni URL', () => {
    const token = signed({ payload: { key: SESSION_ID, status: 4 } });

    expect(editor.verifyCallback(token)).toEqual({
      documentKey: SESSION_ID,
      kind: 'closed',
      users: [],
      downloadUrl: null,
    });
  });

  it.each([
    ['otra clave', () => signed(body, `${CONNECTION.jwtSecret}-otra`)],
    ['otro algoritmo (HS512)', () => signed(body, CONNECTION.jwtSecret, 'HS512')],
    [
      'sin firma (`alg: none`)',
      () =>
        `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify(body)).toString('base64url')}.`,
    ],
    ['basura', () => 'no-es-un-jwt'],
    ['sin clave de documento', () => signed({ status: 2 })],
    ['estado que no es número', () => signed({ ...body, status: '2' })],
    ['usuarios que no son texto', () => signed({ ...body, users: [1] })],
  ])('CA-19: con %s no hay aviso', (_case, token) => {
    expect(editor.verifyCallback(token())).toBeNull();
  });

  it('sin conexión configurada no verifica nada', () => {
    expect(new OnlyOfficeEditor(jwt, null).verifyCallback(signed(body))).toBeNull();
  });
});

describe('OnlyOfficeEditor.download (016 CA-19: lista blanca por origen, sin redirecciones, con tope)', () => {
  const jwt = new JwtService();
  const editor = new OnlyOfficeEditor(jwt, CONNECTION);
  const MAX_BYTES = 1000n;
  const document = (size: number, headers: Record<string, string> = {}): Response =>
    new Response(Buffer.alloc(size, 0x61), {
      status: 200,
      headers: { 'content-length': String(size), ...headers },
    });
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  const readAll = async (stream: NodeJS.ReadableStream): Promise<Buffer> => {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
    return Buffer.concat(chunks);
  };

  it.each([
    'http://onlyoffice.interno.test/cache/files/out.docx',
    'http://docs.nimbo.test/cache/files/out.docx?md5=abc',
  ])('CA-9: descarga de un origen de ONLYOFFICE (%s), como flujo y con su tamaño', async (url) => {
    fetchMock.mockResolvedValue(document(600));

    const downloaded = await editor.download(url, MAX_BYTES);

    expect(downloaded.sizeBytes).toBe(600n);
    expect(await readAll(downloaded.content)).toHaveLength(600);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual' });
  });

  it.each([
    ['otro origen', 'http://evil.test/out.docx'],
    ['un origen parecido', 'http://onlyoffice.interno.test.evil.test/out.docx'],
    ['credenciales que esconden el host', 'http://onlyoffice.interno.test@evil.test/out.docx'],
    ['otro puerto', 'http://onlyoffice.interno.test:8443/out.docx'],
    ['otro esquema', 'https://onlyoffice.interno.test/out.docx'],
    ['un archivo local', 'file:///etc/passwd'],
    ['algo que no es URL', 'no es una url'],
  ])('CA-19: rechaza %s sin descargar nada', async (_case, url) => {
    await expect(editor.download(url, MAX_BYTES)).rejects.toMatchObject({
      reason: 'untrusted_url',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('CA-19: no sigue una redirección', async () => {
    fetchMock.mockResolvedValue(
      new Response(null, { status: 302, headers: { location: 'http://evil.test/x' } }),
    );

    await expect(
      editor.download('http://onlyoffice.interno.test/out.docx', MAX_BYTES),
    ).rejects.toMatchObject({ reason: 'redirect' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['declara más que el tope', () => document(1001), 'too_large'],
    ['no declara su tamaño', () => new Response(Buffer.alloc(10), { status: 200 }), 'no_length'],
  ])('CA-14: rechaza un documento que %s', async (_case, response, reason) => {
    fetchMock.mockResolvedValue(response());

    await expect(
      editor.download('http://onlyoffice.interno.test/out.docx', MAX_BYTES),
    ).rejects.toMatchObject({ reason });
  });

  it('CA-14: un documento que trae más bytes de los declarados corta el flujo con error', async () => {
    fetchMock.mockResolvedValue(
      new Response(Buffer.alloc(900, 0x61), { status: 200, headers: { 'content-length': '500' } }),
    );

    const downloaded = await editor.download('http://onlyoffice.interno.test/out.docx', MAX_BYTES);

    await expect(readAll(downloaded.content)).rejects.toThrow();
  });

  it('un error del servidor de documentos es transitorio: lanza para reintentar, no es un rechazo', async () => {
    fetchMock.mockResolvedValue(new Response('fallo', { status: 503 }));

    const failure = await editor
      .download('http://onlyoffice.interno.test/out.docx', MAX_BYTES)
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toHaveProperty('reason');
  });
});
