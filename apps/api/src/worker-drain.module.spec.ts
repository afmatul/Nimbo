import { WorkerHost } from '@nestjs/bullmq';
import type { DiscoveryService } from '@nestjs/core';
import type { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import type { Job, Worker } from 'bullmq';

import { WorkerDrain } from './worker-drain.module';

class FakeProcessor extends WorkerHost {
  constructor(
    readonly closing: string[],
    readonly name: string,
  ) {
    super();
    Object.defineProperty(this, 'worker', {
      get: () =>
        ({
          close: () => {
            closing.push(name);
            return Promise.resolve();
          },
        }) as unknown as Worker,
    });
  }

  process(_job: Job): Promise<void> {
    return Promise.resolve();
  }
}

const discoveryOf = (instances: readonly unknown[]): DiscoveryService =>
  ({
    getProviders: () => instances.map((instance) => ({ instance }) as InstanceWrapper),
  }) as unknown as DiscoveryService;

describe('WorkerDrain (I-3, ADR-0038)', () => {
  it('antes del cierre de Nest cierra cada `Worker` de BullMQ (que espera su trabajo activo) y nada más', async () => {
    const closing: string[] = [];
    const drain = new WorkerDrain(
      discoveryOf([
        new FakeProcessor(closing, 'optimization'),
        { otro: 'proveedor' },
        undefined,
        new FakeProcessor(closing, 'indexing'),
      ]),
    );

    await drain.beforeApplicationShutdown();

    expect(closing).toEqual(['optimization', 'indexing']);
  });

  it('un `WorkerHost` todavía sin `Worker` no impide cerrar los demás', async () => {
    const closing: string[] = [];
    const uninitialized = new (class extends WorkerHost {
      process(): Promise<void> {
        return Promise.resolve();
      }
    })();
    const drain = new WorkerDrain(
      discoveryOf([uninitialized, new FakeProcessor(closing, 'optimization')]),
    );

    await expect(drain.beforeApplicationShutdown()).resolves.toBeUndefined();
    expect(closing).toEqual(['optimization']);
  });
});
