# Revisión — 001 PR-1 «contratos, migraciones y shared» (T-01 a T-19)

| Campo | Valor |
|---|---|
| Rama | `feat/001-contratos-migraciones-shared` |
| Base del diff | `spec/001-registro-y-verificacion` |
| Revisor | `reviewer` (2026-09-27) |
| Veredicto | ✅ con reservas: sin bloqueantes de código; el merge queda bloqueado por proceso hasta ejecutar las pruebas de integración |

## Bloqueantes

- **[B-1] Pruebas de integración sin ejecutar (proceso, no código).** T-06, T-08, T-13, T-14, T-17 (salvo
  `configure-http-app.int-spec.ts`) y T-18 no se han corrido contra Postgres y Redis reales porque Docker no está
  disponible (`tasks.md`, «Notas del developer»). RNF-10 y `workflow.md` §7.2 piden `pnpm test:int` y el job
  `migrations` en verde antes de fusionar. Corrección: con Docker, `pnpm test:int` y `migration:run → revert ×2 → run`,
  con la evidencia en el PR.

## Importantes

1. **[I-1] Lista de contraseñas comunes casi vacía** (`packages/contracts/src/identity/common-passwords.ts:9-15`).
   Filtrar el top 100 000 de SecLists por la política (12–128 caracteres, número y símbolo) deja 5 entradas, así que
   la regla «contraseña común» de D-6/CA-5 casi no rechaza nada. El developer ya propone la fuente top 1 000 000
   (~1602 entradas, ~34 KB). Resolver antes del cierre de la fase.
2. **[I-2] Falta la regla de lint que impide que `shared` importe `contracts/identity`** (ADR-0020). Hoy se cumple por
   construcción en `zod-validation.pipe.ts`, sin regla automática; PR-3 y PR-4 seguirán tocando `shared`.

## Sugerencias

- `too-many-requests.error.ts:4` es abstracta; verificar en PR-3 que `IdentityTooManyRequestsError` la extienda.
- Abrir un pendiente por la prueba de rendimiento intermitente `redact-deep.spec.ts` (umbral en µs bajo carga).

## Lo que está bien

- Migraciones `crear-usuario` y `crear-token-cuenta` iguales al plan §4 y al E-R: `down` completo, `CHECK` de rol,
  estado, correo normalizado, nombre y aceptación; índice único de correo; índice parcial `uq_token_cuenta_vigente`;
  hash `char(64)` con `CHECK` hex.
- `RedisRateLimiter` y el script Lua: indexación de `ARGV` correcta, atómico, ventana deslizante con *sorted set*, los
  rechazos no cuentan y falla cerrado.
- `ITransactionRunner` y `TransactionContext` sobre `AsyncLocalStorage`: `runWith` es el punto que 003 necesita para
  `withActor`.
- `ZodValidationPipe` y `DomainExceptionFilter`: nunca exponen `stack` ni el mensaje crudo; los errores de
  body-parser salen con texto propio en español, sin filtrar `error.type`.
- `env.schema.ts`: la desviación de `*ObjectSchema` junto a los esquemas con `superRefine` está justificada;
  `SECRET_KEYS` comprobado con `satisfies`.
- `REDACTED_FIELDS` cubre D-18. Archivos y funciones pequeños, sin `console.log`, alcance ceñido al Bloque 1.
