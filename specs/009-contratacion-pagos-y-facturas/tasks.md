# Tareas 009 — Contratación, pagos y facturas

> Spec: `./spec.md` · Plan: `./plan.md`
> 5 a 12 tareas verticales. Un commit cada una (`feat(billing): … [009 T-xx]`).
> Cada tarea deja algo probado de punta a punta y lista sus CA. Sin tareas de «cierre»: el PR integrado lo es.

- [ ] **T-01** Suscripción Personal al verificar: migración `suscripcion` con RLS, `Subscription`, repositorio y oyente idempotente de `identity.client-account-verified`, con prueba de integración — CA: CA-1 — Archivos: `apps/api/src/migrations/*-crear-suscripcion.ts`, `billing/domain/entities/subscription.entity.ts`, `billing/application/account-verified.listener.ts`
- [ ] **T-02** Conciliación idempotente y lectura de la suscripción en `PlanLimitsAdapter` y `SubscriptionAdministration`, con prueba de integración (con fila, sin fila, repetida) — CA: CA-2 — Depende: T-01
- [ ] **T-03** `GET /plans` público con el contrato mínimo (sin desactivados) y `plan-catalog.ts` del registro usando el contrato, con prueba de integración — CA: CA-3 — Archivos: `packages/contracts/src/billing/*`, `apps/web/src/features/identity/plan-catalog.ts` — Depende: 008
- [ ] **T-04** Pago simulado hasta la suscripción: migración `transaccion`, `Money`, `SimulatedPaymentGateway`, `POST /api/v1/billing/subscribe` (aprobado, rechazado, plan no disponible, datos inválidos), con pruebas unitarias y de integración — CA: CA-4, CA-5, CA-6 — Depende: T-01
- [ ] **T-05** Factura al aprobar: migración `factura` y secuencias, `PdfInvoiceGenerator`, export de `IObjectStorage` en `storage/index.ts` (con visto bueno del `architect`) y PDF en MinIO, con prueba de integración — CA: CA-7 — Depende: T-04
- [ ] **T-06** Correo de comprobante en la cola `mail` al aprobar (y ninguno al rechazar), con prueba de integración — CA: CA-7 — Depende: T-04
- [ ] **T-07** `GET /api/v1/billing/history` y `GET /api/v1/billing/invoices/:id/download`, con pruebas de integración y de aislamiento entre clientes — CA: CA-8, CA-9 — Archivos: `billing/presentation/*`, `test/isolation/billing.isolation.spec.ts` — Depende: T-05
- [ ] **T-08** Pantalla `/planes/contratar`: formulario, tarjetas de prueba, resumen con IVA y estados procesando, rechazado y aprobado, con prueba de componente — CA: CA-4, CA-5, CA-6 — Depende: T-04
- [ ] **T-09** Pantalla `/suscripcion`: plan actual, historial de facturas, descarga y estado vacío, con prueba de componente — CA: CA-8, CA-9 — Depende: T-07
- [ ] **T-10** **(humana)** Recorrido local: cuenta nueva con Personal, `/planes` con los planes activos, pago aprobado con factura descargable y correo, pago rechazado sin cambios, y la cuenta de otro cliente sin acceso — CA: CA-1 a CA-9 — Depende: T-03, T-06, T-08, T-09

## Notas del developer

T-04 y T-08 quedan bloqueadas por las preguntas abiertas sobre el punto de entrada a `/planes/contratar` y sobre contratar con plan de pago vigente (spec §8). T-05 no se integra sin el visto bueno del `architect` sobre `storage/index.ts` (plan §8). La conciliación de T-02 y el oyente de T-01 escriben sin actor: siguen ADR-0021. Al integrar el PR se actualizan `pendientes.md` (PD-40 y PD-80 cerrados; PD-86 referenciado, sigue en 010) y `design-findings.md`.
