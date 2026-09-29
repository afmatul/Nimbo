import { ROLES } from '@nimbo/contracts';

import { homePathFor } from './home-path';

describe('homePathFor (003 §6.9)', () => {
  it('CA-1: CLIENT va a Mis archivos', () => {
    expect(homePathFor('CLIENT')).toBe('/archivos');
  });

  it.each(['ADMIN', 'SUPPORT', 'OPERATOR'] as const)('%s va al área interna', (role) => {
    expect(homePathFor(role)).toBe('/interno');
  });

  it('cubre todos los roles de contracts', () => {
    for (const role of ROLES) expect(homePathFor(role)).toMatch(/^\//);
  });
});
