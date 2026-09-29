import { AccessLevel } from '../access-level.enum';

import { editorPolicy } from './editor.policy';
import type { IAccessPolicy } from './i-access-policy';
import { ownerPolicy } from './owner.policy';
import { viewerPolicy } from './viewer.policy';

const POLICIES: Readonly<Record<AccessLevel, IAccessPolicy>> = Object.freeze({
  [AccessLevel.OWNER]: ownerPolicy,
  [AccessLevel.EDITOR]: editorPolicy,
  [AccessLevel.VIEWER]: viewerPolicy,
});

/** Exhaustivo por tipo: un nivel nuevo no compila hasta tener política. */
export function policyFor(level: AccessLevel): IAccessPolicy {
  switch (level) {
    case AccessLevel.OWNER:
      return POLICIES[AccessLevel.OWNER];
    case AccessLevel.EDITOR:
      return POLICIES[AccessLevel.EDITOR];
    case AccessLevel.VIEWER:
      return POLICIES[AccessLevel.VIEWER];
    default: {
      const exhaustive: never = level;
      return exhaustive;
    }
  }
}

export function accessPoliciesMap(): Readonly<Record<AccessLevel, IAccessPolicy>> {
  return POLICIES;
}
