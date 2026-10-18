# Tareas 010 — Renovación, vencimiento y cambio de plan

> Spec: `./spec.md` · Plan: `./plan.md`
> Estado: **Borrador — pendiente de la aprobación del plan por Adrián (`plan.md` §8) y de ADR-0029.**
> Se adelantan por decisión de Juan Marcos; si Adrián cambia el plan o el ADR, estas tareas se ajustan antes de `/implement`.
> 5 a 12 tareas verticales, de medio día a un día, un commit cada una (`feat(billing): … [010 T-xx]`).
> Cada tarea deja algo probado de punta a punta y lista sus CA. Sin tareas de «cierre»: el PR integrado lo es.

**Compuertas generales (antes de T-01)**
- Todo se implementa sobre la **009 ya integrada en `main`** (PR #62): la rama de la 010 se rehace desde `main` después del merge.
  Las pruebas de la 009 que cambian (`Subscription`, `PaymentService`, `IPaymentGateway`, `SubscriptionService`) se ajustan en la tarea que las toca.
- **PD-63 hecho antes** (refactor que pidió Adrián): el patrón planificador + procesador, el bucle de reintento por elemento y
  `errorName` ya están extraídos. T-04 los reutiliza; no crea una séptima copia.
- Módulos ajenos (`[Adrián]`): solo con su autorización del plan §8. `storage` y su web, además, con **ADR-0029 aceptado** (T-06, T-11).
- UI: antes de T-08 a T-11 existen los mockups. Ya están el aviso de solo lectura (`shared/layout/layout--solo-lectura.html`),
  la lista de planes (`billing/planes/planes--plan-actual.html`) y el pago (`billing/pago/pago.html`); `/mockup` crea los cuatro
  estados que faltan de `billing/suscripcion/`, la confirmación del cambio de plan con el aviso de versiones de CA-21
  (referencia: `storage/ficha-archivo/ficha-archivo--aviso-de-poda.html`) y la variante de renovación del pago. Antes de cada
  pantalla se leen sus capturas en `docs/design/capturas/`; las desviaciones van a «Notas del developer».
- Funciones ≤ 30 líneas y ≤ 3 parámetros; cada tarea de lógica empieza por su prueba en rojo; nombres de prueba `'CA-n: …'`.

- [ ] **T-01** Datos y dominio de la suscripción: estado, renovación automática y cambio programado
  - Criterio: CA-15; RN-1, RN-3, RN-5, RN-7 y la regla de `renewalQuote` de CA-26 y CA-28 (unidad).
  - Archivos: `apps/api/src/migrations/*-renovacion-de-suscripcion.ts` (plan §3, con `down`); `billing/domain/subscription.entity.ts`
    (`status`, `autoRenew`, `pendingPlanId`, `reminderSentFor`, `expiredNoticeFor`; `isReadOnly`, `scheduleChange`, `cancelChange`,
    `applyPendingChange`, `setAutoRenew`, `renewWith`, `expire`, `renewalQuote`, `isDue`; `subscribeTo` deja `autoRenew` y `vigente`);
    `billing/domain/errors/{no-paid-subscription,plan-change-invalid,no-pending-plan-change,already-renewed,plan-change-pending}.error.ts`;
    `packages/contracts/src/billing/error-codes.ts` (cinco códigos); `ports/i-subscription-repository.port.ts` (`findStanding`, columnas
    nuevas en `lockCurrent` y `save`) y `typeorm-subscription.repository.ts`; `plan-limits.adapter.ts` pasa a `findStanding` (solo `planId`
    aquí); `audit/application/{audit-action,audit-catalog}.ts` [Adrián] con las nueve acciones de plan §2.
  - Prueba: unit `subscription.entity.spec.ts` (inicio del periodo vigente o en solo lectura, plan del siguiente ciclo, `scheduleChange`
    inactivo, mismo y desde Personal, `renewalQuote`, Personal nunca vence); int `migrations.int-spec.ts` (`up → down → up`, los tres `CHECK`).
  - Depende: 009 en `main`.

- [ ] **T-02** Renovación manual `POST /api/v1/billing/renew`
  - Criterio: CA-8, CA-9, CA-10 (periodo desde el pago y salida de solo lectura), CA-11, CA-20 (manual), CA-26, CA-28, CA-29 (descarte
    en la manual); RN-4, RN-9.
  - Archivos: `packages/contracts/src/billing/subscription.ts` (`cardSchema` exportado, `renewRequestSchema`, `paymentReceiptSchema` con los
    alias `SubscribeResponse` y `RenewResponse`); `billing/application/payment-attempt-limiter.ts` (extraído de `SubscriptionService`, clave
    única `billing:payment:{actor}`); `invoice-issuer.ts` (`issueAfterCommit` sale de `SubscriptionService`); `renewal-checkout.ts`;
    `manual-renewal.service.ts`; `presentation/subscription.controller.ts` (ruta `renew`, `@Roles(CLIENT)`, `402` después del commit);
    `billing.module.ts`, `billing-http.module.ts` (`AuditModule`, `RenewalCheckout`, `ManualRenewalService`).
  - Prueba: unit `renewal-checkout.spec.ts` (aprobada, rechazada manual sin cambios, plan programado aplicado, plan descartado);
    int `renew.int-spec.ts` (aprobada desde `vence_en`, `402` sin cambios, desde solo lectura desde `now` y `estado = 'vigente'`, Personal
    `400`, `409 BILLING_ALREADY_RENEWED` por adelantado y por `expectedExpiresAt` viejo, `409 BILLING_PLAN_CHANGE_PENDING`, auditoría);
    las int de contratación de la 009 siguen verdes con el limitador compartido.
  - Depende: T-01.

- [ ] **T-03** Renovación automática, cambio de plan y vista de la suscripción (API)
  - Criterio: CA-6, CA-16, CA-17 (incluye PD-86: plan desactivado rechazado), CA-18, CA-19, CA-22, CA-27, CA-25 (datos de la vista).
  - Archivos: `packages/contracts/src/billing/subscription.ts` (`autoRenewRequestSchema`, `planChangeRequestSchema`), `billing/history.ts`
    (`subscriptionViewSchema`); `billing/application/subscription-settings.service.ts`; `billing-history.service.ts` y
    `infrastructure/persistence/sql-billing-history.reader.ts` (vista con `renewalQuote`, tarjeta del último pago, estado `expiring`);
    `presentation/subscription.controller.ts` (`PUT`/`DELETE /subscription/plan-change`, `PUT /subscription/auto-renew`),
    `subscription-view.response.ts`; `apiEnvSchema` y `.env.example` [Adrián] con `RENEWAL_REMINDER_DAYS` (1–7, por defecto 3).
  - Prueba: int `subscription-settings.int-spec.ts` (feliz y error principal por ruta: apagar y encender sin tocar `vence_en`, Personal `400`,
    programar y reemplazar, plan desactivado o mismo `400 BILLING_PLAN_CHANGE_INVALID`, cancelar `200` y `404`, a Personal desde solo
    lectura aplicado de inmediato; la auditoría de cada caso); `GET /billing/history` devuelve `subscription` con `nextCharge` y `renewal`;
    `pnpm env:check`.
  - Depende: T-01 (comparte controlador con T-02; si van en paralelo, se integra antes del commit).

- [ ] **T-04** Pasada del `worker`: renovación automática, vencimiento y aviso previo
  - Criterio: CA-1, CA-2, CA-3, CA-4, CA-5, CA-7, CA-20 (automática), CA-21, CA-29, CA-23 (conteos agregados en la bitácora); RN-2, RN-8,
    RN-10.
  - Archivos: `apps/api/src/migrations/*-funciones-de-renovacion.ts` (`suscripciones_por_renovar`, `suscripciones_por_avisar` con el tope
    1–7 y la política `suscripcion_mantenimiento`, ADR-0021, con `down`); `billing/domain/payment-card.ts` (`SavedCard`, único tipo sin número);
    `ports/i-payment-gateway.port.ts` y `adapters/simulated-payment-gateway.ts` (`authorize(last4, amount)`, la marca la da la pasarela);
    `payment.service.ts` (acepta `PaymentCard` o `SavedCard`); `findLastApprovedCard` y `findLatestNit` en los puertos y repositorios de
    pago y factura; `ports/i-due-subscription.scanner.port.ts` y `sql-due-subscription.scanner.ts`; `application/{subscription-renewer,
    renewal-reminder.service,renewal-runner,renewal-config}.ts`; `mail-message.ts`, `receipt-message.ts`, `renewal-messages.ts` (aviso previo,
    vencida, cambio descartado; claves sin `:`); `infrastructure/{renewal.scheduler,renewal.processor}.ts` **sobre la extracción de PD-63**;
    `billing-worker.module.ts`; `workerEnvSchema`, `.env.example` y `apps/api/src/worker.module.ts` [Adrián] (`SUBSCRIPTION_RENEWAL_*`,
    `RENEWAL_REMINDER_DAYS`, `subscription-renewal` en `WORKER_QUEUES`).
  - Prueba: unit `simulated-payment-gateway.spec.ts`, `payment.service.spec.ts` (`SavedCard` sin validar vencimiento), `renewal-runner.spec.ts`
    (un fallo no frena a las demás, la pasada falla al final con `RenewalRunIncompleteError`, `billing.renewal_run` solo con conteos y
    `billing.renewal_failed` con `errorName` y `code`); int `subscription-renewal.int-spec.ts` con `vence_en` sembrado relativo a `now()`
    (aprobada `4242` con NIT de la última factura o `CF`, factura y correo; rechazada `0002` en solo lectura con el mismo plan y correo de
    vencida; renovación apagada; cambio a plan de pago aplicado o, si se rechaza, conservado; a Personal sin cobro y con uso mayor que su
    cuota → la carga siguiente `STORAGE_QUOTA_EXCEEDED`; plan programado desactivado → descartado y correo; dos pasadas y una manual
    simultánea → un cobro y una factura; Personal nunca listado); int `renewal-reminder.int-spec.ts` (un correo por periodo en dos pasadas,
    con tarjeta o con aviso de solo lectura).
  - Depende: T-01, T-02 (`RenewalCheckout`, `InvoiceIssuer`); **PD-63 hecho antes**.

- [ ] **T-05** Aislamiento y roles internos de la 010
  - Criterio: CA-23 (`403` y nada cambia), CA-24; RNF-05.
  - Archivos: `apps/api/test/isolation/billing-renewal.iso-spec.ts`; `apps/api/test/int/billing/billing-internal-roles.int-spec.ts`.
  - Prueba: iso (A cambia solo su fila y no ve la de B; `nimbo_app` sin actor ve 0 filas; con actor `CLIENT` o interno las dos funciones
    fallan; `PUBLIC` no las ejecuta; dueño sin `SUPERUSER`); int (las cuatro rutas × Administrador, Soporte y Operador → `403 SHARED_FORBIDDEN`
    sin cambios en la fila ni en la auditoría).
  - Depende: T-02, T-03, T-04. El caso «la solo lectura de A no afecta las cargas de B» se suma al terminar T-06.

- [ ] **T-06** Solo lectura en `storage` con `PlanLimits.readOnly` [Adrián]
  - **Compuerta**: ADR-0029 aceptado y cambios en `storage` autorizados por Adrián (plan §8).
  - Criterio: CA-12, CA-13, CA-10 (vuelve a poder subir tras renovar); RN-6; caso de CA-24 sobre cargas de B.
  - Archivos: `packages/contracts/src/storage/{error-codes,space-schemas}.ts` (`STORAGE_ACCOUNT_READ_ONLY`, `readOnly` en el resumen);
    `storage/application/plan-limits.ts` (`readOnly`), `storage/domain/errors/account-read-only.error.ts`,
    `storage/application/writable-account.policy.ts` (`assertWritable`, `assertWritableLimits`), `storage/index.ts`; los diez métodos de
    plan §2 (`upload.service.ts` `init`/`complete`, `folder.service.ts` `create`/`rename`/`move`, `file.service.ts` `rename`/`move`,
    `version-restore.service.ts` `restore`, `trash.service.ts` `restoreFile`/`restoreFolder`) y `space-summary.service.ts`;
    `billing/infrastructure/adapters/plan-limits.adapter.ts` (`PlanStorageLimits`; solo `limitsFor` compone `readOnly`, `false` sin fila o
    rol interno); `apps/api/test/support/fake-plan-limits.provider.ts`.
  - Prueba: unit `writable-account.policy.spec.ts`, `plan-limits.adapter.spec.ts`; int `storage/read-only.int-spec.ts` con la tabla explícita
    de rutas de escritura (diez bloqueadas con el mensaje literal y sin cambios; papelera, purga, vaciar, accesos rápidos, `resume` y
    `cancel` permitidas; lecturas, búsqueda, vista previa y descarga iguales) y renovar desde solo lectura → la carga vuelve a aceptarse;
    caso de B en `billing-renewal.iso-spec.ts`. Las int de `storage` existentes siguen verdes con el doble.
  - Depende: T-01, T-02.

- [ ] **T-07** Catálogo de errores y etiquetas de auditoría en la web
  - Criterio: CA-9, CA-11, CA-17, CA-19, CA-26, CA-28 (textos visibles de los códigos), CA-22 (la actividad se lee en español).
  - Archivos: `apps/web/src/lib/error-catalog.ts` (cinco códigos de `billing`); `apps/web/src/features/audit/activity-labels.ts` [Adrián]
    (nueve acciones); `features/billing/subscription-api.ts` (las cuatro mutaciones con `authFetch`).
  - Prueba: web, prueba del catálogo (cada código nuevo con su texto) y de las etiquetas; prueba de `subscription-api` con `fetch` simulado
    (rutas, cuerpo y error con `code`).
  - Depende: T-01, T-02, T-03.

- [ ] **T-08** Pantalla «Plan y facturación» con sus cinco estados
  - **Compuerta**: mockups de `billing/suscripcion/` (vigente, por vencer, vencida/solo lectura, cambio programado, renovación desactivada).
  - Criterio: CA-25, CA-6 (interruptor con confirmación al apagar), CA-19 («Cancelar cambio»), CA-28 (sin «Renovar ahora»), CA-16 (texto
    «Tu plan cambiará a <plan> el <fecha>»), textos literales de spec §6.
  - Archivos: `features/billing/components/{plan-and-billing,current-plan-card}.tsx`; nuevos `next-charge-card.tsx`, `auto-renew-switch.tsx`,
    `subscription-status-notice.tsx`, `pending-change-notice.tsx`; `StateView` para cargando y error; solo tokens de `ui-guidelines.md`.
  - Prueba: web `plan-and-billing.spec.tsx`, un caso por estado más Personal, con axe; interruptor y cancelar llaman a la API y refrescan.
  - Depende: T-07; mockups.

- [ ] **T-09** Elegir plan para el cambio (`/suscripcion/cambiar-plan`)
  - **Compuerta**: mockup `billing/planes/` (`plan-actual`) con la confirmación y el aviso de versiones de CA-21.
  - Criterio: CA-16, CA-17 (solo planes activos, PD-86; error), CA-18 (desde Personal lleva a `/planes/contratar`), CA-21 (la confirmación
    avisa del recorte de versiones si `retainedVersions` baja), CA-27 (a Personal desde solo lectura, aplicado al confirmar).
  - Archivos: `app/(app)/(cliente)/suscripcion/cambiar-plan/{page,loading,error}.tsx`; `features/billing/components/plan-change-list.tsx`
    (reutiliza `PlanCard` de la 008 y `GET /billing/plans`).
  - Prueba: web `plan-change-list.spec.tsx` (lista con el actual marcado, confirmación con y sin aviso de versiones, error del servidor,
    Personal → contratación) con axe.
  - Depende: T-07; mockup.

- [ ] **T-10** Pago de la renovación manual (`/suscripcion/renovar`) y `ReadOnlyBanner`
  - **Compuerta**: variante de renovación de `billing/pago/` (default con el periodo nuevo, rechazado, éxito). El aviso de solo lectura ya tiene mockup: `shared/layout/layout--solo-lectura.html`.
  - Criterio: CA-8 (resumen con el periodo nuevo antes de pagar), CA-9 (rechazo `402` visible, nada cambia), CA-10 (éxito desde solo
    lectura), CA-26 (mensaje de `409`); el componente del aviso de CA-14.
  - Archivos: `app/(app)/(cliente)/suscripcion/renovar/{page,loading,error}.tsx`; `features/billing/components/{payment-form,payment-summary}.tsx`
    y `hooks/use-payment-form.ts` (reciben la acción de envío y el resumen; la contratación de la 009 sigue igual);
    `apps/web/src/components/nimbo/read-only-banner.tsx` («Renovar plan» → `/suscripcion/renovar`).
  - Prueba: web `renovar/page.spec.tsx` (default, rechazado, éxito, `409`) y `read-only-banner.spec.tsx`, con axe; las pruebas de pago de la
    009 siguen verdes.
  - Depende: T-07; mockups.

- [ ] **T-11** Explorador en solo lectura [Adrián]
  - **Compuerta**: ADR-0029 aceptado y cambios en la web de `storage` autorizados. Mockup: `shared/layout/layout--solo-lectura.html` (ya existe).
  - Criterio: CA-14 (aviso con «Renovar plan», acciones de CA-13 deshabilitadas con explicación en texto, arrastre con el mensaje de CA-13);
    las acciones permitidas por RN-6 (papelera, vaciar, accesos rápidos) siguen activas.
  - Archivos: `apps/web/src/lib/error-catalog.ts` (`STORAGE_ACCOUNT_READ_ONLY`, literal); `features/storage/components/space-provider.tsx`
    (`readOnly` del resumen de espacio) y el explorador (`my-files`, barra de acciones, papelera, historial de versiones).
  - Prueba: web `my-files.spec.tsx` (acciones deshabilitadas con texto, permitidas activas, mensaje al arrastrar) con axe.
  - Depende: T-06, T-10.

- [ ] **T-12** **(humana)** Recorrido de la demo en local y nota en el PR — CA: CA-1, CA-2, CA-5, CA-6, CA-8, CA-10, CA-13, CA-14, CA-16,
  CA-19, CA-21, CA-25. Cliente con plan de pago: ve «Próximo cobro», apaga y enciende la renovación, programa y cancela un cambio (con el
  aviso de versiones al bajar); se siembra `vence_en` cercano y vencido para ver el correo del aviso y la pasada (`4242` renueva con factura
  en Mailpit; `0002` deja la cuenta en solo lectura); el explorador muestra el aviso y bloquea la carga; renovar a mano con `4242` devuelve
  la carga. — Depende: T-01 a T-11.

## Trazabilidad CA → tarea
| CA | Tarea(s) | CA | Tarea(s) | CA | Tarea(s) |
|---|---|---|---|---|---|
| CA-1 | T-04, T-12 | CA-11 | T-02, T-07 | CA-21 | T-04, T-09 |
| CA-2 | T-04 | CA-12 | T-06 | CA-22 | T-01, T-03, T-07 |
| CA-3 | T-04 | CA-13 | T-06 | CA-23 | T-04 (conteos), T-05 |
| CA-4 | T-04 | CA-14 | T-10, T-11 | CA-24 | T-05, T-06 |
| CA-5 | T-04 | CA-15 | T-01, T-04 | CA-25 | T-03, T-08 |
| CA-6 | T-03, T-08 | CA-16 | T-03, T-08, T-09 | CA-26 | T-01, T-02, T-10 |
| CA-7 | T-04 | CA-17 | T-03, T-09 | CA-27 | T-03, T-09 |
| CA-8 | T-02, T-10 | CA-18 | T-03, T-09 | CA-28 | T-01, T-02, T-08 |
| CA-9 | T-02, T-10 | CA-19 | T-03, T-08 | CA-29 | T-02, T-04 |
| CA-10 | T-02, T-06, T-10 | CA-20 | T-02, T-04 | | |

## Notas del developer
<Desviaciones (con enlace al registro de cambios de la spec), DF o pendientes que surgieron. Al implementar: DF-70 en
`design-findings.md` (plan §7), PD-86 se cierra, PD-96 se amplía con lo de la 010 y se registran los pendientes nuevos de plan §7
(conteos al momento para el Operador; `readOnly` del propietario en 012, 013, 016 y 021).>
