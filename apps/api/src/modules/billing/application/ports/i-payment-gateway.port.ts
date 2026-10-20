import type { PaymentStatus } from '../../domain/entities/payment.entity';
import type { PaymentCard } from '../../domain/payment-card';
import type { Money } from '../../domain/value-objects/money';

/** Respuesta de la pasarela: si cobró y la marca de la tarjeta. */
export interface GatewayDecision {
  readonly status: PaymentStatus;
  readonly brand: string;
}

/** Pasarela de pagos (M4, `architecture.md` §5). La 009 la implementa con un simulador determinista (RN-3). */
export interface IPaymentGateway {
  authorize(card: PaymentCard, amount: Money): Promise<GatewayDecision>;
}

export const I_PAYMENT_GATEWAY = Symbol('IPaymentGateway');
