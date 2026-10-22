import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PinoLogger } from 'nestjs-pino';

import { FILE_VERSION_CREATED } from '../../storage';
import type { FileVersionCreatedEvent } from '../../storage';
import { IndexScheduler } from '../application/index-scheduler';
import type { IntelligenceLogger } from '../application/intelligence-logger';

const errorClassOf = (error: unknown): string =>
  error instanceof Error ? error.constructor.name : typeof error;

/**
 * Oyente de `storage.file-version-created` (019 RN-11, ADR-0019): solo delega en `IndexScheduler`. `async` lo saca de
 * la petición que guardó la versión (RN-5); `promisify` deja que `emitAsync` lo espere. Un fallo (base o cola) se
 * registra sin nombre ni contenido y no se propaga: la versión ya está guardada y la conciliación la recoge (RN-12).
 */
@Injectable()
export class FileVersionCreatedListener {
  constructor(
    @Inject(IndexScheduler) private readonly scheduler: IndexScheduler,
    @Inject(PinoLogger) private readonly logger: IntelligenceLogger,
  ) {}

  @OnEvent(FILE_VERSION_CREATED, { async: true, promisify: true })
  async handle(event: FileVersionCreatedEvent): Promise<void> {
    try {
      await this.scheduler.schedule(event);
    } catch (error) {
      this.logger.warn({
        event: 'indexing.schedule_failed',
        fileId: event.fileId,
        versionId: event.versionId,
        errorClass: errorClassOf(error),
      });
    }
  }
}
