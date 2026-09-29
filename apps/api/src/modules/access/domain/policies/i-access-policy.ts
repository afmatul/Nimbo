import type { AccessLevel } from '../access-level.enum';
import type { Action } from '../action.enum';

export interface IAccessPolicy {
  readonly level: AccessLevel;
  allows(action: Action): boolean;
}
