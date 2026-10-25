# `intelligence` — M6 · Inteligencia Documental

- **Dueño**: Fátima (`specs/README.md`); la 019 la implementa Adrián.
- **Diagrama de origen**: M6 en `docs/sdd/design-model.md` §3 y `docs/design/diagramas/`.
- **Responsabilidad**: Indexación de la versión vigente de cada archivo (019), recuperación híbrida y agente con citas (020).
  La indexación se dispara con el evento `storage.file-version-created` (019 RN-11, DF-78); `IIndexQueue` es **interno**
  de este módulo y ya no lo cruza nadie (cierra PD-18).
- **Puede depender de**: shared, storage, access, audit (resultados de la indexación, 019 CA-21), billing
  (`IAgentQuota`, 020), realtime (`docs/sdd/architecture.md` §3; el lint de fronteras lo hace cumplir).
- **Expone por HTTP** solo el estado de indexación y «Reintentar» (`GET /files/:fileId/indexing`,
  `POST /files/:fileId/indexing/retry`, `@Roles(CLIENT)`, 019 plan §4); el aviso en vivo `indexing.status-changed` sale
  por el canal de 015, directo desde el `api` o por el relay de `index-status` desde el `worker` (ADR-0033 d).
- **No expone** fragmentos ni texto por HTTP en la 019: los lee la 020 con `accessibleNodes(actor)` antes de ordenar
  por similitud (DF-14). Ningún rol interno ve texto indexado (019 CA-20).
- **Conciliación** (019 RN-12, CA-23): el `worker` corre `index-reconcile` cada `INDEX_RECONCILE_INTERVAL_MINUTES`
  y encola las versiones vigentes indexables sin fila y las `pendiente`/`indexando` de más de 30 min. El Operador la
  lanza una vez con `pnpm --filter api index:reconcile` (resultado en la bitácora del `worker`:
  `index.reconcile_completed`); `pnpm seed`, cuando exista el corpus (D-5), usa el mismo gancho
  (`requestIndexReconcile` de `index.ts`, la única pieza de infraestructura que se exporta, solo para scripts).
- **Specs que lo construyen**: 019 (indexación, completa), 020; 018 consume el índice de texto (`texto_busq`) sin modificarlo (PD-127).

## Puertos (todos internos: ninguno cruza módulos)

| Puerto                                                             | Implementación                                                                          |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `ITextExtractor` (`ExtractorRegistry` decide qué tipos se indexan) | `DocxExtractor`, `PdfExtractor`, `PlainTextExtractor`, `XlsxExtractor`, `PptxExtractor` |
| `IEmbeddingProvider` (768 dimensiones)                             | `GeminiEmbeddingProvider` (REST, sin SDK; ADR-0007, ADR-0033)                           |
| `ICommandRunner` (sin shell, con tiempo límite y salida acotada)   | `ChildProcessRunner`; interno hasta que 021 lo reutilice (DF-80)                        |
| `IIndexQueue` (`enqueue`, `enqueueRetry`)                          | `BullmqIndexQueue` (ya no `editing → intelligence`, DF-78)                              |
| `IIndexStatusNotifier`                                             | `RealtimeIndexStatusNotifier` (`api`) y `QueuedIndexStatusNotifier` (`worker`)          |
| `IIndexingRepository`, `IChunkRepository`                          | `TypeOrmIndexingRepository`, `TypeOrmChunkRepository`                                   |

## Flujo: evento → worker → relay

1. **Evento (`api`).** `storage` publica `storage.file-version-created` tras el commit (carga nueva, reemplazo,
   restauración, edición). `FileVersionCreatedListener` → `IndexScheduler`: si el tipo es indexable crea la fila
   `indexacion` en `pendiente`, encola en `indexing` con `jobId` = `versionId` y avisa. Imágenes y «otros» no crean nada.
2. **Procesamiento (`worker`, concurrencia 1).** `IndexingProcessor` → `IndexingService.indexVersion`: actúa como la
   cuenta propietaria (el `ownerId` del trabajo no se confía), reclama la versión, extrae, parte en fragmentos
   (`Chunker`, nunca mezcla ubicaciones), vectoriza por lotes y, en **una transacción**, reemplaza los fragmentos y marca
   `indexado`. Estados: `pendiente → indexando → indexado | no_indexable | fallido`, y `fallido → pendiente`.
   Errores permanentes (`sin_texto`, `formato_no_soportado`, `demasiado_grande`) → `no_indexable`; los transitorios se
   reintentan `INDEXING_MAX_ATTEMPTS` veces con espera exponencial y luego `giveUp` deja `fallido`. Sin
   `GEMINI_API_KEY` → `fallido/proveedor_no_disponible` sin reintento. Archivo ajeno, purgado o versión superada = descarte.
3. **Relay.** Cada cambio de estado se publica en la cola `index-status` (`{ownerId, fileId, state, reason}`) y
   `IndexStatusRelay`, **en el `api`**, lo retransmite por el canal de 015 como `indexing.status-changed` a la propietaria
   (ADR-0033 d). Los cambios hechos en el `api` van directo. El aviso es de mejor esfuerzo.

## Reintento

`POST /files/:fileId/indexing/retry` (propietaria o editor; límite `RATE_LIMIT_INDEX_RETRY_PER_MINUTE`): CAS
`fallido → pendiente` y `IIndexQueue.enqueueRetry`, que encola un trabajo propio (`jobId` = `<versión>-retry-<ms de
updatedAt>`) para que BullMQ no lo absorba si el trabajo que dejó `fallido` todavía existe. Fuera de `fallido` responde
409 `INTELLIGENCE_INDEXING_NOT_RETRYABLE`. Se audita como `file.index_retried` con quien lo pulsó.

## Conciliación

El `worker` programa `index-reconcile` cada `INDEX_RECONCILE_INTERVAL_MINUTES` (`IndexReconcileScheduler`): por cada
cuenta y con su propio actor encola las versiones vigentes indexables sin fila y las `pendiente`/`indexando` de más de
30 min; repetirla no duplica trabajos ni fragmentos (CA-9). Cubre eventos perdidos y archivos previos (RN-12, CA-23). El
Operador la lanza una vez con `pnpm --filter api index:reconcile`; `pnpm seed`, cuando exista el corpus (D-5), usa el
mismo gancho (`requestIndexReconcile` de `index.ts`, la única pieza de infraestructura que se exporta, solo para
scripts). Resultado en la bitácora del `worker`: `index.reconcile_completed` con los conteos totales (`accounts`,
`failedAccounts`, `files`, `scheduled`, `requeued`) y, como mucho, `MAX_LOGGED_IDS` (100) ids por lista
(`scheduledVersionIds`, `requeuedVersionIds`, `failedAccountIds`); `idsTruncated` dice si alguna lista se cortó. Sin
nombres ni texto.

## Aislamiento

- `indexacion` y `fragmento` tienen RLS (`ENABLE` + `FORCE`) solo para `CLIENT`; Administrador, Soporte y Operador ven 0
  filas y las rutas de estado y «Reintentar» responden `SHARED_FORBIDDEN` (CA-20).
- Toda consulta lleva `actor` y usa `TransactionContext.requireActorScope`; `nearest(actor, vector, limit)` restringe a
  `accessibleNodes` **antes** de ordenar por similitud (DF-14). Archivo ajeno, en la papelera o inexistente: el mismo 404.
- Ninguna bitácora, auditoría ni trabajo lleva texto, nombres de archivo, extractos ni vectores. La clave del proveedor
  solo existe en el `worker`.
- Prueba bloqueante: `apps/api/test/isolation/intelligence.iso-spec.ts` (`pnpm test:isolation`).

## Variables de entorno

Definidas en `shared/infrastructure/config/env.schema.ts` y `.env.example` (valores y detalle en
`docs/operations/ambientes.md`).

| Variable                                                            | Proceso          | Qué fija                                                      |
| ------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------- |
| `INDEXING_MAX_ATTEMPTS`                                             | `api` y `worker` | Intentos por trabajo (3)                                      |
| `RATE_LIMIT_INDEX_RETRY_PER_MINUTE`                                 | `api`            | Límite de «Reintentar» (10)                                   |
| `INDEXING_MAX_FILE_BYTES`                                           | `worker`         | Tope indexable (50 MiB)                                       |
| `INDEX_RECONCILE_INTERVAL_MINUTES`, `INDEX_RECONCILE_BATCH_SIZE`    | `worker`         | Frecuencia (1440) y tamaño de página (100) de la conciliación |
| `GHOSTSCRIPT_BIN`                                                   | `worker`         | Binario para PDF (`gs`; en Windows `gswin64c`)                |
| `GEMINI_API_KEY`, `GEMINI_EMBEDDING_MODEL`                          | `api` y `worker` | Clave (opcional, secreta) y modelo de embeddings (020 D-8)    |
| `GEMINI_CHAT_MODEL`, `AGENT_MAX_QUESTION_CHARS`                     | `api`            | Modelo del agente y largo máximo de la pregunta (1000)        |
| `AGENT_MODEL_FIRST_CHUNK_TIMEOUT_MS`, `AGENT_MODEL_IDLE_TIMEOUT_MS` | `api`            | Plazos del modelo (10000 ms cada uno; se miden en T-09)       |

## Capas (`docs/sdd/architecture.md` §4)

```
modules/intelligence/
├─ domain/          # entidades, objetos de valor, errores; sin Nest, TypeORM ni zod
├─ application/     # servicios («service» de los diagramas) y puertos (`ports/`)
├─ infrastructure/  # persistencia (*.orm-entity.ts), adaptadores, procesadores
├─ presentation/    # controladores, DTOs, oyentes de eventos
├─ intelligence.module.ts # api: oyente, controlador y relay
├─ intelligence-worker.module.ts # worker: procesadores `indexing` e `index-reconcile`
└─ index.ts         # única API pública
```

## Regla

Otros módulos importan **solo** desde `modules/intelligence/index.ts` (fachadas, puertos que este módulo implementa,
eventos y tipos públicos). Nada de `infrastructure/**` cruza la frontera. Nombres de clases y puertos: los de
`docs/sdd/design-model.md`.
