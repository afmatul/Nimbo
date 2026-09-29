import { ALL_ROLES, createActor } from '../../../../shared';

import { accessibleNodes } from './accessible-nodes';

const ACTOR_ID = '7d0e1c9a-3b2f-4c5d-8e6f-1a2b3c4d5e6f';
const EMPTY_TYPED_SET =
  'SELECT NULL::uuid AS nodo_id, NULL::text AS tipo_nodo, NULL::text AS nivel WHERE false';
const PARAMETER_PREFIX = 'access_';

describe('accessibleNodes', () => {
  it.each(ALL_ROLES)(
    'CA-9/CA-10: para %s devuelve el conjunto vacío tipado (nodo_id, tipo_nodo, nivel)',
    (role) => {
      const fragment = accessibleNodes(createActor(ACTOR_ID, role));

      expect(fragment.sql).toBe(EMPTY_TYPED_SET);
    },
  );

  it.each(ALL_ROLES)('CA-10: para %s todos los parámetros llevan el prefijo `access_`', (role) => {
    const { parameters } = accessibleNodes(createActor(ACTOR_ID, role));

    expect(Object.keys(parameters).every((key) => key.startsWith(PARAMETER_PREFIX))).toBe(true);
  });

  it('CA-10: es una función pura: el fragmento no se puede alterar y cada llamada da el mismo', () => {
    const actor = createActor(ACTOR_ID, ALL_ROLES[0]);
    const fragment = accessibleNodes(actor);

    expect(Object.isFrozen(fragment)).toBe(true);
    expect(Object.isFrozen(fragment.parameters)).toBe(true);
    expect(accessibleNodes(actor)).toEqual(fragment);
  });
});
