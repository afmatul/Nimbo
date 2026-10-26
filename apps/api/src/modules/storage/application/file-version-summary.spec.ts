import { randomUUID } from 'node:crypto';

import { fileVersionSummarySchema } from '@nimbo/contracts';

import { createActor, Role } from '../../../shared';
import { FileVersion } from '../domain/file-version';
import { ObjectKey } from '../domain/object-key';
import { VersionHistory } from '../domain/version-history';

import { toFileVersionSummary } from './file-version-summary';

const ANA = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const FILE_ID = '22222222-2222-4222-8222-222222222222';
const CREATED_AT = new Date('2026-10-01T10:00:00.000Z');

const uploaded = (number: number, sizeBytes: bigint): FileVersion => {
  const id = randomUUID();
  return FileVersion.fromUpload({
    id,
    fileId: FILE_ID,
    objectKey: ObjectKey.of(ANA.id, FILE_ID, id),
    sizeBytes,
    createdBy: ANA.id,
    number,
    now: CREATED_AT,
  });
};

describe('toFileVersionSummary (plan 014 §4, CA-6)', () => {
  const first = uploaded(1, 1_000n);
  const restored = FileVersion.fromRestoration(first, {
    id: randomUUID(),
    objectKey: ObjectKey.of(ANA.id, FILE_ID, randomUUID()),
    createdBy: ANA.id,
    number: 2,
    now: CREATED_AT,
  });
  const [newest, oldest] = VersionHistory.of([first, restored]);

  it('CA-6: mapea la versión con su cambio en texto, su origen y si es la actual, sin clave de objeto', () => {
    if (newest === undefined) throw new Error('falta la entrada');

    const summary = toFileVersionSummary(newest, restored.id);

    expect(summary).toEqual({
      id: restored.id,
      number: 2,
      origin: 'restauracion',
      sizeBytes: 1_000,
      deltaBytes: '0',
      restoredFromNumber: 1,
      createdAt: CREATED_AT.toISOString(),
      createdById: ANA.id,
      isCurrent: true,
      keptUntil: null,
    });
    expect(fileVersionSummarySchema.parse(summary)).toEqual(summary);
    expect(JSON.stringify(summary)).not.toContain('u/');
  });

  it('CA-6: sin anterior retenida el cambio es `null`; otra versión no es la actual', () => {
    if (oldest === undefined) throw new Error('falta la entrada');

    const summary = toFileVersionSummary(oldest, restored.id);

    expect(summary).toMatchObject({ number: 1, deltaBytes: null, isCurrent: false });
    expect(summary.restoredFromNumber).toBeNull();
  });

  it('CA-6: un cambio negativo mayor que el entero seguro se conserva exacto en texto', () => {
    const big = uploaded(1, 2n ** 60n);
    const small = uploaded(2, 1n);
    const [entry] = VersionHistory.of([big, small]);
    if (entry === undefined) throw new Error('falta la entrada');

    expect(toFileVersionSummary(entry, small.id).deltaBytes).toBe(String(1n - 2n ** 60n));
  });

  it('014b CA-4: un original conservado trae su fecha de conservación en ISO', () => {
    const optimized = FileVersion.forOrigin('optimizacion', {
      id: randomUUID(),
      fileId: FILE_ID,
      objectKey: ObjectKey.of(ANA.id, FILE_ID, randomUUID()),
      sizeBytes: 400n,
      createdBy: ANA.id,
      number: 2,
      now: CREATED_AT,
    });
    const kept = uploaded(1, 1_000n).conserveAsOriginal(optimized, 7);
    const [, entry] = VersionHistory.of([kept, optimized]);
    if (entry === undefined) throw new Error('falta la entrada');

    expect(toFileVersionSummary(entry, optimized.id).keptUntil).toBe('2026-10-08T10:00:00.000Z');
  });
});
