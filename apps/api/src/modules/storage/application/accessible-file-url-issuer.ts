import { Inject, Injectable } from '@nestjs/common';
import { DOWNLOAD_URL_TTL_SECONDS } from '@nimbo/contracts';

import { I_CLOCK, I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, IClock, ITransactionRunner } from '../../../shared';
import { NodeNotFoundError } from '../domain/errors';
import type { File } from '../domain/file';
import { ObjectKey } from '../domain/object-key';

import { I_NODE_REPOSITORY } from './ports/i-node.repository.port';
import type { INodeRepository } from './ports/i-node.repository.port';
import { I_OBJECT_STORAGE } from './ports/i-object-storage.port';
import type { IObjectStorage } from './ports/i-object-storage.port';

const MS_PER_SECOND = 1000;

/** Archivo accesible y la URL firmada de su versión actual, con el instante en que deja de valer. */
export interface IssuedFileUrl {
  readonly file: File;
  readonly url: string;
  readonly expiresAt: Date;
}

/** Condición del llamador sobre el archivo ya resuelto; lanza para impedir la firma (p. ej. tipo sin vista previa). */
export type IssuableFileCheck = (file: File) => void;

const ANY_FILE: IssuableFileCheck = () => undefined;

/**
 * Resolver el archivo accesible y firmar su versión actual con la política de descarga de 005 (`presignDownload`:
 * un objeto, 300 s, `attachment`, `application/octet-stream`, `no-store`). Lo comparten la descarga y la vista previa
 * (017 plan §2.3, Art. VI). Sin tasa ni auditoría: cada llamador decide las suyas. Interno: no sale del módulo.
 */
@Injectable()
export class AccessibleFileUrlIssuer {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_NODE_REPOSITORY) private readonly nodes: INodeRepository,
    @Inject(I_OBJECT_STORAGE) private readonly objects: IObjectStorage,
    @Inject(I_CLOCK) private readonly clock: IClock,
  ) {}

  /** Ajeno o inexistente es `NodeNotFoundError` (005 CA-16); `check` corre antes de firmar. */
  async issue(actor: Actor, fileId: string, check = ANY_FILE): Promise<IssuedFileUrl> {
    const file = await this.transactions.withActor(actor, () =>
      this.nodes.findAccessibleById(actor, fileId),
    );
    if (file === null) throw new NodeNotFoundError();
    check(file);
    const url = await this.objects.presignDownload({
      key: ObjectKey.of(file.ownerId, file.id, file.currentVersionId).value,
      fileName: file.name.value,
      expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS,
    });
    const expiresAt = new Date(
      this.clock.now().getTime() + DOWNLOAD_URL_TTL_SECONDS * MS_PER_SECOND,
    );
    return { file, url, expiresAt };
  }
}
