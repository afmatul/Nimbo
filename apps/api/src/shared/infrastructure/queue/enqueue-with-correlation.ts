import { randomUUID } from 'node:crypto';

import type { Job, JobsOptions, Queue } from 'bullmq';

import { CorrelationContext } from '../correlation/correlation-context';

export interface CorrelatedJobData {
  readonly correlationId: string;
}

/**
 * Encola propagando el `correlationId` de la petición (CA-14); sin contexto (trabajo programado) crea uno.
 * `opts` llega tal cual a `queue.add` (p. ej. `jobId` para la idempotencia del correo, 001 CA-21); sin `opts`, la
 * llamada es idéntica a la de siempre.
 * Patrón documentado, no clase base: con tres procesadores se evalúa extraer `CorrelatedProcessor` (plan §6.2).
 */
export const enqueueWithCorrelation = <TData extends Record<string, unknown>>(
  queue: Queue,
  name: string,
  data: TData,
  opts?: JobsOptions,
): Promise<Job<TData & CorrelatedJobData>> => {
  const correlated = {
    ...data,
    correlationId: CorrelationContext.get()?.correlationId ?? randomUUID(),
  };
  const added =
    opts === undefined ? queue.add(name, correlated) : queue.add(name, correlated, opts);
  return added as Promise<Job<TData & CorrelatedJobData>>;
};
