import type { PaymentStatus } from '../../domain/entities/payment.entity';
import type { InstrumentReference, PaymentInstrument } from '../../domain/payment-instrument';
import type { Money } from '../../domain/value-objects/money';

/**
 * Respuesta de la pasarela, única fuente de marca, últimos 4 y referencia (plan 010 §2, M-2). `last4` llega siempre,
 * también al rechazar; `instrumentRef` solo si aprueba.
 */
export interface GatewayDecision {
  readonly status: PaymentStatus;
  readonly brand: string;
  readonly last4: string;
  readonly instrumentRef: InstrumentReference | null;
}

/**
 * Pasarela de pagos (M4, `architecture.md` §5; ADR-0031). Con la tarjeta el cliente está presente; con una referencia de
 * un pago anterior, no (renovación automática), y la pasarela puede responder distinto. Al cobrar con referencia puede
 * devolver la misma u otra: se guarda la que devuelva. La 009 y la 010 la implementan con un simulador determinista.
 */
export interface IPaymentGateway {
  authorize(instrument: PaymentInstrument, amount: Money): Promise<GatewayDecision>;
}

export const I_PAYMENT_GATEWAY = Symbol('IPaymentGateway');
