import type { Actor } from '../../../../shared';
import type { SharedNodeRef, UserShare } from '../../domain/user-share';

/**
 * Comparticiones del propietario (`comparticion`, plan 012 §2). Cada método corre dentro de `withActor(actor, …)`:
 * el adaptador usa `requireActorScope` y la RLS es la segunda barrera.
 */
export interface IShareRepository {
  /** El acceso directo de `recipientId` a un nodo del actor, o `null` (RN-2: a lo sumo uno por persona y nodo). */
  findDirect(actor: Actor, node: SharedNodeRef, recipientId: string): Promise<UserShare | null>;
  /** Guarda una compartición nueva; `false`, sin escribir, si no hay un nodo de ese tipo con ese id. */
  insert(actor: Actor, share: UserShare): Promise<boolean>;
  /** Persiste el nivel nuevo de un acceso directo del actor (CA-5). */
  updateLevel(actor: Actor, share: UserShare): Promise<void>;
}

export const I_SHARE_REPOSITORY = Symbol('IShareRepository');
