import { Injectable } from '@nestjs/common';
import { TEST_CARDS } from '@nimbo/contracts';

import type {
  GatewayDecision,
  IPaymentGateway,
} from '../../application/ports/i-payment-gateway.port';
import type { PaymentCard } from '../../domain/payment-card';

/** Las dos tarjetas de prueba son Visa (empiezan por 4). */
const TEST_CARD_BRAND = 'visa';

/**
 * Pasarela simulada y determinista (spec 009 RN-3; DF-69: sin `failureRate` ni `latencyMs` del diagrama). Aprueba solo
 * la tarjeta de prueba `4242…`; cualquier otra, incluida `4000…0002`, se rechaza. La validación del cobro ya descarta
 * números que no sean de prueba (RN-9), así que aquí no llegan.
 */
@Injectable()
export class SimulatedPaymentGateway implements IPaymentGateway {
  authorize(card: PaymentCard): Promise<GatewayDecision> {
    const status = card.number === TEST_CARDS.approved ? 'aprobada' : 'rechazada';
    return Promise.resolve({ status, brand: TEST_CARD_BRAND });
  }
}
