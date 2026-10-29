import { processorQueuesOf, validWorkerOptimizerEnv } from '../test/support/processor-queues';

import { WorkerDrainModule } from './worker-drain.module';
import { WORKER_OPTIMIZER_QUEUES, WorkerOptimizerModule } from './worker-optimizer.module';
import { WORKER_QUEUES } from './worker.module';

describe('WorkerOptimizerModule (ADR-0037)', () => {
  it('consume solo la cola `optimization`', () => {
    expect(WORKER_OPTIMIZER_QUEUES).toEqual(['optimization']);
  });

  it('su composición registra exactamente un procesador, el de `optimization`: ninguna cola de `storage`, correo ni indexación', () => {
    expect(processorQueuesOf(WorkerOptimizerModule.forRoot(validWorkerOptimizerEnv()))).toEqual([
      'optimization',
    ]);
  });

  it('las colas de los dos procesos son disjuntas: cada cola tiene un solo consumidor', () => {
    const general = new Set<string>(WORKER_QUEUES);

    expect(WORKER_OPTIMIZER_QUEUES.filter((queue) => general.has(queue))).toEqual([]);
  });

  it('I-3: compone el cierre ordenado de sus `Worker` de BullMQ (`WorkerDrainModule`)', () => {
    expect(WorkerOptimizerModule.forRoot(validWorkerOptimizerEnv()).imports).toContain(
      WorkerDrainModule,
    );
  });
});
