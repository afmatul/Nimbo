# Propuesta para Adrián — Spec 009 (contratación, pagos y facturas)

> De: Juan Marcos · Fecha: 14/10/2026 · Rama: `feat/009-contratacion-pagos-y-facturas` (último commit `b28e8b7`).
> Pido tu decisión sobre seis puntos. Cada uno dice qué propongo, por qué y qué desbloquea. Si respondes «sí» a la
> recomendación, lo aplico tal cual y lo registro en `plan.md` §8.

## 1. Estado de la spec

Empecé a implementar **antes de tu aprobación final del plan**, con tus decisiones 1–9 y las revisiones ya aplicadas
(B-1 a B-3, I-1 a I-12, S-1 a S-4 y N-1 a N-3). Está anotado en `specs/README.md`.

| Tarea | Estado | Commit |
|---|---|---|
| T-01 Suscripción Personal al verificar | ✅ Hecha | `522ab7b` |
| T-02 Conciliación en el `worker` | ✅ Hecha (falta tu visto bueno del punto 4) | `795345d` |
| T-03 Lectura de la suscripción | ⏸️ Espera los puntos 4 y 5 | — |
| T-04 Pago simulado | ✅ Hecha | `ba236f4` |
| T-05 Contratar un plan de pago | ✅ Hecha | `ceadee3` |
| T-06 Factura dentro del cobro | ✅ Hecha | `255e935` |
| T-07 PDF y reintento | ⏸️ Espera el punto 2 | — |
| T-08 Aviso de comprobante | ⏸️ Depende de T-07 | — |
| T-09 Historial y descarga | ⏸️ Espera el punto 3 | — |
| T-10 Web, pago | 🔜 Se puede hacer ya | — |
| T-11 Web, `/suscripcion` | ⏸️ Depende de T-09 | — |
| T-12 Recorrido local (humana) | ⏸️ Al final | — |

También hice la **011 T-09** (catálogo del Administrador, parte de `billing`) y está fusionada en esta rama.

**Pruebas en la rama:** lint y typecheck limpios; unitarias todas en verde (`api` 1757, `web` 1144, `contracts` 387);
integración 1040 de 1041 (solo falla `dotenv-bootstrap` en mi máquina, por la contraseña del Postgres local); aislamiento
298 de 298.

## 2. Decisiones que te pido

### Punto 1 — Aprobación final del plan
- **Propuesta:** aprobar `plan.md` con las desviaciones ya registradas en `tasks.md` (cada tarea hecha tiene su nota
  «Desviaciones»). Las más importantes:
  - el cobro se separa en `SubscriptionService` (límite, transacción, bitácora) y `SubscriptionCheckout` (pasos de
    negocio): juntos sumaban ocho dependencias (SRP);
  - no se crean `findActiveBySlug`, `Subscription` ORM ni `*.orm-entity.ts` sin uso: `Plan.isForSale` cubre RN-6 (YAGNI);
  - `lockCurrent` bloquea `suscripcion` **sin `JOIN`**: con `JOIN … FOR UPDATE OF s`, el segundo pago simultáneo perdía
    la fila al revaluarse y respondía `500` (lo encontró la prueba de integración);
  - `SIM-` y `NB-` comparten un solo formateador; `AccountContactReader` reutiliza `findById` de la 011.
- **Desbloquea:** pasar la spec de «En curso sin aprobación» a «En curso» formal.

### Punto 2 — ADR-0028: librería del PDF (bloquea T-07)
- **Propuesta:** aceptar **`pdfkit`** (versión exacta, `@types/pdfkit` en desarrollo), solo dentro de
  `billing/infrastructure/adapters/pdf-invoice-generator.ts`, detrás de `IInvoiceGenerator`.
  Detalle y comparación en `docs/adr/0028-dependencia-de-billing-para-la-factura-pdf.md`.
- **Por qué:** JavaScript puro, sin binarios ni Chromium; tildes y «ñ» con las fuentes estándar; mantenida; PDF idéntico
  para los mismos datos (el reintento repone el mismo archivo). Se descartan `pdf-lib` (sin publicar desde 2022 y sin
  maquetación), `pdfmake` (trae `pdfkit` viejo; sobra) y Puppeteer (cientos de MB de imagen y RAM).
- **Subdecisión — formato de montos:** RN-1 dice «el formato `Qxx.xx` es solo de `web`», pero el PDF también muestra
  montos. Ya hay una copia en `web` (`plan-picker.tsx`), el PDF sería la segunda y T-10 la tercera (regla de tres).
  Propongo **una sola `formatGtq(cents)` en `packages/contracts`**, junto a `breakdown`, y corregir RN-1.
- **Desbloquea:** T-07 y, en cadena, T-08.

### Punto 3 — Exportar `I_OBJECT_STORAGE` en el `api` (bloquea T-09)
- **Problema:** T-09 firma la descarga de la factura con `IObjectStorage.presignDownload`. En el `api`, `StorageModule`
  crea `I_OBJECT_STORAGE` dentro de `forRoot(env)` y no lo exporta ni es global. Tu decisión 1 autorizó `putObject`,
  `storage/index.ts` y `StorageWorkerModule`, pero no `storage.module.ts`.
- **Propuesta (la más pequeña):** en `StorageModule.forRoot`, `exports: [I_OBJECT_STORAGE]` y `global: true`. Son dos
  líneas y no cambian el comportamiento de `storage`.
- **Alternativa:** un `ObjectStorageModule.forRoot(env)` en `storage` que usen `StorageModule` y `BillingModule`. Es más
  código y más cambios en tu módulo.
- **Desbloquea:** T-09 y, en cadena, T-11.

### Punto 4 — `IdentityReadersModule` en `identity` (T-02 y T-06 ya lo usan)
- **Qué es:** un módulo pequeño de `identity` que publica solo las dos fachadas de lectura que aprobaste (decisión 2):
  `VerifiedClientLister` (conciliación, en el `worker`) y `AccountContactReader` (correo del comprobante, en el `api`).
  `IdentityModule` no sirve para `billing`: necesita el entorno y trae JWT, sesiones y *throttlers*.
- **Historia:** nació en T-02 como `IdentityWorkerModule`; en T-06 pasó a `IdentityReadersModule` al sumar el uso en el
  `api`. No estaba en tu lista de módulos ajenos autorizados.
- **Propuesta:** autorizarlo tal cual (`identity/identity-readers.module.ts`, `index.ts`).
- **Desbloquea:** cerrar T-02 y T-06 sin pendientes; parte de T-03.

### Punto 5 — Métricas por plan con suscripciones reales (bloquea T-03)
- **Propuesta (Fátima ya la aceptó):** `SubscriptionAdministration` la crea la 009 T-03, sin `clientCount`:
  `planNamesFor(actor, clientIds)` → `ReadonlyMap<clientId, planName>` y `clientCountsByPlan(actor)` →
  `{ planId, clientCount }[]`. Un cliente sin fila de suscripción (por ejemplo, sin verificar) **no cuenta en ningún
  plan** y en la ficha se ve «—». La suma por plan puede quedar debajo de `accounts.clients`.
- **Te pido:** confirmar ese criterio de las métricas (011 CA-12).
- **Desbloquea:** T-03 y, para Fátima, las T-10 y T-11 de la 011.

### Punto 6 — Pendientes nuevos a tu cargo
- **PD-92:** extraer los ayudantes de prueba repetidos (ciclo `revert` → `run` de migraciones en cinco suites, los
  *stub* de `SharedModule` y la lista a mano de procesadores de `worker-health.int-spec.ts`).
- **PD-93:** unificar `IDENTITY_` y `STORAGE_TOO_MANY_REQUESTS` en `SHARED_TOO_MANY_REQUESTS` (la 009 ya estrena el
  compartido con `RateLimitExceededError`, S-2).
- **Te pido:** confirmar que quedan para el 20 % de refactorización de la fase.

## 3. Para que lo sepas (no requiere decisión)

- **Ramas fusionadas:** esta rama trae la 008 (`feat/008-catalogo-y-comparador`) y las T-01 a T-03 de la 011 de Fátima,
  porque las tareas las necesitaban. Si integras primero la 008 y la 011, el PR de la 009 queda solo con lo suyo.
- **Archivos de otros que toqué, con su motivo:**
  - `test/int/backoffice/migrations.int-spec.ts` (Fátima): comprueba el orden de sus migraciones sin exigir que sean
    las últimas; si no, falla en cuanto otra spec agrega una migración.
  - `test/int/shared/migrations-nimbo-app.int-spec.ts`, `worker.module.spec.ts`, `load-env.spec.ts`,
    `shared/index.spec.ts`, `worker/bootstrap.int-spec.ts` y `worker/worker-health.int-spec.ts` (tuyos): suman la
    migración, la cola, las variables o el export nuevos de la 009, sin cambiar lo que verifican.
  - `packages/config/eslint/boundaries.js` y `boundaries.spec.ts`: comentario y prueba de la arista `billing → identity`
    (N-2), dentro de lo que autorizaste.
- **Prueba intermitente:** `storage/usage-reconcile.int-spec.ts` falló una vez en la corrida completa por agotar la espera
  de su cola en Redis; sola pasa siempre. No toqué ese código.
- **Documentos de seguimiento:** `arreglos-011.md` (acuerdos con Fátima) e `informe-t03-choques.pdf` están en esta misma
  carpeta.

## 4. Respuesta corta sugerida

> 1 sí · 2 sí, con `formatGtq` en `contracts` · 3 opción pequeña · 4 sí · 5 sí · 6 sí

Con eso sigo en este orden: T-10 → T-07 → T-08 → T-09 → T-11 → T-03 → T-12.
