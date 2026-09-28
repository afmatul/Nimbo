import { AccessLevel } from '../access-level.enum';

import { EditorPolicy } from './editor.policy';
import type { IAccessPolicy } from './i-access-policy';
import { OwnerPolicy } from './owner.policy';
import { ViewerPolicy } from './viewer.policy';

// `Record` exige una política por nivel: si falta uno, no compila.
export const ACCESS_POLICIES: Readonly<Record<AccessLevel, IAccessPolicy>> = Object.freeze({
  [AccessLevel.OWNER]: new OwnerPolicy(),
  [AccessLevel.EDITOR]: new EditorPolicy(),
  [AccessLevel.VIEWER]: new ViewerPolicy(),
});

export function policyFor(level: AccessLevel): IAccessPolicy {
  return ACCESS_POLICIES[level];
}
