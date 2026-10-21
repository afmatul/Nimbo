# Revisión 010 — Renovación, vencimiento y cambio de plan

> Una página. La escribe `reviewer` (con `security-auditor` solo si aplica, `workflow.md` §4) y la aprueba Adrián.

| Campo | Valor |
|---|---|
| Fecha | 2026-10-21 |
| Rango revisado | `origin/main...feat/010b-renovacion-web` (78 commits, 341 archivos; incluye la spec, la 010a y la 010b) |
| CI | ✅ `lint` · `typecheck` · `test` (contracts 456, api 2271, web 1649, config 244) · `test:int` 1391/1392 en local (falla solo `dotenv-bootstrap`, por el `.env` de desarrollo; en el CI de `5260d01` pasa) · `test:isolation` 416/416 |
| Veredicto | ✅ Aprobar el código: no hay bloqueantes. Antes del merge faltan las condiciones de proceso del final |

## Verificación
Rutas: `int/` = `apps/api/test/int/billing/`, `iso/` = `apps/api/test/isolation/`, `app/` = `apps/api/src/modules/billing/application/`, `web/` = `apps/web/src/`.

| CA | Prueba principal | Estado |
|---|---|---|
| CA-1, CA-2, CA-7, CA-20, CA-21, CA-29 | `int/subscription-renewal.int-spec.ts` (un caso por CA; CA-7 también sin referencia); `app/renewal-checkout.spec.ts` | ✅ |
| CA-3 | `int/subscription-renewal.int-spec.ts › CA-3, RN-9: dos pasadas y una manual…` | ✅ |
| CA-4, CA-23 (conteos) | `app/renewal-runner.spec.ts` | ✅ |
| CA-5 | `int/subscription-renewal.int-spec.ts › CA-5, RN-8`; `app/renewal-messages.spec.ts`; `iso/billing-renewal.iso-spec.ts › suscripciones_por_avisar` | ✅ |
| CA-6, CA-16 a CA-19, CA-22, CA-25, CA-27 | `int/subscription-settings.int-spec.ts`; `app/subscription-settings.service.spec.ts`; web `plan-and-billing.spec.tsx`, `plan-change-list.spec.tsx` | ✅ |
| CA-8 a CA-11, CA-26, CA-28 | `int/renew.int-spec.ts`; web `suscripcion/renovar/page.spec.tsx` (también CA-20 y CA-29 en el resumen del pago) | ✅ |
| CA-10 (vuelve a subir), CA-12, CA-13 | `apps/api/test/int/storage/read-only.int-spec.ts` (10 rutas bloqueadas y 12 permitidas; falla si aparece una ruta sin clasificar) | ✅ |
| CA-14 | web `my-files.spec.tsx`, `papelera/page.spec.tsx`, `file-detail-view.spec.tsx`, `read-only-banner.spec.tsx` | ✅ |
| CA-15 | `domain/entities/subscription.entity.spec.ts`; `int/renovacion-migration.int-spec.ts › CA-15` | ✅ |
| CA-23 (403), CA-24 | `iso/billing-renewal.iso-spec.ts` (4 rutas × 3 roles; A/B; dueño sin superusuario; funciones con actor fallan; `PUBLIC` sin EXECUTE) | ✅ |
| RN-2, RN-10, migraciones | `simulated-payment-gateway.spec.ts`, `payment.service.spec.ts`, `subscribe.int-spec.ts › 010 RN-2`, `subscription-renewal › RN-10`, `renovacion-migration.int-spec.ts` (`down`/`up`) | ✅ |

Los 29 CA tienen prueba con su nombre. En CA-12 solo se ejercitan listar y descargar; buscar y previsualizar quedan
cubiertos porque ninguna ruta `GET` pasa por `WritableAccountPolicy`.

## Seguridad
- **Datos de cliente:** cada servicio recibe `actor` y usa `withActor` y `lockCurrent` (`FOR UPDATE`).
  `suscripciones_por_renovar` y `suscripciones_por_avisar` siguen ADR-0021 (`SECURITY DEFINER`, `search_path` cerrado,
  solo ids, tope de 1000, fallan con actor, `REVOKE … FROM PUBLIC`); la prueba ISO comprueba que el dueño no es
  superusuario ni tiene `BYPASSRLS`. ✅
- **Referencia del instrumento (ADR-0031):** solo la selecciona `findLastApprovedCard` (renovador y aviso, `worker`),
  comprobado por una prueba ISO sobre el código; las respuestas son listas blancas; redactada en bitácoras; no llega a
  auditoría ni a correos. ✅
- **Roles internos:** `@Roles(CLIENT)` en la clase; 403 probados. **Bitácoras:** solo conteos, nombre de error y `code`. ✅
- Sin hallazgos de seguridad: no hizo falta el `security-auditor`.

## UI
- Estados de §6 con prueba: 8 de `billing/suscripcion` más Personal, 5 de `planes`, 4 de `pago--renovacion*` y el aviso
  de solo lectura en explorador, papelera y ficha. Textos de §6 y mensajes de CA-13 y CA-17 literales.
- Sin hex ni valores arbitrarios en `apps/web`; axe sin `serious`/`critical` en las pantallas de la 010.
- Desviaciones del mockup documentadas en las notas de `tasks.md`. ✅

## Bloqueantes
- Ninguno.

## Sugerencias (no bloquean)
- **S-1** `web/features/billing/components/renewal-payment.tsx` y `plan-change-page.tsx`: tras renovar o tras CA-27 no se
  llama a `useSpace().refresh()`; hoy no se nota porque el menú recarga la página. Llamarlo y probarlo.
- **S-2** «es gratis» como `priceCents === 0` en seis lugares de la web: extraer `isFreePlan(plan)` (Art. VI.2).
- **S-3** `auto-renew-switch.tsx`: en solo lectura dice «Podrás activarla cuando renueves», pero RN-3 conserva el valor;
  decir «Se mantendrá activada» si `autoRenew`.
- **S-4** `app/subscription-settings.service.ts:19`: JSDoc huérfano.
- **S-5** `apps/api/test/int/storage/read-only.int-spec.ts:40`: `route()` con 4 parámetros.
- **S-6** `seriousViolations` de axe repetido en las pruebas web (deuda previa): llevarlo a un ayudante compartido.

## DF y pendientes
- **DF-77** coincide con el código. `design-model.md` §M4 y `architecture.md` §6.6 se actualizan al aceptar los ADR
  (están en sus «Documentos a actualizar»).
- **PD-119** cerrado; **PD-121** y **PD-122** abiertos y coinciden con el código; **PD-120** sigue (axe del marco de
  mockups); **PD-86** cerrado.

## Condiciones antes del merge (proceso)
1. Aprobación del plan por Adrián (plan §8) y aceptación de **ADR-0031** y **ADR-0032**, con sus documentos.
2. Autorización de los cambios en módulos ajenos: `storage` y su web, `audit`, `shared` y `editing`.
3. Integrar en orden #63 → #69 → #70 (base del #70 a `main` después del #69).
