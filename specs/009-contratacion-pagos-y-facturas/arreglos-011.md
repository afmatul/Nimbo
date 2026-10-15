# Arreglos que la 009 le pide a la 011

> Origen: implementación de la 009 (T-01 y T-02) y el informe de choques de T-03 (`informe-t03-choques.pdf`).
> Rama: `feat/009-contratacion-pagos-y-facturas` · 14/10/2026 · Juan Marcos.
> Los cambios en archivos de la spec 011 los aprueba Adrián; Fátima los aplica o los confirma en su rama.

## Resumen

| # | Arreglo | Archivo de la 011 | Quién | Estado |
|---|---|---|---|---|
| 1 | Sacar `SubscriptionAdministration` de la T-09 | `tasks.md` (T-09) | Adrián aprueba, Juan Marcos edita | Pendiente |
| 2 | Quitar `clientCount` de `clientCountsByPlan` | `plan.md` §2 | Adrián | Pendiente (por ahora se mantiene) |
| 3 | Fijar los tipos de retorno de `SubscriptionAdministration` | `plan.md` §2 | Juan Marcos y Fátima | Pendiente |
| 4 | Métricas: los clientes sin suscripción no cuentan en ningún plan | `plan.md` (R-6), `spec.md` CA-12 | Adrián | Pendiente |
| 5 | Pasar las pruebas `accounts` y `metrics` con suscripciones reales a la T-10 | `tasks.md` (T-10) | Fátima | Pendiente |
| 6 | `PERSONAL_PLAN_SLUG` ya existe: la T-09 lo reutiliza | `tasks.md` (T-09) | Juan Marcos | Pendiente |
| 7 | `IAccountDirectoryRepository` tiene un método nuevo | `plan.md` §2 | Fátima (aviso) | Hecho en la 009 T-02 |
| 8 | Pruebas de la 011 ajustadas por la 009 | varias | Fátima (aviso) | Hecho en la 009 |
| 9 | `i-plan-repository.ts` se mueve a `application/ports/` | `tasks.md` (T-09) | Juan Marcos | Pendiente (decisión 9 de Adrián) |

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
  `VerifiedClientLister`, más `IdentityWorkerModule` para publicarla en el `worker`.
- **Arreglo:** que el plan de la 011 §2 mencione el método nuevo. `IdentityWorkerModule` está pendiente del visto bueno de
  Adrián (no estaba en la lista de módulos ajenos autorizados).

## 8. Pruebas de la 011 ajustadas por la 009 (hecho)

| Archivo | Cambio | Motivo |
|---|---|---|
| `apps/api/test/int/backoffice/migrations.int-spec.ts` | Comprueba que las 4 migraciones de la 011 van juntas y en orden, sin exigir que sean las últimas | La migración `crear-suscripcion` (009) va después |
| `apps/api/src/modules/identity/application/account-directory.spec.ts` | El doble del repositorio suma `listVerifiedClientIds` | Método nuevo del puerto (punto 7) |
| `apps/api/src/modules/identity/index.spec.ts` | La API pública suma `IdentityWorkerModule` y `VerifiedClientLister` | Exportaciones nuevas de la 009 T-02 |

Fátima debe revisar estos cambios al fusionar su rama con la 009 (o la 009 con `main`).

## 9. `i-plan-repository.ts` a `application/ports/`

- **Decisión 9 de Adrián:** los puertos van en `application/ports/*.port.ts` (ya está en `conventions.md`).
- **Arreglo:** la T-09 de la 011 mueve `billing/application/i-plan-repository.ts` (de la 008) a
  `billing/application/ports/i-plan-repository.port.ts` al integrar.

## Orden sugerido

1. Adrián decide los puntos 1, 2 y 4 y confirma `IdentityWorkerModule` (punto 7).
2. Juan Marcos y Fátima acuerdan los tipos del punto 3.
3. Se actualizan `plan.md` y `tasks.md` de la 011 (puntos 1 a 7 y 9) en un solo commit `docs(backoffice): …`.
4. La 009 T-03 se escribe con lo acordado.
