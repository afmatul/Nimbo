import { WORKER_QUEUES } from './worker.module';

describe('WorkerModule', () => {
  it('CA-21: consume las colas `ping` y `mail` (las que lista `worker.started`)', () => {
    expect(WORKER_QUEUES).toEqual(['ping', 'mail']);
  });
});
