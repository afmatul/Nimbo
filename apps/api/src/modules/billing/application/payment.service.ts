import { Inject, Injectable } from '@nestjs/common';
import { BILLING_FIELD_MESSAGES } from '@nimbo/contracts';

import { I_CLOCK } from '../../../shared';
import type { Actor, IClock } from '../../../shared';
import type { Payment } from '../domain/entities/payment.entity';
import { BillingInvalidInputError } from '../domain/errors/billing-invalid-input.error';
import { isCardExpired, lastFourOf } from '../domain/payment-card';
import type { PaymentCard } from '../domain/payment-card';
import type { Money } from '../domain/value-objects/money';

import { I_PAYMENT_GATEWAY } from './ports/i-payment-gateway.port';
import type { IPaymentGateway } from './ports/i-payment-gateway.port';
import { I_PAYMENT_REPOSITORY } from './ports/i-payment-repository.port';
import type { IPaymentRepository } from './ports/i-payment-repository.port';

/** Qué se cobra: el plan, su precio y la tarjeta. */
export interface ChargeOrder {
  readonly planId: string;
  readonly amount: Money;
  readonly card: PaymentCard;
}

/** Contrato único del cobro (revisión B-3): el pago registrado, `aprobada` o `rechazada`. */
export type ChargeResult = Payment;

/** El texto sale del catálogo de `contracts`, el mismo que muestra `web` (DRY; revisión de Adrián del PR #62, #2). */
const CARD_EXPIRED_ISSUE = Object.freeze({
  field: 'card.expMonth',
  reason: 'CARD_EXPIRED',
  message: BILLING_FIELD_MESSAGES.CARD_EXPIRED,
});

/**
 * Único dueño del pago (spec 009 plan §2, B-3). `charge` corre dentro de la transacción del cobro: valida el
 * vencimiento con `IClock`, pide la decisión a la pasarela e inserta la fila aprobada o rechazada. Un rechazo no lanza:
 * si lanzara, la fila rechazada se revertiría; el `402` lo traduce el controlador después del commit. La 010 lo
 * reutiliza al renovar (`architecture.md` §8).
 */
@Injectable()
export class PaymentService {
  constructor(
    @Inject(I_PAYMENT_GATEWAY) private readonly gateway: IPaymentGateway,
    @Inject(I_PAYMENT_REPOSITORY) private readonly payments: IPaymentRepository,
    @Inject(I_CLOCK) private readonly clock: IClock,
  ) {}

  async charge(actor: Actor, order: ChargeOrder): Promise<ChargeResult> {
    const now = this.clock.now();
    if (isCardExpired(order.card, now)) throw new BillingInvalidInputError([CARD_EXPIRED_ISSUE]);
    const decision = await this.gateway.authorize(order.card, order.amount);
    return this.payments.record(actor, {
      planId: order.planId,
      amount: order.amount,
      status: decision.status,
      cardBrand: decision.brand,
      cardLast4: lastFourOf(order.card),
      createdAt: now,
    });
  }
}
