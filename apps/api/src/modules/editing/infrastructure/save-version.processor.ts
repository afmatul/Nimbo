import { randomUUID } from 'node:crypto';

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Job } from 'bullmq';

import { CorrelationContext } from '../../../shared';
import type { SaveVersionJob } from '../application/ports/i-save-version-queue.port';
import { SaveVersionService } from '../application/save-version.service';

import { SAVE_VERSION_QUEUE } from './save-version.queue';

/** Un guardado a la vez: acota la memoria del `api` junto a ONLYOFFICE (plan §7, ADR-0029). */
const WORKER_OPTIONS = { concurrency: 1 } as const;

type SaveVersionJobData = SaveVersionJob & { readonly correlationId?: string };

/**
 * Procesador de `editing-save` **en el `api`** (ADR-0029: las salas de 015 viven en su memoria). Corre con el
 * `correlationId` del aviso que lo encoló y delega en `SaveVersionService`; un error transitorio se propaga para que
 * BullMQ reintente. Nunca registra `job.data` (lleva la URL de descarga).
 */
@Processor(SAVE_VERSION_QUEUE, WORKER_OPTIONS)
export class SaveVersionProcessor extends WorkerHost {
  constructor(@Inject(SaveVersionService) private readonly saveVersions: SaveVersionService) {
    super();
  }

  process(job: Job<SaveVersionJobData>): Promise<void> {
    const { correlationId, ...data } = job.data;
    const store = { correlationId: correlationId ?? randomUUID(), jobId: String(job.id) };
    return CorrelationContext.run(store, () => this.saveVersions.save(data));
  }
}
