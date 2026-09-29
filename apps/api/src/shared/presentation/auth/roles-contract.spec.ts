import { ROLES, SHARED_ERROR_CODES } from '@nimbo/contracts';

import { InsufficientRoleError, UnauthenticatedError } from '../../domain/errors';
import { Role } from '../../domain/role.enum';

/** El dominio no importa `contracts` (ADR-0008): el contrato con la web se comprueba desde `presentation`. */
describe('Contrato de roles y códigos con @nimbo/contracts', () => {
  it('CA-5: `Role` de `api` tiene exactamente los valores de `ROLES`', () => {
    expect(Object.values(Role).sort()).toEqual([...ROLES].sort());
  });

  it('CA-1/CA-5: los `code` de los errores de autenticación y rol son los de `SHARED_ERROR_CODES`', () => {
    expect(new UnauthenticatedError().code).toBe(SHARED_ERROR_CODES.UNAUTHENTICATED);
    expect(new InsufficientRoleError().code).toBe(SHARED_ERROR_CODES.FORBIDDEN);
  });
});
