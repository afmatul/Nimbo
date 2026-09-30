import { ALL_ROLES, createActor, Role } from '../../../../shared';

import { accessibleNodes } from './accessible-nodes';

const ACTOR_ID = '7d0e1c9a-3b2f-4c5d-8e6f-1a2b3c4d5e6f';
const EMPTY_TYPED_SET =
  'SELECT NULL::uuid AS nodo_id, NULL::text AS tipo_nodo, NULL::text AS nivel WHERE false';
const PARAMETER_PREFIX = 'access_';
const INTERNAL_ROLES = ALL_ROLES.filter((role) => role !== Role.CLIENT);

describe('accessibleNodes', () => {
  it.each(INTERNAL_ROLES)(
    'CA-9/CA-16: para %s devuelve el conjunto vacío tipado (nodo_id, tipo_nodo, nivel)',
    (role) => {
      const fragment = accessibleNodes(createActor(ACTOR_ID, role));

      expect(fragment.sql).toBe(EMPTY_TYPED_SET);
    },
  );

  it('CA-13 (005 D-17): para `CLIENT` devuelve sus archivos fuera de la papelera, como `archivo` y `OWNER`', () => {
    const fragment = accessibleNodes(createActor(ACTOR_ID, Role.CLIENT));

    expect(fragment.sql).toBe(
      "SELECT a.id AS nodo_id, 'archivo'::text AS tipo_nodo, 'OWNER'::text AS nivel FROM archivo a " +
        'WHERE a.propietario_id = :access_actor_id AND a.eliminado_en IS NULL',
    );
    expect(fragment.parameters).toEqual({ access_actor_id: ACTOR_ID });
  });

  it.each(ALL_ROLES)('CA-10: para %s todos los parámetros llevan el prefijo `access_`', (role) => {
    const { parameters } = accessibleNodes(createActor(ACTOR_ID, role));

    expect(Object.keys(parameters).every((key) => key.startsWith(PARAMETER_PREFIX))).toBe(true);
  });

  it.each(ALL_ROLES)(
    'CA-10: para %s es una función pura: el fragmento no se puede alterar y cada llamada da el mismo',
    (role) => {
      const actor = createActor(ACTOR_ID, role);
      const fragment = accessibleNodes(actor);

      expect(Object.isFrozen(fragment)).toBe(true);
      expect(Object.isFrozen(fragment.parameters)).toBe(true);
      expect(accessibleNodes(actor)).toEqual(fragment);
    },
  );
});
