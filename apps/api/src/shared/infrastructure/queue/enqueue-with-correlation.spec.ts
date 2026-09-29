import type { Queue } from 'bullmq';

import { CorrelationContext } from '../correlation/correlation-context';

import { enqueueWithCorrelation } from './enqueue-with-correlation';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const fakeQueue = (): { queue: Queue; add: jest.Mock } => {
  const add = jest.fn().mockResolvedValue({ id: 'job-1' });
  return { queue: { name: 'ping', add } as unknown as Queue, add };
};

describe('enqueueWithCorrelation', () => {
  it('CA-14: toma el `correlationId` del contexto activo', async () => {
    const { queue, add } = fakeQueue();

    await CorrelationContext.run({ correlationId: 'corr-X' }, () =>
      enqueueWithCorrelation(queue, 'ping', { hello: 'world' }),
    );

    expect(add).toHaveBeenCalledWith('ping', { hello: 'world', correlationId: 'corr-X' });
  });

  it('CA-14: sin contexto genera un UUID v4 propio', async () => {
    const { queue, add } = fakeQueue();

    await enqueueWithCorrelation(queue, 'ping', {});

    expect(add.mock.calls[0]?.[1]).toEqual({ correlationId: expect.stringMatching(UUID_V4) });
  });

  it('CA-14: no sobrescribe el resto de `data` y devuelve el trabajo creado', async () => {
    const { queue } = fakeQueue();

    const job = await CorrelationContext.run({ correlationId: 'corr-Y' }, () =>
      enqueueWithCorrelation(queue, 'ping', { a: 1, nested: { b: 2 } }),
    );

    expect(job).toEqual({ id: 'job-1' });
  });

  it('CA-21: pasa `opts` (p. ej. `jobId`) a `queue.add` sin tocar `data`', async () => {
    const { queue, add } = fakeQueue();

    await CorrelationContext.run({ correlationId: 'corr-Z' }, () =>
      enqueueWithCorrelation(queue, 'send', { tag: 't' }, { jobId: 'identity.verification.1' }),
    );

    expect(add).toHaveBeenCalledWith(
      'send',
      { tag: 't', correlationId: 'corr-Z' },
      { jobId: 'identity.verification.1' },
    );
  });

  it('CA-21: sin `opts` llama a `queue.add` con dos argumentos, como antes', async () => {
    const { queue, add } = fakeQueue();

    await enqueueWithCorrelation(queue, 'ping', {});

    expect(add.mock.calls[0]).toHaveLength(2);
  });
});
