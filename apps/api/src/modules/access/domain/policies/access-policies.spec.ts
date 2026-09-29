import { AccessLevel } from '../access-level.enum';
import { Action } from '../action.enum';

import { accessPoliciesMap, policyFor } from './access-policies';

const EXPECTED: Readonly<Record<Action, Readonly<Record<AccessLevel, boolean>>>> = {
  [Action.VIEW]: { OWNER: true, EDITOR: true, VIEWER: true },
  [Action.PREVIEW]: { OWNER: true, EDITOR: true, VIEWER: true },
  [Action.DOWNLOAD]: { OWNER: true, EDITOR: true, VIEWER: true },
  [Action.QUERY_AGENT]: { OWNER: true, EDITOR: true, VIEWER: true },
  [Action.EDIT]: { OWNER: true, EDITOR: true, VIEWER: false },
  [Action.CREATE_VERSION]: { OWNER: true, EDITOR: true, VIEWER: false },
  [Action.SHARE]: { OWNER: true, EDITOR: false, VIEWER: false },
  [Action.CREATE_PUBLIC_LINK]: { OWNER: true, EDITOR: false, VIEWER: false },
  [Action.VIEW_ACCESS_LIST]: { OWNER: true, EDITOR: false, VIEWER: false },
  [Action.MOVE]: { OWNER: true, EDITOR: false, VIEWER: false },
  [Action.DELETE]: { OWNER: true, EDITOR: false, VIEWER: false },
};

describe('políticas de acceso', () => {
  it('cubre los tres niveles y las once acciones', () => {
    for (const action of Object.values(Action)) {
      for (const level of Object.values(AccessLevel)) {
        expect(policyFor(level).allows(action)).toBe(EXPECTED[action][level]);
      }
    }
  });

  it('niega un Action desconocido a Editor y Viewer, y se lo permite al Owner', () => {
    const unknown = 'RENAME' as Action;

    expect(policyFor(AccessLevel.OWNER).allows(unknown)).toBe(true);
    expect(policyFor(AccessLevel.EDITOR).allows(unknown)).toBe(false);
    expect(policyFor(AccessLevel.VIEWER).allows(unknown)).toBe(false);
  });

  it('congela el mapa y resuelve cada nivel', () => {
    const map = accessPoliciesMap();

    expect(Object.isFrozen(map)).toBe(true);
    expect(policyFor(AccessLevel.OWNER).level).toBe(AccessLevel.OWNER);
    expect(policyFor(AccessLevel.EDITOR).level).toBe(AccessLevel.EDITOR);
    expect(policyFor(AccessLevel.VIEWER).level).toBe(AccessLevel.VIEWER);
  });
});
