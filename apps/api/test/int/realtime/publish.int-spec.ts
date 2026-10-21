import { I_DOCUMENT_ROOMS, I_REALTIME_PUBLISHER } from '../../../src/modules/realtime';
import type {
  IDocumentRooms,
  IRealtimePublisher,
  RealtimeNotice,
} from '../../../src/modules/realtime';
import { createActor, Role } from '../../../src/shared';

import { collectEvents, createRealtimeTestApp, OpenClients, settle } from './realtime-test-app';
import type { RealtimeTestApp } from './realtime-test-app';

const USER_A = '1f2e3d4c-5b6a-4978-8a9b-0c1d2e3f4a5b';
const USER_B = '9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d';
const USER_C = '3e4d5c6b-7a89-4b0c-8d1e-2f3a4b5c6d7e';
const DOCUMENT_ID = '0b9c8d7e-6f5a-4b3c-8d2e-1f0a9b8c7d6e';
const NOTICE: RealtimeNotice = { event: 'prueba.aviso', payload: { numero: 1 } };

describe('Canal en vivo: avisos a un usuario y a un documento (015 T-05, T-06)', () => {
  let testApp: RealtimeTestApp;
  let publisher: IRealtimePublisher;
  let rooms: IDocumentRooms;
  const clients = new OpenClients(() => testApp);

  beforeAll(async () => {
    testApp = await createRealtimeTestApp();
    publisher = testApp.app.get<IRealtimePublisher>(I_REALTIME_PUBLISHER);
    rooms = testApp.app.get<IDocumentRooms>(I_DOCUMENT_ROOMS);
  });

  afterEach(() => {
    clients.closeAll();
    testApp.logs.clear();
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('CA-5: dos conexiones del mismo usuario reciben el aviso una vez cada una', async () => {
    const firstTab = await clients.connectAs(USER_A);
    const secondTab = await clients.connectAs(USER_A);
    const otherUser = await clients.connectAs(USER_B);
    const received = [firstTab, secondTab, otherUser].map((client) =>
      collectEvents(client, NOTICE.event),
    );

    publisher.toUser(USER_A, NOTICE);
    await settle();

    expect(received).toEqual([[NOTICE.payload], [NOTICE.payload], []]);
  });

  it('CA-6: un aviso al documento lo reciben solo las conexiones admitidas en su sala, una vez cada una', async () => {
    const admittedA = await clients.connectAs(USER_A);
    const notAdmittedA = await clients.connectAs(USER_A);
    const admittedB = await clients.connectAs(USER_B);
    const outsider = await clients.connectAs(USER_C);
    await rooms.admit(createActor(USER_A, Role.CLIENT), admittedA.id ?? '', DOCUMENT_ID);
    await rooms.admit(createActor(USER_B, Role.CLIENT), admittedB.id ?? '', DOCUMENT_ID);
    const received = [admittedA, notAdmittedA, admittedB, outsider].map((client) =>
      collectEvents(client, NOTICE.event),
    );

    publisher.toDocument(DOCUMENT_ID, NOTICE);
    await settle();

    expect(received).toEqual([[NOTICE.payload], [], [NOTICE.payload], []]);
  });
});
