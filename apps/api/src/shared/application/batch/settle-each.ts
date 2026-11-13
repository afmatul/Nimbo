import { DomainError } from '../../domain/errors';

/** Lo que dejó un lote: los elementos que salieron bien y los que no, con el `code` de su error de dominio. */
export interface Settlement<T> {
  readonly succeeded: T[];
  readonly failed: { readonly item: T; readonly code: string }[];
}

/**
 * Lote pedido por HTTP (explorador: mover, papelera, compartir…): aplica la operación individual a cada elemento, en
 * orden y uno a la vez (cada uno con su transacción y sus bloqueos), y un error de dominio solo marca ese elemento. Un
 * error que no es de dominio (BD caída, defecto) se propaga: no es una respuesta por elemento.
 */
export const settleEach = async <T>(
  items: readonly T[],
  attempt: (item: T) => Promise<unknown>,
): Promise<Settlement<T>> => {
  const settlement: Settlement<T> = { succeeded: [], failed: [] };
  for (const item of items) {
    try {
      await attempt(item);
      settlement.succeeded.push(item);
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      settlement.failed.push({ item, code: error.code });
    }
  }
  return settlement;
};
