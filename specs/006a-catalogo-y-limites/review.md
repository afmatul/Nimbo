# Revisión 006a — Catálogo y límites

> Una página. La escribe `reviewer` (con `security-auditor` solo si aplica, `workflow.md` §4) y la aprueba Adrián.

| Campo | Valor |
|---|---|
| Fecha | 2026-09-30 |
| Rango revisado | `118150f..64aacf5` (squash merge del PR de 006a en `main`) |
| CI | ✅ local en `main`: `lint`, `typecheck`, `test` (1980), `test:int` (629), `test:isolation` (126), `env:check` |
| Veredicto | ✅ Aprobar |

## Verificación
| CA | Prueba | Estado |
|---|---|---|
| CA-1 | `test/int/billing/plan-migration.int-spec.ts`, `plan-limits.adapter.int-spec.ts` | ✅ |
| CA-2, CA-3 | `billing/infrastructure/adapters/plan-limits.adapter.spec.ts` e int-spec (por id y por slug) | ✅ |
| CA-4 | `billing/domain/errors/plan-not-found.error.spec.ts`; unitaria e int-spec para id y slug inexistentes | ✅ |
| CA-5 | `plan-limits.adapter.spec.ts`, int-spec (cliente y admin), `plan-limits-binding.module.spec.ts` | ✅ |
| CA-6 | `readonly` por `typecheck`; `bigint` y forma exacta por `toEqual` con literales `bigint` en las pruebas del adaptador y `plan.orm-entity.spec.ts` (I-1) | ✅ |
| CA-7 | `plan-migration.int-spec.ts`: `down` de semilla y tabla, luego `up`, en base nueva | ✅ |
| CA-9 | UUID literales en la semilla, verificados en la int-spec | ✅ |
| RN-4 | `storage/index.spec.ts` (`plan-limits.ts` no importa `billing`) y lint de fronteras | ✅ |

Además: `migration:run` en la base local aplica `CrearTablaPlan` y `SembrarPlanes`; Personal = 16 106 127 360 B de cuota y 52 428 800 B por archivo.

## Seguridad
- Datos de cliente: no. `plan` es catálogo, sin RLS. `limitsFor` ignora `_actor`, no lee `usuario` ni importa `identity`. No hay rutas HTTP nuevas. `test:isolation` 126/126 ✅.
- Bitácoras sin contenido, nombres de archivo, tokens ni contraseñas: ✅ (el adaptador no registra nada).
- Hallazgos: ninguno.

## UI (si aplica)
- No aplica.

## Bloqueantes
- Ninguno.

## Importantes y sugerencias
- **[I-1]** CA-6 sin prueba. `tasks.md` T-04 y `plan.md` §6 describen `PlanLimits` como clase con `Object.freeze` y un `storage/application/plan-limits.spec.ts` que no existe (T-04 está `[x]`). El código, heredado de 005, es una `interface` con `readonly`, y `toLimits` devuelve un objeto sin congelar. Alinear el plan y T-04 con la `interface`, o añadir la prueba de `typeof === 'bigint'`.
- **[I-2]** Deriva en T-10: `plan.md` §3b y `tasks.md` T-10 dicen `useClass` en `app.module.ts`. El código usa `useExisting: PlanLimitsAdapter` en `PlanLimitsBindingModule`. El comentario de `storage/application/plan-limits.ts:14` aún nombra `AppModule`.
- **[I-3]** `plan.md` §7 promete el log `billing.plan_limits.queried` (`debug`, `{ actorId, durationMs }`), pero el adaptador no lo emite. Implementarlo o quitarlo del plan.
- **[I-4]** `plan.md` §11 sigue «Pendiente» y el plan figura como «Propuesto», aunque el código ya está en `main`. Registrar la aprobación.
- **[I-5]** La tabla de pruebas de `plan.md` §8 omite CA-2 y CA-3, que sí están probados.
- **[I-6]** Hueco R-3 de 005: `test/int/storage/storage-http.ts` sustituye `I_PLAN_LIMITS_PROVIDER` por un doble y ninguna prueba hace una carga con el adaptador real. Añadir una (p. ej., archivo > 50 MB rechazado con Personal) o cubrirlo en T-55 de 005.
- **[S-1]** `.prettierignore` agrega `Cambios.md`, que no existe y está fuera de la spec. Quitar la línea.
- **[S-2]** `limitsFor` consulta la base en cada llamada. Evaluar un caché cuando 007 lo use en cada operación.

Resueltos el 2026-09-30 en esta misma rama: I-1 (plan §1, §6 y §8 y T-04 describen la `interface` de 005; CA-6 queda cubierto por `typecheck` y las comparaciones `bigint`), I-2 (plan §3b, T-05, T-10 y el comentario de `plan-limits.ts`), I-3 (se quita la bitácora del plan: §2 X y §7), I-4 (§11 aprobado) e I-5 (§8 con CA-2 y CA-3). Quedan I-6, S-1 y S-2.

## DF y pendientes
- DF-06, DF-23, DF-24 (aceptados, ADR-0016) y DF-27 (parcial, ADR-0022) coherentes con el código. PD-40 diferido a 009.
- Filas nuevas sugeridas en `pendientes.md`: prueba de carga con el adaptador real (I-6); redibujar el E-R (`plan` en bytes y centavos) y los diagramas M2/M4 con el puerto declarado en `storage`.
