import { AccessLevel } from '../access-level.enum';
import { Action } from '../action.enum';

import type { IAccessPolicy } from './i-access-policy';

const ALLOWED: ReadonlySet<Action> = new Set([
  Action.VIEW,
  Action.PREVIEW,
  Action.DOWNLOAD,
  Action.QUERY_AGENT,
  Action.EDIT,
  Action.CREATE_VERSION,
]);

/** Lo que no está en el conjunto queda negado, también un valor nuevo de `Action` (DT-10). */
export const editorPolicy: IAccessPolicy = Object.freeze({
  level: AccessLevel.EDITOR,
  allows(action: Action): boolean {
    return ALLOWED.has(action);
  },
});
