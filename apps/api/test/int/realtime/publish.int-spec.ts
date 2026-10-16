import { I_REALTIME_PUBLISHER } from '../../../src/modules/realtime';
import type { IRealtimePublisher, RealtimeNotice } from '../../../src/modules/realtime';

import { collectEvents, createRealtimeTestApp, OpenClients, settle } from './realtime-test-app';
import type { RealtimeTestApp } from './realtime-test-app';

const USER_A = '1f2e3d4c-5b6a-4978-8a9b-0c1d2e3f4a5b';
const USER_B = '9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d';
const NOTICE: RealtimeNotice = { event: 'prueba.aviso', payload: { numero: 1 } };

describe('Canal en vivo: avisos a un usuario (015 T-05)', () => {
  let testApp: RealtimeTestApp;
  let publisher: IRealtimePublisher;
  const clients = new OpenClients(() => testApp);

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
});
