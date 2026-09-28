import { AccessLevel } from '../access-level.enum';

import type { IAccessPolicy } from './i-access-policy';

/** El propietario puede todo, incluso acciones que se agreguen después. */
export class OwnerPolicy implements IAccessPolicy {
  readonly level = AccessLevel.OWNER;

  allows(): boolean {
    return true;
  }
}
