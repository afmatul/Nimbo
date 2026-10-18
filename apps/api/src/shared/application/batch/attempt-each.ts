import { errorName } from '../../domain/error-name';

/**
 * Una pasada del `worker` sobre un lote (PD-63): intenta cada elemento y un fallo no frena a los demás. `onFailure`
 * recibe solo el nombre del error (`errorName`). Devuelve cuántos fallaron, para que la pasada falle al final con su
 * `IncompleteBatchError` y BullMQ la reintente.
 */
export const attemptEach = async <T>(
  items: readonly T[],
  attempt: (item: T) => Promise<unknown>,
  onFailure: (item: T, failure: string) => void,
): Promise<number> => {
  let failed = 0;
  for (const item of items) {
    try {
      await attempt(item);
    } catch (error) {
      failed += 1;
      onFailure(item, errorName(error));
    }
  }
  return failed;
};
