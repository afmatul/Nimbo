import { WORKER_QUEUES } from './worker.module';

describe('WorkerModule', () => {
  it('CA-21, 005 CA-9: 006 CA-19, 007 CA-13, 009 CA-2 y CA-6, 010 CA-1: consume las colas `ping`, `mail`, `upload-cleanup`, `trash-purge`, `usage-reconcile`, `subscription-reconcile`, `invoice-retry` y `subscription-renewal` (las que lista `worker.started`)', () => {
    expect(WORKER_QUEUES).toEqual([
      'ping',
      'mail',
      'upload-cleanup',
      'trash-purge',
      'usage-reconcile',
      'subscription-reconcile',
      'invoice-retry',
      'subscription-renewal',
    ]);
  });
});
