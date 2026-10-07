import { ALL_ROLES, createActor, Role } from '../../../../shared';

import { accessibleNodes, ownedTrashedNodes } from './accessible-nodes';

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

  it('CA-22 (006): para `CLIENT` devuelve sus archivos y carpetas fuera de la papelera, con nivel `OWNER`', () => {
    const fragment = accessibleNodes(createActor(ACTOR_ID, Role.CLIENT));

    expect(fragment.sql).toBe(
      "SELECT a.id AS nodo_id, 'archivo'::text AS tipo_nodo, 'OWNER'::text AS nivel FROM archivo a " +
        'WHERE a.propietario_id = :access_actor_id AND a.eliminado_en IS NULL ' +
        'UNION ALL ' +
        "SELECT c.id AS nodo_id, 'carpeta'::text AS tipo_nodo, 'OWNER'::text AS nivel FROM carpeta c " +
        'WHERE c.propietario_id = :access_actor_id AND c.eliminado_en IS NULL',
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

describe('ownedTrashedNodes', () => {
  it.each(INTERNAL_ROLES)(
    'CA-22 (006): para %s devuelve el conjunto vacío tipado (RN-7: solo el propietario ve su papelera)',
    (role) => {
      const fragment = ownedTrashedNodes(createActor(ACTOR_ID, role));

      expect(fragment.sql).toBe(EMPTY_TYPED_SET);
      expect(fragment.parameters).toEqual({});
    },
  );

  it('CA-11 (006): para `CLIENT` devuelve solo las raíces de su papelera (lo arrastrado por una carpeta no)', () => {
    const fragment = ownedTrashedNodes(createActor(ACTOR_ID, Role.CLIENT));

    expect(fragment.sql).toBe(
      "SELECT a.id AS nodo_id, 'archivo'::text AS tipo_nodo, 'OWNER'::text AS nivel FROM archivo a " +
        'WHERE a.propietario_id = :access_actor_id ' +
        'AND a.eliminado_en IS NOT NULL AND a.eliminado_con_carpeta_id IS NULL ' +
        'UNION ALL ' +
        "SELECT c.id AS nodo_id, 'carpeta'::text AS tipo_nodo, 'OWNER'::text AS nivel FROM carpeta c " +
        'WHERE c.propietario_id = :access_actor_id ' +
        'AND c.eliminado_en IS NOT NULL AND c.eliminado_con_carpeta_id IS NULL',
    );
    expect(fragment.parameters).toEqual({ access_actor_id: ACTOR_ID });
  });

  it.each(ALL_ROLES)(
    'CA-22 (006): para %s es puro, inmutable y con parámetros `access_`',
    (role) => {
      const actor = createActor(ACTOR_ID, role);
      const fragment = ownedTrashedNodes(actor);

      expect(Object.isFrozen(fragment)).toBe(true);
      expect(Object.isFrozen(fragment.parameters)).toBe(true);
      expect(
        Object.keys(fragment.parameters).every((key) => key.startsWith(PARAMETER_PREFIX)),
      ).toBe(true);
      expect(ownedTrashedNodes(actor)).toEqual(fragment);
    },
  );
});
