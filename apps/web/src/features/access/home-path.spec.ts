import { INTERNAL_ROLES, ROLES } from '@nimbo/contracts';

import {
  activityPathFor,
  adminAccountFilesPath,
  adminAccountPath,
  areaHomePathFor,
  CLIENT_ROLES,
  homePathFor,
  INTERNAL_PATHS,
} from './home-path';

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
  it.each([
    ['SUPPORT', '/soporte/metadatos'],
    ['ADMIN', '/admin/cuentas'],
  ] as const)('CA-17: el área de %s empieza en %s', (role, path) => {
    expect(areaHomePathFor(role)).toBe(path);
  });

  it.each(['OPERATOR', 'CLIENT'] as const)(
    'CA-17: %s no tiene área interna con página (la del Operador llega en T-11)',
    (role) => {
      expect(areaHomePathFor(role)).toBeNull();
    },
  );

  it('CA-17: las rutas del Administrador cuelgan de /admin/cuentas; la ficha y sus metadatos llevan solo el id', () => {
    expect(INTERNAL_PATHS.adminAccounts).toBe('/admin/cuentas');
    expect(INTERNAL_PATHS.adminNewAccount).toBe('/admin/cuentas/nueva');
    expect(adminAccountPath('2f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f')).toBe(
      '/admin/cuentas/2f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
    );
    expect(adminAccountFilesPath('2f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f')).toBe(
      '/admin/cuentas/2f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f/metadatos',
    );
  });

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
