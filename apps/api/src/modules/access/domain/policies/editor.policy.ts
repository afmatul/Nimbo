import { AccessLevel } from '../access-level.enum';
import { Action } from '../action.enum';

import type { IAccessPolicy } from './i-access-policy';

// Cerrado por defecto: lo que no está aquí queda negado.
const EDITOR_ALLOWED: ReadonlySet<Action> = new Set([
  Action.VIEW,
  Action.PREVIEW,
  Action.DOWNLOAD,
  Action.QUERY_AGENT,
  Action.EDIT,
  Action.CREATE_VERSION,
]);

export class EditorPolicy implements IAccessPolicy {
  readonly level = AccessLevel.EDITOR;

  allows(action: Action): boolean {
    return EDITOR_ALLOWED.has(action);
  }
}
