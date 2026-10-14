# Tareas 009 — Contratación, pagos y facturas

> Spec: `./spec.md` · Plan: `./plan.md`
> 5 a 12 tareas verticales, de medio día a un día. Un commit cada una (`feat(billing): … [009 T-xx]`).
> Cada tarea deja algo probado de punta a punta, lista sus CA y sus archivos, y actualiza `design-model.md` si crea una clase de M4.
> Sin tareas de «cierre»: el PR integrado lo es.

- [ ] **T-01** Suscripción Personal al verificar
  - Criterio: CA-1. Migración `suscripcion` con RLS, `Subscription`, `ISubscriptionRepository` con su repositorio TypeORM sobre `TransactionContext`, `PersonalSubscriptionService` (alta idempotente con `withActor`) y oyente de `identity.client-account-verified` en `presentation/`. Abre el DF de la 009 con las diferencias de `suscripcion` frente al E-R (`iniciado_en`, `vence_en` en lugar de `fin`, sin `renov_auto`), suma las clases a `design-model.md` M4 y fija en `conventions.md` que los puertos van en `application/ports/*.port.ts` (decisión 9).
  - Archivos: `apps/api/src/migrations/*-crear-suscripcion.ts`, `billing/domain/entities/subscription.entity.ts`, `billing/application/personal-subscription.service.ts`, `billing/application/ports/i-subscription-repository.port.ts`, `billing/infrastructure/persistence/{suscripcion.orm-entity,typeorm-subscription.repository}.ts`, `billing/presentation/account-verified.listener.ts`, `billing/billing.module.ts`, `docs/sdd/{design-model,design-findings,conventions}.md`.
  - Prueba: `personal-subscription.service.spec.ts`; `test/int/billing/account-verified.listener.int-spec.ts` (alta con el actor del dueño y repetición sin duplicar).

- [ ] **T-02** Conciliación de suscripciones
  - Criterio: CA-2 (conciliación). Fachada `VerifiedClientLister` en `identity` sobre `IAccountDirectoryRepository` de la 011 con una consulta nueva (ids de verificados, paginada por id), sin exportar repositorios ni entidades; `SubscriptionReconcilerService`; `BillingWorkerModule.forRoot(env)` en `worker.module.ts` con el patrón de `usage-reconcile`: cola `subscription-reconcile`, planificador `{ every }` cada 60 minutos y procesador que solo delega, lote de 100. `boundaries.js`: `billing → identity` solo con el evento y las dos fachadas.
  - Archivos: `identity/application/verified-client-lister.ts`, `identity/application/ports/i-account-directory.repository.port.ts` y su implementación, `identity/{identity.module,index}.ts`, `billing/application/subscription-reconciler.service.ts`, `billing/infrastructure/{subscription-reconcile.scheduler,subscription-reconcile.processor}.ts`, `billing/billing-worker.module.ts`, `billing/index.ts`, `apps/api/src/worker.module.ts`, `workerEnvSchema` y `.env.example` (`SUBSCRIPTION_RECONCILE_INTERVAL_MINUTES=60`, `SUBSCRIPTION_RECONCILE_BATCH_SIZE=100`), `packages/config/eslint/boundaries.js` y *fixtures*.
  - Prueba: `subscription-reconciler.service.spec.ts`; `subscription-reconcile.processor.spec.ts` (un fallo no frena las demás cuentas y el trabajo falla al final); `worker.module.spec.ts`; `test/int/billing/subscription-reconciler.int-spec.ts`; integración de la consulta nueva de `identity`.
  - Depende: T-01, T-03 de la 011 (`IAccountDirectoryRepository`).

- [ ] **T-03** Lectura de la suscripción (PD-80)
  - Criterio: CA-2 (lectura). Migración con `nombres_de_plan_por_cliente` y `conteo_de_clientes_por_plan` (ADR-0021: solo lectura, `search_path` cerrado, `EXECUTE` solo para `nimbo_app`, rol comprobado dentro). `PlanLimitsAdapter.limitsFor` deja `@InjectRepository` y lee por `ISubscriptionRepository` dentro de `withActor`; `SubscriptionAdministration` lee las funciones (la crea T-09 de la 011; esta tarea solo si integra antes). Con fila, el plan de la suscripción; sin fila, Personal en `limitsFor` y `planName` nulo («—») en administración. Ambos caminos ignoran `vence_en` hasta la 010.
  - Archivos: `apps/api/src/migrations/*-funciones-de-lectura-de-suscripcion.ts`, `billing/application/subscription-administration.ts`, `billing/infrastructure/adapters/plan-limits.adapter.ts`.
  - Prueba: `test/int/billing/plan-limits.adapter.int-spec.ts` (con fila, sin fila, bajo RLS forzado) y `subscription-administration.int-spec.ts` (con fila, `planName` nulo sin fila); `accounts` y `metrics` de la 011 siguen verdes; `test/isolation/billing-subscription.iso-spec.ts` (Soporte no ejecuta las funciones, Operador solo el conteo, `PUBLIC` ninguna, dueño sin `SUPERUSER`).
  - Depende: T-01, T-09 de la 011 (`SubscriptionAdministration`, PD-80).

- [ ] **T-04** Pago simulado
  - Criterio: RN-2 y RN-3. `breakdown` en `packages/contracts`; `Money` solo guarda centavos y no importa `contracts`. Migración `transaccion` con índice, `Payment`, `IPaymentRepository` con su repositorio, `IPaymentGateway` con `SimulatedPaymentGateway` determinista y `PaymentService.charge`, único dueño del pago: valida el vencimiento con `IClock`, inserta la fila (aprobada o rechazada) y devuelve `ChargeResult`; no lanza por un rechazo. Suma al DF las diferencias de `transaccion` frente al E-R y el simulador determinista frente a `failureRate` y `latencyMs`.
  - Archivos: `packages/contracts/src/billing/{breakdown,index}.ts`, `billing/domain/value-objects/money.ts`, `billing/domain/entities/payment.entity.ts`, `apps/api/src/migrations/*-crear-transaccion.ts`, `billing/application/payment.service.ts`, `billing/application/ports/{i-payment-repository,i-payment-gateway}.port.ts`, `billing/infrastructure/adapters/simulated-payment-gateway.ts`, `billing/infrastructure/persistence/{transaccion.orm-entity,typeorm-payment.repository}.ts`, `docs/sdd/design-findings.md`.
  - Prueba: `breakdown.spec.ts` (9 821 y 1 179 para 11 000, mitades), `money.spec.ts`, `simulated-payment-gateway.spec.ts`, `payment.service.spec.ts` (`ChargeResult` aprobada y rechazada, vencimiento).
  - Depende: T-01.

- [ ] **T-05** Suscribir
  - Criterio: CA-3, CA-4, CA-5 y RN-4. `SubscribeRequest` con la forma de RN-9 (`card: { number, expMonth, expYear, cvc }`, 16 dígitos, NIT `CF` o de 5 a 12 dígitos; si no, `422` con `fields`) y `SubscribeResponse` sin `receiptEmail` todavía; códigos `BILLING_*`. `findActiveBySlug` en `IPlanRepository` (lo mueve a `ports/` la 011). `PAID_PLAN_PERIOD_DAYS = 30` en el dominio. `SubscriptionService` con la transacción de cobro (fila Personal garantizada, `FOR UPDATE`, `PaymentService.charge`, cambio de suscripción solo si se aprueba); el controlador traduce `ChargeResult` rechazado a `402` después del commit. Límite `billing:subscribe:{actor}` de 10 intentos cada 15 minutos con `RateLimitExceededError` y `SHARED_TOO_MANY_REQUESTS`. `REDACTED_FIELDS` con `card`, `cardNumber`, `number`, `cvc` y `nit`.
  - Archivos: `packages/contracts/src/billing/{subscription,error-codes,index}.ts`, `packages/contracts/src/shared/error-codes.ts`, `apps/api/src/shared/domain/errors/rate-limit-exceeded.error.ts`, `apps/api/src/shared/infrastructure/logging/{redacted-fields.ts,redact-deep.spec.ts}`, `billing/domain/entities/subscription.entity.ts`, `billing/domain/errors/{plan-not-available,payment-rejected}.error.ts`, `billing/application/subscription.service.ts`, `billing/application/ports/i-plan-repository.port.ts`, `billing/infrastructure/persistence/typeorm-plan.repository.ts`, `billing/presentation/subscription.controller.ts`, `apps/web/src/lib/error-catalog.ts`.
  - Prueba: `subscription.service.spec.ts` (RN-4, 30 días); `test/int/billing/subscribe.int-spec.ts` (aprobado, rechazado con la suscripción intacta y la fila confirmada, plan no disponible, plan de pago vigente, datos fuera de RN-9, `429` tras 10 intentos, cliente sin fila y dos pagos simultáneos con y sin fila: solo uno se aprueba y el otro recibe `400`); `redact-deep.spec.ts`.
  - Depende: T-04, T-09 de la 011 (`plan.desactivado_en`, `PERSONAL_PLAN_SLUG`).

- [ ] **T-06** Fila de factura dentro del cobro
  - Criterio: CA-6 (factura registrada). Migración `factura` (`clave_objeto` y `aviso_encolado_en` nulos, `correo_comprobante`, `CHECK` de totales, índice, secuencia y trigger `BEFORE INSERT` que rechaza un `usuario_id` distinto al de la transacción), `Invoice`, `IInvoiceRepository` con su repositorio, fachada `AccountContactReader` en `identity` (consulta de contacto por id en `IAccountDirectoryRepository`) e `InvoiceService.register`, que en la transacción del cobro inserta la fila con los montos de `breakdown`, el `usuario_id` de la transacción bloqueada y el correo. Un pago rechazado no la crea. Suma al DF las diferencias de `factura` frente al E-R.
  - Archivos: `apps/api/src/migrations/*-crear-factura.ts`, `billing/domain/entities/invoice.entity.ts`, `billing/application/invoice.service.ts`, `billing/application/subscription.service.ts`, `billing/application/ports/i-invoice-repository.port.ts`, `billing/infrastructure/persistence/{factura.orm-entity,typeorm-invoice.repository}.ts`, `identity/application/account-contact-reader.ts`, `identity/application/ports/i-account-directory.repository.port.ts` y su implementación, `identity/{identity.module,index}.ts`, `docs/sdd/design-findings.md`.
  - Prueba: `invoice.service.spec.ts` (`register`); `test/int/billing/subscribe-invoice.int-spec.ts` (factura con número, montos y correo solo si se aprueba; el trigger rechaza un `usuario_id` ajeno); integración de la consulta de contacto de `identity`.
  - Depende: T-05, T-03 de la 011.

- [ ] **T-07** PDF y reintento
  - Criterio: CA-6 (PDF y reintento). Compuerta previa, fuera de la tarea: ADR menor de la librería del PDF aprobado por Adrián. `IInvoiceGenerator` con `PdfInvoiceGenerator`; `putObject` en `IObjectStorage` con su adaptador de MinIO, que solo acepta `invoices/{usuario_id}/{factura_id}.pdf` y rechaza `u/`; export del puerto y de `I_OBJECT_STORAGE` en `storage/index.ts` y `StorageWorkerModule`. `InvoiceService.issue` después del commit genera y sube el PDF y guarda `clave_objeto`. Migración de `facturas_pendientes_de_emitir` (sin actor, antigüedad mínima y tope fijos), `IPendingInvoiceScanner` con `SqlPendingInvoiceScanner`, `retryPending` y el trabajo `invoice-retry` cada minuto, lote de 100.
  - Archivos: `billing/application/ports/{i-invoice-generator,i-pending-invoice.scanner}.port.ts`, `billing/infrastructure/adapters/pdf-invoice-generator.ts`, `billing/infrastructure/persistence/sql-pending-invoice.scanner.ts`, `billing/infrastructure/{invoice-retry.scheduler,invoice-retry.processor}.ts`, `billing/application/invoice.service.ts`, `billing/billing-worker.module.ts`, `apps/api/src/migrations/*-funcion-facturas-pendientes.ts`, `storage/application/ports/i-object-storage.port.ts`, `storage/infrastructure/{minio-storage.adapter,storage-worker.module}.ts`, `storage/index.ts`, `workerEnvSchema` y `.env.example` (`INVOICE_RETRY_INTERVAL_MINUTES=1`, `INVOICE_RETRY_BATCH_SIZE=100`), `apps/api/src/worker.module.ts`.
  - Prueba: `invoice.service.spec.ts` (`issue` idempotente, `retryPending`); `minio-storage.adapter.int-spec.ts` (`putObject`, descarga firmada y rechazo de `u/`); `test/int/billing/subscribe-invoice.int-spec.ts` (PDF en MinIO); `test/int/billing/invoice-retry.int-spec.ts` (con fallo del PDF, el reintento lo repone); `worker.module.spec.ts`; `test/isolation/billing-subscription.iso-spec.ts` (con actor `CLIENT` o interno la función falla; `PUBLIC` no la ejecuta).
  - Depende: T-06, T-02 (`BillingWorkerModule`).

- [ ] **T-08** Aviso de comprobante
  - Criterio: CA-6 (correo). Puerto `INotifier` en `notifications`, distinto de `IMailer` y con el mismo `MailMessage` mientras el único canal sea el correo; clave `billing.receipt.<transaccion_id>`; su implementación solo encola en `mail`. Export del token en `NotificationsWorkerModule` e importación en `BillingWorkerModule`. `InvoiceService.issue` avisa solo si el pago se aprobó y marca `aviso_encolado_en`; el reintento repone avisos pendientes. `receiptEmail` en `SubscribeResponse`.
  - Archivos: `notifications/application/ports/i-notifier.port.ts` y su implementación en `infrastructure/`, `notifications/{index,notifications-worker.module}.ts`, `packages/contracts/src/billing/subscription.ts`, `billing/billing-worker.module.ts`, `billing/application/invoice.service.ts`.
  - Prueba: prueba de `INotifier` en `notifications`; `test/int/billing/{subscribe-invoice,invoice-retry}.int-spec.ts` (aviso solo si se aprueba; reintento sin duplicar el correo).
  - Depende: T-07.

- [ ] **T-09** Historial y descarga
  - Criterio: CA-7 y CA-8. `BillingHistoryService`, `GET /api/v1/billing/history` y `GET /api/v1/billing/invoices/:id/download` (enlace de 5 minutos; factura sin PDF, ajena o inexistente → `404 BILLING_INVOICE_NOT_FOUND`).
  - Archivos: `packages/contracts/src/billing/subscription.ts`, `billing/application/billing-history.service.ts`, `billing/domain/errors/invoice-not-found.error.ts`, `billing/presentation/subscription.controller.ts`.
  - Prueba: `test/int/billing/billing-history.int-spec.ts` (historial, vacío, factura sin PDF, enlace); `test/isolation/billing.iso-spec.ts` (el cliente A no ve ni descarga lo del B; ningún rol interno lee `transaccion` ni `factura`).
  - Depende: T-06.

- [ ] **T-10** Web, pago
  - Criterio: CA-9 y los estados de la pantalla de pago (spec §6). Botón «Contratar» en `PlanCard` y `/planes` para planes con precio mayor que 0; pantalla `/planes/contratar?slug=` con formulario según RN-9, resumen con `breakdown` y los estados cargando, formulario, procesando (indicador de progreso, RNF-14), rechazado, aprobado y error con acción correctiva.
  - Archivos: `apps/web/src/components/nimbo/plan-card.tsx`, `apps/web/src/app/(public)/planes/page.tsx`, `apps/web/src/app/(app)/(cliente)/planes/contratar/{page,loading,error}.tsx`, `apps/web/src/features/billing/{subscribe-api.ts,components/payment-form.tsx,components/payment-summary.tsx}`.
  - Prueba: `plan-card.spec.tsx` y `(public)/planes/page.spec.tsx` (CA-9); `payment-form.spec.tsx` (un caso por estado y el resumen con IVA); `contratar/error.spec.tsx`.
  - Depende: T-05; el mensaje de éxito con el correo, T-08.

- [ ] **T-11** Web, `/suscripcion`
  - Criterio: CA-7 y CA-8. Plan actual e historial con descarga y los estados cargando, con facturas, vacío y error con «Reintentar».
  - Archivos: `apps/web/src/app/(app)/(cliente)/suscripcion/page.tsx`, `apps/web/src/features/billing/{billing-history-api.ts,components/invoice-history.tsx}`.
  - Prueba: `subscription-page.spec.tsx` (un caso por estado y la descarga).
  - Depende: T-09.

- [ ] **T-12** **(humana)** Recorrido local
  - Criterio: CA-1 a CA-9. Cuenta nueva con Personal, `/planes` con «Contratar» en los planes de pago, pago aprobado con factura descargable y correo, pago rechazado sin cambios, segundo pago con un plan de pago vigente rechazado, PDF repuesto tras un fallo de MinIO y la cuenta de otro cliente sin acceso.
  - Depende: T-03, T-08, T-10, T-11.

## Notas del developer

- **Compuertas resueltas (plan §8, 2026-10-14):** Adrián aprobó la exportación de `IObjectStorage` con `putObject` limitado a `invoices/`, las fachadas de `identity` y sus dos consultas, las tres funciones de lectura (ADR-0021 Aceptado) y la forma de `INotifier`, y autorizó los cambios en módulos ajenos de plan §8. Queda una compuerta: el ADR menor de la librería del PDF, aprobado antes del código de T-07.
- **Pago:** `PaymentService.charge` es el único que inserta `transaccion` y devuelve `ChargeResult`; nada lanza por un rechazo dentro de la transacción. El cobro no es idempotente (el candado evita el segundo cobro); sí lo son el oyente, la conciliación e `invoice-retry`.
- **Dominio:** `Money` no importa `packages/contracts`; `breakdown` lo llaman `InvoiceService` y el formulario.
- **Orden con la 011:** T-03, T-04 y T-05 dependen de T-09 de la 011 (`plan.desactivado_en`, `Plan`, `PERSONAL_PLAN_SLUG`, `SubscriptionAdministration`) y sus migraciones llevan fecha posterior a `agregar-desactivado-en-a-plan`. T-02 y T-06 esperan además T-03 de la 011. T-09 de la 011 mueve `i-plan-repository.ts` a `application/ports/`. T-10 y T-11 de la 011 (Fátima) deben seguir verdes con suscripciones reales.
- **Worker:** los trabajos siguen el patrón de `storage` (un `*.scheduler.ts` y un `*.processor.ts` por trabajo en `infrastructure/`) y se suman a PD-63, sin extraer. El oyente, la conciliación y el reintento escriben con el actor del dueño (`withActor`).
- **UI:** los estados de las pantallas se implementan aunque el mockup solo traiga `default` y `vigente` (Art. XIII.3).
- **Al integrar:** `pendientes.md` (PD-40 y PD-80 cerrados; PD-48 lo cierra la 008; PD-86 sigue en 010; nuevos para migrar `IDENTITY_` y `STORAGE_TOO_MANY_REQUESTS` a `SHARED_`, para el `IClientAccountScanner` de `storage` y para el redibujo del E-R), `design-findings.md` y `architecture.md` §3 (arista `billing → identity` con las dos fachadas). El squash merge elimina el commit `59d17a9`, así que no hace falta un commit de limpieza.
