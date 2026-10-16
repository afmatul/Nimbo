import { randomInt } from 'node:crypto';
import type { AddressInfo } from 'node:net';

import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import type { Server } from 'socket.io';
import { io } from 'socket.io-client';
import type { Socket as ClientSocket } from 'socket.io-client';

import { REALTIME_DOCUMENT_LEFT, RealtimeModule } from '../../../src/modules/realtime';
import type { DocumentLeftEvent } from '../../../src/modules/realtime';
import {
  REALTIME_CONFIG,
  REALTIME_PATH,
  REALTIME_PING_INTERVAL_MS,
  REALTIME_PING_TIMEOUT_MS,
} from '../../../src/modules/realtime/application/realtime-config';
import type { RealtimeConfig } from '../../../src/modules/realtime/application/realtime-config';
import { RealtimeGateway } from '../../../src/modules/realtime/presentation/realtime.gateway';
import { I_ACCESS_TOKEN_VERIFIER, I_CLOCK, Role, SystemClock } from '../../../src/shared';
import type { IClock } from '../../../src/shared';
import { TestAccessTokenVerifier } from '../../support/test-access-token-verifier';
import { TestAccessTokens } from '../../support/test-access-tokens';
import { buildTestEnv, createTestApp } from '../setup/test-app';
import type { TestApp, ProviderOverride } from '../setup/test-app';

/** Origen de navegador permitido en el entorno de integración (`CORS_ORIGIN` de `global-setup.ts`). */
export const ALLOWED_ORIGIN = 'http://localhost';

/** Umbral corto para agotar el límite de intentos en pocas conexiones (CA-14). */
export const TEST_CONNECT_ATTEMPTS_PER_MINUTE = 3;

/**
 * Verificador de prueba detrás de `I_ACCESS_TOKEN_VERIFIER`, exportado para `RealtimeModule` como lo hace
 * `IdentityModule` en `AppModule`. Lleva su propio reloj: el mismo con que la prueba emite los tokens.
 */
@Module({})
class TestAccessTokenVerifierModule {
  static withClock(clock: IClock): DynamicModule {
    return {
      module: TestAccessTokenVerifierModule,
      providers: [
        { provide: I_CLOCK, useValue: clock },
        { provide: I_ACCESS_TOKEN_VERIFIER, useClass: TestAccessTokenVerifier },
      ],
      exports: [I_ACCESS_TOKEN_VERIFIER],
    };
  }
}

export interface RealtimeTestApp extends TestApp {
  /** URL base del `api` escuchando en un puerto efímero. */
  readonly url: string;
  /** Emisor de tokens con el mismo reloj que el verificador. */
  readonly tokens: TestAccessTokens;
  /** Servidor Socket.IO del gateway, para mirar salas y conexiones desde la prueba. */
  readonly server: Server;
}

export interface RealtimeTestAppOptions {
  /** Cambia campos de `RealtimeConfig` (p. ej. latido corto en T-06). */
  readonly config?: Partial<RealtimeConfig>;
  /** Reloj del verificador y del emisor de tokens (p. ej. un `FixedClock` para vencer el token en T-04). */
  readonly clock?: IClock;
  readonly overrides?: readonly ProviderOverride[];
}

const testConfig = (config: Partial<RealtimeConfig> = {}): RealtimeConfig => ({
  origins: [ALLOWED_ORIGIN],
  connectAttemptsPerMinute: TEST_CONNECT_ATTEMPTS_PER_MINUTE,
  pingIntervalMs: REALTIME_PING_INTERVAL_MS,
  pingTimeoutMs: REALTIME_PING_TIMEOUT_MS,
  ...config,
});

/**
 * App de integración con `RealtimeModule` montado por `configureRealtime` (plan 015 §6), Redis real para el límite de
 * intentos, `EventEmitterModule` como en `AppModule` (`realtime.document-left`, ADR-0019) y `TestAccessTokenVerifier`. Escucha en un puerto efímero para que `socket.io-client` se conecte de verdad.
 */
export const createRealtimeTestApp = async (
  options: RealtimeTestAppOptions = {},
): Promise<RealtimeTestApp> => {
  const env = buildTestEnv();
  const clock = options.clock ?? new SystemClock();
  const testApp = await createTestApp({
    validatedEnv: env,
    modules: [
      EventEmitterModule.forRoot(),
      RealtimeModule.forRoot(env, TestAccessTokenVerifierModule.withClock(clock)),
    ],
    overrides: [
      { provide: REALTIME_CONFIG, useValue: testConfig(options.config) },
      ...(options.overrides ?? []),
    ],
    withRealtime: true,
  });
  await testApp.app.listen(0);
  const { port } = testApp.app.getHttpServer().address() as AddressInfo;
  return {
    ...testApp,
    url: `http://127.0.0.1:${String(port)}`,
    tokens: new TestAccessTokens(clock),
    server: testApp.app.get(RealtimeGateway).server,
  };
};

/** Dirección de documentación (RFC 5737) distinta por llamada: cada prueba tiene su propia clave del límite. */
export const uniqueForwardedFor = (): string =>
  `198.51.${String(randomInt(256))}.${String(randomInt(256))}`;

export interface ClientOptions {
  /** Valor de `auth.token`; si se omite, el intento va sin `auth`. */
  readonly token?: unknown;
  /** Cabecera `Origin` del navegador simulado. */
  readonly origin?: string;
  /** Cabecera `x-forwarded-for` (Traefik); por defecto una distinta por conexión. */
  readonly forwardedFor?: string;
  /** Parámetros en la URL del *handshake* (el token nunca se lee de ahí). */
  readonly query?: Record<string, string>;
  /** Reconexión automática de `socket.io-client`, como en la web (CA-11); por defecto apagada. */
  readonly reconnection?: boolean;
}

/**
 * Cliente real de Socket.IO por WebSocket. Sin reconexión automática salvo que se pida, para afirmar cada intento por
 * separado.
 */
export const connectClient = (url: string, options: ClientOptions = {}): ClientSocket =>
  io(url, {
    path: REALTIME_PATH,
    transports: ['websocket'],
    reconnection: options.reconnection ?? false,
    forceNew: true,
    auth: options.token === undefined ? {} : { token: options.token },
    query: options.query ?? {},
    extraHeaders: {
      'x-forwarded-for': options.forwardedFor ?? uniqueForwardedFor(),
      ...(options.origin === undefined ? {} : { origin: options.origin }),
    },
  });

/** Error de `connect_error` con los datos del rechazo del *handshake* (plan §4). */
export type ConnectError = Error & {
  readonly data?: { code: string; status: number; retryAfterSeconds?: number };
};

/** Espera la conexión aceptada; falla si el *handshake* se rechaza. */
export const waitForConnect = (socket: ClientSocket): Promise<void> =>
  new Promise((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', (error) => reject(error));
  });

/** Espera el rechazo del *handshake*; falla si la conexión se acepta. */
export const waitForConnectError = (socket: ClientSocket): Promise<ConnectError> =>
  new Promise((resolve, reject) => {
    socket.once('connect_error', (error) => resolve(error as ConnectError));
    socket.once('connect', () => reject(new Error('La conexión se aceptó y debía rechazarse')));
  });

/** Margen para afirmar que un aviso no llega (o no llega dos veces): el servidor emite en el mismo ciclo. */
export const SETTLE_MS = 200;

export const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

/** Cargas de cada `event` que recibe el cliente, en orden, desde que se llama. */
export const collectEvents = (socket: ClientSocket, event: string): unknown[] => {
  const received: unknown[] = [];
  socket.on(event, (payload: unknown) => received.push(payload));
  return received;
};

/** Conexiones abiertas por una suite: `open` las registra y `closeAll` las cierra en `afterEach`. */
export class OpenClients {
  private readonly clients: ClientSocket[] = [];

  constructor(private readonly testApp: () => RealtimeTestApp) {}

  open(options: ClientOptions): ClientSocket {
    const client = connectClient(this.testApp().url, options);
    this.clients.push(client);
    return client;
  }

  /** Abre una conexión aceptada del cliente `userId`. */
  async connectAs(userId: string): Promise<ClientSocket> {
    const client = this.open({ token: this.testApp().tokens.forRole(Role.CLIENT, userId) });
    await waitForConnect(client);
    return client;
  }

  closeAll(): void {
    this.clients.splice(0).forEach((client) => client.disconnect());
  }
}

/** Salidas de salas de documento (`realtime.document-left`) que emite la app, en orden, desde que se llama. */
export const collectDepartures = (testApp: RealtimeTestApp): DocumentLeftEvent[] => {
  const departures: DocumentLeftEvent[] = [];
  testApp.app
    .get(EventEmitter2)
    .on(REALTIME_DOCUMENT_LEFT, (event: DocumentLeftEvent) => departures.push(event));
  return departures;
};

/** Espera la próxima salida de una sala de documento, o falla pasado `timeoutMs`. */
export const nextDeparture = (
  testApp: RealtimeTestApp,
  timeoutMs: number,
): Promise<DocumentLeftEvent> =>
  testApp.app
    .get(EventEmitter2)
    .waitFor(REALTIME_DOCUMENT_LEFT, timeoutMs)
    .then(([event]) => event as DocumentLeftEvent);

/**
 * Simula un cliente que se cae sin cerrar (red cortada): sigue recibiendo los pings pero deja de responderlos, y solo el
 * latido del servidor puede detectar la salida (RN-9). Toca un método interno de `engine.io-client` 6.
 */
export const stopAnsweringPings = (client: ClientSocket): void => {
  const engine = client.io.engine as unknown as {
    _sendPacket: (type: string, ...rest: unknown[]) => void;
  };
  const send = engine._sendPacket.bind(engine);
  engine._sendPacket = (type, ...rest) => {
    if (type !== 'pong') {
      send(type, ...rest);
    }
  };
};
