# ADR-0008 — Verificación automática de fronteras entre módulos con ESLint (`eslint-plugin-boundaries` + `eslint-plugin-import-x`)

| Campo | Valor |
|---|---|
| Estado | Propuesto |
| Fecha | 2026-09-15 |
| Decisores | Adrián (architect), equipo Nimbo |
| Specs relacionadas | 000 (CA-5 a CA-9); aplica a todas las specs posteriores |

## Contexto

La constitución (Art. VIII.3 y VIII.4) exige que un módulo solo importe de otro a través de `modules/<x>/index.ts`,
que `domain/` no dependa de frameworks y que el grafo de módulos sea un DAG. `architecture.md` §3 fija la tabla
«Puede depender de» y §4 las capas. Con cuatro personas trabajando en paralelo durante diez semanas, estas reglas
solo sobreviven si las hace cumplir una herramienta en cada PR (RNF-19) y, de preferencia, en el editor antes del PR.

Fuerzas:
- El CI debe quedar por debajo de 15 min (CA-24); cada herramienta extra suma un paso y una configuración.
- `apps/worker` importa código de `apps/api` por alias `@nimbo/api/*`; la herramienta debe resolver ese alias o la
  frontera queda abierta por la puerta de atrás.
- La lista de módulos y el DAG cambian con ADR-0010; deben vivir en **un solo archivo** editable por el `architect`.
- `apps/web` no debe importar `docs/design/mockups/` (CLAUDE.md «Prohibiciones»).
- El equipo ya usa ESLint (D-1, `packages/config`); nadie conoce otra herramienta de análisis de dependencias.

## Opciones consideradas

1. **`eslint-plugin-boundaries` + `eslint-plugin-import-x` (`no-cycle`) + `no-restricted-imports` dentro de `pnpm lint`**
   - Pros: un solo comando (`pnpm lint`) y una sola configuración (`packages/config/eslint/boundaries.js`); errores
     visibles en el editor; mensajes personalizables por regla («`sharing` solo puede importar de `storage` desde
     `modules/storage/index.ts`»); modela «módulo», «capa» y «punto de entrada» de forma declarativa; resuelve
     alias con el *resolver* de TypeScript, así que cubre `apps/worker`; se prueba con *fixtures* negativos sin
     ensuciar `apps/api`.
   - Contras: `import-x/no-cycle` es más lento que un análisis de grafo dedicado (mitigado con `maxDepth` y ~12
     módulos); no genera un grafo visual.
2. **`dependency-cruiser`**
   - Pros: detección de ciclos nativa y rápida; genera el grafo en SVG/DOT, útil para el Documento de Diseño; reglas
     por expresiones regulares muy expresivas.
   - Contras: binario y configuración aparte (`.dependency-cruiser.cjs`), un paso más en CI y ninguna señal en el
     editor; duplica el conocimiento de rutas que ESLint ya tiene (Art. VI); una herramienta más que aprender para un
     equipo de cuatro.
3. **Revisión manual en PR + `tsconfig` con `paths` restringidos**
   - Pros: cero dependencias.
   - Contras: no cumple «verificado por lint» (Art. VIII.4); `paths` no puede prohibir rutas relativas
     (`../../storage/infrastructure/...`); la revisión humana falla justo cuando hay prisa.
4. **Posponer** hasta que existan dos módulos funcionales
   - Contras: 001 y 006a empiezan la misma semana que 000; el primer PR sin lint de fronteras ya puede introducir el
     primer atajo. El costo de agregarlo después es el mismo más la limpieza.

## Decisión

Opción 1. Las reglas viven en `packages/config/eslint/boundaries.js` y se aplican desde `packages/config/eslint/nest.js`
a `apps/api/src/**` **y** a `apps/worker/src/**` (con el alias `@nimbo/api/*` resuelto por `eslint-import-resolver-typescript`):

1. Elementos: `shared` (`apps/api/src/shared/**`), `module` (`apps/api/src/modules/<name>/**`), `layer`
   (`domain|application|infrastructure|presentation`), `entry` (`modules/<name>/index.ts` y `shared/index.ts`).
2. Un módulo importa de otro solo por su `entry` y solo si aparece en `allowed[<name>]`, un objeto literal que copia
   la tabla de `architecture.md` §3. `apps/worker` solo importa `@nimbo/api/shared` y `@nimbo/api/modules/<x>` (index).
3. `layer:domain` usa **lista blanca**: archivos de `domain/` del mismo módulo, `shared/domain` y módulos nativos de
   Node (`node:crypto`). Todo paquete de terceros queda prohibido (incluye `@nestjs/*`, `typeorm`, `bullmq`, `ioredis`,
   `@aws-sdk/*`, `pino`, `zod`, `class-validator`, `@nimbo/contracts`). `layer:application` no importa de
   `infrastructure` ni `presentation`.
4. `import-x/no-cycle` con `maxDepth: 6` sobre `apps/api/src/**` y `apps/worker/src/**`.
5. En `apps/web`: `no-restricted-imports` con patrones `**/docs/design/mockups/**` y `@mockups/*`.
6. Cada regla tiene un *fixture* negativo en `packages/config/eslint/__fixtures__/` y una prueba
   (`boundaries.spec.ts`) que afirma `ruleId` y mensaje.

`dependency-cruiser` **no** se instala en 000. Si el cierre de una fase necesita el grafo dibujado para el
Documento de Diseño, `/design-check` puede ejecutarlo con `npx` sin agregarlo al repositorio (YAGNI).

## Consecuencias

- Positivas: una sola fuente para la lista de módulos y el DAG; la violación se ve en el editor y bloquea el PR
  (`lint` es *status check* requerido, D-2); ADR-0010 se aplica editando un archivo.
- Negativas / deuda aceptada: `no-cycle` con `maxDepth` acotado puede no ver ciclos muy largos (más de 6 saltos);
  con 12 módulos y la tabla de §3 es improbable. El *resolver* de TypeScript añade ~10–20 s al `lint`.
- Cómo sabremos si fue un error: si `pnpm lint` supera los 3 min en CI o si aparece un ciclo entre módulos que la
  regla no detectó (se sabría por `forwardRef` en algún módulo de Nest). En ese caso se evalúa `dependency-cruiser`
  como paso adicional solo para ciclos.
