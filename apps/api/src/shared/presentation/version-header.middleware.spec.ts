import type { IncomingMessage, ServerResponse } from 'node:http';

import { VersionHeaderMiddleware } from './version-header.middleware';

describe('VersionHeaderMiddleware', () => {
  it('CA-31: responde `x-nimbo-version` con el valor de `APP_VERSION` y sigue la cadena', () => {
    const headers: Record<string, string> = {};
    const res = {
      setHeader: (name: string, value: string): void => {
        headers[name] = value;
      },
    } as unknown as ServerResponse;
    const next = jest.fn();
    const middleware = new VersionHeaderMiddleware('sha-abc1234');

    middleware.use({} as IncomingMessage, res, next);

    expect(headers).toEqual({ 'x-nimbo-version': 'sha-abc1234' });
    expect(next).toHaveBeenCalledTimes(1);
  });
});
