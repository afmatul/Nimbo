# Tareas 010 — Renovación, vencimiento y cambio de plan

> Spec: `./spec.md` · Plan: `./plan.md`
> Estado: **Borrador — pendiente de la aprobación del plan por Adrián (`plan.md` §8), de ADR-0029 y de la revisión de M-2
> por el `architect`.** Corregidas tras la auditoría de Adrián en el PR #63; si Adrián o el `architect` cambian el plan,
> estas tareas se ajustan antes de `/implement`.
> Dos bloques, un PR cada uno (`workflow.md` §4.6): **010a** (`api`, `worker`, `storage`) y **010b** (`web`). 12 tareas
> verticales, de medio día a un día, un commit cada una (`feat(billing): … [010 T-xx]`). Sin tareas de «cierre».
> **Tamaño (M-1)**: 010a ≈ 7 días y 010b ≈ 4 días; los dos superan los 3 días de `workflow.md` §4.1 (plan §7).

**Compuertas generales**
- Todo se implementa sobre la **009 integrada en `main`**. Las pruebas de la 009 que cambian (`Subscription`, `PaymentService`,
  `IPaymentGateway`, `SubscriptionCheckout`, `SubscriptionService`, `TEST_CARDS`) se ajustan en la tarea que las toca.
- Módulos ajenos (`[Adrián]`): solo con su autorización del plan §8; `storage` y su web, además, con **ADR-0029 aceptado**.
- Funciones ≤ 30 líneas y ≤ 3 parámetros; cada tarea de lógica empieza por su prueba en rojo; nombres de prueba `'CA-n: …'`.

## Bloque 010a — API, worker y `storage` (PR 1)
**Compuerta del bloque**: plan aprobado por Adrián; **PD-63 hecho** (planificador + procesador, bucle de reintento y
`errorName` extraídos; T-05 los reutiliza); **M-2 revisado por el `architect`** antes de T-02.

- [x] **T-01** Datos y dominio de la suscripción: estado, renovación automática y cambio programado
  - Criterio: CA-15; RN-1, RN-3, RN-5, RN-7 y la regla de `renewalQuote` de CA-26 y CA-28 (cualquier cambio programado).
  - Archivos: `apps/api/src/migrations/*-renovacion-de-suscripcion.ts` (plan §3, con `down`); `billing/domain/entities/subscription.entity.ts`;
    `billing/domain/errors/{no-paid-subscription,plan-change-invalid,no-pending-plan-change,already-renewed,plan-change-pending}.error.ts`;
    `packages/contracts/src/billing/error-codes.ts`; `billing/application/ports/i-subscription-repository.port.ts` (`findStanding`,
    `markReminderSent`, `markExpiredNoticeSent`, columnas nuevas) y `billing/infrastructure/persistence/typeorm-subscription.repository.ts`;
    `billing/infrastructure/adapters/plan-limits.adapter.ts` pasa a `findStanding` (solo `planId` aquí);
    `apps/api/src/modules/audit/application/{audit-action,audit-catalog}.ts` [Adrián] (nueve acciones).
  - Prueba: unit `subscription.entity.spec.ts` (inicio del periodo vigente o en solo lectura, plan del siguiente ciclo, `scheduleChange`,
    `renewalQuote` no disponible con cambio a Personal y a plan de pago, Personal nunca vence); int `migrations.int-spec.ts`.
  - Depende: 009 en `main`.

- [x] **T-02** Instrumento de pago y tarjeta de prueba `0341` (M-2, B-2)
  - **Compuerta**: ADR-0031 aceptado por Adrián (`referencia_instrumento` en claro bajo RLS; la columna va en esta migración).
  - Criterio: RN-2 (referencia sin número; marca y últimos 4 solo para mostrar; `0341` aprobada con el cliente presente); la
    contratación de la 009 sigue verde y acepta `0341`.
  - Archivos: `packages/contracts/src/billing/subscription.ts` (`TEST_CARDS.recurringDeclined`, `cardSchema` con tres tarjetas y exportado);
    `apps/api/src/migrations/*-referencia-de-instrumento.ts` (con `down`); `billing/domain/payment-instrument.ts` (`PaymentInstrument`,
    `InstrumentReference`, `CardOnFile`, `assertChargeable`); `billing/domain/entities/payment.entity.ts` (`instrumentRef`);
    `billing/application/ports/i-payment-gateway.port.ts` y `billing/infrastructure/adapters/simulated-payment-gateway.ts`;
    `billing/application/payment.service.ts`, `subscription-checkout.ts`; `i-payment-repository.port.ts` y `typeorm-payment.repository.ts`
    (`record` con referencia, `findLastApprovedCard`); `apps/api/src/shared/infrastructure/logging/redacted-fields.ts` [Adrián] (redacta `instrumentRef`, `instrument` y `referencia_instrumento`). `findLastApprovedCard` es la única consulta que selecciona la columna (ADR-0031).
  - Prueba: unit `simulated-payment-gateway.spec.ts` (tres tarjetas presentes; referencia de `4242` aprueba y de `0341` rechaza; sin número),
    `payment.service.spec.ts` (guarda lo que da la pasarela; vencimiento solo con tarjeta presente), `subscription.spec.ts` de contracts;
    int `subscribe.int-spec.ts` (`0341` aprobada, la transacción guarda referencia; rechazada sin referencia) y `migrations.int-spec.ts`.
  - Depende: — (paralela a T-01).

- [x] **T-03** Renovación manual `POST /api/v1/billing/renew`
  - Criterio: CA-8, CA-9, CA-10 (periodo desde el pago, salida de solo lectura y cambio programado aplicado), CA-11, CA-20 (desde solo
    lectura), CA-26, CA-28, CA-29 (descarte en la manual); RN-4, RN-9.
  - Archivos: `packages/contracts/src/billing/subscription.ts` (`renewRequestSchema`, `paymentReceiptSchema` con los alias);
    `billing/application/payment-attempt-limiter.ts`; `invoice-issuer.ts` (recibe `issueAfterCommit`) y `subscription.service.ts`;
    `renewal-checkout.ts`; `manual-renewal.service.ts`; `billing/presentation/subscription.controller.ts` (ruta `renew`);
    `billing.module.ts`, `billing-http.module.ts`.
  - Prueba: unit `renewal-checkout.spec.ts` (aprobada, rechazada manual sin cambios, plan programado aplicado, plan descartado);
    int `renew.int-spec.ts` (aprobada desde `vence_en`, `402` sin cambios, desde solo lectura desde `now` con cambio aplicado, Personal
    `400`, `409 BILLING_ALREADY_RENEWED` por adelantado y por `expectedExpiresAt`, `409 BILLING_PLAN_CHANGE_PENDING` con cambio a Personal
    y a plan de pago, auditoría); las int de contratación de la 009 siguen verdes con el limitador compartido.
  - Depende: T-01, T-02.

- [ ] **T-04** Renovación automática encendida o apagada, cambio de plan y vista de la suscripción (API)
  - Criterio: CA-6, CA-16, CA-17 (PD-86), CA-18, CA-19, CA-22, CA-27, CA-25 (datos de la vista).
  - Archivos: `packages/contracts/src/billing/subscription.ts` (`autoRenewRequestSchema`, `planChangeRequestSchema`),
    `packages/contracts/src/billing/history.ts` (`subscriptionViewSchema`, sin referencia); `billing/application/subscription-settings.service.ts`;
    `billing-history.service.ts`, `billing/infrastructure/persistence/sql-billing-history.reader.ts`; `subscription.controller.ts`,
    `billing/presentation/subscription-view.response.ts`; `billing/application/renewal-config.ts` (`RENEWAL_REMINDER_DAYS`);
    `env.schema.ts` y `.env.example` [Adrián].
  - Prueba: int `subscription-settings.int-spec.ts` (feliz y error principal por ruta, con auditoría); `GET /billing/history` con `nextCharge`
    (marca y últimos 4) y `renewal`; `pnpm env:check`.
  - Depende: T-01, T-02; comparte controlador con T-03. La vista reutiliza la consulta de marca y últimos 4 de `sql-billing-history.reader.ts` (`PAYMENT_METHOD_SQL`), no `findLastApprovedCard`: la referencia no entra en el camino HTTP (ADR-0031).

- [ ] **T-05** Pasada del `worker`: renovación automática, vencimiento y aviso previo
  - Criterio: CA-1, CA-2, CA-3, CA-4, CA-5, CA-7, CA-20 (automática), CA-21, CA-29, CA-23 (conteos); RN-2, RN-8, RN-10 (M-3).
  - Archivos: `apps/api/src/migrations/*-funciones-de-renovacion.ts` (ADR-0021, con `down`); `i-invoice-repository.port.ts` y
    `typeorm-invoice.repository.ts` (`findLatestNit`); `billing/application/ports/i-due-subscription.scanner.port.ts` y
    `billing/infrastructure/persistence/sql-due-subscription.scanner.ts`; `billing/application/{subscription-renewer,renewal-reminder.service,
    renewal-runner,renewal-config}.ts`; `{mail-message,receipt-message,renewal-messages}.ts`; `billing/infrastructure/{renewal.scheduler,
    renewal.processor}.ts` sobre PD-63; `billing-worker.module.ts`; `env.schema.ts`, `.env.example`, `apps/api/src/worker.module.ts` [Adrián].
  - Prueba: unit `renewal-runner.spec.ts` (un fallo no frena a las demás, `RenewalRunIncompleteError`, bitácora solo con conteos);
    int `subscription-renewal.int-spec.ts` (`4242` renueva con NIT de la última factura o `CF`; **contratada con `0341`** → solo lectura y
    correo; **cuenta ya en solo lectura sin correo → solo reenvía, sin transacción (M-3)**; sin referencia → como CA-7; renovación apagada;
    cambio aplicado o, si se rechaza, conservado; a Personal sobre cuota → `STORAGE_QUOTA_EXCEEDED`; plan descartado y correo; dos pasadas
    y una manual → un cobro); int `renewal-reminder.int-spec.ts` (un correo por periodo).
  - Depende: T-01, T-02, T-03 (`RenewalCheckout`, `InvoiceIssuer`); PD-63.

- [ ] **T-06** Solo lectura en `storage` con `PlanLimits.readOnly` [Adrián]
  - **Compuerta**: ADR-0029 aceptado y cambios en `storage` autorizados.
  - Criterio: CA-12, CA-13, CA-10 (vuelve a poder subir); RN-6.
  - Archivos: `packages/contracts/src/storage/{error-codes,space-schemas}.ts`; `storage/application/plan-limits.ts`,
    `storage/domain/errors/account-read-only.error.ts` (+ `index.ts`), `storage/application/writable-account.policy.ts`, `storage/index.ts`;
    los diez métodos de plan §2 y `space-summary.service.ts`; `plan-limits.adapter.ts` (`PlanStorageLimits`, `readOnly` solo en `limitsFor`);
    `apps/api/test/support/fake-plan-limits.provider.ts`.
  - Prueba: unit `writable-account.policy.spec.ts`, `plan-limits.adapter.spec.ts`; int `storage/read-only.int-spec.ts` con la tabla de plan §6
    (diez bloqueadas; permitidas, incluidos los `POST` de `download-url` y `recents`) y renovar → la carga vuelve a aceptarse.
  - Depende: T-01, T-03.

- [ ] **T-07** Aislamiento y roles internos de la 010
  - Criterio: CA-23 (`403` y nada cambia), CA-24; RNF-05.
  - Archivos: `apps/api/test/isolation/billing-renewal.iso-spec.ts`; `apps/api/test/int/billing/billing-internal-roles.int-spec.ts`.
  - Prueba: iso (A solo su fila, sin ver la de B ni su referencia; `nimbo_app` sin actor ve 0 filas; con actor las funciones fallan; `PUBLIC`
    no las ejecuta; la solo lectura de A no afecta las cargas de B; dueño sin `SUPERUSER`; `referencia_instrumento` no aparece en
    `GET /billing/history` ni en ninguna respuesta, ADR-0031); int (cuatro rutas × tres roles → `403`).
  - Depende: T-03, T-04, T-05, T-06.

## Bloque 010b — Web (PR 2)
**Compuerta del bloque**: 010a integrado en `main` (contratos y rutas disponibles); mockups creados con `/mockup` (cuatro estados de
`billing/suscripcion/`, confirmación del cambio de plan con el aviso de versiones, variante de renovación del pago con las tres tarjetas).
Antes de cada pantalla se leen sus capturas en `docs/design/capturas/`; las desviaciones van a «Notas del developer».

- [ ] **T-08** Pantalla «Plan y facturación» con sus cinco estados
  - Criterio: CA-25, CA-6 (confirmación al apagar), CA-19, CA-28 (sin «Renovar ahora» con cualquier cambio programado), CA-16, CA-22
    (actividad en español); textos de spec §6.
  - Archivos: `apps/web/src/lib/error-catalog.ts` (cinco códigos de `billing`); `features/billing/subscription-api.ts`;
    `features/billing/components/{plan-and-billing,current-plan-card}.tsx` y los nuevos `next-charge-card.tsx`, `auto-renew-switch.tsx`,
    `subscription-status-notice.tsx`, `pending-change-notice.tsx`; `features/audit/activity-labels.ts` [Adrián].
  - Prueba: web `plan-and-billing.spec.tsx` (un caso por estado más Personal, axe), `subscription-api` con `fetch` simulado, catálogo y etiquetas.
  - Depende: 010a; mockups.

- [ ] **T-09** Elegir plan para el cambio (`/suscripcion/cambiar-plan`)
  - Criterio: CA-16, CA-17 (PD-86), CA-18, CA-21 (aviso de versiones), CA-27.
  - Archivos: `app/(app)/(cliente)/suscripcion/cambiar-plan/{page,loading,error}.tsx`; `features/billing/components/plan-change-list.tsx`
    (usa `components/nimbo/plan-card.tsx` y `GET /billing/plans`).
  - Prueba: web `plan-change-list.spec.tsx` (actual marcado, confirmación con y sin aviso, error, Personal → contratación) con axe.
  - Depende: T-08.

- [ ] **T-10** Pago de la renovación manual (`/suscripcion/renovar`) y `ReadOnlyBanner`
  - Criterio: CA-8, CA-9, CA-10, CA-26, CA-28 (mensaje de `409`); B-2 (la ayuda nombra las tres tarjetas); componente del aviso de CA-14.
  - Archivos: `app/(app)/(cliente)/suscripcion/renovar/{page,loading,error}.tsx`; `features/billing/components/{payment-form,payment-summary}.tsx`,
    `hooks/use-payment-form.ts`; `apps/web/src/components/nimbo/read-only-banner.tsx`.
  - Prueba: web `renovar/page.spec.tsx` (default, rechazado, éxito, `409`), `read-only-banner.spec.tsx`, con axe; las de pago de la 009 siguen verdes
    (`payment-form.spec.tsx` acepta `0341`).
  - Depende: T-08.

- [ ] **T-11** Explorador en solo lectura [Adrián]
  - **Compuerta**: ADR-0029 aceptado y cambios en la web de `storage` autorizados.
  - Criterio: CA-14 (aviso, acciones de CA-13 deshabilitadas con texto, arrastre con el mensaje); las permitidas por RN-6 siguen activas.
  - Archivos: `apps/web/src/lib/error-catalog.ts` (`STORAGE_ACCOUNT_READ_ONLY`, literal); `features/storage/components/{space-provider,
    my-files,upload-dropzone,trash-view,file-detail-view,restore-version-dialog}.tsx`.
  - Prueba: web `my-files.spec.tsx` (deshabilitadas con texto, permitidas activas, mensaje al arrastrar) con axe.
  - Depende: T-10.

- [ ] **T-12** **(humana)** Recorrido de la demo en local y nota en el PR — CA: CA-1, CA-2, CA-5, CA-6, CA-8, CA-10, CA-13, CA-14,
  CA-16, CA-19, CA-21, CA-25, CA-28. Cliente contrata con `4242`: ve «Próximo cobro», apaga y enciende la renovación, programa un cambio
  (sin «Renovar ahora»), lo cancela; se siembra `vence_en` cercano y vencido para ver el aviso y la pasada (renueva con factura en Mailpit).
  Otro cliente contrata con **`0341`** (aprobada); al vencer, la pasada la rechaza y la cuenta queda en solo lectura con el correo; el
  explorador muestra el aviso y bloquea la carga; renovar a mano con `0341` o `4242` devuelve la carga. — Depende: T-01 a T-11.

## Trazabilidad CA → tarea
| CA | Tarea(s) | CA | Tarea(s) | CA | Tarea(s) |
|---|---|---|---|---|---|
| CA-1 | T-05, T-12 | CA-11 | T-03, T-08 | CA-21 | T-05, T-09 |
| CA-2 | T-02, T-05, T-12 | CA-12 | T-06 | CA-22 | T-01, T-04, T-08 |
| CA-3 | T-05 | CA-13 | T-06 | CA-23 | T-05 (conteos), T-07 |
| CA-4 | T-05 | CA-14 | T-10, T-11 | CA-24 | T-07 |
| CA-5 | T-05 | CA-15 | T-01, T-05 | CA-25 | T-04, T-08 |
| CA-6 | T-04, T-08 | CA-16 | T-04, T-08, T-09 | CA-26 | T-01, T-03, T-10 |
| CA-7 | T-05 | CA-17 | T-04, T-09 | CA-27 | T-04, T-09 |
| CA-8 | T-03, T-10 | CA-18 | T-04, T-09 | CA-28 | T-01, T-03, T-08, T-10 |
| CA-9 | T-03, T-10 | CA-19 | T-04, T-08 | CA-29 | T-03, T-05 |
| CA-10 | T-03, T-06, T-10 | CA-20 | T-03, T-05 | | |

## Notas del developer
<Desviaciones (con enlace al registro de cambios de la spec), DF o pendientes que surgieron. Al implementar: DF-70 en
`design-findings.md` (plan §7, incluye M-2 y M-5), PD-86 se cierra, PD-96 se amplía con lo de la 010, PD-63 suma el renombre de
`PlanLimits` y se registran los pendientes nuevos de plan §7 (conteos al momento para el Operador; `readOnly` del propietario en 012,
013, 016 y 021).>

- **T-01** (2026-10-18): `markReminderSent` y `markExpiredNoticeSent` (plan §2) se agregan en T-05, que es quien los usa (YAGNI,
  Art. V); la migración ya trae `aviso_previo_para` y `aviso_vencida_para` porque el esquema es uno solo (plan §3).
  `SubscriptionStanding.readOnly` se lee desde ahora y lo consume T-06 en este mismo PR. Las pruebas de `billing` arman la
  suscripción con `application/testing/subscriptions.ts` (`aSubscription`), como `aPlan` (DRY, Art. VI).
- **T-02** (2026-10-18): se implementó **antes** de que Adrián acepte ADR-0031, por decisión de Juan Marcos para no
  frenar la 010a (avance autorizado del plan §8); si el ADR cambia, se ajusta la migración `20261018100100` y el
  simulador. Desviaciones del plan §2:
  - `assertChargeable` queda como `isChargeable` (booleano puro) en `domain/payment-instrument.ts` y el issue
    `CARD_EXPIRED` sigue en `PaymentService`: el plan suponía que el dominio ya importa `@nimbo/contracts` en `money.ts`,
    pero no lo hace (ADR-0008). `PaymentService` sigue sin ramificar por tipo.
  - `CardOnFile` y `findLastApprovedCard` se agregan en T-05, su único usuario (YAGNI, Art. V); la regla de ADR-0031
    (única consulta que selecciona la columna) se prueba ahí.
  - `cardSchema` se exporta en T-03, cuando lo reutiliza `renewRequestSchema`.
  - `lastFourOf` pasa al simulador (único usuario); `isCardExpired` queda en `payment-card.ts`.
- **T-03** (2026-10-18): `RenewalCheckout`, `ManualRenewalService` y `PaymentAttemptLimiter` viven en `BillingHttpModule` porque
  `PaymentService` e `InvoiceService` solo existen en el `api`; T-05 los lleva a un módulo que también cargue el `worker`.
  La clave del límite pasa de `billing:subscribe:` a `billing:payment:` (una para contratar y renovar). DRY: `issueAfterCommit`
  pasa a `InvoiceIssuer` y la bitácora del pago a `logPaymentOutcome` (`billing-logger.ts`), que usan contratar y renovar;
  `subscribe.response.ts` pasa a `payment-receipt.response.ts` (`toPaymentReceipt`) y `subscribeResponseSchema` a
  `paymentReceiptSchema` (también en `web/subscribe-api.ts`). CA-29 en la manual descarta el plan y lo audita;
  `RenewalOutcome.discardedPlan` queda para el correo de T-05 (`renewal-messages.ts`). Un rechazo no guarda el descarte
  (CA-9: no cambia nada).
