# Revisión 008 — Catálogo y comparador

| Campo | Valor |
|---|---|
| Fecha | 2026-10-14 |
| Rango revisado | `92c713c..67f3e94` (`main...feat/008-catalogo-y-comparador`) |
| CI | ✅ PR #49, run 38681982742 (lint, typecheck, unit, integration + isolation) |
| Veredicto | ✅ Aprobar (sin bloqueantes; I-1 antes del merge, I-2 antes de `Hecha`) |

## Verificación
| CA | Prueba | Estado |
|---|---|---|
| CA-1 | `test/int/billing/plans-catalog.int-spec.ts` › anónimo recibe los cuatro planes por precio con bytes como cadena; con sesión, lo mismo · `plan-repository-order.int-spec.ts` › RN-2 desempate por `slug` · `plans.controller.spec.ts` (lista blanca, vacío, `slug` fuera de la semilla) · `contracts/billing/schemas.spec.ts` (bytes texto, precio entero, `.strict()`) | ✅ |
| CA-2 | `plan-comparison-table.spec.tsx` (nueve filas en orden, «Solo lectura», «—», quetzales, bytes) · `plan-card.spec.tsx` · `format-plan.spec.ts` · `planes/page.spec.tsx` (lectura en servidor, éxito, vacío) | ✅ |
| CA-3 | `typeorm-plan.repository.spec.ts` (solo la consulta se traduce) · `plan-catalog.service.spec.ts` (bitácora sin SQL; `TypeError` intacto) · `plans.controller.spec.ts` · `plan-catalog-api.spec.ts` (500, cuerpo inválido, red) · `planes/error.spec.tsx` (mensaje y «Recargar») | ✅ (+ prueba HTTP extremo a extremo de S-1) |

Comandos locales: typecheck ✅; `test:int` ✅ (101 suites, 947 pruebas); `test` ✅ salvo `redact-deep.spec.ts:181`, prueba de tiempo ajena a la rama, que pasa al repetirla; lint ✅ fuera de `.claude/worktrees` (S-4).

## Seguridad
- Datos de cliente: no. Aislamiento: no aplica (CI ✅). `actor` + `accessibleNodes`: no aplica; catálogo global (plan §5).
- Ruta en la lista cerrada de públicas; respuesta por lista blanca y esquema `.strict()`; sin plan actual ni datos de cuenta; anónimo = con sesión.
- Bitácoras sin contenido, nombres de archivo, tokens ni contraseñas: ✅ (`event`, `code`, `errorName`).
- Hallazgos: ninguno. Sin límite de tasa, como `health`; se evalúa en la 023 (PD-88).

## UI
- Coincide con la referencia de `planes` sin el cromo de `plan-actual` (spec §6). Estados cargando, éxito, error y vacío presentes. Solo tokens (`bg-muted/10`, `border-border`); `tabular-nums`; tabla con `caption`, `scope` y `th` de fila. Textos en español.
- Falta axe en las pantallas nuevas: I-1.

## Bloqueantes
Ninguno.

## Importantes y sugerencias
- **[I-1]** `plan-card.spec.tsx`, `plan-comparison-table.spec.tsx`, `planes/page.spec.tsx`: sin `expectNoA11yViolations` (constitución, lista de cierre: axe). Agregarlo a la tarjeta, la tabla y la página (éxito y vacío). ✅ Atendido.
- **[I-2]** Hacer commit de `spec.md` («En revisión») y `specs/README.md`. Antes de `Hecha`, Adrián decide PD-92. ✅ Commit hecho; PD-92 decidido por Adrián (2026-10-14): «Ver planes» espera a la 009.
- **[S-1]** `plans-catalog.int-spec.ts`: caso con el repositorio sustituido para que falle → `500` `{ code: 'BILLING_PLAN_CATALOG_UNAVAILABLE', message, correlationId }`. ✅ Atendido.
- **[S-2]** `billing.module.ts:16` exporta `TypeOrmModule`: que `BillingHttpModule` importe `TypeOrmModule.forFeature([PlanOrmEntity])` y `BillingModule` exporte solo `PlanLimitsAdapter`. ✅ Atendido.
- **[S-3]** `plan-comparison-table.tsx:62`: quitar `hover:bg-muted/5` de filas que no se pueden pulsar. ✅ Atendido.
- **[S-4]** (fuera de la spec) `.claude/**` en los `ignores` de `eslint.config.mjs`. Va en una rama `chore/` aparte.

## Lo que está bien hecho
- Capas limpias: la aplicación no conoce `PlanOrmEntity`. `IPlanRepository` es interno de `billing`, permitido por el Art. V.2(b), y `BillingHttpModule` deja al `worker` sin la ruta, con prueba.
- El `catch` está acotado a la consulta: un defecto de programación no se disfraza de CA-3.
- Un solo formateador (`lib/format-plan.ts`), que ahora también usa `plan-picker`. Se cierra PD-48: el registro lee la ruta de `contracts` y se borró el esquema local.
- Las pruebas nombran su CA y cubren límites: `slug` fuera de la semilla, descripción nula, empate de precio.

## DF y pendientes
- DF-67 nuevo y reflejado en `design-model.md` (M4). PD-48 cerrado; PD-76 resuelto; PD-91 nuevo y abierto; PD-92 cerrado (espera a la 009).
