import {
  REALTIME_ERROR_CODES,
  REALTIME_EVENTS,
  REALTIME_PATH,
  SHARED_ERROR_CODES,
} from '@nimbo/contracts';
import { io, type Socket } from 'socket.io-client';

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

/** Espera en milisegundos que pide el servidor en un 429, o `null` si falta o no es un número positivo. */
function retryDelayMs(data: unknown): number | null {
  const seconds = field(data, 'retryAfterSeconds');
  const isValid = typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0;
  return isValid ? seconds * MS_PER_SECOND : null;
}

function errorData(error: Error): unknown {
  return 'data' in error ? error.data : undefined;
}

/**
 * Canal abierto mientras haya sesión. Si el servidor lo rechaza o lo cierra por token vencido, lo reabre con el token
 * que la sesión ya renovó o, si sigue siendo el mismo, renueva primero (CA-4). Renueva como mucho una vez por conexión
 * lograda: si el servidor rechaza también el token recién renovado, no renueva ni reabre hasta que conecte. Si lo
 * rechaza por exceso de intentos, lo reabre tras la espera que indica el servidor (CA-14), porque `socket.io-client` no
 * reintenta un rechazo del *handshake*; si la espera falta o no es válida, no lo reabre.
 */
class SocketChannel {
  readonly socket: Socket;
  private presentedToken: string | null;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;
  private renewedSinceConnect = false;

  constructor(private readonly connection: RealtimeConnection) {
    this.presentedToken = connection.token.current;
    this.socket = this.open();
    this.socket.on('connect', () => {
      this.renewedSinceConnect = false;
    });
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
    if (code === REALTIME_ERROR_CODES.TOO_MANY_REQUESTS) this.reopenAfterRetryDelay(data);
  }

  private async reopenWithFreshToken(): Promise<void> {
    const { token } = this.connection;
    if (token.current === this.presentedToken) {
      const renewed = await this.renewOncePerConnection();
      if (this.stopped || renewed === null) return;
      token.current = renewed;
    }
    this.reopen();
  }

  /** Renueva la sesión si el canal no lo hizo desde la última conexión lograda; si ya lo hizo, devuelve `null`. */
  private renewOncePerConnection(): Promise<string | null> {
    if (this.renewedSinceConnect) return Promise.resolve(null);
    this.renewedSinceConnect = true;
    return this.connection.renew();
  }

  private reopenAfterRetryDelay(data: unknown): void {
    const delayMs = retryDelayMs(data);
    if (delayMs === null) return;
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.reopen(), delayMs);
  }

  private reopen(): void {
    if (this.stopped) return;
    this.socket.disconnect().connect();
  }
}

/** Canal abierto: el `Socket` para escuchar avisos y la función que lo cierra. */
export interface StartedRealtime {
  readonly socket: Socket;
  readonly stop: () => void;
}

/** Abre el canal en vivo de la pestaña. */
export function startRealtime(connection: RealtimeConnection): StartedRealtime {
  const channel = new SocketChannel(connection);
  return { socket: channel.socket, stop: () => channel.stop() };
}
