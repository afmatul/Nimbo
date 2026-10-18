import { isCardExpired } from './payment-card';
import type { PaymentCard } from './payment-card';

/**
 * Texto opaco que la pasarela emite al aprobar un cobro y solo ella interpreta (spec 010 RN-2, ADR-0031): permite
 * volver a cobrar sin el cliente. Nunca lleva el número de la tarjeta.
 */
export type InstrumentReference = string;

/**
 * Con qué se cobra (plan 010 §2, M-2): la tarjeta presente (el cliente está pagando) o la referencia de un pago anterior
 * (renovación automática, sin el cliente).
 */
export type PaymentInstrument = PaymentCard | InstrumentReference;

export const isPresentCard = (instrument: PaymentInstrument): instrument is PaymentCard =>
  typeof instrument !== 'string';

/** RN-9 (009): el vencimiento solo se comprueba con la tarjeta presente; una referencia la juzga la pasarela. */
export const isChargeable = (instrument: PaymentInstrument, now: Date): boolean =>
  !isPresentCard(instrument) || !isCardExpired(instrument, now);
