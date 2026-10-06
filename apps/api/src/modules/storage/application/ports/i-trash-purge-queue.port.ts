/**
 * Cola `trash-purge` vista desde la aplicación (plan 006 §4): «Vaciar papelera» encola una pasada inmediata del mismo
 * procesador que la purga programada. El trabajo es idempotente: si el ciclo programado ya lo tomó, no encuentra nada.
 */
export interface ITrashPurgeQueue {
  enqueueNow(): Promise<void>;
}

export const I_TRASH_PURGE_QUEUE = Symbol('ITrashPurgeQueue');
