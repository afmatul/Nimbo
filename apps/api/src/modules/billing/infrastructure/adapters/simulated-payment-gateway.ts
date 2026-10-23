import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { TEST_CARDS } from '@nimbo/contracts';

import type {
  GatewayDecision,
  IPaymentGateway,
} from '../../application/ports/i-payment-gateway.port';
import { BillingInvariantError } from '../../domain/errors/billing-invariant.error';
import type { PaymentCard } from '../../domain/payment-card';
import { isPresentCard } from '../../domain/payment-instrument';
import type { InstrumentReference, PaymentInstrument } from '../../domain/payment-instrument';

/** Las tres tarjetas de prueba son Visa (empiezan por 4). */
const TEST_CARD_BRAND = 'visa';
const LAST_DIGITS = 4;
const REFERENCE_PREFIX = 'SIM-TOK-';

/** Perfil del cobro recurrente de cada tarjeta que aprueba con el cliente presente (010 RN-2, B-2). */
type RecurringProfile = 'ok' | 'decline';

const PROFILE_CARDS: Readonly<Record<RecurringProfile, string>> = {
  ok: TEST_CARDS.approved,
  decline: TEST_CARDS.recurringDeclined,
};

const lastFourOf = (number: string): string => number.slice(-LAST_DIGITS);

const decision = (number: string, instrumentRef: InstrumentReference | null): GatewayDecision => ({
  status: instrumentRef === null ? 'rechazada' : 'aprobada',
  brand: TEST_CARD_BRAND,
  last4: lastFourOf(number),
  instrumentRef,
});

const profileOfCard = (card: PaymentCard): RecurringProfile | null =>
  (Object.keys(PROFILE_CARDS) as RecurringProfile[]).find(
    (profile) => PROFILE_CARDS[profile] === card.number,
  ) ?? null;

const profileOfReference = (reference: InstrumentReference): RecurringProfile => {
  const profile = reference.slice(REFERENCE_PREFIX.length).split('-')[0] ?? '';
  if (!reference.startsWith(REFERENCE_PREFIX) || !(profile in PROFILE_CARDS)) {
    throw new BillingInvariantError('Referencia de instrumento desconocida para el simulador.');
  }
  return profile as RecurringProfile;
};

/** Con el cliente presente: `4242` y `0341` aprueban y emiten referencia; `0002` rechaza (009 RN-3, 010 RN-2). */
const authorizeCard = (card: PaymentCard): GatewayDecision => {
  const profile = profileOfCard(card);
  return decision(
    card.number,
    profile === null ? null : `${REFERENCE_PREFIX}${profile}-${randomUUID()}`,
  );
};

/** Sin el cliente: el perfil de la referencia decide; al aprobar devuelve la misma referencia. */
const authorizeReference = (reference: InstrumentReference): GatewayDecision => {
  const profile = profileOfReference(reference);
  return decision(PROFILE_CARDS[profile], profile === 'ok' ? reference : null);
};

/**
 * Pasarela simulada y determinista (spec 009 RN-3, 010 RN-2; DF-69: sin `failureRate` ni `latencyMs` del diagrama).
 * La referencia es `SIM-TOK-<perfil>-<aleatorio>`: el perfil dice si el cobro recurrente se aprueba y nunca lleva el
 * número. Solo el simulador conoce ese formato (ADR-0031). La validación del cobro ya descarta números que no sean de
 * prueba (RN-9), así que aquí no llegan.
 */
@Injectable()
export class SimulatedPaymentGateway implements IPaymentGateway {
  authorize(instrument: PaymentInstrument): Promise<GatewayDecision> {
    return Promise.resolve(instrument).then((value) =>
      isPresentCard(value) ? authorizeCard(value) : authorizeReference(value),
    );
  }
}
