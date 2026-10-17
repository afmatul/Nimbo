import { REALTIME_EVENTS, SHARED_ERROR_CODES } from '@nimbo/contracts';
import type { Socket as ClientSocket } from 'socket.io-client';

import { FixedClock } from '../../../src/shared';

import {
  ALLOWED_ORIGIN,
  connectClient,
  createRealtimeTestApp,
  waitForConnect,
} from './realtime-test-app';
import type { RealtimeTestApp } from './realtime-test-app';

/** Tiempo de vida del token de acceso (002 D-10), el mismo con que `TestAccessTokens` firma. */
const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
/** Vigencia real que le queda al token «a punto de vencer» (`exp` se redondea a segundos hacia abajo: 2–3 s). */
const REMAINING_LIFE_MS = 3_000;
const EXPIRY_WAIT_TIMEOUT_MS = 15_000;

interface ExpiredClose {
  readonly payload: unknown;
  readonly reason: string;
}

const waitForExpiredClose = (client: ClientSocket): Promise<ExpiredClose> =>
  new Promise((resolve) => {
    client.once(REALTIME_EVENTS.SESSION_EXPIRED, (payload: unknown) => {
      client.once('disconnect', (reason) => resolve({ payload, reason }));
    });
  });

/**
 * El temporizador de cierre corre con el reloj real del `api` y el verificador con un `FixedClock` atrasado: así el
 * token se firma y se acepta como vigente pero su `exp` cae a pocos segundos del reloj real, y la prueba ve el cierre
 * de verdad sin esperar 15 minutos ni falsear los temporizadores de Socket.IO.
 */
describe('Canal en vivo: cierre al vencer el token (015 T-04)', () => {
  let testApp: RealtimeTestApp;
  let tokenClock: FixedClock;
  const clients: ClientSocket[] = [];

  const open = (token: string): ClientSocket => {
    const client = connectClient(testApp.url, { token, origin: ALLOWED_ORIGIN });
    clients.push(client);
    return client;
  };

  beforeAll(async () => {
    tokenClock = new FixedClock(new Date());
    testApp = await createRealtimeTestApp({ clock: tokenClock });
  });

  afterEach(() => {
    clients.splice(0).forEach((client) => client.disconnect());
    testApp.logs.clear();
  });

  afterAll(async () => {
    await testApp.close();
  });

  it(
    'CA-4: un token que vence cierra la conexión con SHARED_UNAUTHENTICATED y otra con token nuevo vuelve a abrir',
    async () => {
      tokenClock.set(new Date(Date.now() - ACCESS_TOKEN_TTL_MS + REMAINING_LIFE_MS));
      const expiring = open(testApp.tokens.valid());
      await waitForConnect(expiring);

      const closed = await waitForExpiredClose(expiring);

      expect(closed).toEqual({
        payload: { code: SHARED_ERROR_CODES.UNAUTHENTICATED },
        reason: 'io server disconnect',
      });
      expect(await testApp.server.fetchSockets()).toHaveLength(0);

      tokenClock.set(new Date());
      const renewed = open(testApp.tokens.valid());
      await waitForConnect(renewed);
      expect(renewed.connected).toBe(true);
    },
    EXPIRY_WAIT_TIMEOUT_MS,
  );
});
