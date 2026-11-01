import { WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable, Module } from '@nestjs/common';
import type { BeforeApplicationShutdown } from '@nestjs/common';
import { DiscoveryModule, DiscoveryService } from '@nestjs/core';
import type { Worker } from 'bullmq';

/** El `Worker` de un procesador, o `null` si todavía no existe (el getter de `WorkerHost` lanza en ese caso). */
const workerOf = (host: WorkerHost): Worker | null => {
  try {
    return host.worker;
  } catch {
    return null;
  }
};

/**
 * Cierre ordenado de los procesos `worker` (I-3, ADR-0038). Nest corre los `onApplicationShutdown` a la vez: el de
 * `@nestjs/bullmq` espera el trabajo activo mientras TypeORM y Redis cierran sus conexiones, y ese trabajo falla al
 * terminar («Driver not Connected»). Aquí, en `beforeApplicationShutdown`, que Nest corre antes, se cierra cada `Worker`
 * de BullMQ (`close()` espera su trabajo activo y no toma otro); después el resto cierra sin trabajos en vuelo.
 */
@Injectable()
export class WorkerDrain implements BeforeApplicationShutdown {
  constructor(@Inject(DiscoveryService) private readonly discovery: DiscoveryService) {}

  async beforeApplicationShutdown(): Promise<void> {
    const workers = this.discovery
      .getProviders()
      .map((wrapper): unknown => wrapper.instance)
      .filter((instance): instance is WorkerHost => instance instanceof WorkerHost)
      .map(workerOf)
      .filter((worker): worker is Worker => worker !== null);
    await Promise.all(workers.map((worker) => worker.close()));
  }
}

/** Lo componen los dos procesos `worker` por `workerBaseImports`. */
@Module({ imports: [DiscoveryModule], providers: [WorkerDrain] })
export class WorkerDrainModule {}
