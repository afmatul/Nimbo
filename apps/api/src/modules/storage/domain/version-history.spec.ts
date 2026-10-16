import { FileVersion } from './file-version';
import { ObjectKey } from './object-key';
import { VersionHistory } from './version-history';

const OWNER = '11111111-1111-4111-8111-111111111111';
const FILE = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-10-08T10:00:00.000Z');

function versionId(number: number): string {
  return `33333333-3333-4333-8333-${String(number).padStart(12, '0')}`;
}

function version(number: number, sizeBytes: bigint): FileVersion {
  const id = versionId(number);
  return FileVersion.fromUpload({
    id,
    fileId: FILE,
    objectKey: ObjectKey.of(OWNER, FILE, id),
    sizeBytes,
    createdBy: OWNER,
    number,
    now: NOW,
  });
}

describe('VersionHistory.of (CA-6)', () => {
  it('CA-6: ordena de la más reciente a la más antigua por número', () => {
    const entries = VersionHistory.of([version(1, 10n), version(3, 30n), version(2, 20n)]);

    expect(entries.map((entry) => entry.version.number)).toEqual([3, 2, 1]);
  });

  it('CA-6: `deltaBytes` es el cambio de tamaño frente a la anterior retenida (positivo, negativo o cero)', () => {
    const entries = VersionHistory.of([
      version(1, 100n),
      version(2, 300n),
      version(3, 200n),
      version(4, 200n),
    ]);

    expect(entries.map((entry) => entry.deltaBytes)).toEqual([0n, -100n, 200n, null]);
  });

  it('CA-6: la primera versión no tiene comparación (`null`)', () => {
    const [only] = VersionHistory.of([version(1, 2048n)]);

    expect(only?.deltaBytes).toBeNull();
  });

  it('CA-6: la más antigua retenida cuya anterior ya se podó tampoco tiene comparación', () => {
    const entries = VersionHistory.of([version(5, 50n), version(3, 30n), version(4, 45n)]);

    expect(entries.map((entry) => [entry.version.number, entry.deltaBytes])).toEqual([
      [5, 5n],
      [4, 15n],
      [3, null],
    ]);
  });

  it('sin versiones devuelve un historial vacío', () => {
    expect(VersionHistory.of([])).toEqual([]);
  });

  it('las entradas son inmutables y no mutan la entrada', () => {
    const versions = [version(1, 10n), version(2, 20n)];

    const entries = VersionHistory.of(versions);

    expect(Object.isFrozen(entries)).toBe(true);
    expect(entries.every((entry) => Object.isFrozen(entry))).toBe(true);
    expect(versions.map((item) => item.number)).toEqual([1, 2]);
  });
});
