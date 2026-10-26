# Plan 020 — Agente con citas (API)

> Spec: `./spec.md` · Estado del plan: Aprobado (Adrián, 2026-10-25, tras el cambio de alcance de ADR-0034: el panel web pasa a 020b)
> Qué archivos se tocan y qué se espera de cada uno. Sin cuerpos de funciones. Lo aprueba Adrián antes de escribir código.

## 1. Resumen técnico y decisiones
`intelligence` (M6) recibe la pregunta del cliente, recupera fragmentos **dentro de la consulta** (nodos accesibles + versión vigente +
RLS), pide la respuesta al modelo y la devuelve **por streaming HTTP**. `billing` lleva el contador de consultas. No hay historial (RN-10).
Todo lo de `apps/web` es de 020b. Verificado contra la 019 ya en `main` (no se asume nada).

- **D-1 Contrato real de la 019** (`20261022100000-crear-indexacion-y-fragmento.ts`). `fragmento(id, archivo_id, version_archivo_id, orden, texto,
  procedencia jsonb, embedding vector(768), texto_busq tsvector 'spanish' generado, creado_en)`; `uq_fragmento_version_orden`;
  `idx_fragmento_archivo` (btree solo de `archivo_id`; no hay índice conjunto con la versión); `idx_fragmento_embedding` HNSW coseno;
  `idx_fragmento_texto_busq` GIN; RLS `fragmento_cliente` (`CLIENT` y `EXISTS` sobre `archivo`), sin política interna. `replaceForVersion`
  deja solo los fragmentos de la última versión indexada; si la versión nueva falla, quedan los de la anterior, por eso la 020 sigue exigiendo
  `fragmento.version_archivo_id = archivo.version_actual_id` (RN-2). `indexacion.estado ∈ pendiente|indexando|indexado|no_indexable|fallido`:
  `hasIndexed` = existe una fila `indexado` para la `version_actual_id` de un archivo accesible (lee `indexacion`, tabla propia de `intelligence`;
  no es excepción de ADR-0035). La 019 guarda `procedencia` con `toJson()` pero **no la lee**: la 020 añade `sourceLocationFromJson` (D-5).
- **D-2 Recuperación** (RNF-05, RN-2, RN-9). **Puerto nuevo de lectura `IChunkSearch`** (`keywordSearch`, `vectorSearch`, `hasIndexed`, `scopeExists`) y no se
  amplía `IChunkRepository`: este es de escritura del `worker` (+ `findByFile`) y el agente no escribe (Art. IV, ISP). Se **retira `IChunkRepository.nearest`**:
  ningún código de producción lo llama (solo 3 pruebas de la 019, que pasan a `vectorSearch` con ámbito `all`); mantener ambos duplicaría la consulta (DRY).
  Se reutilizan `accessibleFiles` y `runNamed` de `persistence/accessible-files.ts`, que gana `accessibleFolders` (mismo patrón, `tipo_nodo = 'carpeta'`),
  y `CHUNK_COLUMNS`/`ChunkRow`/`toStoredChunk` pasan a `chunk-rows.ts`, compartido por las dos implementaciones. Filtro común en `chunk-sql.ts`:
  `fragmento f JOIN archivo a ON a.id = f.archivo_id AND a.version_actual_id = f.version_archivo_id`, `accessibleFiles(actor, 'f.archivo_id')` y ámbito
  (archivo: `a.id = :scopeId`; carpeta: `a.carpeta_id` en las carpetas cuyo `ruta` empieza por la de la carpeta accesible del ámbito). `chunk-sql.ts` es el único
  archivo con SQL de `archivo`/`carpeta` (ADR-0035 enmendado: `archivo(id, carpeta_id, version_actual_id, nombre)`, `carpeta(id, ruta)`; `nombre` solo para la cita, S-1) y de `indexacion`.
  **Vectorial: barrido exacto filtrado, sin HNSW.** El filtro (cuenta + versión vigente + ámbito) deja miles de fragmentos de entre los de todas las cuentas; HNSW
  recorre el índice global y filtra después, así que pierde resultados (recall). Se reduce primero (`MATERIALIZED`, como `nearest` de la 019) y se ordena por coseno solo lo de la cuenta.
  `idx_fragmento_embedding` queda sin uso del agente (sigue siendo de la 019). Si T-09 mide fuera de presupuesto se evalúa `hnsw.iterative_scan`; antes no (YAGNI).
  **Léxica**: `texto_busq` con OR de los lexemas de la pregunta ordenado por `ts_rank_cd` (`websearch_to_tsquery` exige todos los términos y una frase casi nunca coincide). `fuse` por RRF en dominio.
  Ámbito ajeno o inexistente: `404 AGENT_SCOPE_NOT_FOUND` idéntico (CA-17).
- **D-3 Contador** (RF-34). Tabla `uso_agente` en **billing** (dueño de la suscripción y su periodo; DF-25), clave `(usuario_id, periodo_inicio)`: el periodo nuevo es una fila nueva
  (CA-13 sin trabajo de reinicio). Pago: periodo = el de la suscripción (si ya se pagó el siguiente por adelantado, el actual empieza `PAID_PLAN_PERIOD_DAYS` antes de
  `startedAt`; la constante vive en `subscription.entity.ts`); Personal o sin fila: mes calendario de Guatemala. `billing-date.ts` solo formatea fechas: el inicio de mes se
  calcula con la constante `GUATEMALA_UTC_OFFSET_HOURS = -6` (sin horario de verano) en `agent-usage-period.ts`. Solo lectura: periodo vencido, el contador no se reinicia hasta pagar
  (`resetsAt: null`). **Reserva atómica**: `INSERT … ON CONFLICT DO UPDATE … WHERE consultas < límite RETURNING` en transacción corta confirmada antes del streaming (CA-12:
  sin fila devuelta = agotada). Si algo falla antes de entregar la respuesta, `release` resta 1 de **la misma** fila (RN-5, CA-15).
- **D-4 `IAgentQuota`**: lo **declara e implementa `billing`** (PD-18, DF-27, ADR-0032 regla 1); `intelligence → billing` ya está en `boundaries.js` y `billing` no admite `intelligence`.
  Métodos `reserve(actor)`, `release(actor, reservation)`, `status(actor)`; devuelven resultados (`granted | exhausted`), sin lanzar errores de `billing`. Límite desde
  `Plan.limits.agentQueriesPerMonth` (RN-3); no se ensancha `PlanLimits` de `storage`.
- **D-5 Citas e inyección**. El modelo recibe fragmentos **numerados 1..K** (nunca ids ni nombres) como datos delimitados y escapados, y cita con `[n]`. `CitationMarkerFilter`
  (dominio, con estado, tolera marcas partidas) conserva solo los `[n]` entregados; archivo, versión, etiqueta y certeza salen del servidor desde el fragmento. La etiqueta ya trae
  «(ubicación aproximada)» (`SourceLocation.label()`): no se vuelve a decorar; si hay citas inciertas, el texto suma **una** frase fija: «La ubicación de esta cita es aproximada.».
  `sourceLocationFromJson(json)` (archivo propio, evita el ciclo con las subclases) rehidrata `procedencia` con las claves reales: `pdf {pagina}`, `docx {seccion, parrafoDesde,
  parrafoHasta}`, `texto {lineaDesde, lineaHasta}`, `xlsx {hoja}`, `pptx {numero}` más `confianza`; un JSON inválido descarta ese fragmento del candidato y se cuenta en la bitácora (no se cita
  con ubicación inventada). Sin ninguna cita válida el resultado es `not_found` con «No pude respaldar esta respuesta con tus documentos.».
- **D-6 Transporte**: `POST /agent/ask` responde `text/event-stream` (el cliente web lo lee con `fetch`, 020b). No Socket.IO: el canal de 015 (ADR-0030) es de avisos, y 422/429/503 deben ser estados
  HTTP **antes** de abrir el flujo; cancelar es cerrar la petición. El primer evento se espera antes de escribir cabeceras, así los errores previos pasan por `DomainExceptionFilter`. Sin buffering:
  no hay `compress` ni `buffering` en `infra/traefik/*` ni en `compose.override.yml`; `/api` va de Traefik directo al `api`. Se verifica con `curl -N` (T-10) y el `traefik.staging.yml` futuro (T-38) no comprime `text/event-stream` (PD-131).
- **D-7 Modelo y proveedor** (RNF-09). `GeminiFlashModel` con `fetch` nativo contra la API REST (`x-goog-api-key` en cabecera, nunca en URL), sin dependencia nueva ni ADR (ADR-0033). **`gemini-http.ts`** extrae lo ya
  idéntico entre embeddings y chat (`GEMINI_API_BASE_URL`, cabeceras con la clave, `isTransientStatus` y sus constantes de estado); no es un cliente genérico (dos consumidores, Art. VI.2). Plazos al primer trozo y entre trozos
  (variables); fallo, plazo o falta de clave → `AgentUnavailableError` (503) y `release`. El id del modelo y la forma de la API se verifican contra la documentación vigente al implementar.
- **D-8 Embedding de la pregunta**: `IEmbeddingProvider.embed(texts, task?)` con `task: 'query' | 'document'`, por omisión `document` (el `worker` no cambia); `GeminiEmbeddingProvider` mapea a
  `RETRIEVAL_QUERY`/`RETRIEVAL_DOCUMENT`. El `api` embebe en proceso (pasar por la cola del `worker` sumaría una vuelta de Redis a CA-2), así que recibe `GEMINI_API_KEY` y `GEMINI_EMBEDDING_MODEL`: se enmienda
  RN-9 de la 019 («el `api` nunca la lee»). `env.schema.ts` extrae `geminiShape` (ambas claves), usado por `apiEnvObjectSchema` y `workerEnvObjectSchema`; `GEMINI_API_KEY` ya está en `SECRET_KEYS`, así que
  el chequeo `DeclaredKey` sigue verde. Nuevas del `api` (opcionales; sin clave el agente responde `AGENT_UNAVAILABLE` y el resto sigue): `GEMINI_CHAT_MODEL` (por omisión `gemini-3.5-flash`), `AGENT_MAX_QUESTION_CHARS` (1000, RN-7),
  `AGENT_MODEL_FIRST_CHUNK_TIMEOUT_MS`, `AGENT_MODEL_IDLE_TIMEOUT_MS` (valores iniciales a medir en T-09). Comentarios a corregir: `env.schema.ts` (`indexingWorkerShape`, «se declaran solo aquí»), `secret-keys.ts`, `gemini-embedding.provider.ts`, `intelligence-worker.module.ts`.
- **D-9 Sin persistencia**: no hay `conversacion`, `consulta_agente` ni `cita`. Decisiones de menor rango aprobadas (P-9): cancelar antes del primer fragmento = `release`, después cuenta; sin fragmentos indexados se responde la frase fija sin modelo y sin `reserve` (CA-7).

## 2. Módulos, archivos y diseño
Prefijos: `intel/` = `apps/api/src/modules/intelligence/`; `billing/` = `apps/api/src/modules/billing/`. 12 filas; las pruebas y sus dobles están en §6.
| # | Módulo / capa | Archivo (nuevo o cambiado) | Responsabilidad |
|---|---|---|---|
| 1 | intel/domain · pregunta y errores | `agent-question.ts`, `agent-scope.ts`, `errors/{agent-invalid-question,agent-quota-exceeded,agent-unavailable,agent-scope-not-found}.error.ts` (+ `errors/index.ts`) | `AgentQuestion.parse(raw, maxChars)` recorta y rechaza vacía/larga con motivo; `AgentScope` (`all \| folder \| file`); 422, 404, 429 (`limit`, `resetsAt`) y 503 |
| 2 | intel/domain · fragmentos y citas | `retrieved-fragment.ts`, `rrf-fuse.ts`, `prompt-builder.ts`, `citation-marker-filter.ts`, `source-location-json.ts` | `RetrievedFragment` (ids, texto, `SourceLocation`); `fuse` RRF pura (k constante nombrada); instrucción de sistema y fragmentos numerados y escapados; filtro con estado (`push`, `finish`); `sourceLocationFromJson` (D-5) |
| 3 | intel/application · orquestación | `agent.service.ts`, `agent-admission.ts`, `agent-logger.ts`, `agent-config.ts` | `ask(actor, request)` generador de eventos (admisión → `reserve` → recuperación → composición; `release` ante cualquier fallo previo a la entrega, helper `try/finally`) y `status(actor)`; admisión: tasa con `I_RATE_LIMITER` (clave `intelligence:agent:<actor>`, regla constante), `AgentQuestion`, `scopeExists`, `hasIndexed`; bitácora `agent.asked`; `AGENT_CONFIG` |
| 4 | intel/application · respuesta | `hybrid-retriever.ts`, `answer-composer.ts` | Embebe la pregunta (`task: 'query'`, fuera de transacción) y en un `withActor` corre las dos búsquedas, `fuse`, `TOP_K` y `MIN_SIMILARITY` (constantes calibradas en T-09); el compositor une el flujo del modelo con el filtro y emite `citation`, `delta`, la frase de ubicación aproximada y `done`; sin fragmentos → frase fija sin llamar al modelo |
| 5 | intel/application/ports | `i-language-model.port.ts`, `i-chunk-search.port.ts`; cambian `i-embedding-provider.port.ts`, `i-chunk-repository.port.ts` | `ILanguageModel.stream(prompt, signal)`; `IChunkSearch` (solo lectura); `embed(texts, task?)`; se retira `nearest` |
| 6 | intel/infrastructure · Gemini | `gemini-http.ts` (nuevo), `gemini-flash.model.ts` (nuevo), `gemini-embedding.provider.ts` (cambia) | Base, cabeceras y mapeo transitorio compartidos; `GeminiFlashModel` (SSE de Gemini, `AbortSignal` con ambos plazos, errores → `AgentUnavailableError`); el proveedor de embeddings usa lo común y soporta `task` |
| 7 | intel/infrastructure · persistencia | `persistence/typeorm-chunk-search.ts`, `persistence/chunk-sql.ts`, `persistence/chunk-rows.ts` (nuevos); `persistence/accessible-files.ts`, `persistence/typeorm-chunk.repository.ts` (cambian) | `IChunkSearch` con `requireActorScope(actor)`; SQL de D-2 (único con `archivo`/`carpeta`/`indexacion`, solo lectura, ADR-0035); filas compartidas; `accessibleFolders`; el repositorio pierde `nearest` |
| 8 | intel/presentation y composición | `presentation/agent.controller.ts`, `presentation/sse-writer.ts`, `intelligence.module.ts`, `index.ts` | `POST /agent/ask`, `GET /agent/status` (`@Roles(CLIENT)`); cabeceras y marcos SSE, `error` a mitad de flujo, cierra al abortar; el módulo importa `BillingModule`, registra `I_EMBEDDING_PROVIDER`, `I_LANGUAGE_MODEL`, `I_CHUNK_SEARCH` y sus configs (solo `api`; el `worker` no cambia) |
| 9 | billing · contador | `domain/agent-usage-period.ts`, `application/ports/i-agent-quota.port.ts`, `application/ports/i-agent-usage.repository.port.ts`, `application/agent-quota.service.ts`, `billing.module.ts`, `index.ts` | Periodo puro (D-3); **puerto** `IAgentQuota` + `I_AGENT_QUOTA` + tipos; puerto interno del repositorio (`reserveOne`, `releaseOne`, `read`); el servicio (`withActor` → suscripción `findCurrent` → plan `requirePlan` → periodo → repositorio; `I_CLOCK`); el módulo enlaza y exporta el token |
| 10 | billing · persistencia | `infrastructure/persistence/typeorm-agent-usage.repository.ts`; migración `apps/api/src/migrations/20261028100000-crear-uso-agente.ts` | SQL atómico bajo RLS; tabla `uso_agente` (§3) |
| 11 | shared | `infrastructure/config/{env.schema,secret-keys}.ts`, `presentation/configure-http-app.ts`; `.env.example`; `docs/operations/ambientes.md`; `apps/api/package.json` | `geminiShape` y `agentApiShape` (D-8); comentarios; script `agent:measure` (T-09); `/api/v1/agent/` en `NO_STORE_PATH_PREFIXES`; `pnpm env:check` debe pasar (CA-19 de 001) |
| 12 | contracts | `packages/contracts/src/intelligence/{agent.ts,error-codes.ts,index.ts}` | Esquemas zod (ADR-0020): petición, `agentStatusSchema`, `agentEventSchema`. Los 4 códigos del agente se **suman a `INTELLIGENCE_ERROR_CODES`** (un objeto de errores por módulo; no hay `AGENT_ERROR_CODES` aparte) |

- Documentos que se tocan dentro de la tarea que cambia el contrato (sin tarea de cierre): `architecture.md` §5 (fila `IAgentQuota`), §7.4 (HTTP en streaming, sin `consulta_agente`/`cita`) y regla 7 de §3; `design-model.md` M6 y `intel/README.md`
  (variables, `nearest`); `design-findings.md`; `pendientes.md`; `ambientes.md`.
- **Puerto nuevo entre módulos: `IAgentQuota`** (Art. V.2 d: `intelligence` usa `billing` sin conocer sus repositorios; ya está en `architecture.md` §5). `ILanguageModel`: (a)+(c). `IChunkSearch`, `IAgentUsageRepository`: (b).
  No se crean `IAgentService`, `IRetriever`, `ICitationValidator`, `IConversationRepository` (una sola implementación, sin segundo consumidor).
- **Dependencias entre módulos**: `intelligence → billing` (`boundaries.js` ya lo permite) e `intelligence → access` (`accessibleNodes`); no se usa `storage` ni `realtime` aquí. `billing` no importa `intelligence`.
- Funciones ≤ 30 líneas y ≤ 3 parámetros: objetos de entrada nombrados (`AskRequest`, `RetrievalRequest`, `ReserveInput`, `SearchQuery`).

## 3. Datos
```sql
-- 20261028100000-crear-uso-agente (billing)
CREATE TABLE uso_agente (
  usuario_id     uuid        NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  periodo_inicio timestamptz NOT NULL,   -- inicio del periodo de la suscripción de pago o del mes de Guatemala (Personal)
  consultas      integer     NOT NULL CHECK (consultas >= 0),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, periodo_inicio)
);
ALTER TABLE uso_agente ENABLE ROW LEVEL SECURITY;  ALTER TABLE uso_agente FORCE ROW LEVEL SECURITY;
CREATE POLICY uso_agente_cliente ON uso_agente TO nimbo_app
  USING      (nimbo_actor_role() = 'CLIENT' AND usuario_id = nimbo_actor_id())
  WITH CHECK (nimbo_actor_role() = 'CLIENT' AND usuario_id = nimbo_actor_id());   -- como suscripcion_cliente; sin política interna
```
- `down`: `DROP POLICY uso_agente_cliente` y `DROP TABLE uso_agente`; probada con `migration:revert` (RNF-10). Sin limpieza de filas viejas (una por cuenta y periodo; DF-25).
- `fragmento` e `indexacion`: **sin migración**; la 020 usa lo existente (D-1). Sin índices nuevos: el prefiltro por cuenta sale de `accessibleNodes` y `idx_fragmento_archivo`; `uso_agente` se consulta por su clave primaria.

## 4. Contratos
| Método | Ruta (`/api/v1`) | Rol | Request → Respuesta | Errores (`code`) |
|---|---|---|---|---|
| POST | `/agent/ask` | CLIENT | `{question, scope?: {type: 'folder'\|'file', id}}` → 200 `text/event-stream` | 422 `AGENT_INVALID_QUESTION` (motivo `empty`\|`too_long`); 404 `AGENT_SCOPE_NOT_FOUND`; 429 `AGENT_QUOTA_EXCEEDED` (`details`: `limit`, `resetsAt`); 429 `SHARED_TOO_MANY_REQUESTS`; 503 `AGENT_UNAVAILABLE`; 403 `SHARED_FORBIDDEN` |
| GET | `/agent/status` | CLIENT | → 200 `{used, limit, resetsAt: ISO \| null, hasIndexedFiles, maxQuestionChars}` (CA-7, CA-10) | 403 `SHARED_FORBIDDEN` |

- Eventos (cada marco SSE es un JSON con `type`; cabeceras `Cache-Control: no-store, no-transform` y `X-Accel-Buffering: no`): `citation {ordinal, fileId, versionId, fileName, label, isCertain}`
  (una vez por ordinal, **antes** del `delta` que lo menciona); `delta {text}`; `done {outcome: 'answered'\|'not_found', used, limit}`; `error {code: 'AGENT_UNAVAILABLE'}` solo si el fallo llega con texto ya enviado.
- Los errores previos al primer evento son JSON normales con `code`, `message` y `correlationId` (`errorResponseSchema`). `fileName` y `label` van al navegador del dueño; nunca al proveedor del modelo ni a bitácoras (S-1).
- 020b consume estos esquemas; `maxQuestionChars` existe porque 020b no debe copiar el 1 000. Sin eventos Socket.IO.

## 5. Seguridad y operación
- `actor` en `AgentService`, `HybridRetriever`, `IChunkSearch` e `IAgentQuota`. Toda lectura de fragmentos va dentro de `withActor` con `accessibleNodes(actor)` **en la misma consulta** y RLS de `fragmento`/`archivo`/`indexacion`/`uso_agente`; no se filtra
  después. Roles internos: `@Roles(CLIENT)` (CA-16), `accessibleNodes` vacío y sin política en `fragmento`.
- Al proveedor viajan solo la pregunta y los textos de fragmentos autorizados (sin nombres ni ids). El modelo no tiene herramientas: una inyección solo puede alterar el texto que ve su propio dueño.
- Bitácora `agent.asked` (`agent-logger.ts`): `correlationId`, `durationMs`, `fragmentCount`, `outcome` (`answered`, `not_found`, `no_indexed`, `quota`, `unavailable`, `invalid`) y el conteo de fragmentos descartados por procedencia inválida.
  Prohibido: pregunta, respuesta, fragmentos, nombres, clave. Sin auditoría visible ni evento (spec §5). Métricas del agente: 022.
- Límite de tasa por cuenta antes de reservar (`I_RATE_LIMITER`, constante nombrada; una petición limitada no gasta consulta), como `index-status.service.ts` con otra clave.
- Variables: D-8. Todo en `.env.example`, `apiEnvSchema` y `ambientes.md`.

## 6. Estrategia de pruebas (por riesgo)
Siembra: se reutilizan `insertChunk`, `insertIndexing` y `axisVector` de `test/int/intelligence/intelligence-test-db.ts` (no hay `seed-fragments.ts`). Dobles nuevos o ampliados en `test/support/`.
| CA | Nivel | Archivo |
|---|---|---|
| 6 | unit (vacía, solo espacios, límite exacto, límite+1) + int (422 y `uso` intacto) | `intel/domain/agent-question.spec.ts`; `test/int/intelligence/agent-ask.int-spec.ts` |
| 1, 3, 4 | unit: `CitationMarkerFilter` (marca partida, `[n]` no entregado, id inventado, texto hostil), `prompt-builder` (escape), `sourceLocationFromJson` (5 tipos + inválido), `AnswerComposer` (frase fija sin modelo, `not_found`, una sola advertencia de ubicación aproximada) | `citation-marker-filter.spec.ts`, `prompt-builder.spec.ts`, `source-location-json.spec.ts`, `answer-composer.spec.ts`, `rrf-fuse.spec.ts` |
| 1, 3, 4, 7, 16 | int con `ILanguageModel` sustituido: respuesta con citas del servidor (docx, pdf, texto, xlsx, pptx), vacía → frase, sin indexados → frase sin descuento, cada rol interno → 403 en ambas rutas | `agent-ask.int-spec.ts`, `agent-status.int-spec.ts` |
| 3, 9, 17 | int de `TypeOrmChunkSearch`: keyword y vector filtran por `accessibleNodes` en la misma consulta; solo versión vigente; papelera excluida; ámbito archivo/carpeta con subcarpetas; ámbito ajeno = inexistente; **falla si cambian** `archivo(id, carpeta_id, version_actual_id)` o `carpeta(id, ruta)`; `hasIndexed` por `indexacion.estado`; roles internos sin filas | `test/int/intelligence/chunk-search.int-spec.ts`; unit `hybrid-retriever.spec.ts` (`TOP_K`, `MIN_SIMILARITY`, `task: 'query'`) |
| 2 | int: el primer evento llega antes de que el doble termine (no hay buffering) · medición de p95 de 20 preguntas con Gemini real (opt-in por `GEMINI_API_KEY`, no corre en CI) | `agent-streaming.int-spec.ts`; `apps/api/test/perf/agent-measure.ts` (`pnpm --filter api agent:measure`, T-09) |
| 11, 12, 13, 14 | unit: `agentUsagePeriod` (pago, adelantado, solo lectura, 31/oct 23:59 y 1/nov 00:00 en Guatemala, Personal sin fila) · int billing: N reservas paralelas con límite 3 → 3 concedidas; renovar → contador 0; solo lectura consulta y consume; `release` a la fila original | `billing/domain/agent-usage-period.spec.ts`; `test/int/billing/agent-quota.int-spec.ts` |
| 11, 12, 15 | int HTTP: agotada → 429 con `details`; dos preguntas simultáneas con 1 disponible → 200 y 429; modelo caído antes de texto → 503 y uso intacto; falla a mitad → `error` y uso intacto; abort antes del primer fragmento libera; `GET /files` sigue respondiendo | `agent-ask.int-spec.ts` |
| 15 | unit: plazos y mapeo de errores de `GeminiFlashModel` con `fetch` simulado + contrato compartido de `ILanguageModel` (doble y fixture SSE) y de `IEmbeddingProvider` con `task` | `gemini-flash.model.spec.ts`, `language-model.contract.ts`, `embedding-provider.contract.ts`, `fake-language-model.ts`, `fake-embedding.provider.ts` |
| 10 | int: `GET /agent/status` (usadas, total del plan, `resetsAt`, `hasIndexedFiles`, `maxQuestionChars`) | `agent-status.int-spec.ts` |
| 17, 9 | iso (bloqueante): A y B con textos casi idénticos; dato único de B no aparece en respuesta ni citas; ámbito de archivo/carpeta de B → 404 igual que inexistente; modelo malicioso (`[99]`, ids ajenos) → descartados; papelera o versión vieja no se recupera; roles internos sin filas de `uso_agente` | `test/isolation/agent.iso-spec.ts` |
| 18 | int: capturar logs y afirmar campos presentes y ausencia de pregunta, respuesta, nombres y clave | `agent-ask.int-spec.ts` |
| migración, env | int: `up`/`down`, `CHECK`, RLS · `pnpm env:check` y `env.schema.spec.ts` (claves del `api`) | `test/int/billing/agent-usage-migration.int-spec.ts` |
| 5 | **Diferido a 012** (no alcanzable): Lector/Editor y revocación se suman a `agent.iso-spec.ts` (PD-132) | — |

- Las pruebas de la 019 que usaban `nearest` (`chunk.repository.int-spec.ts`, `intelligence.iso-spec.ts`, `intelligence-fakes.ts`) se migran en T-05. Sin repetir un CA en tres capas. Cobertura de lógica de negocio ≥ 60 %.

## 7. Riesgos y coherencia con el diseño
1. **Similitud mínima sin calibrar** (CA-3): el doble de embeddings es un hash, no mide cercanía semántica; `MIN_SIMILARITY` queda provisional hasta T-09 con el embedding real. Si el corpus de medición no la separa bien, se ajusta en la revisión de T-10, no se inventa.
2. **No hay corpus** (`pnpm seed` es un marcador): CA-2 y T-10 dependen del script `agent:measure`, que genera su corpus con los generadores de `test/support/*-fixture.ts`. PD-133 deja el `seed` real a quien lo haga.
3. **Recall y latencia del barrido exacto** con muchas decenas de miles de fragmentos por cuenta: medido en T-09; plan B `hnsw.iterative_scan` (pgvector ≥ 0.8).
4. **Streaming por proxies**: verificado por configuración (D-6); falta staging. Humo con `curl -N` y PD-131.
5. **Crash entre reservar y responder** deja 1 consulta consumida (se prefiere sobrecobrar una a regalar sin límite); el caso normal (error/abort) siempre libera.
6. **Inyección residual**: el servidor garantiza procedencia y aislamiento, no que el modelo diga la verdad; por eso las citas son del servidor y, sin cita válida, se agrega el aviso de D-5.
7. **API y modelo de Gemini cambian**: adaptador aislado + prueba de contrato; id del modelo y forma de la API se confirman al implementar.
8. **Módulo ajeno**: `billing` es de Juan Marcos (`specs/README.md`); las filas 9 y 10 son el único cambio en un módulo ajeno. Adrián, como tech lead, autoriza el cambio sin visto bueno de Juan Marcos (2026-10-25).
- **Desviaciones de los diagramas** (`design-findings.md`): DF-14 y DF-79 ya aceptados y aplicados por la 019 (solo se actualiza el estado a «aplicado y usado por 020»); DF-07 ya aplicado (rehidratación en D-1); DF-08 → No aplica (RN-10);
  DF-15 → `AgentController` Aceptado, `Conversation`/`AgentQuery` Descartado; DF-25 → Parcial (`uso_agente` por periodo, sin `agentQueriesUsed`); DF-27 → `IAgentQuota` Aceptado (`reserve/release/status`); DF-81 → Aceptado (ADR-0035) y **se acota a las
  columnas de §D-2**; DF-82 → HTTP en streaming (corrige `architecture.md` §7.4).
- **Pendientes** (`pendientes.md`): PD-130 → Resuelto (019 entregó el contrato; se anota lo que difería: sin btree conjunto, `task` y `sourceLocationFromJson` lo hace la 020); PD-129 y PD-131 → PD-131 no repite el redibujo de M6 de PD-129:
  se limita a `uso_agente`, `IAgentQuota` y el HTTP del agente (el E-R/M6 se redibuja una vez, bajo PD-129); PD-132 → CA-8 pasa a 020b, queda 012 para CA-5; **PD-133 nuevo**: `pnpm seed` sigue siendo un marcador (la 020 usa `agent:measure`).
- **ADR requeridos**: ninguno nuevo (ADR-0035 aceptado; Gemini por `fetch`, ADR-0033). `architecture.md` §3 regla 7 ya describe el filtro previo; se completa con la excepción de lectura de ADR-0035.

## 8. Aprobación
- `architect` (2026-10-25, plan original): **Aprobado con cambios**. Evidencia: (1) `IAgentQuota`: `boundaries.js` permite `intelligence → billing` y `billing` no admite `intelligence`; declararlo en `billing` mantiene el DAG y es coherente con `architecture.md` §3 y §5 (PD-18); Art. V.2 d. (2) DF-81: excepción aceptada, con ADR-0035. (3) DF-82: no contradice ADR-0030; no requiere ADR. (4) Gemini por `fetch` nativo: sin dependencia, sin ADR.
  Cambios exigidos, ya cumplidos o vigentes: 1. ADR-0035 aceptado; el SQL de `archivo`/`carpeta` acotado a `chunk-sql.ts` con prueba que falla si cambian las columnas. 2. `agentUsagePeriod` y `AgentQuotaService` reutilizan `I_CLOCK` y `PAID_PLAN_PERIOD_DAYS` (`Grep` antes de escribir otra). 3. `AgentService.ask` solo orquesta; ninguna función > 30 líneas ni > 3 parámetros. 4. Al cerrar: `architecture.md` §5 y §7.4, `design-model.md` M6 en el mismo PR (PD-18 ya lo cerró la 019). 5. ADR-0035 en «ADR requeridos».
  **Cambios desde ese veredicto (2026-10-25, planner)**: la 019 ya existe y el plan usa su contrato real; `IChunkSearch` nuevo en lugar de ampliar `IChunkRepository` y retiro de `nearest`; vectorial exacto sin HNSW; `gemini-http.ts`; la clave de Gemini entra al `api` (D-8); el panel web sale a 020b. **Ninguno agrega puerto entre módulos, tecnología ni cambia la arquitectura**: `IChunkSearch` es interno de `intelligence` y el resto se justifica en D-2/D-7/D-8. Sin nuevo dictamen de `architect` salvo que Adrián lo pida.
- Adrián (2026-10-25, plan original): **Aprobado** con los cambios 1–5 y «Lo discutible» (P-9 de la spec). - Adrián (2026-10-25, cambio de alcance): **Aprobado** sobre el resumen de ≤ 15 líneas. Decisiones: el contador queda en la 020 con **visto bueno de Juan Marcos** (dueño de `billing`) en el PR, sin 020a; se aceptan `IChunkSearch` con el retiro de `nearest`, el vectorial exacto sin HNSW y la clave de Gemini también en el `api` (enmienda RN-9 de la 019).

## 9. Registro de cambios
| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-10-25 | Plan inicial (34 filas, con `apps/web`) | `/plan 020` | Adrián |
| 2026-10-25 | **Reescrito para la 020 (API)**: 12 filas; sin `apps/web` (→ 020b); contrato real de la 019 (D-1); `IChunkSearch` y retiro de `nearest` (D-2); `gemini-http.ts` (D-7); `task` en embeddings y clave del `api` (D-8); `GET /agent/status` suma `maxQuestionChars`; códigos en `INTELLIGENCE_ERROR_CODES`; corpus de medición (R-2); DF/PD reconciliados. Vuelve a «Propuesto» | ADR-0034 y decisión de Adrián | Adrián |
| 2026-10-25 | Aprobado tras el cambio de alcance; `billing` con visto bueno de Juan Marcos en el PR | Resumen aprobado | Adrián |
| 2026-10-25 | `billing` sin visto bueno de Juan Marcos: lo autoriza Adrián como tech lead | Decisión de Adrián | Adrián |
