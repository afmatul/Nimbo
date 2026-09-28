import { AccessLevel } from '../access-level.enum';
import { Action } from '../action.enum';

import { ACCESS_POLICIES, policyFor } from './access-policies';

// Tabla de plan §6.5: [acción, Owner, Editor, Viewer].
const TABLE: ReadonlyArray<readonly [Action, boolean, boolean, boolean]> = [
  [Action.VIEW, true, true, true],
  [Action.PREVIEW, true, true, true],
  [Action.DOWNLOAD, true, true, true],
  [Action.QUERY_AGENT, true, true, true],
  [Action.EDIT, true, true, false],
  [Action.CREATE_VERSION, true, true, false],
  [Action.SHARE, true, false, false],
  [Action.CREATE_PUBLIC_LINK, true, false, false],
  [Action.VIEW_ACCESS_LIST, true, false, false],
  [Action.MOVE, true, false, false],
  [Action.DELETE, true, false, false],
];

describe('políticas de acceso (CA-8)', () => {
  it('CA-8: la tabla cubre exactamente las once acciones', () => {
    expect(TABLE.map(([action]) => action).sort()).toEqual(Object.values(Action).sort());
    expect(Object.values(Action)).toHaveLength(11);
  });

  it.each(TABLE)('CA-8: %s → Owner %s, Editor %s, Viewer %s', (action, owner, editor, viewer) => {
    expect(policyFor(AccessLevel.OWNER).allows(action)).toBe(owner);
    expect(policyFor(AccessLevel.EDITOR).allows(action)).toBe(editor);
    expect(policyFor(AccessLevel.VIEWER).allows(action)).toBe(viewer);
  });

  it('CA-8: una acción desconocida queda negada para Editor y Viewer y permitida para Owner', () => {
    const unknown = 'RENAME' as Action;

    expect(policyFor(AccessLevel.OWNER).allows(unknown)).toBe(true);
    expect(policyFor(AccessLevel.EDITOR).allows(unknown)).toBe(false);
    expect(policyFor(AccessLevel.VIEWER).allows(unknown)).toBe(false);
  });

  it('CA-8: policyFor devuelve la política de cada nivel', () => {
    for (const level of Object.values(AccessLevel)) {
      expect(policyFor(level).level).toBe(level);
    }
  });

  it('CA-8: el mapa de políticas está congelado y cubre los tres niveles', () => {
    expect(Object.isFrozen(ACCESS_POLICIES)).toBe(true);
    expect(Object.keys(ACCESS_POLICIES).sort()).toEqual(Object.values(AccessLevel).sort());
  });
});
