import type { Payment } from '../domain/entities/payment.entity';

/**
 * Lo mínimo que `billing` necesita del logger (se inyecta `PinoLogger`; permite un doble en las pruebas). Solo UUID,
 * conteos y motivos: nunca tarjeta, CVC, NIT ni correo (spec 009 §5).
 */
export interface BillingLogger {
  info(payload: Record<string, unknown>): void;
  error(payload: Record<string, unknown>): void;
}

/** Plan §5 (009): el resultado de un cobro, después del commit y solo con UUID (contratar y renovar a mano). */
export const logPaymentOutcome = (
  logger: BillingLogger,
  payment: Pick<Payment, 'id' | 'status'>,
  planId: string,
): void => {
  logger.info({
    event: payment.status === 'aprobada' ? 'billing.payment_approved' : 'billing.payment_rejected',
    paymentId: payment.id,
    planId,
  });
};
