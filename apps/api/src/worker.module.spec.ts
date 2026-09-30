import { WORKER_QUEUES } from './worker.module';

describe('WorkerModule', () => {
  it('CA-21, 005 CA-9: consume las colas `ping`, `mail` y `upload-cleanup` (las que lista `worker.started`)', () => {
    expect(WORKER_QUEUES).toEqual(['ping', 'mail', 'upload-cleanup']);
  });
});
