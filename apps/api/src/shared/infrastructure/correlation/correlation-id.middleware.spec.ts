import type { IncomingMessage, ServerResponse } from 'node:http';

import { CorrelationContext } from './correlation-context';
import { CorrelationIdMiddleware } from './correlation-id.middleware';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

interface Exchange {
  req: IncomingMessage;
  res: ServerResponse;
  headers: Record<string, string>;
  next: jest.Mock<void, []>;
  seenInContext: () => string | undefined;
}

const exchange = (incoming: Record<string, string> = {}): Exchange => {
  const headers: Record<string, string> = {};
  let seen: string | undefined;
  const next = jest.fn((): void => {
    seen = CorrelationContext.get()?.correlationId;
  });
  return {
    req: { headers: incoming } as unknown as IncomingMessage,
    res: {
      setHeader: (name: string, value: string): void => {
        headers[name] = value;
      },
    } as unknown as ServerResponse,
    headers,
    next,
    seenInContext: (): string | undefined => seen,
  };
};

describe('CorrelationIdMiddleware', () => {
  const middleware = new CorrelationIdMiddleware();

  it('CA-13: sin cabecera → genera un UUID v4, lo responde y lo fija en el contexto', () => {
    const x = exchange();

    middleware.use(x.req, x.res, x.next);

    expect(x.next).toHaveBeenCalledTimes(1);
    expect(x.headers['x-correlation-id']).toMatch(UUID_V4);
    expect(x.seenInContext()).toBe(x.headers['x-correlation-id']);
  });

  it('CA-13: cabecera válida → la devuelve tal cual y la usa en el contexto', () => {
    const x = exchange({ 'x-correlation-id': 'cliente-abc-123' });

    middleware.use(x.req, x.res, x.next);

    expect(x.headers['x-correlation-id']).toBe('cliente-abc-123');
    expect(x.seenInContext()).toBe('cliente-abc-123');
  });

  it('CA-13: cabecera inválida → se ignora, se genera una nueva y no hay error', () => {
    const x = exchange({ 'x-correlation-id': 'con espacios y ñ' });

    expect(() => {
      middleware.use(x.req, x.res, x.next);
    }).not.toThrow();

    expect(x.headers['x-correlation-id']).toMatch(UUID_V4);
    expect(x.seenInContext()).toBe(x.headers['x-correlation-id']);
  });

  it('CA-13: cada petición sin cabecera recibe un identificador distinto', () => {
    const first = exchange();
    const second = exchange();

    middleware.use(first.req, first.res, first.next);
    middleware.use(second.req, second.res, second.next);

    expect(first.headers['x-correlation-id']).not.toBe(second.headers['x-correlation-id']);
  });
});
