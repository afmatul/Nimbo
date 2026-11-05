import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** El único archivo de `sharing` que puede derivar un actor con `createActor` (ADR-0039). */
const ALLOWED_FILE = 'application/public-link-access.service.ts';

const CREATE_ACTOR = /\bcreateActor\b/;

/** Archivos de producción de `sharing`, relativos al módulo y con `/`; sin pruebas. */
const productionFiles = (): string[] =>
  readdirSync(__dirname, { recursive: true, encoding: 'utf8' })
    .filter((path) => path.endsWith('.ts') && !path.endsWith('.spec.ts'))
    .map((path) => relative(__dirname, join(__dirname, path)).split(sep).join('/'));

const usesCreateActor = (path: string): boolean =>
  CREATE_ACTOR.test(readFileSync(join(__dirname, path), 'utf8'));

describe('arquitectura de sharing: el actor derivado (013, ADR-0039, condición de Adrián en el PR #93)', () => {
  it('ADR-0039: solo `PublicLinkAccessService` importa o usa `createActor` en `sharing`', () => {
    const offenders = productionFiles().filter(
      (path) => path !== ALLOWED_FILE && usesCreateActor(path),
    );

    expect(offenders).toEqual([]);
  });

  it('ADR-0039: `PublicLinkAccessService` sigue siendo quien deriva el actor (la prueba no es vacía)', () => {
    expect(productionFiles()).toContain(ALLOWED_FILE);
    expect(usesCreateActor(ALLOWED_FILE)).toBe(true);
  });
});
