import { AccessLevel } from '../access-level.enum';
import type { Action } from '../action.enum';

import type { IAccessPolicy } from './i-access-policy';

/** El propietario puede todo, incluido un `Action` que todavía no esté en el enum (cerrado al revés). */
export const ownerPolicy: IAccessPolicy = {
  level: AccessLevel.OWNER,
  allows(_action: Action): boolean {
    return true;
  },
};

Object.freeze(ownerPolicy);
