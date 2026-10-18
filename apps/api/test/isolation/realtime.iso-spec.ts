import { REALTIME_EVENTS } from '@nimbo/contracts';
import type { Socket as ClientSocket } from 'socket.io-client';

import { I_DOCUMENT_ROOMS, I_REALTIME_PUBLISHER } from '../../src/modules/realtime';
import type {
  IDocumentRooms,
  IRealtimePublisher,
  RealtimeNotice,
} from '../../src/modules/realtime';
import { documentRoom, userRoom } from '../../src/modules/realtime/domain/room-names';
import { createActor, ForbiddenError, Role } from '../../src/shared';
import {
  collectEvents,
  createRealtimeTestApp,
  OpenClients,
  settle,
  SETTLE_MS,
} from '../int/realtime/realtime-test-app';
import type { RealtimeTestApp } from '../int/realtime/realtime-test-app';

const USER_A = '3c2b1a09-8f7e-4d6c-9b5a-493827161504';
const USER_B = '7e6d5c4b-3a29-4180-8f7e-6d5c4b3a2918';
/** Documentos casi idénticos: sus identificadores difieren en el último carácter. */
const DOCUMENT_D = '2a4c6e80-1b3d-4f5a-8c7e-9d0b1a2c3e4f';
const DOCUMENT_D_PRIME = '2a4c6e80-1b3d-4f5a-8c7e-9d0b1a2c3e40';
/** Conexiones simultáneas de B: abrir más no le da acceso a nada más. */
const CONNECTIONS_OF_B = 3;
const NOTICE: RealtimeNotice = { event: 'prueba.aviso', payload: { numero: 1 } };
const FORBIDDEN_ACK = { error: { code: 'SHARED_FORBIDDEN' } };

/**
 * Aislamiento del canal en vivo (015 CA-10, RNF-05, Art. IX): con A admitida en la sala de su documento, los avisos a A y
 * a D no llegan a B aunque B abra varias conexiones, pida entrar a esas salas o esté en la sala de un documento casi
 * idéntico. El control positivo (A recibe ambos) evita que la prueba pase por no emitir nada.
 */
describe('aislamiento del canal en vivo (015 CA-10)', () => {
  let testApp: RealtimeTestApp;
  let rooms: IDocumentRooms;
  let publisher: IRealtimePublisher;
  const clients = new OpenClients(() => testApp);
  const actorA = createActor(USER_A, Role.CLIENT);
  const actorB = createActor(USER_B, Role.CLIENT);

  const connectB = (): Promise<ClientSocket[]> =>
    Promise.all(Array.from({ length: CONNECTIONS_OF_B }, () => clients.connectAs(USER_B)));

  /** Cada conexión de B pide entrar a la sala de A y a la de D; devuelve todas las respuestas. */
  const tryJoinForeignRooms = (connections: readonly ClientSocket[]): Promise<unknown[]> =>
    Promise.all(
      connections.flatMap((connection) =>
        [userRoom(USER_A), documentRoom(DOCUMENT_D)].map((room) =>
          connection.timeout(SETTLE_MS).emitWithAck(REALTIME_EVENTS.ROOM_JOIN, { room }),
        ),
      ),
    );

  beforeAll(async () => {
    testApp = await createRealtimeTestApp();
    rooms = testApp.app.get<IDocumentRooms>(I_DOCUMENT_ROOMS);
    publisher = testApp.app.get<IRealtimePublisher>(I_REALTIME_PUBLISHER);
  });

  afterEach(() => {
    clients.closeAll();
    testApp.logs.clear();
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('CA-10: los avisos a A y a su documento D no llegan a ninguna conexión de B', async () => {
    const a = await clients.connectAs(USER_A);
    await rooms.admit(actorA, a.id ?? '', DOCUMENT_D);
    const connectionsOfB = await connectB();
    await rooms.admit(actorB, connectionsOfB[0]?.id ?? '', DOCUMENT_D_PRIME);
    const receivedByA = collectEvents(a, NOTICE.event);
    const receivedByB = connectionsOfB.map((connection) => collectEvents(connection, NOTICE.event));

    const acks = await tryJoinForeignRooms(connectionsOfB);
    publisher.toUser(USER_A, NOTICE);
    publisher.toDocument(DOCUMENT_D, NOTICE);
    await settle();

    expect(acks).toEqual(acks.map(() => FORBIDDEN_ACK));
    expect(receivedByB).toEqual(connectionsOfB.map(() => []));
    expect(receivedByA).toEqual([NOTICE.payload, NOTICE.payload]);
  });

  it('CA-10: los avisos al documento casi idéntico de B no llegan a A', async () => {
    const a = await clients.connectAs(USER_A);
    await rooms.admit(actorA, a.id ?? '', DOCUMENT_D);
    const [b] = await connectB();
    await rooms.admit(actorB, b?.id ?? '', DOCUMENT_D_PRIME);
    const receivedByA = collectEvents(a, NOTICE.event);

    publisher.toUser(USER_B, NOTICE);
    publisher.toDocument(DOCUMENT_D_PRIME, NOTICE);
    await settle();

    expect(receivedByA).toEqual([]);
  });

  it('CA-10: admitir a B con una conexión de A lanza SHARED_FORBIDDEN y no une a nadie a D', async () => {
    const a = await clients.connectAs(USER_A);

    const admission = rooms.admit(actorB, a.id ?? '', DOCUMENT_D);

    await expect(admission).rejects.toBeInstanceOf(ForbiddenError);
    await expect(admission).rejects.toMatchObject({ code: 'SHARED_FORBIDDEN' });
    expect(await testApp.server.in(documentRoom(DOCUMENT_D)).fetchSockets()).toHaveLength(0);
  });
});
