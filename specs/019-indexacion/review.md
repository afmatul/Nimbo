# Revisión 019 — Indexación de documentos

| Campo | Valor |
|---|---|
| Fecha | 2026-10-23 |
| Rango revisado | `main..6199c1da` (24 commits) |
| CI | Local: lint ✅ · typecheck ✅ · test, test:int y test:isolation: se vuelven a correr en serie (la primera corrida se hizo con carga paralela: `redact-deep.spec.ts:192` de rendimiento y `worker-health.int-spec.ts:80` fallaron por entorno; las 6 suites de `test/int/intelligence` ✅). Adrián: todo en verde sobre 04362642 |
| Veredicto | 🔁 Cambios requeridos (I-1, I-2 y suites en verde en serie; sin bloqueantes de código) |

## Verificación
| CA | Prueba | Estado |
|---|---|---|
| CA-1 | `docx.extractor.spec`, `chunker.spec`, `test/int/intelligence/indexing-run.int-spec` + recorrido T-11 | ✅ |
| CA-2 | `pdf.extractor.spec`, `pdf-extraction.int-spec` (Ghostscript real) | ✅ |
| CA-3 | `plain-text.extractor.spec`, `chunker.spec` | ✅ |
| CA-4 | `pdf.extractor.spec`, `pdf-extraction.int-spec`, `indexing-banner.spec` | ✅ |
| CA-5 | extractores `*.spec`, `indexing-run.int-spec` | ✅ |
| CA-6 | `xlsx/pptx.extractor.spec`, `indexing-run.int-spec`, `file-version-created.int-spec` (imágenes fuera) | ✅ |
| CA-7 | `indexing-run.int-spec`, `chunker.spec`, bombas en `docx/xlsx/pptx.extractor.spec` | ✅ |
| CA-8 | `file-version-created.int-spec` (4 caminos), `indexing-run.int-spec` | ✅ |
| CA-9 | `indexing-run.int-spec` (una llamada de embeddings), `index-reconcile.int-spec`, `indexing.repository.int-spec` | ✅ |
| CA-10 | `indexing-run.int-spec`, `chunk.repository.int-spec` | ✅ |
| CA-11 | `indexing-run.int-spec` (50 páginas, ≈ 3,4 s) + recorrido con Gemini real | ✅ |
| CA-12 | `indexing-retries.int-spec`, `gemini-embedding.provider.spec`, `indexing.processor.spec` (compartir: con 012) | ✅ |
| CA-13 | `indexing-status.int-spec`, `index-status.service.spec` (lector solo en unitarias, PD-120), `indexing-banner.spec` | ✅ |
| CA-14 | `indexing-status.int-spec` (Socket.IO desde api y worker), `use-indexing-status.spec` | ✅ |
| CA-15 | `indexing-status.int-spec`, `migrations.int-spec` (cascada) | ✅ |
| CA-16 | `indexing-run.int-spec`, `intelligence.iso-spec` | ✅ |
| CA-17 | `test/isolation/intelligence.iso-spec` (por id y por similitud), `chunk.repository.int-spec` | ✅ |
| CA-18 | `intelligence.iso-spec`, `indexing-status.int-spec` | ✅ |
| CA-19 | Vista: `indexing-banner.spec`; servidor con lector **espera a 012 (PD-120)** | ⏸ |
| CA-20 | `intelligence.iso-spec`, `migrations.int-spec` (0 filas), `indexing-status.int-spec` | ✅ |
| CA-21 | `indexing-logs-audit.int-spec` | ✅ |
| CA-22 | `indexing-run.int-spec` (suscripción vencida) | ✅ |
| CA-23 | `index-reconcile.int-spec`, `index-reconciler.spec` + recorrido `index:reconcile` | ✅ |

## Seguridad
- Datos de cliente: sí. Aislamiento ISO-1 a ISO-11 en `intelligence.iso-spec.ts`.
- `actor`/`accessibleNodes`/RLS: ✅ `nearest` filtra en CTE `MATERIALIZED` antes de `ORDER BY <=>` (DF-14); `fragmento` e `indexacion` con `ENABLE` + `FORCE` RLS solo `CLIENT`; el worker actúa como `createActor(ownerId, CLIENT)` sin confiar en el trabajo.
- Roles internos: ✅ `@Roles(CLIENT)` y 0 filas por RLS. Bitácoras: ✅ solo ids, estado, motivo, `durationMs`, `errorClass`.
- `GEMINI_API_KEY`: ✅ solo en el esquema del worker, secreta, en cabecera, `redirect: 'error'`.
- Archivos no confiables: ✅ zip con tope de 64 MiB declarado antes de inflar (fflate trunca al tamaño declarado); Ghostscript sin shell, `-dSAFER`, 45 s, entorno reducido, temporal 0700 borrado en `finally`; fast-xml-parser 5.11.2 sin entidades externas y expansión acotada.
- Hallazgos [SEC]: ninguno. No hace falta `security-auditor`.

## UI
- Ficha = mockup en sus 10 estados (capturas 360 y 1440 px); solo tokens, sin hex ni arbitrarios; ícono + texto con `sr-only`; `motion-reduce` en íconos que giran; «Reintentar» por `canRetry` con `aria-disabled` mientras responde; axe a 360/1440 px. ✅

## Bloqueantes
- Ninguno en el código. Para ✅: `pnpm test`, `test:int` y `test:isolation` en verde en corrida en serie, e I-1/I-2 (T-FIX-1, T-FIX-2).

## Importantes y sugerencias
- [I-1] `indexing.service.ts:45`, `index-scheduler.ts:20`, `index-reconciler.ts:21` repiten «`pendiente` o `indexando`» (Art. VI.2) → `FileIndexing.isAwaitingWorker` en el dominio.
- [I-2] `errorClassOf` copiado 6 veces en la rama (`indexing.processor.ts:33`, `indexing-outcome.recorder.ts:44`, `index-reconciler.ts:89`, `file-version-created.listener.ts:10`, `scripts/index-reconcile.ts:27`, `event-emitter-domain-event.publisher.ts:12`), además de `realtime/application/error-class.ts` y `editing/presence.service.ts` → una sola en `shared`.
- [I-3] `index-reconciler.ts:188-203`: listas de ids sin tope en una sola línea de bitácora y versiones `none` acumuladas en memoria → acotarlas o registrar por cuenta (PD-63).
- [S-1] El `api` monta extractores y `ChildProcessRunner` solo para `supports(kind)`: basta un registro de tipos (ISP).
- [S-2] `chunker.ts:33-42`: cortar al llegar a `MAX_CHUNKS_PER_VERSION` dentro de `splitLongText`.
- [S-3] «Listo para consultar con el agente» duplicado entre el chip y `indexing-messages.ts:93`.
- [S-4] Si `enqueueRetry` falla tras el commit, el cliente ve 500 con la fila en `pendiente` hasta la conciliación (30 min): documentarlo.

## Lo que está bien hecho
- Concurrencia resuelta: reclamo por CAS, reemplazo de fragmentos en una transacción con `FOR SHARE` sobre la versión vigente, `jobId` propio para «Reintentar».
- Registro de extractores como única decisión de indexabilidad (OCP), `IndexingOutcomeRecorder` (SRP) y disparo por evento sin `editing → intelligence`.
- Migración reversible con `CHECK` nombrados, HNSW y GIN, probada con `migration:revert`.
- Integración y aislamiento con api, worker, Postgres, Redis y MinIO reales; suite de contrato (Liskov) del proveedor de embeddings.

## DF y pendientes
- DF-07, DF-14, DF-37 aplicados; DF-77 a DF-79 aceptados. PD-18, PD-90, PD-123 cerrados. Abiertos: PD-120 (CA-19 con 012), PD-121, PD-122, PD-124, PD-125, PD-126. I-3 se suma a PD-63 si no se corrige.
