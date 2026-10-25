import { randomUUID } from 'node:crypto';

import { FileVersion, type NewVersionInput } from './file-version';
import { ObjectKey } from './object-key';

const OWNER = '11111111-1111-4111-8111-111111111111';
const FILE = '22222222-2222-4222-8222-222222222222';
const OTHER_FILE = '44444444-4444-4444-8444-444444444444';
const UPLOADED_AT = new Date('2026-10-01T10:00:00.000Z');
const OPTIMIZED_AT = new Date('2026-10-20T08:30:00.000Z');

const input = (overrides: Partial<NewVersionInput> = {}): NewVersionInput => {
  const id = randomUUID();
  const fileId = overrides.fileId ?? FILE;
  return {
    id,
    fileId,
    objectKey: ObjectKey.of(OWNER, fileId, id),
    sizeBytes: 1_000n,
    createdBy: OWNER,
    number: 1,
    now: UPLOADED_AT,
    ...overrides,
  };
};

const original = FileVersion.fromUpload(input());
const optimized = (overrides: Partial<NewVersionInput> = {}): FileVersion =>
  FileVersion.forOrigin(
    'optimizacion',
    input({ number: 2, sizeBytes: 400n, now: OPTIMIZED_AT, ...overrides }),
  );

describe('FileVersion: original conservado (014b)', () => {
  it('RN-1: toda versión nueva cuenta en el espacio y no tiene fecha de conservación', () => {
    expect(original.countsInQuota).toBe(true);
    expect(original.keptUntil).toBeNull();
    expect(optimized().countsInQuota).toBe(true);
  });

  it('CA-1, RN-3: el original se conserva hasta el registro de la optimización más los días del plan', () => {
    const kept = original.conserveAsOriginal(optimized(), 7);

    expect(kept.keptUntil).toEqual(new Date('2026-10-27T08:30:00.000Z'));
    expect(kept.countsInQuota).toBe(false);
    expect(kept.snapshot()).toEqual({ ...original.snapshot(), keptUntil: kept.keptUntil });
    expect(original.countsInQuota).toBe(true);
  });

  it.each([
    ['no es menor (igual)', () => optimized({ sizeBytes: 1_000n })],
    ['no es menor (mayor)', () => optimized({ sizeBytes: 1_001n })],
    ['es de otro archivo', () => optimized({ fileId: OTHER_FILE })],
    ['no es una optimización', () => FileVersion.fromUpload(input({ number: 2, sizeBytes: 400n }))],
  ])('CA-3, RN-2: rechaza conservar si la versión nueva %s', (_case, build) => {
    expect(() => original.conserveAsOriginal(build(), 7)).toThrow(TypeError);
  });

  it('CA-3: rechaza conservar un original que ya estaba conservado', () => {
    const kept = original.conserveAsOriginal(optimized(), 7);

    expect(() => kept.conserveAsOriginal(optimized({ sizeBytes: 100n }), 7)).toThrow(TypeError);
  });

  it.each([0, -1, 1.5])(
    'RN-3: los días de conservación deben ser un entero positivo (%s)',
    (days) => {
      expect(() => original.conserveAsOriginal(optimized(), days)).toThrow(TypeError);
    },
  );

  it('ck_version_conservada_hasta: `rehydrate` rechaza una fecha que no es posterior a la creación', () => {
    const snapshot = original.snapshot();

    expect(() => FileVersion.rehydrate({ ...snapshot, keptUntil: UPLOADED_AT })).toThrow(TypeError);
    expect(FileVersion.rehydrate({ ...snapshot, keptUntil: OPTIMIZED_AT }).keptUntil).toEqual(
      OPTIMIZED_AT,
    );
  });

  it('es inmutable: la fecha que devuelve es una copia', () => {
    const kept = original.conserveAsOriginal(optimized(), 7);
    kept.keptUntil?.setTime(0);

    expect(kept.keptUntil).toEqual(new Date('2026-10-27T08:30:00.000Z'));
  });
});
