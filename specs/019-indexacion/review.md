# Revisión 019 — Indexación de documentos

| Campo | Valor |
|---|---|
| Fecha | 2026-10-23 |
| Rango revisado | `main..6199c1da` (24 commits) + re-revisión T-FIX `23c1bf58..d80fe5a9` (4 commits) |
| CI | Pasada 1: lint ✅ · typecheck ✅ · test ✅ · test:int ✅ 1352/150 · test:isolation ✅ 393/25 (en serie). Pasada T-FIX: lint ✅ · typecheck ✅ · test ✅ (api 2404/256, web 1466/181, contracts 457, config 246) · test:int intelligence+realtime+editing+worker ✅ 219/25 (`indexing-retries` CA-12 falló una vez en paralelo con las unitarias y pasa 3/3 aislada: carga) · test:isolation intelligence+realtime+editing ✅ 38/3 |
| Veredicto | ✅ Aprobar (I-1..I-3 resueltos; sin bloqueantes) |

## Verificación
| CA | Prueba | Estado |
|---|---|---|
| CA-1 | `docx.extractor.spec`, `chunker.spec`, `indexing-run.int-spec` + recorrido T-11 | ✅ |
| CA-2 | `pdf.extractor.spec`, `pdf-extraction.int-spec` | ✅ |
| CA-3 | `plain-text.extractor.spec`, `chunker.spec` | ✅ |
| CA-4 | `pdf.extractor.spec`, `pdf-extraction.int-spec`, `indexing-banner.spec` | ✅ |
| CA-5 | extractores `*.spec`, `indexing-run.int-spec` | ✅ |
| CA-6 | `xlsx/pptx.extractor.spec`, `indexing-run.int-spec`, `file-version-created.int-spec` | ✅ |
| CA-7 | `indexing-run.int-spec`, `chunker.spec`, bombas zip en extractores | ✅ |
| CA-8 | `file-version-created.int-spec`, `indexing-run.int-spec` | ✅ |
| CA-9 | `indexing-run.int-spec`, `index-reconcile.int-spec`, `indexing.repository.int-spec`, `file-indexing.spec` (`isAwaitingWorker`, T-FIX-1) | ✅ |
| CA-10 | `indexing-run.int-spec`, `chunk.repository.int-spec` | ✅ |
| CA-11 | `indexing-run.int-spec` (50 p., ≈ 3,4 s) + Gemini real | ✅ |
| CA-12 | `indexing-retries.int-spec`, `gemini-embedding.provider.spec`, `indexing.processor.spec` | ✅ |
| CA-13 | `indexing-status.int-spec`, `index-status.service.spec`, `indexing-banner.spec` | ✅ |
| CA-14 | `indexing-status.int-spec`, `use-indexing-status.spec` | ✅ |
| CA-15 | `indexing-status.int-spec`, `migrations.int-spec` | ✅ |
| CA-16 | `indexing-run.int-spec`, `intelligence.iso-spec` | ✅ |
| CA-17 | `intelligence.iso-spec`, `chunk.repository.int-spec` | ✅ |
| CA-18 | `intelligence.iso-spec`, `indexing-status.int-spec` | ✅ |
| CA-19 | Vista: `indexing-banner.spec`; servidor con lector espera a 012 (PD-120) | ⏸ |
| CA-20 | `intelligence.iso-spec`, `migrations.int-spec`, `indexing-status.int-spec` | ✅ |
| CA-21 | `indexing-logs-audit.int-spec` | ✅ |
| CA-22 | `indexing-run.int-spec` (suscripción vencida) | ✅ |
| CA-23 | `index-reconcile.int-spec`, `index-reconciler.spec` (tope `MAX_LOGGED_IDS`, T-FIX-3) + recorrido | ✅ |

## Seguridad
- Datos de cliente: sí. ISO-1 a ISO-11 en `intelligence.iso-spec.ts` (verde también tras T-FIX). `nearest` filtra en CTE `MATERIALIZED` antes de `<=>` (DF-14); RLS `ENABLE`+`FORCE` solo `CLIENT`; el worker actúa como `createActor(ownerId, CLIENT)`. ✅
- Bitácoras: solo ids, estado, motivo, `durationMs`, `errorClass` (ahora una sola `errorClassOf` en `shared`, nunca el mensaje); `index.reconcile_completed` sigue sin nombres ni texto y ahora está acotada. ✅
- `GEMINI_API_KEY` solo en el worker; archivos no confiables acotados (zip 64 MiB, Ghostscript `-dSAFER` sin shell). Hallazgos [SEC]: ninguno.

## UI
- Ficha = mockup en sus 10 estados; solo tokens; axe 360/1440 px. ✅ (T-FIX no toca UI.)

## Bloqueantes
- Ninguno.

## Importantes y sugerencias
- [I-1] ✅ Resuelto: `FileIndexing.isAwaitingWorker` (`file-indexing.ts:184`); `CLAIMABLE`/`AWAITING_WORKER` solo quedan en el dominio; mismos estados en `indexing.service.ts:116,135`, `index-scheduler.ts:63`, `index-reconciler.ts:158`.
- [I-2] ✅ Resuelto: una definición (`shared/application/error-class.ts:5`), exportada en `shared/index.ts:33`; `grep` sin copias; `realtime/application/error-class.ts` borrado; `shared` no importa módulos.
- [I-3] ✅ Resuelto: `ReconcileTally` cuenta todo y guarda ≤ 100 ids por lista (`idsTruncated`); `forEachPage` no acumula; versiones `none` solo suman a `files`; `intel/README.md` al día.
- [S-1]..[S-4] siguen abiertas (ver pasada 1: registro de tipos en el `api`, corte en `splitLongText`, texto duplicado del chip, 500 si `enqueueRetry` falla tras el commit).
- [S-5] `editing/application/presence.service.ts:47`: JSDoc huérfano de la `errorClassOf` borrada, pegado al de la clase → eliminar la línea.
- [S-6] `shared/README.md` (tabla «Con la spec 019»): falta la fila de `errorClassOf` (`application/error-class.ts`).
- [S-7] `index-reconciler.spec.ts:246`: el cambio declarado (una cuenta que falla a mitad cuenta lo ya encolado) no tiene prueba → caso con `listIndexable` que falla en la segunda página.

## Lo que está bien hecho
- Concurrencia: reclamo por CAS, reemplazo de fragmentos en una transacción con `FOR SHARE`, `jobId` propio para «Reintentar».
- Registro de extractores como única decisión de indexabilidad (OCP), `IndexingOutcomeRecorder` (SRP), disparo por evento sin `editing → intelligence`.
- T-FIX: el conocimiento «espera al worker» vive en el dominio; `errorClassOf` con prueba propia (incluye valores lanzados que no son `Error`) y guardia en `index.spec.ts`; `ReconcileTally` separa la contabilidad del recorrido (SRP), con funciones cortas y ≤ 3 parámetros.
- Migración reversible con `CHECK` nombrados, HNSW y GIN; integración y aislamiento con servicios reales.

## DF y pendientes
- DF-07, DF-14, DF-37 aplicados; DF-77 a DF-79 aceptados. PD-18, PD-90, PD-123 cerrados. Abiertos: PD-120 (CA-19 con 012), PD-121, PD-122, PD-124, PD-125, PD-126. PD-63 sin cambios (I-3 resuelto, no diferido).
