import { I_REALTIME_PUBLISHER } from '../../../src/modules/realtime';
import type { IRealtimePublisher, RealtimeNotice } from '../../../src/modules/realtime';
import { documentRoom, userRoom } from '../../../src/modules/realtime/domain/room-names';

import {
  collectEvents,
  createRealtimeTestApp,
  OpenClients,
  settle,
  SETTLE_MS,
} from './realtime-test-app';
import type { RealtimeTestApp } from './realtime-test-app';

const USER_A = '1f2e3d4c-5b6a-4978-8a9b-0c1d2e3f4a5b';
const USER_B = '9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d';
const DOCUMENT_ID = '0b9c8d7e-6f5a-4b3c-8d2e-1f0a9b8c7d6e';
const NOTICE: RealtimeNotice = { event: 'prueba.aviso', payload: { numero: 1 } };

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
