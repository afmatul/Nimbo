import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

interface RootPackageJson {
  readonly packageManager?: string;
  readonly engines?: { readonly node?: string };
  readonly scripts?: Record<string, string>;
}

function readRootPackageJson(): RootPackageJson {
  return JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as RootPackageJson;
}

describe('CA-4: estructura y comandos raíz', () => {
  it.each([
    'apps/api',
    'apps/web',
    'apps/worker',
    'packages/contracts',
    'packages/config',
    'infra',
    'pnpm-workspace.yaml',
    '.nvmrc',
    '.env.example',
  ])('existe `%s` en la raíz', (relativePath) => {
    expect(existsSync(join(ROOT, relativePath))).toBe(true);
  });

  it.each([
    'dev',
    'lint',
    'typecheck',
    'test',
    'test:int',
    'test:isolation',
    'test:e2e',
    'seed',
    'env:check',
  ])('el `package.json` raíz expone el script `%s`', (script) => {
    expect(readRootPackageJson().scripts).toHaveProperty(script);
  });

  it('fija pnpm 10 y Node 22 en el `package.json` raíz', () => {
    const pkg = readRootPackageJson();
    expect(pkg.packageManager).toMatch(/^pnpm@10\./);
    expect(pkg.engines?.node).toBe('22.x');
  });

  it('`.nvmrc` fija Node 22', () => {
    expect(readFileSync(join(ROOT, '.nvmrc'), 'utf8').trim()).toBe('22');
  });

  it('`pnpm-workspace.yaml` incluye `apps/*` y `packages/*` y deja fuera `docs/**`', () => {
    const workspace = readFileSync(join(ROOT, 'pnpm-workspace.yaml'), 'utf8');
    expect(workspace).toMatch(/apps\/\*/);
    expect(workspace).toMatch(/packages\/\*/);
    expect(workspace).not.toMatch(/docs/);
  });
});
