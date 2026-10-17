# Arreglos que la 009 le pide a la 011

> Origen: implementación de la 009 (T-01 y T-02) y el informe de choques de T-03 (`informe-t03-choques.pdf`).
> Rama: `feat/009-contratacion-pagos-y-facturas` · 14/10/2026 · Juan Marcos.
> **Respuesta de Fátima (14/10/2026):** acepta los puntos 1 a 6, 8 y 9 y ya ajustó spec, plan, tareas y PD-80 de la 011
> (aún sin subir). El 7 lo decide Adrián. La 009 quedó alineada en la misma rama: la T-09 de la 011 ya no crea
> `SubscriptionAdministration` y su tarea en `specs/011-…/tasks.md` volvió a la versión de Fátima.
> Los cambios en archivos de la spec 011 los aprueba Adrián; Fátima los aplica o los confirma en su rama.

## Resumen

| # | Arreglo | Archivo de la 011 | Quién | Estado |
|---|---|---|---|---|
| 1 | Sacar `SubscriptionAdministration` de la T-09 | `tasks.md` (T-09) | Fátima | **Aceptado**; la T-09 ya no la crea, la crea la 009 T-03 |
| 2 | Quitar `clientCount` de `clientCountsByPlan` | `plan.md` §2 | Fátima | **Aceptado**: `clientCountsByPlan(actor)` |
| 3 | Fijar los tipos de retorno de `SubscriptionAdministration` | `plan.md` §2 | Juan Marcos y Fátima | **Aceptado**; se implementan en la 009 T-03 |
| 4 | Métricas: los clientes sin suscripción no cuentan en ningún plan | `plan.md` (R-6), `spec.md` CA-12 | Fátima y Adrián | **Aceptado** por Fátima y confirmado por Adrián (2026-10-15) |
| 5 | Pasar las pruebas `accounts` y `metrics` con suscripciones reales a la T-10 | `tasks.md` (T-10) | Fátima | Pendiente |
| 6 | `PERSONAL_PLAN_SLUG` en un solo archivo | `billing/domain/plan-slug.ts` | Juan Marcos | **Aceptado**: lo crea la 009 T-01 y la T-09 de la 011, que depende de ella, le suma `slugFromName` |
| 7 | `IAccountDirectoryRepository` tiene un método nuevo | — | Adrián | Hecho en la 009 T-02; `listVerifiedClientIds` queda nombrado solo en el plan de la 009 (la 011 no lo usa). `IdentityReadersModule` (antes `IdentityWorkerModule`; desde la T-06 también publica `AccountContactReader` en el `api`) **autorizado por Adrián** (2026-10-15) |
| 8 | Pruebas de la 011 ajustadas por la 009 | varias | Fátima | **Aceptado** |
| 9 | `i-plan-repository.ts` se mueve a `application/ports/` | `tasks.md` (T-09) | Juan Marcos | **Aceptado** y hecho en la T-09 |
| 10 | Método de `billing` que liste **todos** los planes (activos o no) para CA-8 | `plan.md` §2 | Juan Marcos, a pedido de Fátima (T-11) | Pendiente: la T-09 no lo agregó (YAGNI, sin consumidor) |

## 1. Sacar `SubscriptionAdministration` de la T-09

- **Problema:** la T-09 de la 011 crea `SubscriptionAdministration` con la regla «todo cliente es Personal» (PD-80) y su prueba
  `subscription-administration.spec.ts`. La 009 T-03 la crea ya leyendo la suscripción real. Si las dos la crean, hay
  duplicado o conflicto al fusionar.
- **Arreglo:** en la T-09 de `tasks.md`, quitar `SubscriptionAdministration` de los archivos, del criterio («regla PD-80»)
  y de las pruebas (`subscription-administration.spec.ts`), y anotar «la crea 009 T-03». T-10 y T-11 pasan a depender de
  009 T-03 para esta fachada.

## 2. Quitar `clientCount` de `clientCountsByPlan`

- **Problema:** `clientCountsByPlan(actor, clientCount)` recibe el total de clientes solo para la regla «todo cliente es
  Personal». Con la 009 los conteos salen de la función `conteo_de_clientes_por_plan()` y el parámetro no se usa
  (choca con YAGNI, constitución Art. V).
- **Decisión actual:** la 009 mantiene la firma de la 011 para no romper el acuerdo con Fátima (parámetro `_clientCount`).
- **Arreglo:** cambiar el plan de la 011 §2 a `clientCountsByPlan(actor)` y, después, quitar el parámetro en la 009 y en la
  llamada de `MetricsService` (T-10).

## 3. Fijar los tipos de retorno de `SubscriptionAdministration`

- **Problema:** el plan de la 011 nombra los métodos pero no lo que devuelven, y `backoffice` (T-10) los consume.
- **Propuesta de la 009:**
  - `planNamesFor(actor, clientIds)` → `ReadonlyMap<string, string>` (id del cliente → nombre del plan). Un cliente sin
    suscripción no aparece y `backoffice` muestra «—» (`planName: null`), como decidió Adrián (I-7).
  - `clientCountsByPlan(actor, clientCount)` → `readonly { planId: string; clientCount: number }[]`, solo de planes con al
    menos un cliente. `backoffice` le suma el nombre, `deactivatedAt` y los planes activos con 0 desde el catálogo.
  - `nombres_de_plan_por_cliente` acepta como máximo 100 ids y lanza un error si recibe más (`backoffice` pide 10).
- **Arreglo:** acordarlo con Fátima y escribirlo en el plan de la 011 §2.

## 4. Métricas: los clientes sin suscripción no cuentan en ningún plan

- **Problema:** hoy cada cliente cuenta como Personal, así que la suma de `byPlan` es igual a `accounts.clients`. Con la
  009, un cliente sin fila en `suscripcion` (por ejemplo, uno sin verificar el correo) no cuenta en ningún plan y la
  suma puede quedar por debajo del total.
- **Arreglo:** que Adrián confirme el comportamiento (recomendado: coherente con el «—» de la ficha) y anotarlo en el plan
  de la 011 (R-6) y en la nota de CA-12. Si no se acepta, la alternativa es contar a los clientes sin fila como Personal
  con `clientCount`, y entonces la ficha y las métricas dirían cosas distintas.

## 5. Pruebas con suscripciones reales en la T-10

- **Problema:** la 009 T-03 promete que `accounts.int-spec.ts` y `metrics.int-spec.ts` de la 011 «siguen en verde con
  suscripciones reales», pero esas pruebas aún no existen (son de la T-10).
- **Arreglo:** que la T-10 de la 011 las escriba ya sobre la tabla `suscripcion` de la 009 (casos con fila y sin fila), y
  quitar esa verificación de la 009 T-03.

## 6. `PERSONAL_PLAN_SLUG` ya existe

- **Problema:** la T-09 de la 011 iba a crear `PERSONAL_PLAN_SLUG`. La 009 T-01 ya lo creó en
  `billing/domain/plan-slug.ts` (lo usan el alta Personal y `PlanLimitsAdapter`).
- **Arreglo:** en la T-09, ampliar ese archivo con `PlanSlug` y reutilizar la constante; no declararla de nuevo (Art. VI).

## 7. `IAccountDirectoryRepository` tiene un método nuevo (hecho)

- La 009 T-02 agregó `listVerifiedClientIds(afterId, limit)` al puerto de la 011, su implementación SQL y la fachada
  `VerifiedClientLister`, más `IdentityReadersModule` para publicarla en el `worker`.
- **Arreglo:** que el plan de la 011 §2 mencione el método nuevo. `IdentityReadersModule` está pendiente del visto bueno de
  Adrián (no estaba en la lista de módulos ajenos autorizados).

## 8. Pruebas de la 011 ajustadas por la 009 (hecho)

| Archivo | Cambio | Motivo |
|---|---|---|
| `apps/api/test/int/backoffice/migrations.int-spec.ts` | Comprueba que las 4 migraciones de la 011 van juntas y en orden, sin exigir que sean las últimas | La migración `crear-suscripcion` (009) va después |
| `apps/api/src/modules/identity/application/account-directory.spec.ts` | El doble del repositorio suma `listVerifiedClientIds` | Método nuevo del puerto (punto 7) |
| `apps/api/src/modules/identity/index.spec.ts` | La API pública suma `IdentityReadersModule` y `VerifiedClientLister` | Exportaciones nuevas de la 009 T-02 |

Fátima debe revisar estos cambios al fusionar su rama con la 009 (o la 009 con `main`).

## 9. `i-plan-repository.ts` a `application/ports/`

- **Decisión 9 de Adrián:** los puertos van en `application/ports/*.port.ts` (ya está en `conventions.md`).
- **Arreglo:** la T-09 de la 011 mueve `billing/application/i-plan-repository.ts` (de la 008) a
  `billing/application/ports/i-plan-repository.port.ts` al integrar.

## 10. Lista de todos los planes para CA-8

- **Problema:** CA-8 pide que el Administrador vea cada plan, activo o no. `PlanCatalogService.list()` solo da los activos
  (008 CA-1, PD-76) y la T-09 no agregó otra lectura porque nadie la usaba todavía.
- **Arreglo:** cuando Fátima la necesite en la T-11, Juan Marcos suma en `billing` un método de solo lectura con todos
  los planes (`IPlanRepository` y `PlanCatalogService`).

## Archivos de la 011 que tocó la T-09 (para revisar con Fátima)

- `specs/011-administracion-y-soporte/tasks.md`: volvió a la versión de Fátima (la marca de la T-09 la pone ella).
- `apps/api/test/int/backoffice/migrations.int-spec.ts`: la lista de migraciones de la 011 suma la de `billing` (son cinco)
  y el ciclo `up → down → up` comprueba también el esquema de `plan`. Sin este cambio, la prueba falla: suponía que las
  migraciones de la 011 eran las últimas.

## Orden sugerido

1. Adrián decide los puntos 1, 2 y 4 y confirma `IdentityReadersModule` (punto 7).
2. Juan Marcos y Fátima acuerdan los tipos del punto 3.
3. Se actualizan `plan.md` y `tasks.md` de la 011 (puntos 1 a 7 y 9) en un solo commit `docs(backoffice): …`.
4. La 009 T-03 se escribe con lo acordado.

## 11. Integración con el PR-A de la 011 (acuerdo con Fátima, 2026-10-15)

Adrián aprobó dividir la 011: el PR-A (T-01 a T-08) entra a `main` antes que la 009; la T-09 entra con la 009 y Fátima
la marca en su PR-B. Cuando el PR-A esté en `main`, en `feat/009`:

1. **Hecho (2026-10-17, merge `ac9c437`).** **Traer `main`** para que el PR de la 009 quede solo con lo suyo, y resolver los choques así:
   - `specs/011-administracion-y-soporte/{spec,plan,tasks}.md`: la versión de `main` (la del PR-A ya tiene lo acordado;
     la copia de esta rama trae la T-09 vieja).
   - `docs/sdd/pendientes.md`: conservar PD-31 resuelto, PD-94 y PD-80 en «Cerrados».
   - `app.module.ts` (T-04 registra `BackofficeModule`; la 009 T-07 crea la única instancia de `storage`),
     `lib/error-catalog.ts` (T-07 de la 011 suma mensajes; la 009, `BILLING_INVOICE_NOT_FOUND`) y los archivos de
     `identity` de la 009 T-02 (`listVerifiedClientIds`, `IdentityReadersModule`): los dos lados.
   - `docs/sdd/design-findings.md`: en `main`, **DF-68 ya es de la 014** (versiones). Hecho (2026-10-17): el hallazgo de
     la 009 pasó a **DF-69** y sus citas se actualizaron; en `pendientes.md`, el PD-92 de la 009 (ayudantes de prueba de
     migraciones) pasó a **PD-105**, porque en `main` PD-92 es la decisión de «Ver planes» de la 008.
   - Después, suites completas (sobre todo `migrations-nimbo-app` y `backoffice/migrations`).
2. **Hecho (2026-10-17).** **Ítem «Plan y facturación» → `/suscripcion` en `AccountMenu`** (lo hace la 009; en el PR-A sería un enlace a una
   página que no existe): con el mismo patrón que la T-07 de la 011 usa para `activityHref` según el rol, **solo para
   clientes** (las cuentas internas no tienen suscripción). Cierra el acceso pendiente de la T-11 (PD-68).
3. **`SubscriptionAdministration` desde `read`**: Fátima lo anota en su T-10 (métricas solo con conteos, `planNamesFor`
   solo en las cuentas del Administrador, Soporte sin ninguna).
4. **Lista de todos los planes (punto 10)**: Fátima avisa cuando empiece su T-11.
