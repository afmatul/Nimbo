import type { Actor } from '../../../shared';
import type { AccessLevel } from '../domain/access-level.enum';

/**
 * Lee el nivel de acceso de un actor sobre un nodo (plan 003 §6.5, DT-9). Se llama dentro de `withActor(actor, …)`:
 * el adaptador SQL toma su `EntityManager` de ese ámbito. `null` = sin acceso.
 */
export interface IAccessLevelReader {
  levelFor(actor: Actor, nodeId: string): Promise<AccessLevel | null>;
}

export const I_ACCESS_LEVEL_READER = Symbol('I_ACCESS_LEVEL_READER');
