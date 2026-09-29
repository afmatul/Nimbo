import type { ClientAccountVerifiedEvent } from '../../domain/client-account-verified.event';

/** Aísla el mecanismo de eventos en proceso (ADR-0019). Nunca lanza: una verificación confirmada no falla por un oyente. */
export interface IAccountEventsPublisher {
  clientAccountVerified(event: ClientAccountVerifiedEvent): void;
}

export const I_ACCOUNT_EVENTS_PUBLISHER = Symbol('IAccountEventsPublisher');
