import type { FileVersionSummary } from '@nimbo/contracts';

import { versionFixture } from './test-versions';
import { historySummary, totalVersionBytes, versionToPrune } from './version-history';

function version(number: number, sizeBytes = 1_000): FileVersionSummary {
  return versionFixture({ number, sizeBytes, isCurrent: number === 5 });
}

const AT_LIMIT = [version(5), version(4), version(3)];

describe('historial de versiones (014)', () => {
  it('021 CA-15 / 014b: el original conservado ocupa lugar pero no cuenta en el espacio', () => {
    const kept = { ...version(4, 4_800_000), keptUntil: '2027-01-15T16:00:00.000Z' };
    const versions = [version(5, 2_900_000), kept, version(3, 1_000_000)];
    expect(totalVersionBytes(versions)).toBe(3_900_000);
    expect(versionToPrune(versions, 3)).toBe(3);
  });
  it('CA-15: en el límite del plan, restaurar elimina la más antigua retenida', () => {
    expect(versionToPrune(AT_LIMIT, 3)).toBe(3);
  });

  it('CA-15: por debajo del límite no se elimina ninguna', () => {
    expect(versionToPrune(AT_LIMIT.slice(0, 2), 3)).toBeNull();
  });

  it('D-1: todas las versiones cuentan en el espacio', () => {
    expect(totalVersionBytes([version(5, 2_600_000), version(4, 2_400_000)])).toBe(5_000_000);
  });

  it('CA-6: cuántas versiones hay y cuántas conserva el plan, contando la actual', () => {
    expect(historySummary(3, 3, 'Personal')).toBe(
      '3 versiones · tu plan Personal conserva 3, contando la actual',
    );
    expect(historySummary(1, 30, null)).toBe('1 versión · tu plan conserva 30, contando la actual');
  });
});
