# Tareas 008 — Catálogo y comparador

> Spec: `./spec.md` · Plan: `./plan.md`
> 5 a 12 tareas verticales. Un commit cada una (`feat(billing): … [008 T-xx]`).
> Cada tarea deja algo probado y lista sus CA.

- [x] **T-01** Contrato `PlanCatalogResponse` en `packages/contracts` — CA: CA-1 — Archivos: `packages/contracts/src/billing/{schemas,error-codes,index}.ts`, `packages/contracts/src/index.ts`
- [x] **T-02** `IPlanRepository`, `TypeOrmPlanRepository`, `PlanCatalogService` y `PlanCatalogUnavailableError`, con la prueba unitaria de orden, lista vacía y fallo de lectura — CA: CA-1, CA-3 — Depende: T-01
- [x] **T-03** `GET /api/v1/billing/plans` público y prueba de integración contra la semilla de la 006a (anónimo y con sesión; bytes como cadena) — CA: CA-1 — Depende: T-02
- [x] **T-04** `format-plan.ts` y el texto de `BILLING_PLAN_CATALOG_UNAVAILABLE` en el catálogo de errores — CA: CA-2, CA-3 — Depende: T-01
- [x] **T-05** Página pública `/planes`, tarjetas, tabla y estados cargando, éxito, error y vacío, con prueba de componente — CA: CA-2, CA-3 — Depende: T-03, T-04
- [ ] **T-06** **(humana)** Recorrido local: visitante sin sesión y cliente con sesión ven los planes activos, los precios en quetzales y la tabla; la recarga tras un fallo muestra el mensaje de CA-3 — CA: CA-1, CA-2, CA-3

## Notas del developer

- `apps/web/src/features/identity/plan-catalog.ts` (002) lee este catálogo con `fetchPlanCatalog` y cierra PD-48 (aprobado por Adrián en la revisión).
- La desviación del diagrama (un `GET` en lugar de `listPlans` / `comparePlans`, sin `IPlanLimitsProvider`) es DF-67.
- 2026-10-09, alineación con la 011 (PR #49, PD-76, PD-83): contrato en inglés en `packages/contracts/src/billing/` (`planSchema`, `PlanCatalogResponse = { plans }`), código `BILLING_PLAN_CATALOG_UNAVAILABLE`, `PlanSummary` en el dominio de la API, un solo `PlanCard` en `components/nimbo` sin color por `slug`, `format-plan.ts` en `lib/` y pruebas de componente de la tarjeta y la tabla.