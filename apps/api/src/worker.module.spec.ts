import { WORKER_QUEUES } from './worker.module';

describe('WorkerModule', () => {
  it('CA-21, 005 CA-9: 006 CA-19, 007 CA-13: consume las colas `ping`, `mail`, `upload-cleanup`, `trash-purge` y `usage-reconcile` (las que lista `worker.started`)', () => {
    expect(WORKER_QUEUES).toEqual([
      'ping',
      'mail',
      'upload-cleanup',
      'trash-purge',
      'usage-reconcile',
    ]);
  });
});
