import type { IncomingMessage, ServerResponse } from 'node:http';

import type { NestMiddleware } from '@nestjs/common';

const CACHE_CONTROL = 'Cache-Control';
const NO_STORE = 'no-store';

/**
 * Toda respuesta de `AuthController` lleva `Cache-Control: no-store` (plan §5), también los errores que escribe
 * `DomainExceptionFilter` (`422`, `429`): al fijarla antes del controlador, el filtro la conserva.
 */
export class NoStoreMiddleware implements NestMiddleware {
  use(_req: IncomingMessage, res: ServerResponse, next: () => void): void {
    res.setHeader(CACHE_CONTROL, NO_STORE);
    next();
  }
}
