import { fetchObjectBytes } from './object-bytes';

const RANGE = { start: 37, end: 46 };
const CONTENT_RANGE = 'bytes 37-46/2048';

let fetchMock: jest.SpiedFunction<typeof fetch>;
let signal: AbortSignal;

const SIGNED_URL =
  'https://objects.test/private-object?X-Amz-Signature=PRIVATE_SIGNATURE&token=PRIVATE_TOKEN';

function readObject(range?: typeof RANGE) {
  return fetchObjectBytes({ url: SIGNED_URL, signal, ...(range === undefined ? {} : { range }) });
}

/** No devolver el resultado evita fijar aquí la representación de los bytes. */
async function succeeded(operation: Promise<unknown>): Promise<boolean> {
  return operation.then(
    () => true,
    () => false,
  );
}

function fetchOptions(): RequestInit {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const call = fetchMock.mock.calls[0];
  expect(call?.[0] === SIGNED_URL).toBe(true);
  const options = call?.[1];
  if (options === undefined) throw new Error('Faltan las opciones del GET de objetos');
  return options;
}

function sentHeaders(): Headers {
  return new Headers(fetchOptions().headers);
}

function rangeResponse(contentRange: string | null = CONTENT_RANGE): Response {
  const headers = new Headers();
  if (contentRange !== null) headers.set('Content-Range', contentRange);
  return new Response(new Uint8Array(10), { status: 206, headers });
}

type Outcome<T> =
  | { readonly kind: 'resolved'; readonly value: T }
  | { readonly kind: 'rejected'; readonly error: unknown };

async function observe<T>(operation: Promise<T>): Promise<Outcome<T>> {
  return operation.then<Outcome<T>, Outcome<T>>(
    (value) => ({ kind: 'resolved', value }),
    (error: unknown) => ({ kind: 'rejected', error }),
  );
}

async function beforeDeadline<T>(operation: Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<{ readonly kind: 'pending' }>((resolve) => {
    // Guardia del arnés: detecta una lectura colgada; vencer nunca declara éxito.
    timer = setTimeout(() => resolve({ kind: 'pending' }), 1000);
  });
  try {
    return await Promise.race([observe(operation), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

function controlledSource() {
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  const cancel = jest.fn();
  const body = new ReadableStream<Uint8Array>({
    start(source) {
      controller = source;
    },
    cancel,
  });
  if (controller === undefined) throw new Error('Falta el controlador del stream de prueba');
  return { body, controller, cancel };
}

function rangeBodyResponse(chunks: readonly number[], contentLength?: string): Response {
  const headers = new Headers({ 'Content-Range': CONTENT_RANGE });
  if (contentLength !== undefined) headers.set('Content-Length', contentLength);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const length of chunks) controller.enqueue(new Uint8Array(length));
      controller.close();
    },
  });
  return new Response(body, { status: 206, headers });
}

async function consumeBody(body: ReadableStream<Uint8Array>): Promise<number> {
  const reader = body.getReader();
  let length = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) return length;
      length += chunk.value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

async function consumeRange(): Promise<number> {
  const { body } = await readObject(RANGE);
  return consumeBody(body);
}

function privateStreamError(): Error {
  return new Error(`PRIVATE_MESSAGE ${SIGNED_URL}`, { cause: new Error('PRIVATE_CAUSE') });
}

function expectSanitizedError(caught: unknown, original?: Error): void {
  expect(caught instanceof Error).toBe(true);
  if (!(caught instanceof Error)) throw new Error('Falta un error público saneado');
  const text = `${caught.message}\n${caught.stack ?? ''}\n${JSON.stringify(caught)}`;
  expect({
    originalEscaped: original !== undefined && caught === original,
    hasCause: Reflect.has(caught, 'cause'),
    hasSignedUrl: text.includes(SIGNED_URL),
    hasSignature: text.includes('X-Amz-Signature'),
    hasPrivatePath: text.includes('private-object'),
    hasPrivateMessage: text.includes('PRIVATE_'),
  }).toEqual({
    originalEscaped: false,
    hasCause: false,
    hasSignedUrl: false,
    hasSignature: false,
    hasPrivatePath: false,
    hasPrivateMessage: false,
  });
}

describe('object-bytes T-07: contrato inicial de transporte', () => {
  beforeEach(() => {
    signal = new AbortController().signal;
    fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(new Uint8Array(10), { status: 200 }));
  });

  afterEach(() => jest.restoreAllMocks());

  it('CA-11: GET completo usa fetch nativo directamente con método GET', async () => {
    expect(await succeeded(readObject())).toBe(true);
    expect(fetchOptions().method === 'GET').toBe(true);
  });

  it('CA-11: GET completo usa exactamente credentials omit', async () => {
    expect(await succeeded(readObject())).toBe(true);
    expect(fetchOptions().credentials === 'omit').toBe(true);
  });

  it('CA-11: propaga el AbortSignal recibido al fetch', async () => {
    expect(await succeeded(readObject())).toBe(true);
    expect(fetchOptions().signal === signal).toBe(true);
  });

  it('CA-11: GET completo no añade Authorization', async () => {
    expect(await succeeded(readObject())).toBe(true);
    expect(sentHeaders().has('authorization')).toBe(false);
  });

  it('CA-11: GET completo no añade Cookie', async () => {
    expect(await succeeded(readObject())).toBe(true);
    expect(sentHeaders().has('cookie')).toBe(false);
  });

  it('CA-11: GET completo no añade x-correlation-id', async () => {
    expect(await succeeded(readObject())).toBe(true);
    expect(sentHeaders().has('x-correlation-id')).toBe(false);
  });

  it('CA-11: GET completo no añade otras cabeceras Nimbo ni cabeceras de aplicación', async () => {
    expect(await succeeded(readObject())).toBe(true);
    expect(Array.from(sentHeaders().keys())).toEqual([]);
  });

  it('CA-11: no propaga RequestInit arbitrario del consumidor al fetch', async () => {
    const unsafeInit = {
      method: 'POST',
      credentials: 'include' as const,
      headers: {
        Authorization: 'Bearer PRIVATE_TOKEN',
        Cookie: 'session=PRIVATE_COOKIE',
        'x-correlation-id': 'PRIVATE_CORRELATION',
        'x-nimbo-test': 'PRIVATE_HEADER',
      },
      body: 'PRIVATE_BODY',
    };
    // Un objeto con propiedades extra no debe convertirse en un passthrough de RequestInit.
    const consumerInput = { url: SIGNED_URL, signal, ...unsafeInit, init: unsafeInit };
    expect(await succeeded(fetchObjectBytes(consumerInput))).toBe(true);
    const options = fetchOptions();
    expect(options.method === 'GET').toBe(true);
    expect(options.credentials === 'omit').toBe(true);
    expect(options.signal === signal).toBe(true);
    expect(options.body === undefined).toBe(true);
    expect(Reflect.has(options, 'init')).toBe(false);
    expect(Array.from(new Headers(options.headers).keys())).toEqual([]);
  });

  it('CA-11: Range envía solo bytes=start-end y las opciones comunes seguras', async () => {
    fetchMock.mockResolvedValue(rangeResponse());
    expect(await succeeded(readObject(RANGE))).toBe(true);
    const options = fetchOptions();
    expect(options.method === 'GET').toBe(true);
    expect(options.credentials === 'omit').toBe(true);
    expect(options.signal === signal).toBe(true);
    const headers = new Headers(options.headers);
    expect(Array.from(headers.keys())).toEqual(['range']);
    expect(headers.get('range') === 'bytes=37-46').toBe(true);
  });

  it.each([201, 204, 416])('CA-11: Range exige 206 y rechaza status %s', async (status) => {
    const body = status === 204 ? null : new Uint8Array(10);
    fetchMock.mockResolvedValue(
      new Response(body, { status, headers: { 'Content-Range': CONTENT_RANGE } }),
    );
    expect(await succeeded(readObject(RANGE))).toBe(false);
  });

  it('CA-11: una respuesta 200 a una solicitud Range es inválida', async () => {
    expect(await succeeded(readObject(RANGE))).toBe(false);
  });

  it('CA-11: Range fallido no provoca un segundo GET completo automático', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(new Uint8Array(10), { status: 200 }))
      .mockResolvedValue(new Response(new Uint8Array(10), { status: 200 }));
    expect(await succeeded(readObject(RANGE))).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentHeaders().get('range') === 'bytes=37-46').toBe(true);
  });

  it('CA-11: acepta Content-Range válido correspondiente a la solicitud', async () => {
    fetchMock.mockResolvedValue(rangeResponse());
    expect(await succeeded(readObject(RANGE))).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('CA-11: rechaza Content-Range ausente en una respuesta Range', async () => {
    fetchMock.mockResolvedValue(rangeResponse(null));
    expect(await succeeded(readObject(RANGE))).toBe(false);
  });

  it.each(['not-a-range', 'items 37-46/2048', 'bytes 37-x/2048'])(
    'CA-11: rechaza Content-Range malformado: %s',
    async (contentRange) => {
      fetchMock.mockResolvedValue(rangeResponse(contentRange));
      expect(await succeeded(readObject(RANGE))).toBe(false);
    },
  );

  it.each(['bytes 38-47/2048', 'bytes 37-45/2048', 'bytes 36-46/2048'])(
    'CA-11: rechaza inicio o fin incompatible: %s',
    async (contentRange) => {
      fetchMock.mockResolvedValue(rangeResponse(contentRange));
      expect(await succeeded(readObject(RANGE))).toBe(false);
    },
  );

  it('CA-2: una señal ya abortada rechaza la lectura sin iniciar fetch', async () => {
    const controller = new AbortController();
    controller.abort();
    signal = controller.signal;
    expect(await succeeded(readObject())).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it('CA-11: una respuesta Range inválida cancela su body cuando es posible', async () => {
    const cancel = jest.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    fetchMock.mockResolvedValue(new Response(body, { status: 206 }));
    expect(await succeeded(readObject(RANGE))).toBe(false);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(body.locked).toBe(false);
  });

  it('CA-2: un fallo de fetch descarta URL firmada, mensaje y cause originales', async () => {
    const originalCause = new Error('PRIVATE_CAUSE');
    const original = new Error(`PRIVATE_FETCH_MESSAGE ${SIGNED_URL}`, { cause: originalCause });
    fetchMock.mockRejectedValue(original);
    const caught: unknown = await readObject().then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(caught instanceof Error).toBe(true);
    if (!(caught instanceof Error)) throw new Error('Falta el error público del transporte');
    expect(caught === original).toBe(false);
    expect(Reflect.has(caught, 'cause')).toBe(false);
    const publicText = `${caught.message}\n${caught.stack ?? ''}\n${JSON.stringify(caught)}`;
    for (const secret of [SIGNED_URL, 'X-Amz-Signature', 'PRIVATE_', 'private-object'])
      expect(publicText.includes(secret)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('object-bytes T-07: segundo RED de streaming y rangos', () => {
  beforeEach(() => {
    signal = new AbortController().signal;
    fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(rangeResponse());
  });

  afterEach(() => jest.restoreAllMocks());

  it.each(['GET completo', 'Range'] as const)(
    'CA-2: %s sanea un error tardío después de entregar el body y un primer chunk',
    async (mode) => {
      const source = controlledSource();
      const headers = new Headers();
      if (mode === 'Range') headers.set('Content-Range', CONTENT_RANGE);
      const response = new Response(source.body, { status: mode === 'Range' ? 206 : 200, headers });
      Object.defineProperty(response, 'url', { value: SIGNED_URL });
      fetchMock.mockResolvedValue(response);
      const { body } = await readObject(mode === 'Range' ? RANGE : undefined);
      const reader = body.getReader();
      try {
        source.controller.enqueue(new Uint8Array(4));
        expect((await reader.read()).value?.byteLength).toBe(4);
        const pending = reader.read();
        const original = privateStreamError();
        source.controller.error(original);
        const outcome = await observe(pending);
        expect(outcome.kind).toBe('rejected');
        if (outcome.kind === 'rejected') expectSanitizedError(outcome.error, original);
      } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
    },
  );

  it('CA-11: cancelar el reader público cancela y libera el stream subyacente', async () => {
    const source = controlledSource();
    fetchMock.mockResolvedValue(
      new Response(source.body, { status: 206, headers: { 'Content-Range': CONTENT_RANGE } }),
    );
    const { body } = await readObject(RANGE);
    const reader = body.getReader();
    try {
      await reader.cancel();
      expect(source.cancel).toHaveBeenCalledTimes(1);
    } finally {
      reader.releaseLock();
    }
    expect(source.body.locked).toBe(false);
  });

  it('CA-11: entrega el body antes del EOF sin consumirlo completo', async () => {
    const source = controlledSource();
    fetchMock.mockResolvedValue(
      new Response(source.body, { status: 206, headers: { 'Content-Range': CONTENT_RANGE } }),
    );
    const request = readObject(RANGE);
    const outcome = await beforeDeadline(request);
    // El EOF posterior también limpia una implementación que se cuelgue esperando el body.
    source.controller.enqueue(new Uint8Array(10));
    source.controller.close();
    const result = await request;
    expect(await consumeBody(result.body)).toBe(10);
    expect(outcome.kind).toBe('resolved');
  });

  it('CA-11: Range acepta Content-Length 10 y diez bytes reales repartidos en chunks', async () => {
    fetchMock.mockResolvedValue(rangeBodyResponse([4, 6], '10'));
    const outcome = await observe(consumeRange());
    expect(outcome.kind).toBe('resolved');
    if (outcome.kind === 'resolved') expect(outcome.value).toBe(10);
  });

  it.each(['9', '11', 'ten', '10.5', '-10', '9007199254740992'])(
    'CA-11: Range rechaza Content-Length inválido %s aunque el body tenga diez bytes',
    async (contentLength) => {
      fetchMock.mockResolvedValue(rangeBodyResponse([4, 6], contentLength));
      const outcome = await observe(consumeRange());
      expect(outcome.kind).toBe('rejected');
      if (outcome.kind === 'rejected') expectSanitizedError(outcome.error);
    },
  );

  it('CA-11: sin Content-Length valida la longitud real contra Content-Range', async () => {
    // RFC 9110 §8.6 recomienda Content-Length; sin él, el rango permite verificar los bytes reales.
    fetchMock.mockResolvedValue(rangeBodyResponse([3, 7]));
    const outcome = await observe(consumeRange());
    expect(outcome.kind).toBe('resolved');
    if (outcome.kind === 'resolved') expect(outcome.value).toBe(10);
  });

  it.each([9, 11])(
    'CA-11: Range falla al consumir %s bytes reales cuando Content-Range exige diez',
    async (length) => {
      const source = controlledSource();
      fetchMock.mockResolvedValue(
        new Response(source.body, { status: 206, headers: { 'Content-Range': CONTENT_RANGE } }),
      );
      const { body } = await readObject(RANGE);
      const consumption = observe(consumeBody(body));
      source.controller.enqueue(new Uint8Array(4));
      source.controller.enqueue(new Uint8Array(length - 4));
      source.controller.close();
      const outcome = await consumption;
      expect(outcome.kind).toBe('rejected');
      if (outcome.kind === 'rejected') expectSanitizedError(outcome.error);
    },
  );

  it('CA-11: acepta EOF 2038-2047/2048 para Range 2038-2099', async () => {
    // RFC 9110 §14.1.2: el último byte solicitado se ajusta a total - 1 cuando excede el objeto.
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array(10), {
        status: 206,
        headers: { 'Content-Range': 'bytes 2038-2047/2048', 'Content-Length': '10' },
      }),
    );
    const outcome = await observe(
      readObject({ start: 2038, end: 2099 }).then(({ body }) => consumeBody(body)),
    );
    expect(outcome.kind).toBe('resolved');
    if (outcome.kind === 'resolved') expect(outcome.value).toBe(10);
    expect(sentHeaders().get('range') === 'bytes=2038-2099').toBe(true);
  });

  it.each([
    ['inicio distinto', 'bytes 2039-2047/2048'],
    ['fin mayor al solicitado', 'bytes 2038-2100/2200'],
    ['fin mayor o igual al total', 'bytes 2038-2099/2048'],
    ['rango vacío', 'bytes 2038-2037/2048'],
    ['fin corto sin llegar al EOF', 'bytes 2038-2046/2048'],
    ['total incompatible con el final', 'bytes 2038-2047/2047'],
    ['total que no justifica acortar el rango', 'bytes 2038-2047/4096'],
  ])('CA-11: rechaza un falso ajuste EOF: %s', async (_label, contentRange) => {
    fetchMock.mockResolvedValue(rangeResponse(contentRange));
    const outcome = await observe(readObject({ start: 2038, end: 2099 }));
    expect(outcome.kind).toBe('rejected');
    if (outcome.kind === 'rejected') expectSanitizedError(outcome.error);
  });

  it.each([
    ['total cero', 'bytes 37-46/0'],
    ['total igual al fin', 'bytes 37-46/46'],
    ['total menor al fin', 'bytes 37-46/45'],
    ['total no seguro', 'bytes 37-46/9007199254740992'],
    ['inicio negativo', 'bytes -37-46/2048'],
    ['fin negativo', 'bytes 37--46/2048'],
    ['total negativo', 'bytes 37-46/-2048'],
    ['inicio decimal', 'bytes 37.5-46/2048'],
    ['fin decimal', 'bytes 37-46.5/2048'],
    ['total decimal', 'bytes 37-46/2048.5'],
    ['espacio adicional', 'bytes  37-46/2048'],
    ['espacio dentro del intervalo', 'bytes 37 -46/2048'],
    ['basura adicional', 'bytes 37-46/2048 extra'],
    ['total desconocido', 'bytes 37-46/*'],
    ['intervalo invertido', 'bytes 46-37/2048'],
  ])('CA-11: rechaza Content-Range inválido: %s', async (_label, contentRange) => {
    fetchMock.mockResolvedValue(rangeResponse(contentRange));
    const outcome = await observe(readObject(RANGE));
    expect(outcome.kind).toBe('rejected');
    if (outcome.kind === 'rejected') expectSanitizedError(outcome.error);
  });

  it.each([
    ['inicio no seguro', { start: Number.MAX_SAFE_INTEGER + 1, end: Number.MAX_SAFE_INTEGER + 1 }],
    ['fin no seguro', { start: 37, end: Number.MAX_SAFE_INTEGER + 1 }],
    ['inicio negativo', { start: -1, end: 46 }],
    ['fin negativo', { start: 0, end: -1 }],
    ['inicio decimal', { start: 37.5, end: 46 }],
    ['fin decimal', { start: 37, end: 46.5 }],
    ['intervalo invertido', { start: 46, end: 37 }],
  ] as const)('CA-11: rechaza Range de entrada inválido sin fetch: %s', async (_label, range) => {
    const outcome = await observe(readObject(range));
    expect(outcome.kind).toBe('rejected');
    expect(fetchMock).toHaveBeenCalledTimes(0);
    if (outcome.kind === 'rejected') expectSanitizedError(outcome.error);
  });

  it('CA-2: abort cancela el read pendiente sin bytes tardíos ni reason privado', async () => {
    const abort = new AbortController();
    signal = abort.signal;
    const source = controlledSource();
    fetchMock.mockResolvedValue(
      new Response(source.body, { status: 206, headers: { 'Content-Range': CONTENT_RANGE } }),
    );
    const { body } = await readObject(RANGE);
    const reader = body.getReader();
    try {
      source.controller.enqueue(new Uint8Array(4));
      expect((await reader.read()).value?.byteLength).toBe(4);
      const pending = reader.read();
      const reason = privateStreamError();
      abort.abort(reason);
      const interrupted = await beforeDeadline(pending);
      if (source.cancel.mock.calls.length === 0) {
        source.controller.enqueue(new Uint8Array(6));
        source.controller.close();
      }
      const late = await observe(pending);
      expect({
        settledBeforeLateBytes: interrupted.kind !== 'pending',
        acceptedLateBytes: late.kind === 'resolved' && !late.value.done,
        underlyingCancelled: source.cancel.mock.calls.length === 1,
      }).toEqual({
        settledBeforeLateBytes: true,
        acceptedLateBytes: false,
        underlyingCancelled: true,
      });
      if (late.kind === 'rejected') expectSanitizedError(late.error, reason);
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  });
});
