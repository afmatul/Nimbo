# Plan 019 — Indexación de documentos

> Spec: `./spec.md` · Estado del plan: Propuesto
> Obligatorio y ≤ 250 líneas. Dice **qué** archivos se tocan y **qué** se espera de cada uno; no es el código en
> prosa (sin cuerpos de funciones ni pseudocódigo). Lo aprueba Adrián antes de escribir código.

## 1. Resumen técnico
- **Disparo (RN-11, PD-90):** `storage` emite `storage.file-version-created` `{fileId, versionId, ownerId, kind}` **después del commit**, desde
  `FileVersionService` (reemplazo, restauración, edición y, luego, optimización) y desde `UploadRegistrar` (archivo nuevo, que hoy **no** pasa por
  `register`). `intelligence` lo escucha en el `api`: si el tipo es indexable crea `indexacion` en `pendiente` y encola en BullMQ (`indexing`,
  `jobId` = `versionId`). Se elimina el encolado directo de `editing` (016 CA-12) y su `IIndexQueue`: el puerto pasa a `intelligence`, interno (cierra PD-18).
- **Proceso (worker, no `api`):** `IndexingProcessor` actúa como la cuenta propietaria (`createActor(ownerId, CLIENT)`; RLS decide: un `ownerId`
  falso no ve nada y el trabajo se descarta). Pasos: archivo existe y la versión sigue vigente → reclama (CAS a `indexando`) → tope y formato
  → contenido por flujo → `ITextExtractor` (por `ExtractorRegistry`) → `Chunker` → `IEmbeddingProvider` por lotes → **una transacción** que
  bloquea la versión vigente, borra fragmentos de otras versiones, inserta los nuevos y marca `indexado` (CA-8, 9, 10, 16).
- **Fallos:** errores permanentes (`sin_texto`, `formato_no_soportado`, `demasiado_grande`) → `no_indexable` sin reintento. Transitorios (proveedor,
  lectura) → BullMQ reintenta `INDEXING_MAX_ATTEMPTS` (3) con espera exponencial; agotados → `fallido` con motivo (CA-12). «Reintentar» (CA-13) vuelve a `pendiente`.
- **Aviso en vivo (CA-14):** los sockets viven en el `api` (ADR-0030). El `worker` publica el cambio de estado en una cola pequeña `index-status`
  y el `api` la retransmite con `IRealtimePublisher.toUser`. Los cambios hechos en el `api` (pendiente, reintento) se publican directo.
- **Conciliación (RN-12, ADR-0019):** trabajo repetible `index-reconcile` (worker) y script del Operador `index:reconcile` que lanza el mismo trabajo una vez:
  encola versiones vigentes indexables sin fila, o `pendiente`/`indexando` desde hace más de 30 min. Cubre archivos previos y eventos perdidos (CA-23).
- **Lectura segura:** `IChunkRepository` solo lee con `accessibleNodes(actor)` **antes** de ordenar por similitud (DF-14) y RLS en `fragmento`/`indexacion`.
  019 no expone fragmentos por HTTP (los usa 020); sus métodos de lectura existen para CA-17.

## 2. Módulos, archivos y diseño
Prefijo `apps/api/src/modules/` salvo indicación. Funciones ≤ 30 líneas y ≤ 3 parámetros (objetos de entrada nombrados).

| Módulo / capa | Archivo (nuevo o cambiado) | Responsabilidad |
|---|---|---|
| intelligence/domain | `source-location.ts` (+ `pdf-`, `docx-`, `text-`, `sheet-`, `slide-location.ts`) | `SourceLocation` abstracta: `groupKey()`, `mergeWith()`, `label()` en español, `isCertain()`, `toJson()` (forma de DF-07: `{tipo, …, confianza}`). Docx `{seccion, parrafoDesde, parrafoHasta}`, pdf `{pagina}`, texto `{lineaDesde, lineaHasta}`, hoja `{hoja}`, diapositiva `{numero}` |
| intelligence/domain | `segment.ts`, `chunk.ts`, `chunker.ts` | `Segment` (texto + ubicación, salida de extractores); `Chunker.split`: une segmentos contiguos solo con igual `groupKey`, parte los largos (`CHUNK_TARGET_CHARS` 1000, `CHUNK_MAX_CHARS` 1500) sin cambiar ubicación (RN-3) |
| intelligence/domain | `file-indexing.ts`, `errors/*.ts` | Estados `pendiente→indexando→indexado\|no_indexable\|fallido`, `fallido→pendiente`; `NotIndexableError(reason)`, `EmbeddingUnavailableError`, `IndexingNotRetryableError` (409) |
| intelligence/application | `file-version-created.listener.ts` (presentation) + `index-scheduler.ts` | Oyente `@OnEvent(..., {async:true})` idempotente; `schedule(event)`: ¿`ExtractorRegistry.supports(kind)`? → `INSERT … ON CONFLICT DO NOTHING` + `IIndexQueue.enqueue` + aviso. Un fallo se registra y lo recoge la conciliación |
| intelligence/application | `indexing.service.ts`, `indexing-outcome.recorder.ts` | `indexVersion(job)`: orquesta los pasos de §1; el recorder aplica estado, auditoría, bitácora y aviso (SRP). `giveUp(job)` al agotar intentos |
| intelligence/application | `index-status.service.ts` | `get(actor, fileId)` y `retry(actor, fileId)`: acceso por `IndexableFileGateway.findAccessible` (papelera/ajeno/inexistente → `NodeNotFoundError`, CA-18); `PermissionResolver.can(actor, fileId, Action.EDIT)` para `canRetry`; límite de tasa (`IRateLimiter`) |
| intelligence/application | `index-reconciler.ts` | Recorre cuentas y versiones por páginas (`INDEX_RECONCILE_BATCH_SIZE`) y llama a `schedule`; idempotente |
| intelligence/application | `extractor-registry.ts` | **Registry** `kind → ITextExtractor`: `supports(kind)`, `forKind(kind)`. Es la única fuente de «qué es indexable» (OCP: `.xlsx`/`.pptx` = registrar dos extractores) |
| intelligence/application/ports | `i-text-extractor`, `i-embedding-provider`, `i-index-queue`, `i-chunk-repository`, `i-indexing-repository`, `i-index-status-notifier` | Ver «Puertos» abajo |
| intelligence/infrastructure | `extractors/docx.extractor.ts`, `pdf.extractor.ts`, `plain-text.extractor.ts` | Docx: `word/document.xml`; sección = último encabezado (estilo `heading 1–3` de `styles.xml` u `outlineLvl`; 0 antes del primero), párrafo = orden dentro de la sección. PDF: Ghostscript `txtwrite` UTF-8, una salida por página, en directorio temporal 0700 con tiempo límite y borrado en `finally`; sin texto en todas → `sin_texto`; ilegible/cifrado → `formato_no_soportado`. Texto: UTF-8 con BOM, una línea = un segmento |
| intelligence/infrastructure | `extractors/ooxml-reader.ts`, `xlsx.extractor.ts`, `pptx.extractor.ts` (**última tarea, cortable**) | Lector común de OOXML (zip + XML, con tope de bytes descomprimidos contra bombas de compresión); hoja = `{hoja}` (celdas con tabuladores, filas con salto); diapositiva = orden en `presentation.xml`. Sin imágenes ni notas |
| intelligence/infrastructure | `gemini-embedding.provider.ts` | `IEmbeddingProvider` por REST con `fetch` (sin SDK): lotes ≤ 100, dimensión 768 (`outputDimensionality`) y **normalización L2** (obligatoria por debajo de la dimensión nativa), clave en cabecera `x-goog-api-key` (nunca en URL ni bitácora), tiempo límite; 429/5xx/red → `EmbeddingUnavailableError`; sin clave → error no reintentable `fallido/proveedor_no_disponible` |
| intelligence/infrastructure | `persistence/{indexacion,fragmento}.orm-entity.ts`, `typeorm-indexing.repository.ts`, `typeorm-chunk.repository.ts` | Siempre con `TransactionContext.requireActorScope`. `replaceForVersion` (swap atómico), `findByFile(actor,…)` y `nearest(actor, vector, limit)` con `fragmento.archivo_id IN (accessibleNodes)` antes de `ORDER BY embedding <=> $q` |
| intelligence/infrastructure | `bullmq-index.queue.ts`, `indexing.processor.ts`, `index-reconcile.{scheduler,processor}.ts`, `queued-index-status.notifier.ts`, `realtime-index-status.notifier.ts`, `index-status.relay.ts` | Cola `indexing` (`removeOnComplete/Fail`, `INDEXING_MAX_ATTEMPTS`, `@OnWorkerEvent('failed')` → `giveUp`); `index-reconcile` repetible con `upsertJobScheduler` (`INDEX_RECONCILE_INTERVAL_MINUTES`, 1440); notificador del worker (cola `index-status`) y del api (directo); relay en el `api` |
| intelligence/presentation | `indexing.controller.ts` | `GET/POST /files/:fileId/indexing[/retry]` (§4), `@Roles(CLIENT)` |
| intelligence | `intelligence.module.ts` (api), `intelligence-worker.module.ts` (worker), `index.ts`, `README.md` | Composición; el `worker` no carga controlador ni oyente. `index.ts` no exporta nada de infraestructura |
| storage/application | `indexable-file.gateway.ts` (**exportada**) | Fachada para `intelligence`: `findAccessible`, `findOwned` (vivo o en papelera: así termina de indexar aunque se envíe a la papelera, PD-112), `openCurrent`, `lockCurrentVersion(actor, fileId)` (`SELECT … FOR SHARE` dentro de la transacción del llamador), `listIndexable(actor, cursor)` y `clientIds(cursor)` (sobre `IClientAccountScanner`). Mismo patrón que `EditableFileGateway`. `findOwned` filtra por `propietario_id = actor.id` (no solo por id) y `clientIds` devuelve solo UUID y lo usa únicamente `IndexReconciler`: ensancha el aislamiento de `IClientAccountScanner` (007), cuyo comentario se actualiza |
| storage/application | `file-version.service.ts`, `upload-registrar.ts`, `version-restore.service.ts`, `edited-version.registrar.ts` | `afterCommit(actor, registered)` publica el evento (además de podar) y `announce` para el archivo nuevo; los 4 caminos lo llaman tras el commit. Contrato `FILE_VERSION_CREATED` y `FileVersionCreatedEvent` en `storage/index.ts` |
| shared | `domain-event-publisher.port.ts` + `event-emitter-domain-event.publisher.ts` | `IDomainEventPublisher`: tercer productor de eventos tras `identity` y `realtime` (ADR-0019 manda extraerlo; atrapa y registra el fallo de un oyente) |
| intelligence | `application/ports/i-command-runner.port.ts`, `infrastructure/process/child-process.runner.ts` | `ICommandRunner` (sin shell, tiempo límite, salida acotada; regla (a): procesos del sistema). **Interno** de `intelligence` hasta que 021 sea el segundo consumidor; entonces se mueve a `shared` (el README de `shared` admite lo que usan ≥ 3 módulos o lo que otro módulo no puede importar de `intelligence`) |
| editing | `save-version.service.ts`, `editing.module.ts` (cambian); `index.queue.ts`, `i-index-queue.port.ts` (se borran) | Deja de encolar: el evento sale del registro en `storage`. Ajusta pruebas de 016 CA-12 |
| audit | `audit-action.ts`, `audit-catalog.ts` | `file.indexed`, `file.index_unindexable`, `file.index_failed`, `file.index_retried`; atributos: `versionId`, `reason`, `durationMs`, `fragmentCount` |
| shared / raíz / worker | `env.schema.ts`, `.env.example`, `app.module.ts`, `worker.module.ts`, `worker.main.ts`, `package.json` | Variables de §5; el `worker` suma `EventEmitterModule` (comparte `FileVersionService`), `IntelligenceWorkerModule` y las colas `indexing` e `index-reconcile` en `WORKER_QUEUES`; script `index:reconcile` |
| contracts | `packages/contracts/src/intelligence/*` | Esquemas zod: `IndexingStatusResponse`, `INDEXING_STATES`, `INDEXING_REASONS`, `INDEXING_EVENTS`, `INTELLIGENCE_ERROR_CODES` |
| web | `features/intelligence/{indexing-api.ts,hooks/use-indexing-status.ts,components/indexing-status-chip.tsx,indexing-banner.tsx}`; `features/storage/components/file-detail-view.tsx` (cambia) | Chip + banner con motivo y «Reintentar» (solo si `canRetry`); `useRealtime()` actualiza al llegar `indexing.status-changed` y revalida al reconectar. Imágenes y «otros»: no muestra nada. Sin columna en el explorador (P-3). Textos desde el catálogo por `code` |

- **Puertos nuevos y su regla (Art. V.2):** `ITextExtractor` (e: ≥ 3 implementaciones), `IEmbeddingProvider` (a, c), `IIndexQueue` (a: BullMQ; ya existía, se mueve), `ICommandRunner` (a: procesos del sistema),
  `IChunkRepository` e `IIndexingRepository` (b), `IIndexStatusNotifier` (e: dos implementaciones, `queued` en el worker y `realtime` en el api). Todos
  **internos** de `intelligence`. Fuera de módulo: solo `IDomainEventPublisher` en `shared` (regla (d)/ADR-0019). `IIndexQueue` **deja de ser un puerto entre `editing` e `intelligence`**.
- **Dependencias entre módulos:** nueva `intelligence → audit` (CA-21; `architecture.md` §3 no la lista). `intelligence → storage/access/realtime` ya existen. Sin `storage → intelligence` ni `editing → intelligence`: solo evento.
  Lint: `boundaries.js` (`intelligence: [..., 'audit']`), `module-graph.spec.ts` y README del módulo.
- **Eventos:** contrato exportado por el productor (`storage/index.ts`, ADR-0019); `intelligence` depende de `storage`. Una sola razón de cambio por clase.

## 3. Datos
```sql
-- 20261022100000-crear-indexacion-y-fragmento (extensión `vector` ya creada en 20260915120000; imagen pgvector/pgvector:pg17)
CREATE TABLE indexacion (
  id uuid PRIMARY KEY,
  archivo_id uuid NOT NULL REFERENCES archivo(id) ON DELETE CASCADE,            -- la purga arrastra el estado (CA-15)
  version_archivo_id uuid NOT NULL REFERENCES version_archivo(id) ON DELETE CASCADE,
  estado varchar(12) NOT NULL CHECK (estado IN ('pendiente','indexando','indexado','no_indexable','fallido')),
  motivo varchar(30) CHECK (motivo IN ('sin_texto','formato_no_soportado','demasiado_grande','proveedor_no_disponible','lectura_fallida','error_interno')),
  intentos smallint NOT NULL DEFAULT 0, fragmentos integer NOT NULL DEFAULT 0, duracion_ms integer,
  creado_en timestamptz NOT NULL, actualizado_en timestamptz NOT NULL,
  CONSTRAINT uq_indexacion_version UNIQUE (version_archivo_id),                 -- idempotencia (CA-9, RN-10)
  CONSTRAINT ck_indexacion_motivo CHECK ((estado IN ('no_indexable','fallido')) = (motivo IS NOT NULL))
);
CREATE INDEX idx_indexacion_archivo ON indexacion (archivo_id);
CREATE INDEX idx_indexacion_pendiente ON indexacion (actualizado_en) WHERE estado IN ('pendiente','indexando');  -- conciliación
CREATE TABLE fragmento (
  id uuid PRIMARY KEY,
  archivo_id uuid NOT NULL REFERENCES archivo(id) ON DELETE CASCADE,            -- desnormalizado para RLS y filtro previo (DF-14)
  version_archivo_id uuid NOT NULL REFERENCES version_archivo(id) ON DELETE CASCADE,
  orden integer NOT NULL, texto text NOT NULL,
  procedencia jsonb NOT NULL CHECK (jsonb_typeof(procedencia) = 'object' AND procedencia ? 'tipo'),   -- DF-07
  embedding vector(768) NOT NULL,
  texto_busq tsvector GENERATED ALWAYS AS (to_tsvector('spanish'::regconfig, texto)) STORED,
  creado_en timestamptz NOT NULL,
  CONSTRAINT uq_fragmento_version_orden UNIQUE (version_archivo_id, orden)
);
CREATE INDEX idx_fragmento_archivo ON fragmento (archivo_id);
CREATE INDEX idx_fragmento_embedding ON fragmento USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_fragmento_texto_busq ON fragmento USING gin (texto_busq);
-- RLS (ENABLE + FORCE), rol nimbo_app, como `version_archivo_cliente`: solo CLIENT y solo archivos que `archivo` (también con RLS) le deja ver.
CREATE POLICY indexacion_cliente ON indexacion TO nimbo_app
  USING (nimbo_actor_role() = 'CLIENT' AND EXISTS (SELECT 1 FROM archivo a WHERE a.id = indexacion.archivo_id))
  WITH CHECK (nimbo_actor_role() = 'CLIENT' AND EXISTS (SELECT 1 FROM archivo a WHERE a.id = indexacion.archivo_id));
-- ídem fragmento_cliente sobre fragmento. Sin política para ADMIN/SUPPORT/OPERATOR: 0 filas (CA-20). Permisos: los de ALTER DEFAULT PRIVILEGES de 003.
```
- `down`: borra políticas, `fragmento` e `indexacion` (en ese orden) antes de que pueda revertirse la extensión; probado con `migration:revert` (RNF-10). `synchronize: false`. Bytes: ninguna columna nueva de tamaño (el tope usa `archivo.tamano_bytes`, `bigint`).
- Una fila por versión; al terminar el swap se borran las filas y fragmentos de las demás versiones del archivo (CA-10). Sin fila para tipos no indexables (imágenes, otros).
- El filtro por `archivo_id` suele acotar mucho; si el planificador no usa HNSW con filtro, 020 decide (`hnsw.iterative_scan` o escaneo exacto). Se mide en 020.

## 4. Contratos
| Método | Ruta | Rol | Request → Respuesta | Errores (`code`) |
|---|---|---|---|---|
| GET | `/files/:fileId/indexing` | CLIENT | → 200 `{state, reason, updatedAt, canRetry}`; `state` = `pendiente\|indexando\|indexado\|no_indexable\|fallido` o `null` si el tipo no se indexa; sin fila y tipo indexable = `pendiente` | 404 `STORAGE_NODE_NOT_FOUND` (ajeno, papelera, inexistente: mismo cuerpo, CA-18); 403 `SHARED_FORBIDDEN` (roles internos, CA-20) |
| POST | `/files/:fileId/indexing/retry` | CLIENT con EDIT | → 202 `{state:'pendiente'}` | 404 igual; 403 `SHARED_FORBIDDEN` (lector o rol interno); 409 `INTELLIGENCE_INDEXING_NOT_RETRYABLE` (no está `fallido`); 429 del limitador (`RATE_LIMIT_INDEX_RETRY_PER_MINUTE`) |

- `reason` ∈ `INDEXING_REASONS`; el texto visible sale del catálogo del frontend por código. Una cuenta en solo lectura puede ver el estado; «Reintentar» es una escritura del cliente y la bloqueará el guard global de 010 (la indexación automática no, CA-22).
- Evento interno `storage.file-version-created` `{fileId, versionId, ownerId, kind}` (en proceso, ADR-0019; no es API). Eventos de usuario (015, `toUser(ownerId)`):
  `indexing.status-changed` `{fileId, state, reason}`; sin nombres, texto ni versión. Hasta 012 solo llega a la propietaria (PD nuevo).
- Jobs: `indexing` `{fileId, versionId, ownerId}`; `index-status` `{ownerId, fileId, state, reason}`; `index-reconcile` `{}`. Ningún job lleva texto, nombre, URL ni clave de objeto.

## 5. Seguridad y operación
- `actor` en todos los servicios. El procesador y el reconciliador actúan con `createActor(ownerId, CLIENT)` dentro de `withActor`: el `ownerId` del trabajo **no se confía**, RLS y `accessibleNodes` deciden; archivo ajeno o purgado = descarte silencioso (CA-16). Lectura de estado: `IndexableFileGateway.findAccessible` (usa `accessibleNodes`) antes de leer `indexacion`; ambas con RLS.
- Roles internos: `@Roles(CLIENT)` y sin política RLS: 0 filas en `fragmento` e `indexacion`. Ninguna vista interna lee texto (la 022b solo verá estados de trabajos).
- Bitácora (`indexing.started|completed|unindexable|failed|discarded`, `index.reconcile_completed`): `correlationId` (vía `enqueueWithCorrelation`), `fileId`, `versionId`, `state`, `reason`, `durationMs`, `attempt`, `errorClass`, `fragmentCount`. **Nunca** texto, nombre, extracto, vector, cuerpo de la respuesta del proveedor ni clave. Auditoría de §2 con `actor` propietario (el reintento, con quien lo pulsó).
- Texto del cliente sale hacia Gemini: se documenta en la Política de privacidad (001 D-14, spec §5). `GEMINI_API_KEY` solo en `worker`; el `api` no la lee.
- Variables (api y/o worker, en `.env.example`, `apiEnvSchema`/`workerEnvSchema` y `ambientes.md`; `pnpm env:check` debe pasar): `INDEXING_MAX_FILE_BYTES` (50 MiB, RN-7), `INDEXING_MAX_ATTEMPTS` (3, ambos), `INDEX_RECONCILE_INTERVAL_MINUTES` (1440), `INDEX_RECONCILE_BATCH_SIZE`, `RATE_LIMIT_INDEX_RETRY_PER_MINUTE` (api), `GEMINI_API_KEY` (opcional, secreto), `GEMINI_EMBEDDING_MODEL`, `GHOSTSCRIPT_BIN` (`gs`; en Windows `gswin64c`). El tope de fragmentos por versión (`MAX_CHUNKS_PER_VERSION`, 5000) es constante: superarlo = `demasiado_grande`.
- Operación: Ghostscript debe estar en la imagen del `worker`, en CI y en el host de desarrollo (`docs/operations/ambientes.md`). Concurrencia del procesador = 1. Métricas de duración y cola las expone 022; hoy basta `duracion_ms`. Sin `IHealthIndicator`: la caída del proveedor no afecta `/health/ready` (RNF-09).

## 6. Estrategia de pruebas (por riesgo)
| CA | Nivel | Archivo |
|---|---|---|
| 2, 3, 6; RN-3 | unit: `Chunker` y `SourceLocation` (nunca mezcla ubicaciones; rangos; `label()`) | `intelligence/domain/chunker.spec.ts`, `source-location.spec.ts` |
| 1, 2, 3, 4, 5, 6 | unit: extractores con fixtures pequeñas armadas en la prueba (docx con encabezados, texto con BOM, xlsx/pptx); PDF con `ICommandRunner` falso (orden, `sin_texto`, ilegible) | `intelligence/infrastructure/extractors/*.spec.ts` |
| 13 | unit: transiciones de `FileIndexing` (válidas e inválidas) | `intelligence/domain/file-indexing.spec.ts` |
| 12, 21 | unit + contrato (Liskov, junto a un doble): lotes, L2, 429/5xx/red, clave ausente, la clave no aparece en errores | `gemini-embedding.provider.spec.ts` (servidor HTTP local) |
| 2, 4, 11 | int: Ghostscript real; PDF de 50 páginas generado con `pdfkit` y proveedor falso con latencia: `duracion_ms` < 60 000 (CA-11); escaneado = `sin_texto` | `test/int/intelligence/pdf-extraction.int-spec.ts` |
| 1, 7, 8, 9, 10, 16, 22 | int (Postgres + Redis + MinIO reales): carga → `indexado` con ubicaciones; mismo trabajo dos veces = un solo juego y una sola llamada de embeddings; nueva versión reemplaza fragmentos; tope; purga o versión superada a mitad = descarte sin huérfanos ni error; cuenta en solo lectura se indexa | `test/int/intelligence/indexing-run.int-spec.ts` |
| 8 | int: los 4 caminos (carga nueva, reemplazo, restauración, edición) dejan una fila `pendiente` y un trabajo; un rollback no emite | `test/int/intelligence/file-version-created.int-spec.ts` |
| 12, 13 | int: proveedor caído → 3 intentos → `fallido`; mientras tanto subir, descargar, listar y editar responden; «Reintentar» (propietario sí, lector no) | `test/int/intelligence/indexing-retries.int-spec.ts` |
| 14, 15, 18, 19 | int: estado en cada situación, papelera → 404 y restaurar sin reindexar, purga borra fragmentos y estado, aviso `indexing.status-changed` por Socket.IO (patrón de `test/int/realtime`). CA-19 con lector **espera a 012** (PD nuevo) | `test/int/intelligence/indexing-status.int-spec.ts` |
| 23 | int: `index-reconcile` encola archivos sin fila y `pendiente` viejos; repetir no duplica | `test/int/intelligence/index-reconcile.int-spec.ts` |
| 21 | int: bitácora y auditoría de un ciclo completo sin texto, nombres, extractos ni vectores (patrón `audit-and-logs`) | `test/int/intelligence/indexing-logs-audit.int-spec.ts` |
| migraciones | int: `up`, `down`, `CHECK`, `UNIQUE`, RLS y que `nimbo_app` sin actor vea 0 filas | `test/int/intelligence/migrations.int-spec.ts` |
| 17, 18, 20 | **aislamiento (bloqueante)**: A y B con contenido casi idéntico; `findByFile` y `nearest` como B no devuelven nada de A (por id y por similitud); con consulta directa sin filtro, RLS lo impide; estado/reintento ajeno = mismo 404; Administrador, Soporte y Operador → `SHARED_FORBIDDEN` y 0 filas; trabajo con `ownerId` ajeno se descarta | `test/isolation/intelligence.iso-spec.ts` |
| 14, 13 | web: chip y banner por estado, aviso en vivo, «Reintentar» solo con `canRetry`, axe a 360 y 1440 px | `features/intelligence/**/*.spec.tsx` |
| 16 (016) | se ajusta: el guardado ya no encola; el evento sale de `storage` | `test/int/editing/save-version.int-spec.ts` |
| demo | manual en la tarea humana: subir PDF de 50 páginas con Gemini real y medir CA-11 | recorrido de Adrián |

- Sin E2E automático (no es flujo de demo crítico propio). Cobertura de lógica ≥ 60 %. Sin repetir un CA en tres capas.

## 7. Riesgos y coherencia con el diseño
1. **Evento perdido o `enqueue` fallido** (ADR-0019): `index-reconcile` lo repara y reutiliza lo del P-6. Se prueba en CA-23.
2. **Carrera con una versión nueva:** el swap toma `FOR SHARE` sobre el archivo (`lockCurrentVersion`) y descarta si la versión ya no es la vigente; sin esa guarda un trabajo lento podría reinsertar texto viejo.
3. **Memoria y coste:** `extract(Buffer)` carga hasta 50 MiB (DF-37); concurrencia 1 y `worker` de 768 MB. Un `.txt` de 50 MiB daría ~50 000 fragmentos: tope de fragmentos → `demasiado_grande`. Cuotas del proveedor: 429 se reintenta con espera.
4. **PDF = Ghostscript:** ya está en el stack (021) pero no hay Dockerfile ni CI que lo instalen; riesgo de entorno en Windows (`GHOSTSCRIPT_BIN`). El orden de lectura de PDFs de varias columnas puede ser pobre: la citación sigue siendo por página. Alternativa descartada: `pdfjs-dist`/`unpdf` (ESM contra `api` CommonJS, en el mismo proceso, dependencia mayor).
5. **Interpretación de «sección + párrafo»:** encabezados de nivel 1–3 abren sección; el fragmento cita un rango de párrafos de una sola sección (como el rango de líneas en `.txt`, CA-3). Decidido (D-3).
6. **Seed:** `pnpm seed` es un marcador; el corpus sintético no existe. 019 deja `index:reconcile` listo y el generador de PDF/DOCX de pruebas en `test/support/`, y la semilla lo invoca cuando exista.
7. **El `worker` emite sin oyente:** hoy nada en el `worker` registra versiones; cuando 021 lo haga, su plan registra el oyente allí.
8. **Reclamo y reintento:** el CAS a `indexando` acepta `pendiente` o `indexando` (un trabajo recuperado tras una caída del `worker` debe poder reclamar); `removeOnComplete/Fail` borran el trabajo al terminar para que el evento y la conciliación puedan volver a encolar la versión. «Reintentar» encola con `IIndexQueue.enqueueRetry(job, retriedAt)` un trabajo propio de su transición (`jobId` = `<versión>-retry-<ms de updatedAt>`): el trabajo que deja `fallido` sin clave lo guarda y avisa antes de terminar, y con `jobId` = versión BullMQ ignoraría el reintento (corrección de T-07). El CAS `fallido → pendiente` gana una vez por fallo, así que hay un reintento por fallo. Dos trabajos de la misma versión solo coinciden si el viejo vuelve a correr (caída del `worker` o fallo al anunciar) o si la conciliación encola mientras el reintento espera: con concurrencia 1 se serializan y el segundo descarta (`not_claimable`); con varios `worker`, el CAS de `swap` desde `indexando` deja un solo ganador (vectorización duplicada, sin daño en fragmentos ni estado). `FOR SHARE` bajo RLS exige la política de `UPDATE` de `archivo` y se prueba.
9. **Relay en el `api`:** segunda excepción acotada a ADR-0001 tras ADR-0029 (procesador liviano que necesita los sockets del `api`); alternativa descartada: adaptador de Redis (ADR-0030 opción 2). PD-106 sigue abierto solo para varias réplicas. Se razona en ADR-0031 (c).
- **Desviaciones de los diagramas (`design-findings.md`):** nuevos **DF-77** (disparo por evento; `IIndexQueue` interno; `intelligence → audit`; relay `index-status`), **DF-78** (`indexacion` por versión y motivos; `fragmento` con `orden`, `texto_busq` generado y `SourceLocation` con hoja, diapositiva y rangos; cierra DF-07, DF-14 y DF-37) y **DF-79** (`IDomainEventPublisher` sube a `shared`; `ICommandRunner` queda interno de `intelligence` hasta que 021 lo reutilice). DF-08 sigue en 020 (esta spec solo borra fragmentos).
- **Pendientes que deja fuera (`pendientes.md`):** PD-120 (CA-19 con lector y aviso a quienes comparten, con 012), PD-121 (tercera fachada de lectura de contenido: 017 → extraer), PD-122 (migrar `IAccountEventsPublisher` y `SocketIoHub` a `IDomainEventPublisher`), PD-123 (`architecture.md` §3/§5/§7.3/§8, `design-model.md` y redibujo de «Indexación»). PD-18 y PD-90 quedan resueltos al implementar.
- **ADR (D-10, redactados por `architect`, Propuestos):** `docs/adr/0031-extraccion-de-texto-y-embeddings-por-rest.md` (`fflate`, `fast-xml-parser`, Ghostscript `txtwrite`, REST sin SDK y relay `index-status`), `0003-postgresql-con-pgvector.md` y `0007-modelo-de-lenguaje-detras-de-puertos-propios.md`. Adrián los acepta con el plan.

## 7b. Decisiones de Adrián (2026-10-21)
D-1 PDF con Ghostscript `txtwrite` (proceso aparte con tiempo límite; Dockerfile del `worker` y CI lo instalan; `GHOSTSCRIPT_BIN` en Windows) · D-2 aviso por relay en `index-status` (worker → api → socket de 015) · D-3 sección = encabezado H1–H3; fragmento = rango de párrafos de una sección · D-4 `MAX_CHUNKS_PER_VERSION` = 5000 → `demasiado_grande` · D-5 019 entrega `index:reconcile` y generadores de PDF/DOCX en `test/support/`; el corpus de `pnpm seed` queda fuera · D-6 se audita cada resultado (`file.indexed`, `file.index_unindexable`, `file.index_failed`, `file.index_retried`) · D-7 `findByFile` y `nearest` por actor se construyen ahora (los exige CA-17) · D-8 índice GIN de `texto_busq` ahora: no es especulativo, su consumidor es 018 (búsqueda por contenido, Juan Marcos), que lo usa tal cual sin modificar la migración, los archivos ni la rama de 019 (PD-124) · D-11 `ICommandRunner` interno de `intelligence` (punto 1 del architect) · D-9 CA-19 se prueba con 012 (PD-120) · D-10 ADR-0031, 0003 y 0007 junto con este plan.

## 8. Aprobación
- ¿Puerto nuevo entre módulos? **No** hay puerto de módulo a módulo: `intelligence → storage` va por el evento y la fachada concreta `IndexableFileGateway`; `IIndexQueue` deja de cruzar. **Sí** hay `IDomainEventPublisher` nuevo en `shared` (e `ICommandRunner`, interno de `intelligence`), y una **arista nueva `intelligence → audit`**. ¿Tecnología nueva? **Sí, menor**: `fflate`, `fast-xml-parser`, primer uso real de Ghostscript y de pgvector. ¿Cambio de arquitectura? **Sí, menor**: indexación disparada por evento y relay worker → api. → `architect` interviene.
- `architect`: **Aprobado con cambios** (2026-10-21), ya aplicados en este plan salvo lo marcado como pendiente de Adrián.
  1. `ICommandRunner` no sube a `shared`: tiene un solo consumidor y el README de `shared` admite lo que usan ≥ 3 módulos; queda interno de `intelligence` (regla (a)) y 021 lo mueve al ser el segundo consumidor. `IDomainEventPublisher` sí sube (tercer productor, ADR-0019). Aplicado (§2, DF-79).
  2. `IndexableFileGateway.clientIds` ensancha el aislamiento de `IClientAccountScanner` (007): solo UUID y un único consumidor; `findOwned` filtra por `propietario_id`. Aplicado (§2).
  3. CAS de reclamo desde `pendiente` o `indexando` y `removeOnComplete/Fail` para que «Reintentar» no sea ignorado. Aplicado (§7 punto 8).
  4. `intelligence → audit` es correcta (transversal sin dependencias de negocio, `architecture.md` §3 regla 5; ya la usan `identity`, `billing`, `storage`, `editing`). El relay se registra como excepción acotada tras ADR-0029 (§7 punto 9, ADR-0031 c). Aplicado.
  5. Pendiente (no bloquea): `docs/sdd/architecture.md` y `design-model.md` se actualizan al cierre (PD-123), incluida la fila `ICommandRunner` (hoy M7) y `IIndexQueue` (hoy `editing → intelligence`).
- Adrián: **Aprobado** (2026-10-21), con los cambios del architect y D-1 a D-11. Mockup de la ficha (P-3) pendiente con `/mockup`.
