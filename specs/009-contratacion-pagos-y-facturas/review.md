# Revisión 009 — Contratación, pagos y facturas

> Una página. La escribe `reviewer` (sin `security-auditor`: la 009 no está en la lista de `workflow.md` §4) y la aprueba Adrián.

| Campo | Valor |
|---|---|
| Fecha | 2026-10-15 |
| Rango revisado | `origin/main..3f2aa98` (+ estado «En revisión» sin commit), solo commits `[009]` y `402464e` (011 T-09) |
| CI | Local (2026-10-15, sobre `3f2aa98`): `pnpm lint` ✅ · `pnpm typecheck` ✅ · `pnpm test` ✅ (api 1786, web 1178, contracts 397, config 241) · `test:int` ✅ 1061/1062: el único fallo, `storage/node-tree.repository` › R-2 (plan de índices de la 006), pasa 16/16 corrido solo: intermitente y ajeno a la 009 · `test:isolation` ✅ 325/325. Tras los arreglos de esta revisión: lint, typecheck, `api` 1763, `web` 1178, `int/billing` 73 y `isolation/billing*` 27 ✅ |
| Veredicto | ✅ Aprobar, condicionado a I-1 (traer `main` y el PR-A de la 011, y volver a correr las cinco suites) e I-2 (ítem del menú, al integrar el PR-A) |

## Verificación
| CA | Prueba | Estado |
|---|---|---|
| CA-1 | `int/billing/account-verified.listener.int-spec.ts` › CA-1 (alta con actor del dueño; repetir no duplica) | ✅ |
| CA-2 | `int/billing/subscription-reconciler.int-spec.ts` › CA-2 (2); `plan-limits.adapter.int-spec.ts` › T-03 con/sin fila y RLS; `subscription-administration.int-spec.ts` (3) | ✅ |
| CA-3 | `int/billing/subscribe.int-spec.ts` › CA-3; `payment-form.spec.tsx` (aprobado con referencia) | ✅ |
| CA-4 | `subscribe.int-spec.ts` › CA-4 (402, fila `rechazada`, sigue Personal); `subscribe-invoice.int-spec.ts` › sin factura | ✅ |
| CA-5 | `subscribe.int-spec.ts` › CA-5 (no existe, `personal`, plan vigente, 422 ×3, 429), dos pagos simultáneos; desactivado solo en `subscription.entity.spec.ts` (S-1) | ✅ |
| CA-6 | `subscribe-invoice.int-spec.ts` (4) e `invoice-retry.int-spec.ts` (4: PDF caído → 201, reintento, antigüedad, aviso una vez) | ✅ |
| CA-7 | `billing-history.int-spec.ts` › CA-7; `isolation/billing.iso-spec.ts` › CA-7; `subscription-page.spec.tsx` (9) | ✅ |
| CA-8 | `billing-history.int-spec.ts` › CA-8 (300 s; sin PDF = 404); `billing.iso-spec.ts` › ajena = inexistente | ✅ |
| CA-9 | `plan-card.spec.tsx` y `(public)/planes/page.spec.tsx` › 009 CA-9 | ✅ |

## Seguridad
- Datos de cliente: sí. `suscripcion`, `transaccion` y `factura` con `ENABLE` + `FORCE`; `transaccion`/`factura` sin `UPDATE`/`DELETE` del cliente y `UPDATE` de `factura` limitado por columna a `clave_objeto` y `aviso_encolado_en` (RN-7). Trigger exige transacción aprobada del mismo usuario. Todo servicio recibe `actor` y lee con `withActor`; los repositorios usan `requireActorScope`. ✅
- Funciones `SECURITY DEFINER` (ADR-0021): `search_path` cerrado, `REVOKE … FROM PUBLIC`, `EXECUTE` solo `nimbo_app`, rol comprobado dentro (nombres: solo `ADMIN`, ≤ 100 ids; conteos: `ADMIN`/`OPERATOR`; pendientes: sin actor). Cubiertas por `billing-subscription.iso-spec.ts` (8) y `billing-invoices.iso-spec.ts`. Roles internos: `403` en las tres rutas y 0 filas directas. ✅
- RN-9 y bitácoras: solo marca y últimos 4; el CVC no pasa del controlador; `card`, `number`, `cvc`, `nit` redactados; eventos `billing.*` solo con UUID y `errorName`. `putObject` solo acepta `invoices/{uuid}/{uuid}.pdf`; enlace de 300 s; id malformado = mismo 404. ✅
- Sin hallazgos SEC. Nota: `suscripcion_administracion` y `factura_mantenimiento` (`TO CURRENT_USER`) suponen que el rol que migra es el dueño y `NOSUPERUSER` también en staging.

## UI
- Tokens de Cielo Sereno, sin hex; estados de §6 completos (cargando, formulario, procesando, rechazado, aprobado, error; con facturas, vacío, error con «Reintentar»); axe en `payment-form.spec.tsx` y `subscription-page.spec.tsx`; desviaciones del mockup documentadas en T-10/T-11 y recorridas en T-12. ✅

## Bloqueantes
- Ninguno.

## Importantes y sugerencias
- **[I-1]** Rama — está detrás de `main` (`b6475be` 008 squash y `3d8216c` 014) y `git merge-tree` da 43 conflictos (`billing`, `minio-storage.adapter.ts`, `storage.module.ts`, `error-catalog.ts`, `pendientes.md`, `design-findings.md`…). Traer `main` (y el PR-A de la 011, `arreglos-011.md` §11) y repetir las cinco suites antes del merge; esta revisión vale para `3f2aa98`.
- **[I-2]** `apps/web/src/components/nimbo/account-menu.tsx:133` — `/suscripcion` no tiene entrada en la UI (CA-7 «o `/suscripcion`»; el correo de `receipt-message.ts:25` manda allí). Agregar el ítem «Plan y facturación» solo para clientes al integrar el PR-A, como fija `arreglos-011.md` §11.2, con su prueba.
- **[I-3]** `docs/sdd/pendientes.md:61` — PD-40 sigue «Diferido a 009» y faltan las filas que promete el plan §7 (`IClientAccountScanner` de `storage` → fachada de `identity`; redibujo de M4 y E-R de DF-68). Cerrar PD-40 (puntos 1 y 2) y abrir las dos filas.
- **[I-4]** `spec.md` CA-7 / plan §4 — `BillingHistoryResponse` suma `subscription`, `paymentMethod` y `billingDetails` (NIT, correo) por el mockup (T-09/T-11). Registrarlo en la spec (§6 o registro de cambios) y en el contrato del plan: la spec es la fuente de verdad.
- **[I-5]** `specs/009-contratacion-pagos-y-facturas/.Rhistory` — archivo vacío ajeno al proyecto, entró en `3da131b`. Eliminarlo.
- **[S-1]** `apps/api/test/int/billing/subscribe.int-spec.ts:114` — sumar un plan desactivado al `it.each` (CA-5, RN-6), hoy solo probado en dominio.
- **[S-2]** `typeorm-invoice.repository.ts:21` — `FOR_ISSUE_SQL` (y los dos `UPDATE`) filtran solo por RLS; sumar `AND f.usuario_id = $2` como hace `SqlBillingHistoryReader` (defensa en profundidad).
- **[S-3]** `subscription.controller.ts:34` — `amounts` recalcula `breakdown(plan.priceCents)`; usar los montos de `invoice` (una sola fuente).
- **[S-4]** `receipt-message.ts:25` — «Mi suscripción» → «Plan y facturación»; `invoice-retrier.ts:20` dice «sin PDF» aunque también reintenta avisos.
- **[S-5]** `plan-and-billing.tsx:50` — JSDoc duplicado sobre `AccountColumn`; `contratar/page.tsx:39` — el plan no disponible es un `<p>` suelto: usar `StateView` con su `h1`.
- **[S-6]** `docs/sdd/design-findings.md:95` — el estado de DF-68 no cita T-03, T-08 ni T-09 (`ISubscriptionAdministrationReader`, `MailNotifier`, `IBillingHistoryReader`); `spec.md:12` sigue con fecha 2026-10-14.

## Estado de los hallazgos (2026-10-15)
- **Resueltos en esta revisión:** I-3 (PD-40 cerrado; PD-95 y PD-96 abiertos), I-4 (CA-7 y plan §4; el cambio de la spec queda «Pendiente Adrián» en su registro), I-5 (`.Rhistory` eliminado), S-1 (`subscribe.int-spec.ts` › plan desactivado), S-2 (`usuario_id` en las tres consultas de `typeorm-invoice.repository.ts`), S-3 (montos de la factura), S-4, S-5 (`StateView` y `h1` en `contratar/page.tsx`) y S-6.
- **Al integrar el PR-A de la 011** (`arreglos-011.md` §11): I-1 e I-2.

## DF y pendientes
- DF-68 abierto y actualizado (S-6; redibujo en PD-96). Pendientes: PD-40 y PD-80 cerrados; PD-63, PD-92 y PD-93 actualizados; PD-95 y PD-96 abiertos.

## Lo que está bien hecho
- Cobro en una sola transacción con fila Personal garantizada, `FOR UPDATE` sin `JOIN` (bug real encontrado por la prueba de concurrencia) y `ChargeResult` sin excepciones: el rechazo queda confirmado y el `402` sale después del commit.
- Emisión idempotente por pasos (`clave_objeto`, `aviso_encolado_en`, `jobId` por transacción) con reintento sin actor acotado por ADR-0021; PDF determinista.
- Aislamiento probado desde la base (permisos por columna, trigger, funciones con rol comprobado) y no solo desde la API; SRP aplicado al partir `SubscriptionCheckout`, `InvoiceIssuer` e `InvoiceRetrier`.
