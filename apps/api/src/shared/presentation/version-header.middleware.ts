import type { IncomingMessage, ServerResponse } from 'node:http';

export const VERSION_HEADER = 'x-nimbo-version';

/** Toda respuesta de `api` lleva `x-nimbo-version` = `APP_VERSION` (CA-31); `web` la muestra en la página de estado. */
export class VersionHeaderMiddleware {
  constructor(private readonly version: string) {}

  use(_req: IncomingMessage, res: ServerResponse, next: () => void): void {
    res.setHeader(VERSION_HEADER, this.version);
    next();
  }
}
