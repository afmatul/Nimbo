import type { TrashItemType } from './i-trash.repository.port';

/** Una raíz vencida de la papelera: solo identificadores, sin nombre ni clave de objeto (plan 006 §5). */
export interface ExpiredTrashItem {
  readonly type: TrashItemType;
  readonly id: string;
  readonly propietarioId: string;
}

/**
 * Raíces vencidas de la papelera de **todos** los propietarios (plan 006 §2, RN-8, ADR-0021). Es el único acceso sin
 * actor de la purga: llama a `papelera_vencida`, que no deja adelantar el reloj y tiene tope de 1000 filas. Se llama
 * dentro de `ITransactionRunner.run` (sin actor). Solo lo inyecta `TrashPurgeProcessor`: no se exporta desde
 * `storage/index.ts` y ningún servicio con `actor` lo recibe.
 */
export interface IExpiredTrashScanner {
  listExpired(now: Date, limit: number): Promise<readonly ExpiredTrashItem[]>;
}

export const I_EXPIRED_TRASH_SCANNER = Symbol('IExpiredTrashScanner');
