import type { Actor } from '../../../../shared';
import type { Payment, PaymentDraft } from '../../domain/entities/payment.entity';
import type { CardOnFile } from '../../domain/payment-instrument';

/**
 * `transaccion` bajo RLS forzado (plan 009 §3): toma el `EntityManager` de `requireActorScope(actor)`, así que se llama
 * dentro de la transacción del cobro (`withActor`). Solo inserta: las transacciones no se borran ni cambian (RN-7).
 */
export interface IPaymentRepository {
  /** Inserta el pago con la siguiente referencia `SIM-` de la secuencia y lo devuelve con su id. */
  record(actor: Actor, draft: PaymentDraft): Promise<Payment>;
  /**
   * 010 RN-2: la tarjeta del último pago aprobado con su referencia; `null` sin pagos aprobados. **Única** consulta que
   * selecciona `referencia_instrumento` (ADR-0031); la usa solo la renovación automática del `worker`.
   */
  findLastApprovedCard(actor: Actor): Promise<CardOnFile | null>;
}

export const I_PAYMENT_REPOSITORY = Symbol('IPaymentRepository');
