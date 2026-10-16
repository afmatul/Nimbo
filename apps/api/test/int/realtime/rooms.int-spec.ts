import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Socket as ClientSocket } from 'socket.io-client';

import {
  I_DOCUMENT_ROOMS,
  I_REALTIME_PUBLISHER,
  REALTIME_DOCUMENT_LEFT,
} from '../../../src/modules/realtime';
import type {
  DocumentLeftEvent,
  IDocumentRooms,
  IRealtimePublisher,
  RealtimeNotice,
} from '../../../src/modules/realtime';
import { documentRoom, userRoom } from '../../../src/modules/realtime/domain/room-names';
import { createActor, ForbiddenError, Role } from '../../../src/shared';

import {
  collectDepartures,
  collectEvents,
  createRealtimeTestApp,
  nextDeparture,
  OpenClients,
  settle,
  SETTLE_MS,
  stopAnsweringPings,
  waitForConnect,
} from './realtime-test-app';
import type { RealtimeTestApp } from './realtime-test-app';

const USER_A = '1f2e3d4c-5b6a-4978-8a9b-0c1d2e3f4a5b';
const USER_B = '9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d';
const DOCUMENT_ID = '0b9c8d7e-6f5a-4b3c-8d2e-1f0a9b8c7d6e';
const OTHER_DOCUMENT_ID = '5c4b3a29-1807-4f6e-9d5c-4b3a29180706';
const UNKNOWN_CONNECTION_ID = 'conexion-que-no-existe';
const NOTICE: RealtimeNotice = { event: 'prueba.aviso', payload: { numero: 1 } };

/** Latido corto (plan §6): una caída sin cierre se detecta en `SHORT_PING_INTERVAL_MS + SHORT_PING_TIMEOUT_MS`. */
const SHORT_PING_INTERVAL_MS = 300;
const SHORT_PING_TIMEOUT_MS = 300;
const HEARTBEAT_DETECTION_MS = SHORT_PING_INTERVAL_MS + SHORT_PING_TIMEOUT_MS + SETTLE_MS;
/** Margen para que `socket.io-client` reconecte solo (retraso por defecto: 1 s ± 50 %). */
const RECONNECT_TIMEOUT_MS = 5_000;

describe('Canal en vivo: el cliente no elige sus salas (015 T-05)', () => {
  let testApp: RealtimeTestApp;
  let publisher: IRealtimePublisher;
  const clients = new OpenClients(() => testApp);

  const roomsOf = async (connectionId: string | undefined): Promise<string[]> => {
    const [connection] = await testApp.server.in(connectionId ?? '').fetchSockets();
    return [...(connection?.rooms ?? [])].sort();
  };

  beforeAll(async () => {
    testApp = await createRealtimeTestApp();
    publisher = testApp.app.get<IRealtimePublisher>(I_REALTIME_PUBLISHER);
  });

  afterEach(() => {
    clients.closeAll();
    testApp.logs.clear();
  });

  afterAll(async () => {
    await testApp.close();
  });

  it.each([
    ['la sala de otro usuario', userRoom(USER_A), () => publisher.toUser(USER_A, NOTICE)],
    [
      'la sala de un documento',
      documentRoom(DOCUMENT_ID),
      () => publisher.toDocument(DOCUMENT_ID, NOTICE),
    ],
  ])(
    'CA-7: pedir entrar a %s responde SHARED_FORBIDDEN, no une y no recibe',
    async (_, room, notify) => {
      await clients.connectAs(USER_A);
      const intruder = await clients.connectAs(USER_B);
      const received = collectEvents(intruder, NOTICE.event);

      const ack: unknown = await intruder.timeout(SETTLE_MS).emitWithAck('room.join', { room });
      notify();
      await settle();

      expect(ack).toEqual({ error: { code: 'SHARED_FORBIDDEN' } });
      expect(await roomsOf(intruder.id)).toEqual([intruder.id, userRoom(USER_B)].sort());
      expect(received).toEqual([]);
    },
  );

  it('RN-4: ningún otro mensaje del cliente tiene manejador (no hay respuesta)', async () => {
    const client = await clients.connectAs(USER_B);

    const reply = client.timeout(SETTLE_MS).emitWithAck('room.leave', { room: userRoom(USER_B) });

    await expect(reply).rejects.toThrow();
    expect(await roomsOf(client.id)).toEqual([client.id, userRoom(USER_B)].sort());
  });
});

const waitForReconnect = (client: ClientSocket): Promise<void> =>
  new Promise((resolve) => client.io.once('reconnect', () => resolve()));

describe('Canal en vivo: salas de documento (015 T-06)', () => {
  let testApp: RealtimeTestApp;
  let rooms: IDocumentRooms;
  let publisher: IRealtimePublisher;
  let departures: DocumentLeftEvent[];
  const clients = new OpenClients(() => testApp);
  const actorA = createActor(USER_A, Role.CLIENT);

  const roomsOf = async (connectionId: string | undefined): Promise<string[]> => {
    const [connection] = await testApp.server.in(connectionId ?? '').fetchSockets();
    return [...(connection?.rooms ?? [])].sort();
  };

  const admitA = (client: ClientSocket, documentId = DOCUMENT_ID): Promise<void> =>
    rooms.admit(actorA, client.id ?? '', documentId);

  const leftEvent = (client: ClientSocket, documentId: string): DocumentLeftEvent => ({
    userId: USER_A,
    connectionId: client.id ?? '',
    documentId,
  });

  beforeAll(async () => {
    testApp = await createRealtimeTestApp({
      config: { pingIntervalMs: SHORT_PING_INTERVAL_MS, pingTimeoutMs: SHORT_PING_TIMEOUT_MS },
    });
    rooms = testApp.app.get<IDocumentRooms>(I_DOCUMENT_ROOMS);
    publisher = testApp.app.get<IRealtimePublisher>(I_REALTIME_PUBLISHER);
    departures = collectDepartures(testApp);
  });

  afterEach(() => {
    clients.closeAll();
    departures.length = 0;
    testApp.logs.clear();
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('CA-6: `admit` une la conexión del actor a la sala del documento', async () => {
    const client = await clients.connectAs(USER_A);

    await admitA(client);

    expect(await roomsOf(client.id)).toEqual(
      [client.id, userRoom(USER_A), documentRoom(DOCUMENT_ID)].sort(),
    );
  });

  it.each([
    ['ajena', async () => (await clients.connectAs(USER_B)).id ?? ''],
    ['inexistente', () => Promise.resolve(UNKNOWN_CONNECTION_ID)],
  ])(
    '`admit` con una conexión %s lanza ForbiddenError y no une a nadie',
    async (_, connectionOf) => {
      const connectionId = await connectionOf();

      const admission = rooms.admit(actorA, connectionId, DOCUMENT_ID);

      await expect(admission).rejects.toBeInstanceOf(ForbiddenError);
      await expect(admission).rejects.toMatchObject({ code: 'SHARED_FORBIDDEN' });
      expect(await testApp.server.in(documentRoom(DOCUMENT_ID)).fetchSockets()).toHaveLength(0);
    },
  );

  it('CA-8: `retire` saca a todas las conexiones del usuario y deja de recibir avisos del documento', async () => {
    const tabs = [await clients.connectAs(USER_A), await clients.connectAs(USER_A)];
    await Promise.all(tabs.map((tab) => admitA(tab)));
    const received = tabs.map((tab) => collectEvents(tab, NOTICE.event));

    await rooms.retire(USER_A, DOCUMENT_ID);
    publisher.toDocument(DOCUMENT_ID, NOTICE);
    await settle();

    expect(received).toEqual([[], []]);
    expect(await roomsOf(tabs[0]?.id)).toEqual([tabs[0]?.id, userRoom(USER_A)].sort());
    expect(departures).toEqual([]);
  });

  it('CA-9: al cerrar limpiamente se avisa la salida de cada sala de documento en que estaba', async () => {
    const client = await clients.connectAs(USER_A);
    await admitA(client, DOCUMENT_ID);
    await admitA(client, OTHER_DOCUMENT_ID);
    const expected = [leftEvent(client, DOCUMENT_ID), leftEvent(client, OTHER_DOCUMENT_ID)];

    client.disconnect();
    await settle();

    expect(departures).toHaveLength(expected.length);
    expect(departures).toEqual(expect.arrayContaining(expected));
  });

  it('CA-9: el cierre desde el servidor (el mismo que al vencer el token) también avisa la salida', async () => {
    const client = await clients.connectAs(USER_A);
    await admitA(client);
    const expected = leftEvent(client, DOCUMENT_ID);

    testApp.server.in(client.id ?? '').disconnectSockets();
    await settle();

    expect(departures).toEqual([expected]);
  });

  it('CA-9: una conexión que no está en salas de documento no avisa ninguna salida', async () => {
    const client = await clients.connectAs(USER_A);

    client.disconnect();
    await settle();

    expect(departures).toEqual([]);
  });

  it('CA-9, RN-9: un cliente que deja de responder los pings se da por salido dentro del latido', async () => {
    const client = await clients.connectAs(USER_A);
    await admitA(client);
    const expected = leftEvent(client, DOCUMENT_ID);

    stopAnsweringPings(client);
    const departure = await nextDeparture(testApp, HEARTBEAT_DETECTION_MS);

    expect(departure).toEqual(expected);
    expect(testApp.logs.lines()).toContainEqual(
      expect.objectContaining({ event: 'realtime.disconnected', reason: 'ping timeout' }),
    );
  });

  it('ADR-0019: un oyente que lanza no impide cerrar la conexión y se registra solo su clase', async () => {
    const emitter = testApp.app.get(EventEmitter2);
    const failingListener = (): never => {
      throw new RangeError('fallo del oyente con datos');
    };
    emitter.on(REALTIME_DOCUMENT_LEFT, failingListener);
    const client = await clients.connectAs(USER_A);
    await admitA(client);

    client.disconnect();
    await settle();
    emitter.off(REALTIME_DOCUMENT_LEFT, failingListener);

    expect(await testApp.server.fetchSockets()).toHaveLength(0);
    expect(testApp.logs.lines()).toContainEqual(
      expect.objectContaining({ event: 'realtime.document_left_failed', errorClass: 'RangeError' }),
    );
    expect(JSON.stringify(testApp.logs.lines())).not.toContain('fallo del oyente');
  });

  it(
    'CA-11: tras un corte reconecta a su sala de usuario, fuera de las de documento y sin reenvío',
    async () => {
      const client = clients.open({
        token: testApp.tokens.forRole(Role.CLIENT, USER_A),
        reconnection: true,
      });
      await waitForConnect(client);
      await admitA(client);
      const received = collectEvents(client, NOTICE.event);
      const departure = nextDeparture(testApp, RECONNECT_TIMEOUT_MS);

      client.io.engine.close();
      await departure;
      publisher.toUser(USER_A, NOTICE);
      publisher.toDocument(DOCUMENT_ID, NOTICE);
      await waitForReconnect(client);
      publisher.toDocument(DOCUMENT_ID, NOTICE);
      await settle();

      expect(await roomsOf(client.id)).toEqual([client.id, userRoom(USER_A)].sort());
      expect(received).toEqual([]);
    },
    RECONNECT_TIMEOUT_MS * 2,
  );
});
