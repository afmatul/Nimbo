import { processorQueuesOf, validWorkerEnv } from '../test/support/processor-queues';

import { WorkerDrainModule } from './worker-drain.module';
import { WORKER_QUEUES, WorkerModule } from './worker.module';

// ADR-0037: el `worker` general nunca carga `sharp` (solo `worker-optimizer`). Si algo de su raíz lo requiriera,
// esta suite no cargaría.
jest.mock('sharp', () => {
  throw new Error('El `worker` general no carga `sharp`.');
});

describe('WorkerModule', () => {
  it('CA-21, 005 CA-9: 006 CA-19, 007 CA-13, 009 CA-2 y CA-6, 010 CA-1, 019 CA-8 y CA-23: consume las colas `ping`, `mail`, `upload-cleanup`, `trash-purge`, `usage-reconcile`, `subscription-reconcile`, `invoice-retry`, `subscription-renewal`, `indexing` e `index-reconcile` (las que lista `worker.started`)', () => {
    expect(WORKER_QUEUES).toEqual([
      'ping',
      'mail',
      'upload-cleanup',
      'trash-purge',
      'usage-reconcile',
      'subscription-reconcile',
      'invoice-retry',
      'subscription-renewal',
      'indexing',
      'index-reconcile',
    ]);
  });

  it('ADR-0037: los procesadores que registra su composición son exactamente `WORKER_QUEUES`, uno por cola y sin `optimization`', () => {
    const queues = processorQueuesOf(WorkerModule.forRoot(validWorkerEnv()));

    expect([...queues].sort()).toEqual([...WORKER_QUEUES].sort());
    expect(queues).not.toContain('optimization');
  });

  it('I-3: compone el cierre ordenado de sus `Worker` de BullMQ (`WorkerDrainModule`)', () => {
    expect(WorkerModule.forRoot(validWorkerEnv()).imports).toContain(WorkerDrainModule);
  });
});
