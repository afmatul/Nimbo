import { AccessLevel } from '../access-level.enum';
import { Action } from '../action.enum';

import type { IAccessPolicy } from './i-access-policy';

const ALLOWED: ReadonlySet<Action> = new Set([
  Action.VIEW,
  Action.PREVIEW,
  Action.DOWNLOAD,
  Action.QUERY_AGENT,
]);

export const viewerPolicy: IAccessPolicy = Object.freeze({
  level: AccessLevel.VIEWER,
  allows(action: Action): boolean {
    return ALLOWED.has(action);
  },
});
