import type { Queue } from 'bullmq';

import { CorrelationContext } from '../../../shared';

import {
  INDEX_STATUS_JOB,
  INDEX_STATUS_QUEUE,
  QueuedIndexStatusNotifier,
} from './queued-index-status.notifier';

const CHANGE = {
  ownerId: '11111111-1111-4111-8111-111111111111',
  fileId: '33333333-3333-4333-8333-333333333333',
  state: 'no_indexable',
  reason: 'sin_texto',
} as const;

function setup() {
  const add = jest.fn().mockResolvedValue({ id: 'job-1' });
  const queue = { name: INDEX_STATUS_QUEUE, add } as unknown as Queue;
  return { add, notifier: new QueuedIndexStatusNotifier(queue) };
}

describe('QueuedIndexStatusNotifier (019 CA-14, ADR-0030)', () => {
  it('CA-14: publica en `index-status` solo propietaria, archivo, estado y motivo, con el `correlationId`', async () => {
    const { add, notifier } = setup();

    await CorrelationContext.run({ correlationId: 'corr-1' }, () => notifier.notify(CHANGE));

    expect(INDEX_STATUS_QUEUE).toBe('index-status');
    expect(add).toHaveBeenCalledWith(
      INDEX_STATUS_JOB,
      { ...CHANGE, correlationId: 'corr-1' },
      { removeOnComplete: true, removeOnFail: true },
    );
  });

  it('CA-21: no copia campos de más que lleguen en el cambio', async () => {
    const { add, notifier } = setup();

    await notifier.notify({ ...CHANGE, fileName: 'contrato.docx' } as typeof CHANGE);

    const [, data] = add.mock.calls[0] as [string, Record<string, unknown>];
    expect(Object.keys(data).sort()).toEqual(
      ['correlationId', 'fileId', 'ownerId', 'reason', 'state'].sort(),
    );
  });

  it('un fallo de Redis sube al llamador (el recorder lo registra sin reintentar)', async () => {
    const { add, notifier } = setup();
    add.mockRejectedValue(new Error('redis caído'));

    await expect(notifier.notify(CHANGE)).rejects.toThrow('redis caído');
  });
});
