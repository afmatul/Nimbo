# Tareas 009 — Contratación, pagos y facturas

> Spec: `./spec.md` · Plan: `./plan.md`
> 5 a 12 tareas verticales. Un commit cada una (`feat(billing): … [009 T-xx]`).
> Cada tarea deja algo probado de punta a punta y lista sus CA. Sin tareas de «cierre»: el PR integrado lo es.

- [ ] **T-01** Migración de tablas `suscripcion`, `transaccion` y `factura` con RLS forzado y contratos Zod en `packages/contracts` — CA: CA-1, CA-4, CA-7 — Archivos: `apps/api/src/migrations/*`, `packages/contracts/src/billing/*`
- [ ] **T-02** Oyente `@OnEvent(identity.client-account-verified)` y conciliación de suscripción Personal (PD-40) con pruebas de integración — CA: CA-1, CA-2 — Depende: T-01
- [ ] **T-03** Adaptación de `PlanLimitsAdapter` y `SubscriptionAdministration` leyendo suscripción activa (PD-80, cuenta sin verificar) con prueba de integración — CA: CA-2 — Depende: T-01, T-02
- [ ] **T-04** Endpoint público `GET /plans` (PD-40, PD-86) y actualización de `apps/web/src/features/identity/plan-catalog.ts` (PD-48) con prueba de integración — CA: CA-3 — Depende: T-01
- [ ] **T-05** Value object `Money` (cálculo de subtotal e IVA 12% con redondeo) y gateway `SimulatedPaymentGateway` (4242 vs 4000) con pruebas unitarias — CA: CA-4, CA-5, RN-1, RN-2, RN-3 — Depende: T-01
- [ ] **T-06** Generador PDF `PdfInvoiceGenerator`, export acordado de `IObjectStorage` en `storage/index.ts` y guardado de facturas en MinIO con pruebas — CA: CA-4, CA-8, RN-5 — Depende: T-01
- [ ] **T-07** Encolado de comprobante por correo en la cola `mail` de `notifications` vía `IMailer` con prueba de integración — CA: CA-4 — Depende: T-01
- [ ] **T-08** Orquestación y endpoint `POST /api/v1/billing/subscribe` (cobro simulado, actualización de plan, factura y correo) con pruebas de integración — CA: CA-4, CA-5, CA-6 — Depende: T-03, T-05, T-06, T-07
- [ ] **T-09** Endpoints `GET /api/v1/billing/history` y `GET /api/v1/billing/invoices/:id/download` con prueba de integración — CA: CA-7, CA-8 — Depende: T-01, T-06, T-08
- [ ] **T-10** Suite de aislamiento entre clientes (RNF-05) para historial y facturas en `test/isolation` — CA: CA-7, CA-8 — Depende: T-08, T-09
- [ ] **T-11** Pantalla web `/planes/contratar` (formulario de pago simulado, cálculo de IVA, estados y preselección desde registro 001 CA-28) con prueba de componente — CA: CA-4, CA-5, CA-6, CA-9 — Depende: T-01, T-08
- [ ] **T-12** **(humana)** Pantalla web `/suscripcion` en `AccountMenu` (plan actual, facturas y descarga PDF) y recorrido local de la demo de punta a punta — CA: CA-1, CA-4, CA-5, CA-7, CA-8 — Depende: T-09, T-11

## Notas del developer
Resuelve PD-40 (oyente Personal, conciliación y catálogo de registro) y PD-80 (consulta de suscripción activa en límites y administración; cuenta sin verificar degrada a Personal). Aplica PD-86 excluyendo planes con `desactivado_en IS NOT NULL`. La persistencia de PDFs en MinIO utiliza `IObjectStorage`, exportado desde `storage/index.ts` con autorización requerida del `architect` en plan §8. La pantalla `/suscripcion` implementa el marco base y será reutilizada por la spec 010. Al integrar el PR se actualizará `pendientes.md` cerrando PD-40 y PD-80.
