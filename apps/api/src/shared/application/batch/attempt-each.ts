import { errorName } from '../../domain/error-name';

/** Lo único que se registra de un fallo: el nombre del error y su `code` (de dominio o de Postgres), nunca el mensaje. */
export interface BatchFailure {
  readonly errorName: string;
  readonly code: string | null;
}

const codeOf = (error: unknown): string | null => {
  const code = error instanceof Error ? (error as { code?: unknown }).code : undefined;
  return typeof code === 'string' ? code : null;
};

/**
 * Una pasada del `worker` sobre un lote (PD-63): intenta cada elemento y un fallo no frena a los demás. `onFailure`
 * recibe solo `BatchFailure`. Devuelve cuántos fallaron, para que la pasada falle al final con su
 * `IncompleteBatchError` y BullMQ la reintente.
 */
export const attemptEach = async <T>(
  items: readonly T[],
  attempt: (item: T) => Promise<unknown>,
  onFailure: (item: T, failure: BatchFailure) => void,
): Promise<number> => {
  let failed = 0;
  for (const item of items) {
    try {
      await attempt(item);
    } catch (error) {
      failed += 1;
      onFailure(item, { errorName: errorName(error), code: codeOf(error) });
    }
  }
  return failed;
};
