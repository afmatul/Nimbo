import { Inject, Injectable } from '@nestjs/common';

import { TransactionContext } from '../../../../shared';
import type { Actor } from '../../../../shared';
import type { IPaymentRepository } from '../../application/ports/i-payment-repository.port';
import type { Payment, PaymentDraft } from '../../domain/entities/payment.entity';
import { formatPaymentReference } from '../../domain/sequence-number';

import { onlyRow } from './only-row';

const NEXT_REFERENCE_SQL = `SELECT nextval('transaccion_referencia_seq')::int AS sequence`;
const INSERT_SQL = `INSERT INTO transaccion (usuario_id, plan_id, monto_centavos, estado, marca_tarjeta,
    tarjeta_ultimos4, referencia, referencia_instrumento, creado_en)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`;

/**
 * `IPaymentRepository` sobre `transaccion` (plan 009 §3) con el `EntityManager` de `TransactionContext`: la fila entra
 * en la transacción del cobro y se confirma o se revierte con ella (RN-8). La secuencia no se revierte: un cobro
 * revertido deja un hueco en la numeración, nunca una referencia repetida.
 */
@Injectable()
export class TypeOrmPaymentRepository implements IPaymentRepository {
  constructor(@Inject(TransactionContext) private readonly context: TransactionContext) {}

  async record(actor: Actor, draft: PaymentDraft): Promise<Payment> {
    const manager = this.context.requireActorScope(actor);
    const next = onlyRow((await manager.query(NEXT_REFERENCE_SQL)) as { sequence: number }[]);
    const reference = formatPaymentReference(draft.createdAt.getUTCFullYear(), next.sequence);
    const row = onlyRow(
      (await manager.query(INSERT_SQL, [
        actor.id,
        draft.planId,
        draft.amount.cents,
        draft.status,
        draft.cardBrand,
        draft.cardLast4,
        reference,
        draft.instrumentRef,
        draft.createdAt,
      ])) as { id: string }[],
    );
    return { ...draft, id: row.id, userId: actor.id, reference };
  }
}
