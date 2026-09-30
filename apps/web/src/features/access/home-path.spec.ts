import { ROLES } from '@nimbo/contracts';

import { CLIENT_ROLES, homePathFor, INTERNAL_ROLES } from './home-path';

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

describe('grupos de roles (003 §6.9)', () => {
  it('CA-17: CLIENT_ROLES e INTERNAL_ROLES reparten todos los roles de contracts sin solaparse', () => {
    expect([...CLIENT_ROLES, ...INTERNAL_ROLES].sort()).toEqual([...ROLES].sort());
    expect(CLIENT_ROLES).toEqual(['CLIENT']);
  });

  it('CA-17: cada rol va al inicio de su grupo', () => {
    for (const role of CLIENT_ROLES) expect(homePathFor(role)).toBe('/archivos');
    for (const role of INTERNAL_ROLES) expect(homePathFor(role)).toBe('/interno');
  });
});
