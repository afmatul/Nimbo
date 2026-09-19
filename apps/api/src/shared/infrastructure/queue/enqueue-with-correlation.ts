import { randomUUID } from 'node:crypto';

import type { Job, Queue } from 'bullmq';

import { CorrelationContext } from '../correlation/correlation-context';

export interface CorrelatedJobData {
  readonly correlationId: string;
}

/**
 * Encola propagando el `correlationId` de la petición (CA-14); sin contexto (trabajo programado) crea uno.
 * Patrón documentado, no clase base: con tres procesadores se evalúa extraer `CorrelatedProcessor` (plan §6.2).
 */
export const enqueueWithCorrelation = <TData extends Record<string, unknown>>(
  queue: Queue,
  name: string,
  data: TData,
): Promise<Job<TData & CorrelatedJobData>> =>
  queue.add(name, {
    ...data,
    correlationId: CorrelationContext.get()?.correlationId ?? randomUUID(),
  }) as Promise<Job<TData & CorrelatedJobData>>;
