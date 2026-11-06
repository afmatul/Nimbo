import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** El único archivo de `sharing` que puede derivar un actor con `createActor` (ADR-0039). */
const ALLOWED_FILE = 'application/public-link-access.service.ts';

const CREATE_ACTOR = /\bcreateActor\b/;

/** La política de contraseña y bloqueo no ve el actor derivado ni audita (PD-177): ni `Actor` ni la auditoría. */
const PASSWORD_GATE_FILE = 'application/public-link-password-gate.ts';
const AUDIT_OR_ACTOR = /from '\.\.\/\.\.\/audit'|\bI_AUDIT_LOGGER\b|\bIAuditLogger\b|\bActor\b/;

/** Archivos de producción de `sharing`, relativos al módulo y con `/`; sin pruebas. */
const productionFiles = (): string[] =>
  readdirSync(__dirname, { recursive: true, encoding: 'utf8' })
    .filter((path) => path.endsWith('.ts') && !path.endsWith('.spec.ts'))
    .map((path) => relative(__dirname, join(__dirname, path)).split(sep).join('/'));

const sourceOf = (path: string): string => readFileSync(join(__dirname, path), 'utf8');

const usesCreateActor = (path: string): boolean => CREATE_ACTOR.test(sourceOf(path));

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

  it('ADR-0039, PD-177: `PublicLinkPasswordGate` no recibe el actor ni depende de la auditoría', () => {
    expect(productionFiles()).toContain(PASSWORD_GATE_FILE);
    expect(sourceOf(PASSWORD_GATE_FILE)).not.toMatch(AUDIT_OR_ACTOR);
  });
});
