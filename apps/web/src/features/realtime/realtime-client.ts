import {
  REALTIME_ERROR_CODES,
  REALTIME_EVENTS,
  REALTIME_PATH,
  SHARED_ERROR_CODES,
} from '@nimbo/contracts';
import { io, type Socket } from 'socket.io-client';

/** Espera ante un 429 que no trae `retryAfterSeconds`: la ventana del límite de intentos del `api` (CA-14). */
export const DEFAULT_RETRY_AFTER_SECONDS = 60;
const MS_PER_SECOND = 1_000;

/** Token que el canal presenta en cada intento; lo actualizan la sesión y la propia renovación del canal. */
export interface TokenHolder {
  current: string | null;
}

export interface RealtimeConnection {
  readonly apiPublicUrl: string;
  readonly token: TokenHolder;
  readonly renew: () => Promise<string | null>;
}

function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null && key in value
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function retryDelayMs(data: unknown): number {
  const seconds = field(data, 'retryAfterSeconds');
  return (typeof seconds === 'number' ? seconds : DEFAULT_RETRY_AFTER_SECONDS) * MS_PER_SECOND;
}

function errorData(error: Error): unknown {
  return 'data' in error ? error.data : undefined;
}

/**
 * Canal abierto mientras haya sesión. Si el servidor lo rechaza o lo cierra por token vencido, lo reabre con el token
 * que la sesión ya renovó o, si sigue siendo el mismo, renueva primero (CA-4). Si lo rechaza por exceso de intentos,
 * lo reabre tras la espera indicada (CA-14): `socket.io-client` no reintenta un rechazo del *handshake*.
 */
class RealtimeChannel {
  private readonly socket: Socket;
  private presentedToken: string | null;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;

  constructor(private readonly connection: RealtimeConnection) {
    this.presentedToken = connection.token.current;
    this.socket = this.open();
    this.socket.on('connect_error', (error: Error) => this.onRejected(errorData(error)));
    this.socket.on(REALTIME_EVENTS.SESSION_EXPIRED, (payload: unknown) => this.onRejected(payload));
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    this.socket.off();
    this.socket.disconnect();
  }

  /**
   * Abre el canal en el origen de la API (la ruta de la API no es un *namespace*). `auth` es una función: cada
   * intento, también las reconexiones automáticas tras un corte de red (CA-11), lee el token vigente y nunca lo pone
   * en la URL.
   */
  private open(): Socket {
    const { apiPublicUrl, token } = this.connection;
    return io(new URL(apiPublicUrl).origin, {
      path: REALTIME_PATH,
      auth: (send) => {
        this.presentedToken = token.current;
        send({ token: token.current });
      },
    });
  }

  private onRejected(data: unknown): void {
    const code = field(data, 'code');
    if (code === SHARED_ERROR_CODES.UNAUTHENTICATED) void this.reopenWithFreshToken();
    if (code === REALTIME_ERROR_CODES.TOO_MANY_REQUESTS) this.reopenAfter(retryDelayMs(data));
  }

  private async reopenWithFreshToken(): Promise<void> {
    const { token, renew } = this.connection;
    if (token.current === this.presentedToken) {
      const renewed = await renew();
      if (renewed === null) return;
      token.current = renewed;
    }
    this.reopen();
  }

  private reopenAfter(delayMs: number): void {
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.reopen(), delayMs);
  }

  private reopen(): void {
    if (this.stopped) return;
    this.socket.disconnect().connect();
  }
}

/** Abre el canal en vivo de la pestaña. Devuelve la función que lo cierra. */
export function startRealtime(connection: RealtimeConnection): () => void {
  const channel = new RealtimeChannel(connection);
  return () => channel.stop();
}
