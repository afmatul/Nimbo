import type { AccessLevel } from '../access-level.enum';
import type { Action } from '../action.enum';

/** Qué acciones permite un nivel de acceso. */
export interface IAccessPolicy {
  readonly level: AccessLevel;
  allows(action: Action): boolean;
}
