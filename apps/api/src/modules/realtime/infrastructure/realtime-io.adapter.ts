import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { REALTIME_PATH } from '@nimbo/contracts';
import type { Server, ServerOptions } from 'socket.io';

import { CorrelationContext } from '../../../shared';
import type { RealtimeConfig } from '../application/realtime-config';

/** Lo mínimo del logger que usa el adaptador. Nunca registra el `Origin` ni el token (CA-13). */
export interface OriginRejectionLogger {
  warn(payload: Record<string, unknown>): void;
}

type AllowRequestCallback = (error: string | null | undefined, success: boolean) => void;

/** Motivo que recibe el cliente rechazado por `Origin` (engine.io responde 403). */
const ORIGIN_REJECTION = 'origin';

/**
 * Adaptador de WebSocket de Nest para el canal en vivo (plan §2): ruta fija, CORS y `allowRequest` con los orígenes
 * exactos de `CORS_ORIGIN` (RN-3: un `Origin` presente y no listado se rechaza; un cliente sin `Origin` no es un
 * navegador y pasa al *handshake*), y el latido de `RealtimeConfig` (RN-9).
 */
export class RealtimeIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly config: RealtimeConfig,
    private readonly logger: OriginRejectionLogger,
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    return super.createIOServer(port, { ...options, ...this.channelOptions() }) as Server;
  }

  private channelOptions(): Partial<ServerOptions> {
    return {
      path: REALTIME_PATH,
      cors: { origin: [...this.config.origins] },
      pingInterval: this.config.pingIntervalMs,
      pingTimeout: this.config.pingTimeoutMs,
      allowRequest: (request, callback) => this.allowOrigin(request, callback),
    };
  }

  private allowOrigin(request: IncomingMessage, callback: AllowRequestCallback): void {
    const { origin } = request.headers;
    if (origin === undefined || this.config.origins.includes(origin)) {
      callback(null, true);
      return;
    }
    CorrelationContext.run({ correlationId: randomUUID() }, () =>
      this.logger.warn({ event: 'realtime.rejected', reason: ORIGIN_REJECTION }),
    );
    callback(ORIGIN_REJECTION, false);
  }
}
