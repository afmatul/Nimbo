/**
 * Publica un evento de dominio en el proceso, **después del commit** (ADR-0019). Lo comparten los productores desde
 * el tercero (`storage`, 019; regla de tres, Art. VI.2). El nombre y la forma del contenido los exporta el productor
 * en su `index.ts`. Nunca lanza: una operación ya confirmada no falla por un oyente.
 */
export interface IDomainEventPublisher {
  publish(name: string, payload: object): void;
}

export const I_DOMAIN_EVENT_PUBLISHER = Symbol('IDomainEventPublisher');
