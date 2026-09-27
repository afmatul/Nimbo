# ADR-0015 — Dependencias de fundaciones: gitleaks, zod, nestjs-pino y Testcontainers (ADR menor)

| Campo | Valor |
|---|---|
| Estado | Aceptado (2026-09-26, Adrián) |
| Fecha | 2026-09-15 |
| Decisores | Adrián (architect), equipo Nimbo |
| Specs relacionadas | 000 (D-8, D-10, CA-13 a CA-15, CA-18, CA-19, CA-24, CA-27) |

## Contexto

La spec 000 introduce cuatro dependencias que todos los módulos posteriores heredan y que, por su alcance, merecen
una decisión explícita aunque ninguna sea estructural. D-10 exige un ADR menor para gitleaks; D-8 deja la librería
de validación de entorno al plan; RNF-17 exige `correlationId` y redacción en toda bitácora; Art. III.2 exige
integración contra servicios reales.

## Opciones consideradas

### a) Detección de secretos en CI
1. **gitleaks (`gitleaks/gitleaks-action`) en el job `lint`, con historial completo** — pros: gratuito para
   repositorios públicos, reglas mantenidas, corre en segundos; contras: falsos positivos ocasionales (se manejan con
   `.gitleaksignore` revisado en PR).
2. **GitHub secret scanning + push protection** — pros: sin configuración; contras: no bloquea el *status check* de
   forma controlada, no cubre el historial antes de publicar (CA-27) y su cobertura de patrones propios es menor.
3. **Posponer** — contras: el repositorio se publica en 000; después de publicar, un secreto en el historial ya se filtró.

### b) Validación de entorno y contratos
1. **zod** — pros: un esquema produce el tipo (`z.infer`), sin clases ni decoradores; sirve igual en `api`/`worker`
   (sin DI) y en `apps/web` (Next.js, sin Nest); `conventions.md` §Frontend ya asume esquemas para `react-hook-form`;
   mensajes en español por campo; `coerce` cubre `PORT=abc` (CA-18). Contras: una librería más junto a
   `class-validator`.
2. **class-validator + class-transformer** — pros: ya se usa en DTOs HTTP; contras: exige una clase por esquema y
   decoradores (`reflect-metadata`) que no encajan en `apps/web` ni en `packages/contracts`; los mensajes por defecto
   están en inglés; el tipo no se infiere del esquema.
3. **Validación manual** — contras: sin tipo inferido, sin mensajes uniformes, repetido en tres apps.

### c) Logger
1. **`nestjs-pino`** (pino + pino-http integrados en Nest) — pros: JSON por defecto, `mixin` para inyectar
   `correlationId` desde `AsyncLocalStorage` en cualquier línea (incluido el worker), `hooks.logMethod` para la
   redacción profunda que CA-15 exige en «cualquier nivel» (el `redact` nativo de pino solo acepta rutas explícitas);
   es el logger que `architecture.md` §3 asigna a `shared`. Contras: su `Logger` no es el de Nest; se inyecta con
   `PinoLogger`.
2. **`winston` + `nest-winston`** — pros: popular; contras: más lento, formato JSON no nativo, sin `mixin` equivalente.
3. **`Logger` de Nest** — contras: texto plano, sin `correlationId` automático, sin redacción.

### d) Servicios reales en pruebas de integración
1. **Testcontainers (`@testcontainers/postgresql`, `@testcontainers/redis`, `GenericContainer` para MinIO)** — pros:
   cada suite arranca sus contenedores con la misma imagen que compose (`pgvector/pgvector:pg17`); las pruebas de
   CA-22/CA-23 pueden **detener** un contenedor para simular la caída; funciona igual en local y en CI. Contras:
   arranque de ~20–40 s por suite; depende de Docker en el runner.
2. **`services:` de GitHub Actions** — pros: más barato en CI; contras: no permite detener un servicio desde la prueba
   (CA-22) y en local exige levantar compose a mano antes de `pnpm test:int`.
3. **Mocks de Postgres/Redis/MinIO** — prohibido por Art. III.2.

## Decisión

- gitleaks en el job `lint` (opción a.1), además de una corrida sobre todo el historial antes de publicar el repositorio.
- zod para `env.schema.ts` de `api`/`worker`/`web` y para los esquemas de `packages/contracts` (opción b.1).
  `class-validator` sigue siendo la herramienta de los DTOs HTTP (`ValidationPipe`); no se mezclan. zod **nunca**
  se importa desde `domain/` (regla de lint, ADR-0008).
- `nestjs-pino` como único logger (opción c.1), con `REDACTED_FIELDS` y `redactDeep` en `shared/infrastructure/logging`.
- Testcontainers para `int` e `isolation` (opción d.1); el job `migrations` usa `services:` porque no necesita
  detener nada y es más barato.

## Consecuencias

- Positivas: mismas herramientas en las tres apps; `correlationId` y redacción por defecto sin esfuerzo de cada módulo;
  las pruebas de degradación (CA-22, CA-23) son reales.
- Negativas / deuda aceptada: dos librerías de validación conviven (zod para entorno/contratos, class-validator para
  DTOs); el `int` en CI tarda más que con `services:`.
- Cómo sabremos si fue un error: si `int` + `isolation` superan 6 min en CI (R-2 del plan 000) se migran a `services:`
  salvo las pruebas que detienen contenedores; si aparece una tercera librería de validación, se unifica.
