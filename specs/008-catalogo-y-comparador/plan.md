# Plan 008 — Catálogo y Comparador

> Spec: `./spec.md` · Estado del plan: Propuesto
> Obligatorio y ≤ 250 líneas. Dice **qué** archivos se tocan y **qué** se espera de cada uno; no es el código en
> prosa (sin cuerpos de funciones ni pseudocódigo). Lo aprueba Adrián antes de escribir código.

## 1. Resumen técnico
El catálogo es de solo lectura y vive en el módulo `billing`, que ya es dueño de la tabla `plan` (spec 006a):
nombre, slug, descripción, precio en centavos y los límites de cada plan (cuota, tamaño de archivo, editores,
consultas del agente, versiones retenidas y retención de papelera).

- `billing` expone un endpoint público de solo lectura que lista todos los planes ordenados de menor a mayor
  precio (la jerarquía) y los devuelve con el contrato compartido de `packages/contracts`.
- La lectura se hace directo sobre la tabla `plan` de `billing`. No se usa `IPlanLimitsProvider`: ese puerto
  devuelve solo dos límites del plan de un actor, y el catálogo necesita todos los límites de todos los planes.
- Los bytes viajan como cadena en el contrato (el `bigint` no se serializa a JSON); el dinero viaja en centavos
  (ADR-0016) y el formato en quetzales se resuelve en `web`.
- `web` agrega una página pública `/planes` con las tarjetas de los planes y la tabla comparativa del mockup
  `billing/planes` (spec 008).
- Si la lectura falla, la API responde `500` con un error de dominio de código estable y sin alterar estado.

## 2. Módulos, archivos y diseño
| Módulo / capa | Archivo (nuevo o cambiado) | Responsabilidad |
|---|---|---|
| Contracts | `packages/contracts/src/billing/plan-catalog.ts` | Esquema zod de la respuesta: lista de planes con precio en centavos y límites (bytes como cadena); se exporta desde `packages/contracts/src/index.ts`. |
| API · dominio | `apps/api/src/modules/billing/domain/errors/plan-catalog-unavailable.error.ts` | `DomainError` con `code` estable `PLAN_CATALOG_UNAVAILABLE` (CA-3). |
| API · aplicación | `apps/api/src/modules/billing/application/list-plan-catalog.ts` | Caso de uso: lee los planes de `plan` ordenados por `precio_centavos`, los mapea al contrato y traduce cualquier fallo de lectura al error de dominio. |
| API · presentación | `apps/api/src/modules/billing/presentation/plans.controller.ts` | `GET /api/v1/billing/plans`, público; valida la respuesta con el contrato. |
| API | `apps/api/src/modules/billing/billing.module.ts` | Registra el controlador y el caso de uso (el repositorio de `PlanOrmEntity` ya está registrado). |
| Web · errores | `apps/web/src/lib/error-catalog.ts` | Texto de `PLAN_CATALOG_UNAVAILABLE`: «Error al recuperar los límites del catálogo». |
| Web | `apps/web/src/app/(public)/planes/page.tsx` | Ruta pública `/planes`; pide el catálogo a la API. |
| Web | `apps/web/src/features/billing/components/plan-cards.tsx` | Tarjetas de los planes con precio en quetzales. |
| Web | `apps/web/src/features/billing/components/plan-comparison-table.tsx` | Tabla que contrasta los límites de todos los planes (CA-2). |

- Clases, puertos y tablas con los nombres de `design-model.md`. Puertos nuevos: ninguno (Art. V): `IPlanLimitsProvider`
  sigue como lo declaró `storage` y no se ensancha.
- Dependencias nuevas entre módulos: ninguna; `billing` solo lee su propia tabla `plan`.
- Frontend: ruta en `app/(public)/planes/`, nueva carpeta `features/billing/` y reutilización de `components/nimbo/`
  donde ya exista el elemento (botón, tarjeta, tabla).

## 3. Datos
Sin migración: la tabla `plan` ya existe (006a) con todo lo que muestra el catálogo.

```sql
-- Ninguna tabla ni columna nueva.
-- Lectura: SELECT de todas las filas de `plan` ordenadas por `precio_centavos` ascendente.
```

- `down` de la migración: no aplica.
- Decisión abierta para Adrián: CA-1 habla de planes «activos», pero `plan` no tiene columna de estado ni de orden.
  Se propone tratar todos los planes como activos y ordenar por `precio_centavos`; si se necesita desactivar planes,
  hay que agregar una columna con su migración.

## 4. Contratos
| Método | Ruta | Rol | Request → Respuesta | Errores (`code`) |
|---|---|---|---|---|
| GET | `/api/v1/billing/plans` | Público (sin sesión) | `void` → `PlanCatalogResponse` | `PLAN_CATALOG_UNAVAILABLE` (500) |

Eventos / Socket.IO: ninguno.

## 5. Seguridad y operación
- `actor` y `accessibleNodes` / RLS: no aplican; el catálogo es global y no pertenece a ninguna cuenta. La ruta se
  marca pública y el rol de la aplicación debe poder hacer `SELECT` sobre `plan` sin contexto de actor.
- Bitácoras y auditoría: el fallo de lectura se registra en la bitácora técnica con el `code`, sin datos de usuario.
  No genera auditoría de cliente (RF-07 no aplica a una consulta pública). Métricas: ninguna adicional.

## 6. Estrategia de pruebas (por riesgo)
| CA | Nivel (unit / int / iso / web / e2e) | Archivo |
|---|---|---|
| CA-1 | unit | `apps/api/src/modules/billing/application/list-plan-catalog.spec.ts` |
| CA-1 | int | `apps/api/test/int/billing/plans-catalog.int-spec.ts` |
| CA-2 | web | `apps/web/src/features/billing/components/plan-comparison-table.spec.tsx` |
| CA-3 | unit | `apps/api/src/modules/billing/application/list-plan-catalog.spec.ts` |

## 7. Riesgos y coherencia con el diseño
- Riesgos reales y mitigación:
  - El rol de la aplicación podría no tener `SELECT` sobre `plan` → la prueba de integración de CA-1 lo detecta.
  - `bigint` en JSON → el contrato exige cadena y el caso de uso la convierte; la prueba unitaria lo cubre.
- Desviaciones de los diagramas: la spec (CA-1) dice que los límites salen «mediante el proveedor de la Spec 006a»;
  este plan lee la tabla `plan` directo porque el puerto no sirve para el catálogo. Se registra como DF nuevo en
  `design-findings.md` y se ajusta la redacción de CA-1.
- Pendientes que deja fuera: fila nueva en `pendientes.md` para (a) el estado `default` del mockup (sin plan
  actual), que es el que ve el usuario público, ya que el mockup solo trae `plan-actual`, y (b) «Hablar con ventas»,
  que no tiene flujo en los requisitos. El cambio de plan y el pago quedan fuera de esta spec.
- ADR requeridos: ninguno nuevo; se rige por ADR-0016 (dinero en centavos y bytes) y ADR-0010 (separación de módulos).

## 8. Aprobación
- `architect`: no aplica (sin puerto nuevo, tecnología nueva ni cambio de arquitectura)
- Adrián: pendiente
