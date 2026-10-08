import { FILE_VERSION_ORIGINS, fileVersionsResponseSchema } from './version-schemas';

const VERSION = {
  id: '2f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
  number: 3,
  origin: 'restauracion',
  sizeBytes: 2048,
  deltaBytes: '-1024',
  restoredFromNumber: 1,
  createdAt: '2026-10-08T10:00:00.000Z',
  createdById: '7a8b9c0d-1e2f-4c5d-8e6f-2f0c1d2e3a4b',
  isCurrent: true,
};

const FIRST = {
  ...VERSION,
  id: '3a4b4c5d-8e6f-4a8b-9c0d-1e2f2f0c1d2e',
  number: 1,
  origin: 'carga',
  deltaBytes: null,
  restoredFromNumber: null,
  isCurrent: false,
};

describe('fileVersionsResponseSchema (014 plan §4)', () => {
  it('CA-6: el historial lleva las versiones y las retenidas del plan', () => {
    const response = { items: [VERSION, FIRST], retainedVersions: 3 };

    expect(fileVersionsResponseSchema.parse(response)).toEqual(response);
  });

  it('CA-6: el cambio de tamaño es un entero con signo en texto, o `null` sin anterior retenida', () => {
    const grown = { ...VERSION, deltaBytes: '9007199254740993' };

    expect(fileVersionsResponseSchema.parse({ items: [grown], retainedVersions: 3 })).toBeTruthy();
  });

  it('CA-5: los orígenes son los de `version_archivo.origen`', () => {
    expect([...FILE_VERSION_ORIGINS].sort()).toEqual(
      ['carga', 'edicion', 'optimizacion', 'restauracion'].sort(),
    );
  });

  it.each([
    ['número en cero', { ...VERSION, number: 0 }],
    ['origen desconocido', { ...VERSION, origin: 'copia' }],
    ['cambio de tamaño como número', { ...VERSION, deltaBytes: -1024 }],
    ['cambio de tamaño no entero', { ...VERSION, deltaBytes: '1.5' }],
    ['cambio de tamaño vacío', { ...VERSION, deltaBytes: '' }],
    ['número de origen en cero', { ...VERSION, restoredFromNumber: 0 }],
    ['clave de objeto', { ...VERSION, objectKey: 'u/a/b/c' }],
    ['nombre del autor', { ...VERSION, createdByName: 'Ana López' }],
  ])('CA-7: rechaza una versión con %s', (_case, version) => {
    expect(
      fileVersionsResponseSchema.safeParse({ items: [version], retainedVersions: 3 }).success,
    ).toBe(false);
  });

  it('CA-6: rechaza unas versiones retenidas en cero', () => {
    expect(fileVersionsResponseSchema.safeParse({ items: [], retainedVersions: 0 }).success).toBe(
      false,
    );
  });
});
