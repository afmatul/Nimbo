import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Actor } from '../../shared';

import * as storage from './index';
import type { IPlanLimitsProvider, PlanLimits } from './index';

/** Igualdad estricta de tipos (patrón de `type-challenges`); un fallo aquí lo detecta `pnpm typecheck`. */
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

/** ISP (plan §6): `PlanLimits` solo lleva los límites de almacenamiento, en bytes. */
type _PlanLimitsShape = Expect<
  Equal<PlanLimits, { readonly maxFileBytes: bigint; readonly storageQuotaBytes: bigint }>
>;
type _LimitsForSignature = Expect<
  Equal<IPlanLimitsProvider['limitsFor'], (actor: Actor) => Promise<PlanLimits>>
>;

/**
 * API pública de `storage` (plan §6, DF-51 opción A): el token del puerto de límites y el módulo que monta la raíz de
 * composición. El detector, el escáner y los repositorios no salen.
 */
const RUNTIME_EXPORTS = ['I_PLAN_LIMITS_PROVIDER', 'StorageModule'] as const;

describe('modules/storage/index.ts', () => {
  it('CA-3, CA-4, RN-1: exporta exactamente el token del puerto de límites y `StorageModule`', () => {
    expect(Object.keys(storage).sort()).toEqual([...RUNTIME_EXPORTS].sort());
    expect(typeof storage.I_PLAN_LIMITS_PROVIDER).toBe('symbol');
  });

  it('RN-1: `plan-limits.ts` no importa `billing` (billing implementa el puerto, no al revés)', () => {
    const source = readFileSync(join(__dirname, 'application', 'plan-limits.ts'), 'utf8');

    expect(source).not.toMatch(/from\s+['"][^'"]*billing/);
  });
});
