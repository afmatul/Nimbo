# Tareas 006a — Catálogo y límites

> Spec: `./spec.md` · Plan: `./plan.md`
> Leyenda: `[P]` paralelizable con otras `[P]` del mismo bloque · Cada tarea ≈ 2–4 h y un commit, con sus CA.

## Bloque 0 — Base de datos y migraciones
- [x] **T-01** Migración `20260928233000-crear-tabla-plan.ts` que crea la tabla `plan` con restricciones `CHECK` e índice en `slug`, con reversibilidad en `down` — CA: CA-7, RN-2 — Archivo: `apps/api/src/migrations/20260928233000-crear-tabla-plan.ts`
- [x] **T-02** Migración `20260928233500-sembrar-planes.ts` que inserta los cuatro planes oficiales (`personal`, `pro`, `equipo`, `institucional`) con sus UUIDs fijos, precios en centavos y tamaños en bytes según RN-1, con reversibilidad en `down` — CA: CA-1, CA-9, RN-1 — Depende: T-01 — Archivo: `apps/api/src/migrations/20260928233500-sembrar-planes.ts`
- [x] **T-03** Prueba de integración de migraciones con Testcontainers Postgres (ejecutar `up`, verificar estructura y datos sembrados, ejecutar `down`, verificar eliminación limpia) — CA: CA-1, CA-7, CA-9 — Depende: T-02 — Archivo: `apps/api/test/int/billing/plan-migration.int-spec.ts`

## Bloque 1 — Dominio y contratos (Pruebas primero)
- [x] **T-04** [P] Alinear con el tipo `PlanLimits` que ya declara la 005 en `storage` (`interface` con `maxFileBytes` y `storageQuotaBytes` `readonly` y `bigint`); sin clase ni `Object.freeze`. CA-6 lo cubren `pnpm typecheck` y las comparaciones con literales `bigint` de las pruebas del adaptador y de `PlanOrmEntity` — CA: CA-6 — Archivos: `apps/api/src/modules/storage/application/plan-limits.ts` (sin cambios), `apps/api/src/modules/billing/infrastructure/adapters/plan-limits.adapter.spec.ts`, `apps/api/src/modules/billing/infrastructure/persistence/plan.orm-entity.spec.ts`
- [x] **T-05** [P] Verificar que el puerto `IPlanLimitsProvider` (`limitsFor(actor: Actor)`) y el token `I_PLAN_LIMITS_PROVIDER` (`Symbol`) que declaró la 005 en `storage/application/plan-limits.ts` se exportan por `storage/index.ts`; la 006a no los modifica — CA: CA-5, RN-4 — Archivos: `apps/api/src/modules/storage/application/plan-limits.ts`, `apps/api/src/modules/storage/index.ts`
- [x] **T-06** [P] Error de dominio `PlanNotFoundError` con código `PLAN_NOT_FOUND` y mensaje descriptivo en español — CA: CA-4 — Archivo: `apps/api/src/modules/billing/domain/errors/plan-not-found.error.ts`

## Bloque 2 — Infraestructura y adaptador (Módulo Billing)
- [x] **T-07** Entidad TypeORM `PlanOrmEntity` mapeando la tabla `plan` y transformando columnas `bigint` a tipos nativos — CA: CA-1, CA-6 — Depende: T-01 — Archivo: `apps/api/src/modules/billing/infrastructure/persistence/plan.orm-entity.ts`
- [x] **T-08** Prueba unitaria (TDD) para `PlanLimitsAdapter` simulando la llamada `limitsFor(actor)` que devuelve los límites de Personal (`52428800n` y `16106127360n`) sin consultar `usuario` ni importar `identity` — CA: CA-5 — Depende: T-04, T-05, T-06 — Archivo: `apps/api/src/modules/billing/infrastructure/adapters/plan-limits.adapter.spec.ts`
- [x] **T-09** Implementación de `PlanLimitsAdapter` cumpliendo las pruebas de T-08 — CA: CA-5 — Depende: T-08 — Archivo: `apps/api/src/modules/billing/infrastructure/adapters/plan-limits.adapter.ts`
- [x] **T-10** Módulo NestJS `BillingModule`, exportando `PlanLimitsAdapter` en `modules/billing/index.ts`, y en `PlanLimitsBindingModule` (raíz de composición global de la 005, que importan `AppModule` y `WorkerModule`) cambiar el proveedor provisional por `{ provide: I_PLAN_LIMITS_PROVIDER, useExisting: PlanLimitsAdapter }` importando `BillingModule` — CA: CA-5, RN-3 — Depende: T-07, T-09 — Archivos: `apps/api/src/modules/billing/billing.module.ts`, `apps/api/src/modules/billing/index.ts`, `apps/api/src/plan-limits-binding.module.ts` (+ `.spec.ts`)

## Bloque 3 — Integración, fronteras y verificación
- [x] **T-11** Pruebas de integración con Testcontainers Postgres comprobando `PlanLimitsAdapter` con la base real sembrada — CA: CA-1, CA-5, CA-9 — Depende: T-02, T-10 — Archivo: `apps/api/test/int/billing/plan-limits.adapter.int-spec.ts`
- [x] **T-12** Verificación de lint de fronteras arquitectónicas (`pnpm lint`) garantizando que `storage` no importe nada de `billing` (ADR-0022 / DF-51 opción A) y que no existan ciclos de dependencias — RN-4, Art. VIII — Depende: T-10

## Notas del developer
- El catálogo público por HTTP y el oyente de cuentas verificadas se trasladaron a la spec 009 de acuerdo con la decisión de arquitectura PD-40.
- La interfaz y token de límites se alinean con la spec 005 (`storage/application/plan-limits.ts`, `I_PLAN_LIMITS_PROVIDER` como `Symbol`, `maxFileBytes` y `storageQuotaBytes`). `PlanLimits` sigue siendo el tipo de `storage`; no se sustituye por una clase.
- El puerto `IPlanLimitsProvider` contiene únicamente `limitsFor(actor)` (ISP). Las consultas por ID y slug (`getLimitsByPlanId`, `getLimitsBySlug`) quedan en `PlanLimitsAdapter` como API interna de `billing` para la spec 009 (Opción A).
- El enlace del token vive en `PlanLimitsBindingModule` (raíz de composición global creada en 005), enlazado a `PlanLimitsAdapter` mediante `useExisting`.
- `limitsFor` consulta la fila `personal` de la tabla `plan` en base de datos (`Art. VI`), respetando CA-5 al no consultar `usuario` ni `identity`.
- La migración de creación de `plan` no duplica el índice en `slug`: la restricción `UNIQUE` ya crea el índice automáticamente en PostgreSQL.
- La prueba de `down` corre en una base nueva: en `main` las migraciones de 005 quedan después de las de `plan`, así que `undoLastMigration` revertiría `carga` y no el catálogo.
