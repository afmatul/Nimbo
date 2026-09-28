import { ROLES, roleSchema, SHARED_ERROR_CODES } from './index';
import type { RoleName } from './index';

/** `satisfies` falla en `pnpm typecheck` si a `RoleName` le sobra o le falta un rol. */
const EVERY_ROLE_NAME = {
  CLIENT: true,
  ADMIN: true,
  SUPPORT: true,
  OPERATOR: true,
} satisfies Record<RoleName, true>;

describe('contracts/shared: roles y códigos de error', () => {
  it('CA-5: `ROLES` es exactamente CLIENT, ADMIN, SUPPORT y OPERATOR', () => {
    expect([...ROLES]).toEqual(['CLIENT', 'ADMIN', 'SUPPORT', 'OPERATOR']);
  });

  it.each(['CLIENT', 'ADMIN', 'SUPPORT', 'OPERATOR'])('CA-5: `roleSchema` acepta %s', (role) => {
    expect(roleSchema.safeParse(role).success).toBe(true);
  });

  it.each(['client', '', 'ROOT'])('CA-5: `roleSchema` rechaza %p', (role) => {
    expect(roleSchema.safeParse(role).success).toBe(false);
  });

  it('CA-17: `RoleName` es la unión de los cuatro roles', () => {
    expect(Object.keys(EVERY_ROLE_NAME)).toEqual([...ROLES]);
    // @ts-expect-error `client` en minúsculas no es un `RoleName`.
    const invalid: RoleName = 'client';
    expect(invalid).toBe('client');
  });

  it('CA-1/CA-5: `SHARED_ERROR_CODES` contiene SHARED_UNAUTHENTICATED y SHARED_FORBIDDEN', () => {
    expect(Object.values(SHARED_ERROR_CODES)).toEqual(
      expect.arrayContaining(['SHARED_UNAUTHENTICATED', 'SHARED_FORBIDDEN']),
    );
  });
});
