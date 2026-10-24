import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import type { Actor, ITransactionRunner } from '../../../shared';
import { I_TRANSACTION_RUNNER, IncompleteBatchError } from '../../../shared';

import { I_QUOTA_REPOSITORY } from './ports/i-quota.repository.port';
import type { IQuotaRepository } from './ports/i-quota.repository.port';
import { SpaceMeasurer } from './space-measurer';
import type { StorageLogger } from './storage-logger';

/** Quedaron cuentas sin conciliar (CA-15): el trabajo falla para que BullMQ lo reintente. Sin ids ni cifras. */
export class UsageReconcileIncompleteError extends IncompleteBatchError {
  constructor(failed: number) {
    super(
      failed,
      `La conciliación de espacio dejó ${String(failed)} cuenta(s) sin revisar; se reintentará.`,
    );
  }
}

/**
 * Conciliación de `espacio_usado` de una cuenta (spec 007 CA-13, CA-14; plan D-11). Como el dueño, en su propia
 * transacción: `lockUsage` primero (una purga o el registro de una carga esperan y no se mide a medias), después
 * `SpaceMeasurer.measure` (la misma medición del resumen) y `addUsedBytes(diferencia)`. Las cargas en curso no entran
 * en la medición ni en el contador (su reserva son las filas `carga`, 005 RN-13), así que no se tocan. Idempotente:
 * una cuenta coherente no cambia ni deja evento.
 */
@Injectable()
export class UsageReconciler {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_QUOTA_REPOSITORY) private readonly quotas: IQuotaRepository,
    @Inject(SpaceMeasurer) private readonly measurer: SpaceMeasurer,
    @Inject(PinoLogger) private readonly logger: StorageLogger,
  ) {}

  /** El evento técnico se registra tras confirmar la transacción: solo UUID y diferencia (RNF-17, D-14). */
  async reconcile(owner: Actor): Promise<void> {
    const diffBytes = await this.transactions.withActor(owner, () => this.correct(owner));
    if (diffBytes === 0n) return;
    this.logger.info({
      event: 'quota.reconciled',
      userId: owner.id,
      diffBytes: Number(diffBytes),
    });
  }

  private async correct(owner: Actor): Promise<bigint> {
    const recordedBytes = await this.quotas.lockUsage(owner);
    const { totalBytes } = await this.measurer.measure(owner);
    const diffBytes = totalBytes - recordedBytes;
    if (diffBytes !== 0n) await this.quotas.addUsedBytes(owner, diffBytes);
    return diffBytes;
  }
}
