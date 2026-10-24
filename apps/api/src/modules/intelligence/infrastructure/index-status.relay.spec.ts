import { INDEXING_EVENTS } from '@nimbo/contracts';
import type { Job } from 'bullmq';

import type { IRealtimePublisher, RealtimeNotice } from '../../realtime';

import { IndexStatusRelay } from './index-status.relay';
import type { IndexStatusJobData } from './index-status.relay';
import { RealtimeIndexStatusNotifier } from './realtime-index-status.notifier';

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const FILE_ID = '22222222-2222-4222-8222-222222222222';

/** Canal en vivo que anota lo enviado a cada cuenta. */
class RecordingPublisher implements IRealtimePublisher {
  readonly sent: { userId: string; notice: RealtimeNotice }[] = [];

  toUser(userId: string, notice: RealtimeNotice): void {
    this.sent.push({ userId, notice });
  }

  toDocument(): void {
    throw new Error('El aviso de indexación no va a salas de documento.');
  }
}

const relayWith = (publisher: RecordingPublisher): IndexStatusRelay =>
  new IndexStatusRelay(new RealtimeIndexStatusNotifier(publisher));

const jobOf = (data: IndexStatusJobData): Job<IndexStatusJobData> =>
  ({ id: 'aviso-1', data }) as Job<IndexStatusJobData>;

describe('IndexStatusRelay (019 CA-14, ADR-0033 d)', () => {
  it('CA-14: retransmite el aviso del `worker` a la propietaria como `indexing.status-changed`', async () => {
    const publisher = new RecordingPublisher();

    await relayWith(publisher).process(
      jobOf({
        ownerId: OWNER_ID,
        fileId: FILE_ID,
        state: 'fallido',
        reason: 'proveedor_no_disponible',
        correlationId: 'correlacion-1',
      }),
    );

    expect(publisher.sent).toEqual([
      {
        userId: OWNER_ID,
        notice: {
          event: INDEXING_EVENTS.STATUS_CHANGED,
          payload: { fileId: FILE_ID, state: 'fallido', reason: 'proveedor_no_disponible' },
        },
      },
    ]);
  });

  it('CA-21: al navegador solo llegan archivo, estado y motivo (ni `ownerId`, ni `correlationId`, ni extras)', async () => {
    const publisher = new RecordingPublisher();
    const data = { ownerId: OWNER_ID, fileId: FILE_ID, state: 'indexado', reason: null } as const;

    await relayWith(publisher).process(
      jobOf({
        ...data,
        correlationId: 'correlacion-2',
        nombre: 'secreto.docx',
      } as IndexStatusJobData),
    );

    expect(publisher.sent.map(({ notice }) => notice.payload)).toEqual([
      { fileId: FILE_ID, state: 'indexado', reason: null },
    ]);
  });
});
