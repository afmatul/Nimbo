# Revisión 020 — Agente con citas (API)

> Una página. La escribe `reviewer` (con `security-auditor`, `workflow.md` §4) y la aprueba Adrián.

| Campo | Valor |
|---|---|
| Fecha | 2026-10-28 (segunda pasada) |
| Rango revisado | `19c8013d..ad9e33b4`, commits `[020 …]` y `[020]` (T-FIX-1 `b43ac79e`, T-FIX-2 `ad9e33b4`) |
| CI (local) | `lint` ✅ (eslint + prettier) · `typecheck` ✅ · `pnpm test` ✅ api 2724/2724, web ✅ (una corrida completa bajo carga dio 9 fallos; repetida sola, 0: temporizadores, ver S-3) · `test:int` ✅ (165 suites, 1563 pruebas) · `test:isolation` 459/460, único fallo `billing-renewal.iso-spec.ts` (ADR-0031 010a-4, ajeno a la 020; rutas de Windows, I-3) |
| Veredicto | ✅ Aprobar (B-1 y B-2 cerrados; incluida la prueba `agent-ask.int-spec.ts › CA-18`) |

## Verificación
| CA | Prueba | Estado |
|---|---|---|
| CA-1 | `agent-ask.int-spec.ts › CA-1` (cita por formato; cita antes del texto) | ✅ |
| CA-2 | `agent-streaming.int-spec.ts › CA-2`; medición real p95 2 015 ms (plan §6) | ✅ |
| CA-3 | `agent-ask.int-spec.ts › CA-3`; `agent.service.spec.ts › CA-3` | ✅ |
| CA-4 | `answer-composer.spec.ts › CA-4`; `citation-marker-filter.spec.ts › CA-4` | ✅ |
| CA-5 | Diferido a la 012 (PD-132) | n/a |
| CA-6 | `agent-ask.int-spec.ts › CA-6` (vacía, espacios, límite+1) | ✅ |
| CA-7 | `agent-ask.int-spec.ts › CA-7`; `agent-status.int-spec.ts › CA-7`; `ISO-11` | ✅ |
| CA-8 | Pasó a la 020b | n/a |
| CA-9 | `chunk-search.int-spec.ts › CA-9`; `agent.iso-spec.ts › ISO-9/10` | ✅ |
| CA-10 | `agent-status.int-spec.ts › CA-10`; `agent-quota.int-spec.ts › CA-10` | ✅ |
| CA-11 | `agent-ask.int-spec.ts › CA-11`; `agent-quota.int-spec.ts › CA-11` | ✅ |
| CA-12 | `agent-ask.int-spec.ts › CA-12`; `agent-quota.int-spec.ts › CA-12` (reservas simultáneas) | ✅ |
| CA-13 | `agent-quota.int-spec.ts › CA-13`; `agent-usage-period.spec.ts` | ✅ |
| CA-14 | `agent-status.int-spec.ts › CA-14`; `agent-quota.int-spec.ts › CA-14` | ✅ |
| CA-15 | `agent-ask.int-spec.ts › CA-15`; `gemini-flash.model.spec.ts` | ✅ |
| CA-16 | `agent-ask.int-spec.ts › CA-16`; `ISO-14` | ✅ |
| CA-17 | `agent.iso-spec.ts › ISO-1…ISO-8`; `agent-ask.int-spec.ts › CA-17` | ✅ |
| CA-18 | `agent-ask.int-spec.ts › CA-18` (camino feliz y fallo de Postgres con `REVOKE`: 500, sin pregunta ni `parameters` en bitácora, contador en 0); `domain-exception.filter.spec.ts › CA-18` (3 casos) | ✅ |

## Seguridad
- Datos de cliente: sí. Aislamiento: `agent.iso-spec.ts` ISO-1…15 e `intelligence.iso-spec.ts` ✅ en la 1ª pasada (no reejecutadas; T-FIX no toca consultas ni RLS). `actor` + `accessibleNodes` + RLS ✅; roles internos 403 sin filas.
- Bitácoras sin contenido: ✅. **SEC-1 cerrado** (`ad9e33b4`): `domain-exception.filter.ts` registra solo `errorClass`, `errorMessage` recortado a 200 y marcos de pila (sin `query`, `parameters` ni `driverError`); la prueba del hueco falla sin la corrección (security-auditor).
- Sin bloqueantes de seguridad.
- **[SEC-2]** baja · `agent.service.ts:156` · cancelar antes del primer trozo devuelve la consulta aunque ya se pagó embedding y prompt; costo, no aislamiento (P-9/S-4). Devolver solo si se cancela antes de llamar al modelo, o registrar como riesgo aceptado.
- **[SEC-3]** baja · `file-detail-view.tsx:255-267` · `?ubicacion=` sin límite de longitud (cae en 020b).
- **[SEC-4]** informativa · `errorMessage` puede arrastrar texto del mensaje de Postgres; opcional registrar `driverError.code` en su lugar.
- Huecos de prueba: archivo compartido a un lector (pendiente de la 012), subcarpeta en papelera dentro de un ámbito de carpeta, numeración ISO repetida entre `agent` e `intelligence`.

## UI (si aplica)
- No aplica: la 020 es solo API.

## Bloqueantes
- **[B-1]** ✅ Resuelto (`b43ac79e`): `prettier --check .` y `eslint` limpios. Los cambios sin commitear en `gemini-flash.model(.spec).ts` son solo fin de línea: `git diff --ignore-cr-at-eol` queda vacío.
- **[B-2]** ✅ Resuelto (`ad9e33b4`): ver SEC-1; sin regresiones: el `domain-exception-filter.int-spec.ts` existente se ajustó a `errorClass`/`errorMessage` y `typecheck` pasa. Sin bloqueantes nuevos.

## Importantes y sugerencias
- **[I-1]** `docs/sdd/design-model.md:144`: M4 no refleja `uso_agente`, `AgentQuotaService`, `IAgentUsageRepository`→`TypeOrmAgentUsageRepository`, `agentUsagePeriod`; falta fila de mapeo `uso_agente` (DF-25).
- **[I-2]** `hybrid-retriever.ts:23-27`: `MIN_SIMILARITY = 0.66` calibrado con 12 fragmentos (margen 0.645–0.676) y sin fila en `pendientes.md`; abrir PD junto con PD-133 y la 023.
- **[I-3]** `billing-renewal.iso-spec.ts:322` falla en Windows (rutas con `\`): preexistente; registrar PD o normalizar con `path.posix`.
- **[S-1]** `agent.controller.ts:34-37`: cualquier error de esquema distinto del ámbito responde `reason: 'empty'`; anotar en el contrato del plan §4.
- **[S-2]** `agent-quota-exceeded.error.ts:4-9` repite `BILLING_DATE_FORMAT`; al tercer uso, a `shared` (Art. VI.2).
- **[S-3]** `agent-status.int-spec.ts:60,77` usan reloj real (frágil al cambio de mes); `gemini-flash.model.spec.ts:12` usa temporizadores reales (candidato a los 9 fallos bajo carga; no reprodujeron solos).
- **[S-4]** `pnpm audit --prod`: 1 crítica (`next` ≤ 15.5.27, GHSA-2464-fhr4-w9xw), 11 altas; preexistentes, fuera de 020, tratar aparte.

## DF y pendientes
- DF al día: DF-08, 14, 15, 25 (Parcial), 27, 79, 81, 82; PD-130 resuelta; PD-131…134 registradas.
- Faltan: M4 en `design-model.md` (I-1), PD de `MIN_SIMILARITY` (I-2), PD del fallo en Windows (I-3).
