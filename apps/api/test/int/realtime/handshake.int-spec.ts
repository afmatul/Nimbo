import type { Socket as ClientSocket } from 'socket.io-client';

import { userRoom } from '../../../src/modules/realtime/domain/room-names';
import { Role } from '../../../src/shared';
import { DEFAULT_TEST_CLAIMS } from '../../support/test-access-tokens';
import type { LogLine } from '../setup/log-sink';
import { waitForLog } from '../setup/wait-for-log';

import {
  ALLOWED_ORIGIN,
  connectClient,
  createRealtimeTestApp,
  TEST_CONNECT_ATTEMPTS_PER_MINUTE,
  uniqueForwardedFor,
  waitForConnect,
  waitForConnectError,
} from './realtime-test-app';
import type { ClientOptions, RealtimeTestApp } from './realtime-test-app';

const USER_ID = DEFAULT_TEST_CLAIMS.userId;

const realtimeLines = (testApp: RealtimeTestApp, event: string): LogLine[] =>
  testApp.logs.lines().filter((line) => line.event === event);

describe('Canal en vivo: handshake autenticado (015 T-03)', () => {
  let testApp: RealtimeTestApp;
  const clients: ClientSocket[] = [];

  const open = (options: ClientOptions): ClientSocket => {
    const client = connectClient(testApp.url, options);
    clients.push(client);
    return client;
  };

  beforeAll(async () => {
    testApp = await createRealtimeTestApp();
  });

  afterEach(() => {
    clients.splice(0).forEach((client) => client.disconnect());
    testApp.logs.clear();
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('CA-1: un cliente con token vigente queda conectado y unido solo a su sala de usuario', async () => {
    const client = open({ token: testApp.tokens.valid(), origin: ALLOWED_ORIGIN });

    await waitForConnect(client);

    const [connection] = await testApp.server.in(userRoom(USER_ID)).fetchSockets();
    expect(connection?.id).toBe(client.id);
    expect([...(connection?.rooms ?? [])].sort()).toEqual([client.id, userRoom(USER_ID)].sort());
  });

  it.each([
    ['sin token', {}],
    ['con un token que no es texto', { token: 12345 }],
    ['con el token en la URL y no en `auth`', { query: { token: 'en-la-url' } }],
  ])('CA-2: un intento %s se rechaza con SHARED_UNAUTHENTICATED', async (_, options) => {
    const error = await waitForConnectError(open(options));

    expect(error.message).toBe('SHARED_UNAUTHENTICATED');
    expect(error.data).toEqual({ code: 'SHARED_UNAUTHENTICATED', status: 401 });
    expect(await testApp.server.fetchSockets()).toHaveLength(0);
  });

  it.each([
    ['inválido', (): string => testApp.tokens.tampered()],
    ['vencido', (): string => testApp.tokens.expired()],
  ])('CA-2: un token %s se rechaza con SHARED_UNAUTHENTICATED', async (_, tokenFor) => {
    const error = await waitForConnectError(open({ token: tokenFor() }));

    expect(error.data).toEqual({ code: 'SHARED_UNAUTHENTICATED', status: 401 });
    expect(await testApp.server.fetchSockets()).toHaveLength(0);
  });

  it('CA-3: un rol interno con token vigente se rechaza con SHARED_FORBIDDEN', async () => {
    const error = await waitForConnectError(open({ token: testApp.tokens.forRole(Role.SUPPORT) }));

    expect(error.message).toBe('SHARED_FORBIDDEN');
    expect(error.data).toEqual({ code: 'SHARED_FORBIDDEN', status: 403 });
    expect(await testApp.server.fetchSockets()).toHaveLength(0);
  });

  it('RN-3: un `Origin` no listado se rechaza antes del handshake y queda en la bitácora', async () => {
    const client = open({ token: testApp.tokens.valid(), origin: 'https://otro-sitio.example' });

    await waitForConnectError(client);

    const rejected = await waitForLog(testApp.logs, (line) => line.event === 'realtime.rejected');
    expect(rejected).toMatchObject({ reason: 'origin', correlationId: expect.any(String) });
    expect(realtimeLines(testApp, 'realtime.connected')).toHaveLength(0);
  });

  it('CA-14: sobre el umbral por origen rechaza con REALTIME_TOO_MANY_REQUESTS y la espera', async () => {
    const realOrigin = uniqueForwardedFor();
    const attemptFrom = (spoofed: string): ClientSocket =>
      open({ token: testApp.tokens.valid(), forwardedFor: `${spoofed}, ${realOrigin}` });

    for (let attempt = 0; attempt < TEST_CONNECT_ATTEMPTS_PER_MINUTE; attempt += 1) {
      await waitForConnect(attemptFrom(uniqueForwardedFor()));
    }
    const error = await waitForConnectError(attemptFrom(uniqueForwardedFor()));

    expect(error.message).toBe('REALTIME_TOO_MANY_REQUESTS');
    expect(error.data).toMatchObject({ code: 'REALTIME_TOO_MANY_REQUESTS', status: 429 });
    expect(error.data?.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('CA-13: aceptación, rechazo y cierre dejan una línea con correlationId, usuario y motivo, sin token', async () => {
    const token = testApp.tokens.valid();
    const tampered = testApp.tokens.tampered();
    const client = open({ token });
    await waitForConnect(client);
    await waitForConnectError(open({ token: tampered }));

    const connectionId = client.id;
    client.disconnect();
    const ofThisConnection = (event: string) => (line: LogLine) =>
      line.event === event && line.connectionId === connectionId;
    const disconnected = await waitForLog(testApp.logs, ofThisConnection('realtime.disconnected'));

    const connected = testApp.logs.lines().find(ofThisConnection('realtime.connected'));
    expect(connected).toMatchObject({ userId: USER_ID, correlationId: expect.any(String) });
    expect(disconnected).toMatchObject({
      userId: USER_ID,
      correlationId: connected?.correlationId,
      reason: 'client namespace disconnect',
    });
    expect(realtimeLines(testApp, 'realtime.rejected')).toEqual([
      expect.objectContaining({ reason: 'invalid_token', correlationId: expect.any(String) }),
    ]);
    const everything = JSON.stringify(testApp.logs.lines());
    expect(everything).not.toContain(token);
    expect(everything).not.toContain(tampered);
  });
});
