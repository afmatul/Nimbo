import { ROLES } from '@nimbo/contracts';

import { ROLE_LABELS } from './role-labels';

describe('ROLE_LABELS (003 DT-12)', () => {
  it('CA-17: nombra cada rol en español', () => {
    expect(ROLE_LABELS).toEqual({
      CLIENT: 'Cliente',
      ADMIN: 'Administrador',
      SUPPORT: 'Soporte',
      OPERATOR: 'Operador',
    });
  });

  it('cubre todos los roles de contracts', () => {
    for (const role of ROLES) expect(ROLE_LABELS[role]).toBeTruthy();
  });
});
