# Plan 020 — Agente con citas

> Spec: `./spec.md` · Estado del plan: Aprobado (Adrián, 2026-10-25)
> Qué archivos se tocan y qué se espera de cada uno. Sin cuerpos de funciones. Lo aprueba Adrián antes de escribir código.

## 1. Resumen técnico y decisiones
`intelligence` (M6) recibe la pregunta del cliente, recupera fragmentos **dentro de la consulta** (nodos accesibles + RLS), pide la respuesta
al modelo y la devuelve **por streaming HTTP**. `billing` lleva el contador de consultas. No se guarda historial (RN-10).

- **D-1 Contrato con 019** (P-7). La migración de `fragmento`, `IEmbeddingProvider`/`GeminiEmbeddingProvider` y el dominio `SourceLocation`
  (`label()`, `isCertain()`, lectura de `procedencia`) los crea la **019**; la 020 los exige como prerrequisito (§3) y sus pruebas siembran
  fragmentos directo en BD. Evita que dos specs escriban la misma tabla. Lo que 019 debe respetar queda en PD-130.
- **D-2 Recuperación** (RNF-05, RN-2, RN-9). `HybridRetriever` embebe la pregunta (fuera de transacción) y, en un `withActor`, ejecuta
  `keywordSearch` y `vectorSearch` con el mismo filtro: `archivo.id IN accessibleNodes(actor)` + `fragmento.version_archivo_id = archivo.version_actual_id`
  (solo vigente; la papelera ya la excluye `accessibleNodes`) + ámbito opcional (archivo: igualdad; carpeta: `carpeta.ruta LIKE <ruta>%` sobre carpetas accesibles).
  `fuse` por RRF en dominio. Un ámbito ajeno o inexistente da `404 AGENT_SCOPE_NOT_FOUND` idéntico (CA-17). Sin índice ANN hasta que la
  medición de CA-2 lo pida (YAGNI); si 019 crea HNSW se usa `hnsw.iterative_scan` para que el filtro no pierda recall.
- **D-3 Contador** (RF-34). Tabla `uso_agente` en **billing** (dueño de la suscripción y su periodo; E-R/DF-25), no en `intelligence`.
  Clave `(usuario_id, periodo_inicio)`: el periodo nuevo es una fila nueva, así que CA-13 no necesita un trabajo de reinicio. Pago: periodo = el de la
  suscripción (si ya se pagó el siguiente por adelantado, el actual empieza 30 días antes de `iniciado_en`, constante `PAID_PLAN_PERIOD_DAYS`); Personal o sin fila:
  mes calendario de `America/Guatemala`. Solo lectura: periodo vencido, el contador no se reinicia hasta pagar (`resetsAt: null`). **Reserva atómica**: una
  sentencia `INSERT … ON CONFLICT DO UPDATE … WHERE consultas < límite RETURNING` en transacción corta que se confirma antes del streaming
  (CA-12: sin fila devuelta = agotada). Si algo falla antes de entregar la respuesta, `release` resta 1 de **la misma** fila (RN-5, CA-15).
- **D-4 `IAgentQuota`**: lo **declara e implementa `billing`** (PD-18, DF-27, ADR-0032 regla 1). No aplica el patrón de DF-51/ADR-0022 (el consumidor
  declara) porque ese patrón existe para romper un ciclo y aquí `intelligence → billing` ya está en el grafo; que `billing` lo declarase al revés
  (`billing → intelligence`) lo cerraría. Métodos: `reserve(actor)`, `release(actor, reservation)`, `status(actor)`; devuelven resultados (`granted | exhausted`),
  sin lanzar errores de `billing` hacia `intelligence`. Límite del plan desde `Plan.limits.agentQueriesPerMonth` (RN-3); no se ensancha `PlanLimits` de `storage`.
- **D-5 Citas e inyección** (§5 de la spec). El modelo recibe fragmentos **numerados 1..K** (nunca ids ni nombres) como datos delimitados y escapados, y cita con
  `[n]`. `CitationMarkerFilter` (dominio, con estado, tolera marcas partidas entre trozos) conserva solo `[n]` entregados y descarta el resto; archivo, versión,
  etiqueta y certeza de cada cita **salen del servidor** desde el fragmento. La web muestra texto plano (sin Markdown ni HTML ni enlaces): cierra la exfiltración por imagen/enlace.
  Si hay citas inciertas el servidor agrega una frase fija (CA-4). Sin ninguna cita válida el resultado es `not_found`.
- **D-6 Transporte**: `POST /agent/ask` responde `text/event-stream` leído con `fetch` (EventSource no admite POST ni `Authorization`). No Socket.IO: el canal de 015
  (ADR-0030) es de avisos `toUser/toDocument`, y 422/429/503 deben ser estados HTTP **antes** de abrir el flujo (CA-6, 11, 15); además cancelar es cerrar la petición. El primer
  evento se espera antes de escribir cabeceras, así los errores previos pasan por `DomainExceptionFilter`. Sin buffering: no hay `compress` ni `buffering` en
  `infra/traefik/*` ni en las etiquetas de `compose.override.yml`; `/api` va de Traefik directo al `api` (Next no interviene); el `api` no comprime. Se verifica con `curl -N` (T de humo) y
  el `traefik.staging.yml` futuro (T-38) no debe comprimir `text/event-stream` (PD-131).
- **D-7 Degradación** (RNF-09): `ILanguageModel` con plazo al primer trozo y entre trozos (variables); fallo, plazo o falta de clave → `AgentUnavailableError` (503) y `release`.
  **Sin dependencia nueva**: `GeminiFlashModel` usa `fetch` nativo de Node 22 contra la API REST (la clave viaja en cabecera `x-goog-api-key`, nunca en URL). Si el equipo prefiere el SDK de
  Google, requiere ADR (no se propone). El id del modelo y la forma exacta de la API se verifican contra la documentación del proveedor al implementar.
- **D-8 Sin persistencia**: no hay `conversacion`, `consulta_agente` ni `cita`. DF-08 deja de aplicar; DF-15 cierra con `AgentController` y sin `Conversation`/`AgentQuery`.
- **Decisión de menor rango**: cancelar el cliente antes del primer fragmento = `release`; después, la consulta cuenta (respondida, RN-5). Sin fragmentos indexados: se responde la frase fija sin modelo y sin descontar (CA-7).

## 2. Módulos, archivos y diseño
| Módulo / capa | Archivo (nuevo o cambiado) | Responsabilidad |
|---|---|---|
| intelligence/domain | `agent-question.ts` | `AgentQuestion.parse(raw, maxChars)`: recorta, rechaza vacía o larga → `AgentInvalidQuestionError` con motivo (RN-7) |
| intelligence/domain | `agent-scope.ts`, `retrieved-fragment.ts` | Tipos `AgentScope` (`all \| folder \| file`) y `RetrievedFragment` (ids, texto, `SourceLocation` de 019) |
| intelligence/domain | `rrf-fuse.ts` | `fuse`: fusión RRF (k constante nombrada) de las dos listas; pura |
| intelligence/domain | `prompt-builder.ts` | Instrucción de sistema (español, solo fragmentos, citar `[n]`, frase fija si no hay respuesta, fragmentos = datos) y fragmentos numerados y escapados |
| intelligence/domain | `citation-marker-filter.ts` | Filtro con estado: `push(chunk)` → texto limpio y ordinales nuevos válidos; `finish()`; descarta `[n]` no entregados |
| intelligence/domain | `errors/*.ts` | `AgentInvalidQuestionError` 422, `AgentQuotaExceededError` 429 (`limit`, `resetsAt`), `AgentUnavailableError` 503, `AgentScopeNotFoundError` 404 |
| intelligence/application | `agent.service.ts` | `ask(actor, request)`: generador de eventos (admisión → `reserve` → recuperación → composición; `release` ante cualquier fallo previo a la entrega); `status(actor)` |
| intelligence/application | `agent-admission.ts` | Límite de tasa (`I_RATE_LIMITER`, clave por cuenta, regla constante), `AgentQuestion`, `scopeExists`, `hasIndexed` (sin indexados: frase fija, sin `reserve`) |
| intelligence/application | `hybrid-retriever.ts` | Embebe la pregunta, ejecuta las dos búsquedas con `IChunkRepository` en un `withActor`, `fuse`, `TOP_K` y similitud mínima (constantes, calibradas en T-08) |
| intelligence/application | `answer-composer.ts` | Une el flujo del modelo con `CitationMarkerFilter`; emite `citation`, `delta`, frase de ubicación aproximada, `done {outcome}`; sin fragmentos → frase fija sin llamar al modelo |
| intelligence/application | `agent-logger.ts` | Bitácora CA-18: correlación, `durationMs`, `fragmentCount`, `outcome`; nada de texto, nombres ni clave |
| intelligence/application | `agent-config.ts` | `AGENT_CONFIG`: máximo de pregunta, plazos del modelo, modelo (desde el esquema de entorno) |
| intelligence/application/ports | `i-language-model.port.ts`, `i-chunk-repository.port.ts` | `ILanguageModel` (`stream(prompt, signal)`), `IChunkRepository` (`keywordSearch`, `vectorSearch`, `hasIndexed`, `scopeExists`; solo lectura). `IEmbeddingProvider` lo trae 019 (`embed(texts, task)` con `query`/`document`) |
| intelligence/infrastructure | `gemini-flash.model.ts` | `GeminiFlashModel implements ILanguageModel`: REST con `fetch`, SSE de Gemini, `AbortSignal` con ambos plazos, errores → `AgentUnavailableError` |
| intelligence/infrastructure | `sql-chunk.repository.ts`, `chunk-sql.ts` | Consultas con `TransactionContext.requireActorScope(actor)` y `accessibleNodes(actor)`; unen `archivo`/`carpeta` en **solo lectura** (DF-81) |
| intelligence/presentation | `agent.controller.ts`, `sse-writer.ts` | `POST /agent/ask`, `GET /agent/status` (`@Roles(CLIENT)`); el writer cabeceras y marcos SSE, `error` a mitad de flujo, cierra al abortar el cliente |
| intelligence | `intelligence.module.ts`, `index.ts` | Importa `BillingModule`; registra el módulo en `AppModule` (solo `api`; el `worker` no) |
| billing/domain | `agent-usage-period.ts` | `agentUsagePeriod(subscription \| null, now)` → `{startsAt, endsAt \| null}`; pura (pago, adelantado, solo lectura, mes de Guatemala) |
| billing/application | `ports/i-agent-quota.port.ts` | **Puerto** `IAgentQuota` + `I_AGENT_QUOTA` + tipos `AgentQuotaReservation`, `AgentQuotaStatus` |
| billing/application | `agent-quota.service.ts` | Implementa el puerto: `withActor` → suscripción (`ISubscriptionRepository.findCurrent`) → plan (`requirePlan`) → periodo → repositorio; `I_CLOCK` |
| billing/application | `ports/i-agent-usage.repository.port.ts` | Interno de billing: `reserveOne(actor, periodStart, limit)`, `releaseOne`, `read` (Art. V.2 b) |
| billing/infrastructure | `persistence/typeorm-agent-usage.repository.ts`, `billing.module.ts`, `index.ts` | SQL atómico bajo RLS; el módulo enlaza y exporta `I_AGENT_QUOTA`; `index.ts` exporta el token, el puerto y los tipos |
| migraciones | `20261028100000-crear-uso-agente.ts` | Tabla `uso_agente` (§3) |
| shared | `env.schema.ts`, `secret-keys.ts`, `.env.example`, `ambientes.md` | Variables de §5 (opcionales); `GEMINI_API_KEY` entra en `SECRET_KEYS` (redacción en bitácoras) |
| shared | `configure-http-app.ts` | `/api/v1/agent/` entra en `NO_STORE_PATH_PREFIXES` (respuestas con contenido del cliente) |
| contracts | `packages/contracts/src/intelligence/*` (+ `index.ts`) | Esquemas zod (ADR-0020): petición, `agentStatusSchema`, `agentEventSchema`; `AGENT_ERROR_CODES` |
| web | `features/intelligence/{agent-api.ts,agent-stream.ts}` | `getStatus` con `authFetch`; `streamAnswer` con `fetch`+`Authorization` (renueva una vez ante `401 SHARED_UNAUTHENTICATED`) y lector SSE con validación zod por evento |
| web | `features/intelligence/hooks/use-agent-conversation.ts` | Preguntas de la sesión **solo en memoria** (sin `localStorage`; se vacían al recargar, RN-10), ámbito, cancelación con `AbortController` |
| web | `components/nimbo/agent-panel.tsx` | `AgentPanel` presentacional: 420 px, hoja completa a 360 px; `aria-live="polite"`, sin animación con reduced-motion; estados `vacio`, `respondiendo`, `con-citas`, `sin-resultados`, `cita-incierta`, `limite-alcanzado`, `no-disponible`, `error-pregunta` con `StateView`; texto plano y `[n]` → `CitationChip` |
| web | `components/nimbo/citation-chip.tsx` | Existe; solo cambia el texto «ubicación estimada» por «ubicación aproximada» (spec §6) |
| web | `components/nimbo/app-layout.tsx`, `app/(app)/(cliente)/layout.tsx` | «Agente Nimbo» (hoy `#agente`) abre el panel; el layout monta el proveedor para conservar el estado al navegar (no al recargar) |
| web | `features/storage/components/file-detail-view.tsx` + vista de carpeta | Botón «Preguntar sobre esto» (fija el ámbito, RN-9); la ficha muestra «Ubicación citada» desde `?ubicacion=<etiqueta>` (P-5); archivo ajeno o en papelera: vista «No encontramos este archivo.» ya existente (CA-9) |

- **Puerto nuevo entre módulos: `IAgentQuota`** (Art. V.2: está en los diagramas y en `architecture.md` §5; cumple (d): `intelligence` usa `billing` sin conocer sus repositorios). `ILanguageModel`: (a)+(c). `IChunkRepository`, `IAgentUsageRepository`: (b).
  No se crean `IAgentService`, `IRetriever`, `ICitationValidator`, `IConversationRepository` (una sola implementación, sin segundo consumidor).
- **Dependencias entre módulos**: `intelligence → billing` (ya permitida en `boundaries.js`: `intelligence: ['storage','access','billing','realtime']`), `intelligence → access` (`accessibleNodes`). No se usa `storage` ni `realtime` en esta spec. `billing` no importa `intelligence`.
- Funciones ≤ 30 líneas y ≤ 3 parámetros: objetos de entrada nombrados (`AskRequest`, `RetrievalRequest`, `ReserveInput`).

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
- **Contrato mínimo de `fragmento` (lo crea 019; lo exige 020)**: `id uuid PK`; `archivo_id uuid NOT NULL REFERENCES archivo ON DELETE CASCADE` y `version_archivo_id uuid NOT NULL REFERENCES version_archivo ON DELETE CASCADE`
  (DF-14, indexados juntos con btree); `orden int`; `texto text`; `procedencia jsonb NOT NULL` con `tipo` (`pdf`: `pagina`; `docx`: `seccion`, `parrafo`; `txt`/`md`: `linea`) y `confianza` en [0,1] (DF-07);
  `embedding vector(768) NOT NULL`; `texto_busq tsvector` generado con configuración `spanish` e índice GIN. RLS `ENABLE`+`FORCE`: `CLIENT` ve el fragmento si ve su `archivo` (`EXISTS` sobre `archivo`, que ya tiene RLS y crecerá con 012); sin política para roles internos (no hay contenido para ellos).
  `nimbo_actor_role()` y `nimbo_actor_id()` ya existen. Solo hay fragmentos de la versión indexada más reciente (DF-08); la 020 igual exige coincidir con `version_actual_id`.

## 4. Contratos
| Método | Ruta (`/api/v1`) | Rol | Request → Respuesta | Errores (`code`) |
|---|---|---|---|---|
| POST | `/agent/ask` | CLIENT | `{question, scope?: {type: 'folder'\|'file', id}}` → 200 `text/event-stream` | 422 `AGENT_INVALID_QUESTION` (motivo `empty`\|`too_long`); 404 `AGENT_SCOPE_NOT_FOUND`; 429 `AGENT_QUOTA_EXCEEDED` (`details`: `limit`, `resetsAt`); 429 `SHARED_TOO_MANY_REQUESTS`; 503 `AGENT_UNAVAILABLE`; 403 `SHARED_FORBIDDEN` |
| GET | `/agent/status` | CLIENT | → 200 `{used, limit, resetsAt: ISO \| null, hasIndexedFiles}` (CA-7, CA-10) | 403 `SHARED_FORBIDDEN` |

- Eventos del flujo (cada marco SSE es un JSON con `type`; cabeceras `Cache-Control: no-store, no-transform` y `X-Accel-Buffering: no`): `citation {ordinal, fileId, versionId, fileName, label, isCertain}`
  (una vez por ordinal, **antes** del `delta` que lo menciona); `delta {text}`; `done {outcome: 'answered'\|'not_found', used, limit}`; `error {code: 'AGENT_UNAVAILABLE'}` solo si el fallo llega con texto ya enviado (el cliente conserva lo recibido y muestra el aviso, CA-15).
- Los errores previos al primer evento son JSON normales con `code`, `message` y `correlationId` (`errorResponseSchema`). `fileName` y `label` van al navegador del dueño; nunca al proveedor del modelo ni a bitácoras.
- La cita abre `/archivos/archivo/<fileId>?ubicacion=<etiqueta>` (sin 017). Con 017 la misma cita abre la vista previa resaltada (CA-8 completo, PD-132). Sin eventos Socket.IO.

## 5. Seguridad y operación
- `actor` en `AgentService`, `HybridRetriever`, `IChunkRepository` y `IAgentQuota`. Toda lectura de fragmentos va dentro de `withActor` con `accessibleNodes(actor)` **en la misma consulta** y RLS de `fragmento`/`archivo`/`uso_agente`; no se filtra después. Roles internos: `@Roles(CLIENT)` (CA-16), `accessibleNodes` vacío y sin política en `fragmento`.
- Al proveedor viajan solo la pregunta y los textos de fragmentos autorizados (sin nombres ni ids). El modelo no tiene herramientas: una inyección solo puede alterar el texto que ve su propio dueño.
- Bitácora `agent.asked` (`agent-logger.ts`): `correlationId`, `durationMs`, `fragmentCount`, `outcome` (`answered`, `not_found`, `quota`, `unavailable`, `invalid`). Prohibido: pregunta, respuesta, fragmentos, nombres, clave. Sin auditoría visible ni evento (spec §5). Métricas del agente: 022.
- Límite de tasa por cuenta antes de reservar (`I_RATE_LIMITER`, constante nombrada; una petición limitada no gasta consulta): acota costo y abuso además de la cuota.
- Variables nuevas del `api` (todas **opcionales**: sin clave el agente responde `AGENT_UNAVAILABLE` y el resto sigue): `GEMINI_API_KEY` (secreto), `GEMINI_CHAT_MODEL` (por omisión `gemini-3.5-flash`), `AGENT_MAX_QUESTION_CHARS` (1000, RN-7),
  `AGENT_MODEL_FIRST_CHUNK_TIMEOUT_MS` y `AGENT_MODEL_IDLE_TIMEOUT_MS` (valores iniciales a medir). `GEMINI_API_KEY`/`GEMINI_EMBEDDING_MODEL` los declara quien llegue primero (019 o 020; `Grep` antes). Todo en `.env.example`, `apiEnvSchema` y `ambientes.md`; `pnpm env:check` debe pasar (CA-19).

## 6. Estrategia de pruebas (por riesgo)
| CA | Nivel | Archivo |
|---|---|---|
| 6 | unit (vacía, solo espacios, límite exacto, límite+1) + int (422 y `uso` intacto) | `intelligence/domain/agent-question.spec.ts`; `test/int/intelligence/agent-ask.int-spec.ts` |
| 1, 3, 4 | unit: `CitationMarkerFilter` (marca partida entre trozos, `[n]` no entregado, id inventado, texto hostil), `prompt-builder` (escape), composición (frase fija sin modelo, `not_found` sin citas, nota de ubicación aproximada) | `citation-marker-filter.spec.ts`, `prompt-builder.spec.ts`, `answer-composer.spec.ts` |
| 1, 3, 4, 7, 16 | int con `ILanguageModel` sustituido: respuesta con citas del servidor, vacía → frase, sin indexados → frase sin descuento, cada rol interno → 403 en ambas rutas | `agent-ask.int-spec.ts`, `agent-status.int-spec.ts` |
| 2 | int: el primer evento llega antes de que el doble termine (no hay buffering) · medición de p95 de 20 preguntas del corpus de 019 con Gemini real (opt-in por `GEMINI_API_KEY`, no corre en CI) | `agent-streaming.int-spec.ts`; `test/perf/agent-first-fragment.perf.ts` |
| 11, 12, 13, 14 | unit: `agentUsagePeriod` (pago, adelantado, solo lectura, 31/oct 23:59 y 1/nov 00:00 en Guatemala, Personal sin fila) · int billing: N reservas paralelas con límite 3 → 3 concedidas; renovar → contador 0; solo lectura consulta y consume; `release` a la fila original | `billing/domain/agent-usage-period.spec.ts`; `test/int/billing/agent-quota.int-spec.ts` |
| 11, 12, 15 | int HTTP: agotada → 429 con `details`; dos preguntas simultáneas con 1 disponible → una 200 y una 429; modelo caído antes de texto → 503 y uso intacto; falla a mitad → `error` y uso intacto; `GET /files` sigue respondiendo | `agent-ask.int-spec.ts` |
| 15 | unit: plazos y mapeo de errores de `GeminiFlashModel` con `fetch` simulado + prueba de contrato compartida de `ILanguageModel` (doble y fixture SSE de Gemini) | `gemini-flash.model.spec.ts`, `language-model.contract.spec.ts` |
| 10 | int: `GET /agent/status` (usadas, total del plan, `resetsAt`) + web: contador en el panel | `agent-status.int-spec.ts`; `agent-panel.spec.tsx` |
| 17, 9 | iso (bloqueante): A y B con textos casi idénticos; dato único de B no aparece en respuesta ni citas; ámbito de archivo/carpeta de B → 404 igual que inexistente; modelo malicioso (devuelve `[99]` e ids ajenos) → descartados; archivo en papelera o versión vieja no se recupera | `test/isolation/agent.iso-spec.ts` |
| 18 | int: capturar logs y afirmar campos presentes y ausencia de pregunta, respuesta, nombres y clave | `agent-ask.int-spec.ts` |
| 8, 9 | web: la ficha muestra «Ubicación citada» y, si el archivo no existe, solo «No encontramos este archivo.» (sin ubicación) | `file-detail-view.spec.tsx` |
| UI | componentes: los 8 estados + axe + lector SSE (marcos partidos, evento inválido) + memoria solo de sesión | `agent-panel.spec.tsx`, `agent-stream.spec.ts`, `use-agent-conversation.spec.tsx`, `citation-chip.spec.tsx` |
| migración, 19 | int: `up`/`down`, `CHECK`, RLS · `pnpm env:check` | `test/int/billing/agent-usage-migration.int-spec.ts` |
| 5 | **Diferido a 012** (no alcanzable): casos de Lector/Editor y revocación se suman a `agent.iso-spec.ts` (PD-132) | — |

- Los fragmentos se siembran con `test/support/seed-fragments.ts` (necesita la migración de 019). Sin repetir un CA en tres capas. Cobertura de lógica de negocio ≥ 60 %.

## 7. Riesgos y coherencia con el diseño
1. **019 sin spec ni código**: es prerrequisito de `fragmento`, `IEmbeddingProvider` y `SourceLocation`. Sin ellos la 020 no arranca (T-01 de sus tareas lo verifica). Mitigación: PD-130 fija el contrato.
2. **Recall y latencia del filtro con vectores**: con filtro previo y pocos miles de fragmentos por cuenta basta el escaneo exacto; si 019 agrega HNSW, `iterative_scan` (pgvector ≥ 0.8) o se mide sin índice. La similitud mínima de «No encontré esto» se calibra con el corpus (CA-3) en T-08.
3. **Streaming por proxies**: verificado en local por configuración (D-6); falta staging (`traefik.staging.yml` no existe). Humo con `curl -N` y PD-131.
4. **Crash entre reservar y responder** deja 1 consulta consumida (se prefiere sobrecobrar una a regalar sin límite); el caso normal (error/abort) siempre libera.
5. **Inyección residual**: el servidor garantiza procedencia y aislamiento, no que el modelo diga la verdad; por eso las citas son del servidor, el texto es plano y, sin cita válida, se agrega «No pude respaldar esta respuesta con tus documentos.» (la pregunta igual cuenta como respondida, RN-5).
6. **API y modelo de Gemini cambian**: adaptador aislado + prueba de contrato; id del modelo y forma de la API se confirman con la documentación vigente al implementar.
7. **Periodo adelantado y solo lectura**: casos de borde cubiertos por `agentUsagePeriod`; en solo lectura agotada no hay fecha de renovación (`resetsAt: null`, la UI ofrece «Renovar plan»).
- **Desviaciones de los diagramas** (`design-findings.md`): DF-14 → Aceptado (columnas + RLS vía `archivo`); DF-08 → No aplica (RN-10); DF-15 → `AgentController` Aceptado, `Conversation`/`AgentQuery` Descartado; DF-25 → Parcial (`uso_agente` por periodo, sin `agentQueriesUsed` en `Subscription`); DF-27 → `IAgentQuota` Aceptado
  (`reserve/release/status` en lugar de `consume`); **DF-81 nuevo**: `intelligence` lee `archivo`/`carpeta` por SQL de solo lectura dentro de la misma consulta (tercera excepción documentada, tras `access` y `storage→usuario`; alternativa por fachada de `storage` descartada: el filtro debe vivir en la misma consulta, ADR-0005);
  **DF-82 nuevo**: respuesta por HTTP en streaming, no por `realtime` (corrige `architecture.md` §7.4).
- **Pendientes** (`pendientes.md`): PD-130 contrato con 019; PD-131 redibujar M6/E-R y corregir `architecture.md` §7.4, `design-model.md` M6 y el Traefik de staging; PD-132 012 (CA-5) y 017 (CA-8).
- **ADR requeridos**: ADR-0035 (DF-81, `Propuesto`); ninguno por dependencia (sin dependencia nueva). ADR-0003 (pgvector y dimensión 768) sigue `Pendiente` y lo necesita 019 antes de su código. Si `architect` exige ADR por la excepción de lectura SQL (DF-81), se redacta antes de la primera tarea.

## 8. Aprobación
- `architect` (2026-10-25): **Aprobado con cambios**. Evidencia: (1) `IAgentQuota`: `boundaries.js` permite `intelligence → billing` y `billing` no admite `intelligence`; declararlo en `billing` mantiene el DAG y es coherente con `architecture.md` §3 y §5 (PD-18). Se acepta el puerto (Art. V.2 d). (2) DF-81: se acepta la excepción, pero **requiere ADR-0035** (`Propuesto`; la regla 6 de `architecture.md` lo exige): `INodeMetadataReader` no filtra por `accessibleNodes` ni por ruta, y una fachada devolvería ids fuera de la consulta (ADR-0005). (3) DF-82: válido; ADR-0030 descartó SSE para la presencia bidireccional de 016, no para una respuesta unidireccional; no requiere ADR. (4) Gemini por `fetch` nativo: sin dependencia, sin ADR.
  Cambios exigidos:
  1. Adrián acepta ADR-0035 antes de la tarea de `sql-chunk.repository.ts`; esa tarea limita el SQL a `archivo(id, carpeta_id, version_actual_id)` y `carpeta(id, ruta)`, todo en `chunk-sql.ts`, y suma `sql-chunk.repository.int-spec.ts` (§6) que falla si esas columnas cambian.
  2. `agentUsagePeriod` y `AgentQuotaService` reutilizan `I_CLOCK` y la utilidad de zona horaria de Guatemala ya existente (`Grep` en `shared`/`billing` antes de escribir otra); la constante de 30 días se toma de la regla de periodo de la suscripción si ya existe (DRY, Art. VI.2).
  3. `AgentService.ask` solo orquesta: `reserve`/`release` en un helper (`try/finally` por resultado) y ninguna función > 30 líneas ni > 3 parámetros; el generador no mezcla SSE ni SQL.
  4. Al cerrar la 020: `architecture.md` §5 (fila `IAgentQuota`: `reserve/release/status`) y §7.4, `design-model.md` M6 y el cierre de PD-18 (PD-131) en el mismo PR; DF-08/14/15/25/27 pasan a `Aceptado` con el cierre.
  5. §7 «ADR requeridos»: ADR-0035 (DF-81) en lugar de «ninguno».
- Adrián (2026-10-25): **Aprobado**, con los cambios 1–5 de `architect`. ADR-0035 aceptado (cumple el cambio 1) y decisiones de §«Lo discutible» aceptadas tal como están: cancelar antes del primer fragmento libera la consulta; sin citas válidas cuenta como respondida con el aviso del servidor; en solo lectura con la cuota agotada, `resetsAt: null` y «Renovar plan»; límite de tasa por cuenta además de la cuota. También los mockups del panel (12 estados).

## 9. Registro de cambios
| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-10-25 | Plan inicial | `/plan 020` | — |
