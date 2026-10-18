/** Origen de objetos controlado: responde rangos como MinIO y registra exactamente lo que pide el helper real. */
export const SIGNED_URL = 'https://objects.test/private-object?X-Amz-Signature=PRIVATE_SIGNATURE';

export type ObservedRequest = {
  readonly start: number;
  readonly end: number;
  readonly credentials: RequestCredentials | undefined;
  readonly headers: readonly string[];
  readonly method: string | undefined;
};

export type ObjectServer = {
  readonly requests: ObservedRequest[];
  readonly signals: AbortSignal[];
  failAfter: number;
};

function rangeOf(init: RequestInit | undefined): { start: number; end: number } {
  const match = /^bytes=(\d+)-(\d+)$/.exec(new Headers(init?.headers).get('Range') ?? '');
  if (match === null) throw new Error('El origen de prueba solo acepta rangos');
  return { start: Number(match[1]), end: Number(match[2]) };
}

export function serveObject(bytes: Uint8Array): ObjectServer {
  const server: ObjectServer = { requests: [], signals: [], failAfter: Number.POSITIVE_INFINITY };
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (input !== SIGNED_URL) throw new Error('URL inesperada');
    const { start, end: requested } = rangeOf(init);
    const end = Math.min(requested, bytes.length - 1);
    server.requests.push({
      start,
      end,
      credentials: init?.credentials,
      headers: [...new Headers(init?.headers).keys()],
      method: init?.method,
    });
    if (init?.signal) server.signals.push(init.signal);
    if (server.requests.length > server.failAfter) return new Response(null, { status: 403 });
    return new Response(bytes.slice(start, end + 1), {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${bytes.length}`,
        'Content-Length': String(end - start + 1),
      },
    });
  });
  return server;
}
