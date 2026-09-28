import { AccessLevel } from '../access-level.enum';
import { Action } from '../action.enum';

import type { IAccessPolicy } from './i-access-policy';

// Cerrado por defecto: lo que no está aquí queda negado.
const VIEWER_ALLOWED: ReadonlySet<Action> = new Set([
  Action.VIEW,
  Action.PREVIEW,
  Action.DOWNLOAD,
  Action.QUERY_AGENT,
]);

export class ViewerPolicy implements IAccessPolicy {
  readonly level = AccessLevel.VIEWER;

  allows(action: Action): boolean {
    return VIEWER_ALLOWED.has(action);
  }
}
