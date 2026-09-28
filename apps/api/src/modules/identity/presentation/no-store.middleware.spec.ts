import type { IncomingMessage, ServerResponse } from 'node:http';

import { NoStoreMiddleware } from './no-store.middleware';

describe('NoStoreMiddleware', () => {
  it('CA-1, CA-5: fija `Cache-Control: no-store` antes del controlador y sigue la cadena', () => {
    const headers: Record<string, string> = {};
    const res = {
      setHeader: (name: string, value: string): void => {
        headers[name] = value;
      },
    } as unknown as ServerResponse;
    const next = jest.fn();

    new NoStoreMiddleware().use({} as IncomingMessage, res, next);

    expect(headers).toEqual({ 'Cache-Control': 'no-store' });
    expect(next).toHaveBeenCalledTimes(1);
  });
});
