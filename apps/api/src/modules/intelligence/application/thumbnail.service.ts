import { randomUUID } from 'node:crypto';
import { buffer } from 'node:stream/consumers';

import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { createActor, errorClassOf, I_CLOCK, I_TRANSACTION_RUNNER, Role } from '../../../shared';
import type { Actor, IClock, ITransactionRunner } from '../../../shared';
import { IndexableFileGateway, NodeNotFoundError } from '../../storage';
import type { IndexableFile } from '../../storage';
import { NotIndexableError } from '../domain/errors';
import { thumbnailExcerptOf } from '../domain/thumbnail-excerpt';

import { ExtractorRegistry } from './extractor-registry';
import type { IntelligenceLogger } from './intelligence-logger';
import { I_THUMBNAIL_REPOSITORY } from './ports/i-thumbnail-repository.port';
import type { IThumbnailRepository } from './ports/i-thumbnail-repository.port';

/** Más allá de este tamaño no se lee el archivo para la miniatura (se queda con la hoja de renglones). */
export const THUMBNAIL_MAX_FILE_BYTES = 5n * 1024n * 1024n;

/** Lo que el servicio usa de la fachada de `storage`: el archivo que el actor ve y el contenido de su versión vigente. */
export type ThumbnailFiles = Pick<IndexableFileGateway, 'findAccessible' | 'openCurrent'>;

/** Lo que dejó leer el archivo: `settled` es definitivo (se guarda); si no, fue un fallo transitorio y se reintenta luego. */
interface Reading {
  readonly text: string | null;
  readonly settled: boolean;
}

const TRANSIENT: Reading = { text: null, settled: false };

/**
 * Extracto de texto de un `.docx` para su miniatura (sin auditoría: no es una descarga). El acceso lo decide
 * `accessibleNodes(actor)` (`findAccessible`); la lectura y el guardado actúan como la propietaria, igual que
 * `IndexScheduler`, así quien recibe el archivo compartido ve la misma miniatura. Un archivo ajeno, inexistente o en
 * la papelera es `NodeNotFoundError`. `null`: no es un `.docx`, es grande, está dañado o sin texto (la web dibuja la
 * hoja de renglones). Se guarda por versión también cuando no hay texto o el documento es ilegible, para no volver a
 * descargarlo ni descomprimirlo en cada petición; un fallo transitorio (objeto ausente, error de lectura) no se
 * guarda. Reutiliza el extractor de 019 (DRY) y nunca registra texto ni nombres.
 */
@Injectable()
export class ThumbnailService {
  constructor(
    @Inject(IndexableFileGateway) private readonly files: ThumbnailFiles,
    @Inject(ExtractorRegistry) private readonly extractors: ExtractorRegistry,
    @Inject(I_THUMBNAIL_REPOSITORY) private readonly thumbnails: IThumbnailRepository,
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_CLOCK) private readonly clock: IClock,
    @Inject(PinoLogger) private readonly logger: IntelligenceLogger,
  ) {}

  async excerptOf(actor: Actor, fileId: string): Promise<string | null> {
    const file = await this.files.findAccessible(actor, fileId);
    if (file === null) throw new NodeNotFoundError();
    if (file.kind !== 'docx' || file.sizeBytes > THUMBNAIL_MAX_FILE_BYTES) return null;
    const owner = createActor(file.ownerId, Role.CLIENT);
    const stored = await this.transactions.withActor(owner, () =>
      this.thumbnails.find(owner, file.currentVersionId),
    );
    if (stored !== null) return stored.text;
    const reading = await this.read(owner, file);
    if (reading.settled) await this.save(owner, file, reading.text);
    return reading.text;
  }

  private save(owner: Actor, file: IndexableFile, text: string | null): Promise<void> {
    return this.transactions.withActor(owner, () =>
      this.thumbnails.insertIfAbsent(owner, {
        id: randomUUID(),
        fileId: file.id,
        versionId: file.currentVersionId,
        text,
        createdAt: this.clock.now(),
      }),
    );
  }

  private async read(owner: Actor, file: IndexableFile): Promise<Reading> {
    try {
      const ref = { fileId: file.id, versionId: file.currentVersionId };
      const stream = await this.files.openCurrent(owner, ref);
      if (stream === null) return TRANSIENT;
      const segments = await this.extractors.forKind(file.kind).extract(await buffer(stream));
      return { text: thumbnailExcerptOf(segments) || null, settled: true };
    } catch (error) {
      this.logger.warn({
        event: 'thumbnail.extract_failed',
        fileId: file.id,
        errorClass: errorClassOf(error),
      });
      return error instanceof NotIndexableError ? { text: null, settled: true } : TRANSIENT;
    }
  }
}
