import { createActor } from './actor';
import { ALL_ROLES, Role } from './role.enum';

const USER_ID = '6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b';

describe('createActor', () => {
  it.each([
    [Role.CLIENT, true],
    [Role.ADMIN, false],
    [Role.SUPPORT, false],
    [Role.OPERATOR, false],
  ])('CA-9: con rol %s, `canReadContent` es %p', (role, canReadContent) => {
    const actor = createActor(USER_ID, role);

    expect(actor).toEqual({ id: USER_ID, role, canReadContent });
  });

  it('CA-4: el actor está congelado y no se puede alterar después de crearlo', () => {
    const actor = createActor(USER_ID, Role.ADMIN);

    expect(Object.isFrozen(actor)).toBe(true);
    expect(() => {
      (actor as { canReadContent: boolean }).canReadContent = true;
    }).toThrow(TypeError);
  });
});

describe('ALL_ROLES', () => {
  it('CA-4: son los valores de `Role`, en el mismo orden', () => {
    expect(ALL_ROLES).toEqual(Object.values(Role));
  });

  it('CA-4: es de solo lectura', () => {
    expect(Object.isFrozen(ALL_ROLES)).toBe(true);
  });
});
