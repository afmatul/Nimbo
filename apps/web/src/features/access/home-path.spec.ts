import { INTERNAL_ROLES, ROLES } from '@nimbo/contracts';

import { activityPathFor, areaHomePathFor, CLIENT_ROLES, homePathFor } from './home-path';

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

describe('inicio del área y Mi actividad por rol (011 CA-17)', () => {
  it('CA-17: el área de Soporte empieza en /soporte/metadatos', () => {
    expect(areaHomePathFor('SUPPORT')).toBe('/soporte/metadatos');
  });

  it.each(['ADMIN', 'OPERATOR', 'CLIENT'] as const)(
    'CA-17: %s no tiene área interna con página en el PR-A (Admin y Operador la tendrán en T-11/T-13)',
    (role) => {
      expect(areaHomePathFor(role)).toBeNull();
    },
  );

  it('CA-17: el cliente abre Mi actividad en /actividad', () => {
    expect(activityPathFor('CLIENT')).toBe('/actividad');
  });

  it.each(['ADMIN', 'SUPPORT', 'OPERATOR'] as const)(
    'CA-17: %s abre Mi actividad dentro de su marco, en /interno/actividad',
    (role) => {
      expect(activityPathFor(role)).toBe('/interno/actividad');
    },
  );
});
