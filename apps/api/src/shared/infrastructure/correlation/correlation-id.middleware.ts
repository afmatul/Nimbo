import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { CorrelationContext, isValidCorrelationId } from './correlation-context';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

const incomingCorrelationId = (req: IncomingMessage): string | undefined => {
  const raw = req.headers[CORRELATION_ID_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value !== undefined && isValidCorrelationId(value) ? value : undefined;
};

/**
 * Primer middleware de la cadena (`app.use` en `main.ts`): fija el `correlationId` de la petición,
 * lo devuelve en la respuesta y abre el `CorrelationContext` para el resto del ciclo (CA-13).
 * Una cabecera inválida se ignora sin error.
 */
export class CorrelationIdMiddleware {
  use(req: IncomingMessage, res: ServerResponse, next: () => void): void {
    const correlationId = incomingCorrelationId(req) ?? randomUUID();
    res.setHeader(CORRELATION_ID_HEADER, correlationId);
    CorrelationContext.run({ correlationId }, next);
  }
}
