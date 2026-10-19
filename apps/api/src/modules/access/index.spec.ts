import * as access from './index';
import type { AccessibleNodesFragment } from './index';

/** Igualdad estricta de tipos (patrón de `type-challenges`); un fallo aquí lo detecta `pnpm typecheck`. */
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

type _FragmentHasSqlAndParameters = Expect<
  Equal<keyof AccessibleNodesFragment, 'sql' | 'parameters'>
>;

/**
 * API pública de `access` (plan 003 §5, §6.5): nada de `infrastructure/**` salvo `accessibleNodes`,
 * `ownedTrashedNodes` (plan 006 §2) y `ownedFiles` (plan 016 §2, PD-112).
 */
const RUNTIME_EXPORTS = [
  'AccessModule',
  'PermissionResolver',
  'accessibleNodes',
  'ownedTrashedNodes',
  'ownedFiles',
  'AccessLevel',
  'Action',
] as const;

describe('modules/access/index.ts', () => {
  it('CA-8, CA-9: exporta exactamente el módulo, el resolvedor, los fragmentos y los enumerados', () => {
    expect(Object.keys(access).sort()).toEqual([...RUNTIME_EXPORTS].sort());
  });
});
