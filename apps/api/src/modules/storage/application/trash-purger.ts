import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, ITransactionRunner } from '../../../shared';

import { I_OBJECT_STORAGE } from './ports/i-object-storage.port';
import type { IObjectStorage } from './ports/i-object-storage.port';
import { I_QUOTA_REPOSITORY } from './ports/i-quota.repository.port';
import type { IQuotaRepository } from './ports/i-quota.repository.port';
import { I_TRASH_REPOSITORY } from './ports/i-trash.repository.port';
import type { ITrashRepository, PurgeFile, TrashItemRef } from './ports/i-trash.repository.port';
import type { StorageLogger } from './storage-logger';

/** Resultado de purgar un elemento: lo que se liberó, cuántos nodos se borraron y cuántos archivos quedaron. */
export interface PurgeReport {
  readonly freedBytes: bigint;
  readonly itemCount: number;
  readonly failedFiles: number;
}

/** Quedaron archivos sin purgar (CA-20): se reintenta (el trabajo de BullMQ o el cliente). Sin nombres ni claves. */
export class TrashPurgeIncompleteError extends Error {
  constructor(readonly failed: number) {
    super(
      `La purga de la papelera dejó ${String(failed)} elemento(s) sin eliminar; se reintentará.`,
    );
    this.name = 'TrashPurgeIncompleteError';
  }
}

/**
 * Único que borra de la papelera (plan 006 §1): lo comparten «Eliminar definitivamente» y la purga programada (DRY).
 * Por archivo: `purgeObject` de cada versión, después sus filas y `addUsedBytes(-bytes)`; las carpetas al final y solo
 * si ya no les quedan archivos. Todo el elemento corre en un `withActor` con `lockUsage` tomado primero: así una
 * restauración no se cuela entre leer las claves y borrar los objetos (CA-20, nunca un registro vivo sin objeto). Si
 * un objeto falla, ese archivo no cambia en la BD y la purga sigue con los demás. Es idempotente: lo ya purgado no
 * vuelve a aparecer y `purgeObject` tolera claves ausentes.
 */
@Injectable()
export class TrashPurger {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_TRASH_REPOSITORY) private readonly trash: ITrashRepository,
    @Inject(I_QUOTA_REPOSITORY) private readonly quotas: IQuotaRepository,
    @Inject(I_OBJECT_STORAGE) private readonly objects: IObjectStorage,
    @Inject(PinoLogger) private readonly logger: StorageLogger,
  ) {}

  /**
   * Purga `item` de la papelera del actor. `dueBy` (purga programada) exige que haya vencido a esa fecha. `null` si no
   * es una raíz de su papelera (inexistente, ajena, viva, ya purgada o, con `dueBy`, sin vencer).
   */
  purge(actor: Actor, item: TrashItemRef, dueBy: Date | null): Promise<PurgeReport | null> {
    return this.transactions.withActor(actor, async () => {
      await this.quotas.lockUsage(actor);
      const files = await this.trash.purgeTargets(actor, item, dueBy);
      if (files === null) return null;
      let freedBytes = 0n;
      let purgedFiles = 0;
      for (const file of files) {
        if (!(await this.purgeFile(actor, file))) continue;
        freedBytes += file.sizeBytes;
        purgedFiles += 1;
      }
      const failedFiles = files.length - purgedFiles;
      const folders =
        item.type === 'folder' && failedFiles === 0
          ? await this.trash.deleteFolderRows(actor, item.id)
          : 0;
      return { freedBytes, itemCount: purgedFiles + folders, failedFiles };
    });
  }

  /** `true` si el archivo quedó purgado. El error solo deja su nombre: el mensaje podría traer una clave (CA-20). */
  private async purgeFile(actor: Actor, file: PurgeFile): Promise<boolean> {
    try {
      for (const key of file.objectKeys) await this.objects.purgeObject(key);
    } catch (error) {
      this.logger.error({
        event: 'trash.purge_failed',
        nodeId: file.id,
        errorName: error instanceof Error ? error.name : 'unknown',
      });
      return false;
    }
    await this.trash.deleteFileRows(actor, file.id);
    await this.quotas.addUsedBytes(actor, -file.sizeBytes);
    return true;
  }
}
