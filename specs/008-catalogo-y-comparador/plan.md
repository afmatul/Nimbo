# Plan 008 — Catálogo y Comparador

> Spec: `./spec.md` · Estado del plan: Aprobado
> Obligatorio y ≤ 250 líneas. Dice **qué** archivos se tocan y **qué** se espera de cada uno; no es el código en
> prosa (sin cuerpos de funciones ni pseudocódigo). Lo aprueba Adrián antes de escribir código.

## 1. Resumen técnico
`billing` expone un endpoint público de solo lectura que lista los planes activos de su tabla `plan` y la pantalla
pública `/planes` los muestra como tarjetas y como tabla comparativa.

- `PlanCatalogService` (aplicación) pide las filas a un puerto interno `IPlanRepository`; la implementación con
  TypeORM vive en infraestructura. La aplicación no importa `PlanOrmEntity`.
- La lectura no usa `IPlanLimitsProvider`: ese puerto sigue con `limitsFor(actor)` y dos límites (006a CA-6, ADR-0022).
- El orden es `precio_centavos` ascendente y después `slug`. Hasta la T-09 de la 011 no existe `desactivado_en` y todas
  las filas son activas; desde entonces el repositorio filtra `desactivado_en IS NULL` (PD-76).
- El contrato lleva el dinero en centavos enteros (ADR-0016) y los bytes como cadena decimal; `web` convierte a
  quetzales y a MB/GB/TB en un solo lugar (`lib/format-plan.ts`).
- Tarjetas y tabla salen de la misma respuesta. La pantalla es pública y no marca plan actual.
- Un fallo de lectura responde `500` con `BILLING_PLAN_CATALOG_UNAVAILABLE` y no escribe estado.
- El registro (001) lee este mismo catálogo con `fetchPlanCatalog` (cierra PD-48); no hay otra ruta `GET /plans`.

## 2. Módulos, archivos y diseño
| Módulo / capa | Archivo (nuevo o cambiado) | Responsabilidad |
|---|---|---|
| Contracts | `packages/contracts/src/billing/` (`schemas.ts`, `error-codes.ts`, `index.ts`) | `planSchema` (`id`, `slug`, `name`, `description`, `priceCents` y los seis límites; bytes como cadena decimal) y `PlanCatalogResponse = { plans }`; `BILLING_ERROR_CODES`. `src/index.ts` exporta `./billing`. La 011 extiende `planSchema` para su vista de administración (PD-83). |
| API · dominio | `apps/api/src/modules/billing/domain/plan-summary.ts` | `PlanSummary`: lectura del catálogo con los mismos campos en inglés y bytes en `bigint`. Sin TypeORM. |
| API · dominio | `apps/api/src/modules/billing/domain/errors/plan-catalog-unavailable.error.ts` | `DomainError`, `code = BILLING_PLAN_CATALOG_UNAVAILABLE`, `status = 500`, mensaje «No pudimos cargar los planes. Intenta recargar la página.» |
| API · aplicación | `apps/api/src/modules/billing/application/i-plan-repository.ts` | Puerto interno de `billing`: `findAll()`. Lo permite el Art. V.2(b). No sale del módulo y no lo ve `storage`. |
| API · aplicación | `apps/api/src/modules/billing/application/plan-catalog.service.ts` | `PlanCatalogService.list()`: pide las filas al repositorio y traduce el fallo de persistencia a `PlanCatalogUnavailableError`. No importa `PlanOrmEntity`. |
| API · infraestructura | `apps/api/src/modules/billing/infrastructure/persistence/typeorm-plan.repository.ts` | Implementa el puerto con `PlanOrmEntity`, orden `precio_centavos` ASC, `slug` ASC, y mapea columnas en español a `PlanSummary`. |
| API · presentación | `apps/api/src/modules/billing/presentation/plans.controller.ts` | `GET /api/v1/billing/plans`, `@Public()`. Mapea `PlanSummary` al contrato por lista blanca (bytes a cadena); el tipo de retorno es `PlanCatalogResponse`. No consulta la base. |
| API | `apps/api/src/modules/billing/billing.module.ts` | Registra controlador, servicio y repositorio. |
| Web · errores | `apps/web/src/lib/error-catalog.ts` | `BILLING_PLAN_CATALOG_UNAVAILABLE` → el mensaje de CA-3. |
| Web | `apps/web/src/lib/format-plan.ts` | Único lugar que pasa centavos a quetzales y bytes a MB/GB/TB (1024³, como 006a RN-1), y que deriva «Solo lectura» / «Sí» y «—» en editores. En `lib` porque lo usan `components/nimbo` y `features`. |
| Web | `apps/web/src/features/billing/plan-catalog-api.ts` | `fetchPlanCatalog`: lee la ruta y valida el cuerpo con `planCatalogResponseSchema`. |
| Web | `apps/web/src/app/(public)/planes/` (`page.tsx`, `loading.tsx`, `error.tsx`) | Ruta pública. Pide el catálogo en el servidor y pinta cargando, éxito, error y vacío; la rejilla de tarjetas se ajusta a cuantos planes haya. |
| Web | `apps/web/src/components/nimbo/plan-card.tsx` | `PlanCard`, único para 008 y 011 (`ui-guidelines.md` §4, PD-83): una tarjeta por plan con las props del contrato. Sin color por plan, sin botón de pago ni marca de plan actual. Ahora solo la variante del comparador. |
| Web | `apps/web/src/features/billing/components/plan-comparison-table.tsx` | Tabla de CA-2. Usa `format-plan.ts` y las props del contrato. |
| Web | `apps/web/src/features/identity/plan-catalog.ts` | El registro lee este catálogo con `fetchPlanCatalog` y lo adapta a su selector (cierra PD-48). |

- Clases, puertos y tablas con los nombres de `design-model.md`. Puertos nuevos: `IPlanRepository`, interno de
  `billing` (Art. V.2(b)); ningún puerto nuevo entre módulos.
- Dependencias nuevas entre módulos: ninguna; `billing` solo lee su propia tabla `plan`.
- El registro lee el catálogo vía `fetchPlanCatalog`; el esquema local de `plan-catalog.ts` se borró (PD-48).
- `PlanLimitsAdapter` no gana un método de catálogo.
- El servicio se llama `PlanCatalogService`, como en el diagrama de M4. `SubscriptionController.listPlans` y
  `comparePlans` no se crean: una sola lectura y dos componentes (DF-67).
- Frontend: ruta en `app/(public)/planes/`, carpeta nueva `features/billing/` y reutilización de `components/nimbo/`
  donde ya exista el elemento.

## 3. Datos
Sin migración. Hasta la T-09 de la 011 la lectura es todas las filas; después, `WHERE desactivado_en IS NULL`.

```sql
-- Ninguna tabla ni columna nueva.
-- Lectura: SELECT de `plan` ORDER BY precio_centavos ASC, slug ASC.
```

- `down` de la migración: no aplica.

## 4. Contratos
`GET /api/v1/billing/plans`, público, sin cuerpo. La respuesta lista los campos de CA-1.

| Método | Ruta | Rol | Request → Respuesta | Errores (`code`) |
|---|---|---|---|---|
| GET | `/api/v1/billing/plans` | Público (sin sesión) | `void` → `PlanCatalogResponse` | `BILLING_PLAN_CATALOG_UNAVAILABLE` (500) |

Lista vacía es `200`, no es error. Eventos y Socket.IO: ninguno.

## 5. Seguridad y operación
- `actor` y `accessibleNodes` / RLS: no aplican; el catálogo es global y no pertenece a ninguna cuenta. La ruta se
  marca pública y el rol de la aplicación debe poder hacer `SELECT` sobre `plan` sin contexto de actor.
- El `catch` del servicio cubre solo el fallo del repositorio. Una excepción de programación sigue al filtro global
  y no se disfraza de catálogo no disponible.
- Bitácoras y auditoría: el fallo de lectura se registra en la bitácora técnica con el `code`, sin datos de usuario
  ni SQL. No genera auditoría de cliente (RF-07 no aplica). Métricas: ninguna adicional.

## 6. Estrategia de pruebas (por riesgo)
| CA | Nivel (unit / int / iso / web / e2e) | Archivo |
|---|---|---|
| CA-1 | unit | `packages/contracts/src/billing/schemas.spec.ts`: bytes como texto decimal, precio entero, descripción nula. |
| CA-1 | unit | `apps/api/src/modules/billing/application/plan-catalog.service.spec.ts`: entrega las filas en el orden del repositorio y lista vacía. `presentation/plans.controller.spec.ts`: `{ plans }` con precio entero y bytes como cadena, orden conservado, vacío y un `slug` fuera de la semilla. |
| CA-1 | int | `apps/api/test/int/billing/plans-catalog.int-spec.ts`: orden por precio y bytes como cadena contra la semilla real de la 006a; anónimo y con sesión reciben lo mismo. |
| CA-2 | web | `apps/web/src/lib/format-plan.spec.ts` (quetzales, potencias de 1024, «Solo lectura» y «—»); `apps/web/src/components/nimbo/plan-card.spec.tsx` (Personal «Solo lectura» y «al mes», Q45.00 y bytes legibles, un plan fuera de la semilla con sus propios valores); `apps/web/src/features/billing/components/plan-comparison-table.spec.tsx` (las nueve filas en orden, «—» en editores, precios y límites desde el contrato); `apps/web/src/app/(public)/planes/page.spec.tsx` (lectura en el servidor, éxito y vacío). |
| CA-3 | unit | `plan-catalog.service.spec.ts`: el repositorio rechaza la lectura, el servicio lanza `PlanCatalogUnavailableError` y la bitácora no lleva SQL ni mensaje; `plans.controller.spec.ts` lo propaga. |
| CA-3 | web | `apps/web/src/features/billing/plan-catalog-api.spec.ts` (500, cuerpo fuera del contrato y red caída se rechazan) y `apps/web/src/app/(public)/planes/error.spec.tsx` (mensaje de CA-3 y «Recargar»). |

## 7. Riesgos y coherencia con el diseño
- Riesgos reales y mitigación:
  - El rol de la aplicación podría no tener `SELECT` sobre `plan` → lo detecta la prueba de integración de CA-1.
  - `bigint` en JSON → el contrato exige cadena decimal; la prueba unitaria y la de integración lo cubren.
- Desviaciones de los diagramas: DF-67. El diagrama de M4 muestra `SubscriptionController.listPlans` y
  `comparePlans`; esta spec hace un solo `GET` y compara en `web`, y deja escrito que el catálogo no pasa por
  `IPlanLimitsProvider`.
- Pendientes que deja fuera: «Hablar con ventas» y el cromo de `plan-actual` quedan cerrados por la spec (§6 y §8);
  si se quieren rastrear, una fila en `pendientes.md` que apunte a 009/010.
- PD-40 (3) y PD-48: el registro ya lee esta ruta; la suscripción Personal y la conciliación siguen en la 009.
- 011 (R-5, PD-83): extiende `planSchema`, `PlanCard`, `IPlanRepository` y `PlanCatalogService` y agrega `desactivado_en`.
- ADR requeridos: ninguno nuevo; se rige por ADR-0016 (dinero en centavos y bytes), ADR-0010 (separación de
  módulos) y ADR-0022 (puerto de límites).

## 8. Aprobación
- `architect`: no aplica (el repositorio es interno de `billing`; no hay puerto entre módulos ni tecnología nueva)
- Adrián: Aprobado (2026-10-06, comentario en el PR #49)