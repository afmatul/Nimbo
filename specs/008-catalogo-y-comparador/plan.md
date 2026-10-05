# Plan 008 — Catálogo y Comparador

> Spec: `./spec.md` · Estado del plan: Propuesto
> Obligatorio y ≤ 250 líneas. Dice **qué** archivos se tocan y **qué** se espera de cada uno; no es el código en
> prosa (sin cuerpos de funciones ni pseudocódigo). Lo aprueba Adrián antes de escribir código.

## 1. Resumen técnico
`billing` expone un endpoint público de solo lectura que lista todas las filas de su tabla `plan` y la pantalla
pública `/planes` las muestra como tarjetas y como tabla comparativa.

- `PlanCatalogService` (aplicación) pide las filas a un puerto interno `IPlanRepository`; la implementación con
  TypeORM vive en infraestructura. La aplicación no importa `PlanOrmEntity`.
- La lectura no usa `IPlanLimitsProvider`: ese puerto sigue con `limitsFor(actor)` y dos límites (006a CA-6, ADR-0022).
- El orden es `precio_centavos` ascendente y después `slug`. Se devuelven todas las filas, sin columna de estado.
- El contrato lleva el dinero en centavos enteros (ADR-0016) y los bytes como cadena decimal; `web` convierte a
  quetzales y a MB/GB/TB en un solo lugar (`format-plan.ts`).
- Tarjetas y tabla salen de la misma respuesta. La pantalla es pública y no marca plan actual.
- Un fallo de lectura responde `500` con `PLAN_CATALOG_UNAVAILABLE` y no escribe estado.
- Convive con el `GET /plans` del registro (PD-40, 009): este plan no lo modifica ni lo sustituye.

## 2. Módulos, archivos y diseño
| Módulo / capa | Archivo (nuevo o cambiado) | Responsabilidad |
|---|---|---|
| Contracts | `packages/contracts/src/billing/plan-catalog.ts` | `PlanCatalogResponse`: lista con `id`, `slug`, `nombre`, `descripcion`, `precioCentavos` y los seis límites; bytes como cadena decimal. Se exporta en `index.ts`. |
| API · dominio | `apps/api/src/modules/billing/domain/plan-catalog.ts` | Tipo de lectura del catálogo (los mismos campos, bytes en `bigint`). Sin TypeORM. |
| API · dominio | `apps/api/src/modules/billing/domain/errors/plan-catalog-unavailable.error.ts` | `DomainError`, `code = PLAN_CATALOG_UNAVAILABLE`, `status = 500`, mensaje «No pudimos cargar los planes. Intenta recargar la página.» |
| API · aplicación | `apps/api/src/modules/billing/application/i-plan-repository.ts` | Puerto interno de `billing`: `listAll()`. Lo permite el Art. V.2(b). No sale del módulo y no lo ve `storage`. |
| API · aplicación | `apps/api/src/modules/billing/application/plan-catalog.service.ts` | `PlanCatalogService.list()`: pide las filas al repositorio y traduce el fallo de persistencia a `PlanCatalogUnavailableError`. No importa `PlanOrmEntity`. |
| API · infraestructura | `apps/api/src/modules/billing/infrastructure/persistence/typeorm-plan.repository.ts` | Implementa el puerto con `PlanOrmEntity`, orden `precio_centavos` ASC, `slug` ASC, y mapea `bigint`. |
| API · presentación | `apps/api/src/modules/billing/presentation/plans.controller.ts` | `GET /api/v1/billing/plans`, `@Public()`, valida la salida con el contrato. No consulta la base. |
| API | `apps/api/src/modules/billing/billing.module.ts` | Registra controlador, servicio y repositorio. |
| Web · errores | `apps/web/src/lib/error-catalog.ts` | `PLAN_CATALOG_UNAVAILABLE` → el mensaje de CA-3. |
| Web | `apps/web/src/features/billing/format-plan.ts` | Único lugar que pasa centavos a quetzales y bytes a MB/GB/TB (1024³, como 006a RN-1), y que deriva «Solo lectura» / «Sí». |
| Web | `apps/web/src/app/(public)/planes/page.tsx` | Ruta pública. Pide el catálogo y pinta cargando, éxito, error y vacío. |
| Web | `apps/web/src/features/billing/components/plan-cards.tsx` | Tarjetas. Usa `format-plan.ts` y las props del contrato. Sin botón de pago ni marca de plan actual. |
| Web | `apps/web/src/features/billing/components/plan-comparison-table.tsx` | Tabla de CA-2. Usa `format-plan.ts` y las props del contrato. |

- Clases, puertos y tablas con los nombres de `design-model.md`. Puertos nuevos: `IPlanRepository`, interno de
  `billing` (Art. V.2(b)); ningún puerto nuevo entre módulos.
- Dependencias nuevas entre módulos: ninguna; `billing` solo lee su propia tabla `plan`.
- No se modifica `apps/web/src/features/identity/plan-catalog.ts` ni la ruta `GET /plans` del registro.
- `PlanLimitsAdapter` no gana un método de catálogo.
- El servicio se llama `PlanCatalogService`, como en el diagrama de M4. `SubscriptionController.listPlans` y
  `comparePlans` no se crean: una sola lectura y dos componentes. Se anota como DF.
- Frontend: ruta en `app/(public)/planes/`, carpeta nueva `features/billing/` y reutilización de `components/nimbo/`
  donde ya exista el elemento.

## 3. Datos
Sin migración. La lectura es todas las filas.

```sql
-- Ninguna tabla ni columna nueva.
-- Lectura: SELECT de `plan` ORDER BY precio_centavos ASC, slug ASC.
```

- `down` de la migración: no aplica.

## 4. Contratos
`GET /api/v1/billing/plans`, público, sin cuerpo. La respuesta lista los campos de CA-1.

| Método | Ruta | Rol | Request → Respuesta | Errores (`code`) |
|---|---|---|---|---|
| GET | `/api/v1/billing/plans` | Público (sin sesión) | `void` → `PlanCatalogResponse` | `PLAN_CATALOG_UNAVAILABLE` (500) |

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
| CA-1 | unit | `apps/api/src/modules/billing/application/plan-catalog.service.spec.ts`: orden, empate por `slug`, bytes en `bigint` dentro del dominio, lista vacía en `200`. |
| CA-1 | int | `apps/api/test/int/billing/plans-catalog.int-spec.ts`: contra la semilla real (slugs `personal`, `pro`, `equipo`, `institucional`; precios `0`, `4500`, `11000`, `45000`; bytes de 006a RN-1 como cadena). Anónimo y con sesión reciben lo mismo. |
| CA-2 | web | `apps/web/src/features/billing/components/plan-cards.spec.tsx`, `plan-comparison-table.spec.tsx` y `apps/web/src/app/(public)/planes/page.spec.tsx`: Personal muestra «Solo lectura» y «al mes»; los componentes no contienen precios escritos a mano; estados cargando, error (mensaje de CA-3) y vacío. |
| CA-3 | unit | Mismo archivo que la unitaria de CA-1: el repositorio rechaza la lectura y el servicio lanza `PlanCatalogUnavailableError` sin tocar estado. |

## 7. Riesgos y coherencia con el diseño
- Riesgos reales y mitigación:
  - El rol de la aplicación podría no tener `SELECT` sobre `plan` → lo detecta la prueba de integración de CA-1.
  - `bigint` en JSON → el contrato exige cadena decimal; la prueba unitaria y la de integración lo cubren.
- Desviaciones de los diagramas: DF nuevo. El diagrama de M4 muestra `SubscriptionController.listPlans` y
  `comparePlans`; esta spec hace un solo `GET` y compara en `web`, y deja escrito que el catálogo no pasa por
  `IPlanLimitsProvider`. Se abre en `design-findings.md` en el mismo PR de la spec.
- Pendientes que deja fuera: «Hablar con ventas» y el cromo de `plan-actual` quedan cerrados por la spec (§6 y §8);
  si se quieren rastrear, una fila en `pendientes.md` que apunte a 009/010.
- Límite con PD-40: esta ruta no reemplaza `GET /plans` del registro.
- ADR requeridos: ninguno nuevo; se rige por ADR-0016 (dinero en centavos y bytes), ADR-0010 (separación de
  módulos) y ADR-0022 (puerto de límites).

## 8. Aprobación
- `architect`: no aplica (el repositorio es interno de `billing`; no hay puerto entre módulos ni tecnología nueva)
- Adrián: pendiente