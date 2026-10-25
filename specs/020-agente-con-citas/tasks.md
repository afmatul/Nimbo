# Tareas 020 — Agente con citas (API)

> Spec: `./spec.md` · Plan: `./plan.md` (Propuesto; `/implement` exige «Aprobado»). El panel web es la 020b.
> 10 tareas verticales, un commit cada una (`feat(intelligence): … [020 T-xx]`). Cada tarea es una línea: criterio, prueba y de qué depende; los archivos viven en `plan.md` §2 y §6.
> Toda tarea de lógica empieza por su prueba (roja → verde). Funciones ≤ 30 líneas y ≤ 3 parámetros. Los documentos de diseño (plan §2, nota de documentos) se actualizan dentro de la tarea que cambia el contrato; no hay tarea de cierre.

- [ ] **T-01** Pregunta, errores y contratos del agente, y variables de entorno del `api` (clave de Gemini, plazos, máximo; `/agent/` sin caché; comentarios de RN-9 corregidos) — CA: CA-6 (regla), CA-18 (clave redactada) — Prueba: unitaria de `AgentQuestion` y de los esquemas zod, `env.schema.spec.ts` y `pnpm env:check`
- [ ] **T-02** Contador de consultas en `billing`: `uso_agente`, `agentUsagePeriod` e `IAgentQuota` (`reserve`/`release`/`status`); fila `IAgentQuota` de `architecture.md` §5 (PD-18 ya está cerrado), DF-25 y DF-27 al día — CA: CA-10 (dato), CA-11, CA-12, CA-13, CA-14 (servicio) — Prueba: unitaria del periodo + integración de migración (`up`/`down`, RLS) y de N reservas paralelas con límite 3
- [ ] **T-03** Proveedor Gemini: `gemini-http.ts` compartido, `task` `query|document` en embeddings y `GeminiFlashModel` con su doble — CA: CA-15 (adaptador y plazos) — Prueba: unitaria con `fetch` simulado y contratos compartidos de `ILanguageModel` e `IEmbeddingProvider` — Depende: T-01
- [ ] **T-04** Citas del servidor: `sourceLocationFromJson`, `RetrievedFragment`, RRF, prompt escapado y filtro de marcas `[n]` — CA: CA-1, CA-3, CA-4 (dominio), RN-6 — Prueba: unitaria (marca partida, `[n]` inventado, texto hostil, hoja y diapositiva) — Depende: T-01
- [ ] **T-05** Recuperación híbrida filtrada: `IChunkSearch`, SQL acotado por ADR-0035 y `HybridRetriever`; retira `nearest` y migra sus pruebas; DF-14, DF-79 y DF-81 al día — CA: CA-3 (umbral provisional), CA-9, CA-17 (recuperación) — Prueba: integración con fragmentos sembrados (versión vigente, papelera, ámbito, ajeno, columnas de `storage`) + unitaria del retriever — Depende: T-03, T-04
- [ ] **T-06** Composición y orquestación: `AnswerComposer`, admisión (tasa, ámbito, indexados), `AgentService` con `reserve`/`release` y bitácora `agent.asked` — CA: CA-1, CA-3, CA-4, CA-6, CA-7, CA-15 (liberación), CA-18 (campos) — Prueba: unitaria con `FakeLanguageModel` y dobles de cuota y recuperación — Depende: T-02, T-03, T-04, T-05
- [ ] **T-07** `POST /agent/ask` (SSE) y `GET /agent/status`; `architecture.md` §7.4, `design-model.md` M6, DF-08/15/82 y PD-131 al día — CA: CA-1, CA-2 (sin buffering), CA-3, CA-6, CA-7, CA-10 a CA-16, CA-18 — Prueba: integración HTTP por endpoint (feliz, 422, 429 y carrera, 503 antes y a mitad, 403 de cada rol interno, bitácora sin texto) — Depende: T-06
- [ ] **T-08** Aislamiento (bloqueante; lo revisa `security-auditor`): A no obtiene datos, citas ni ámbitos de B; modelo malicioso; papelera y versión vieja; roles internos sin filas — CA: CA-17, CA-9, CA-16 (datos) — Prueba: aislamiento (`pnpm test:isolation`) — Depende: T-07
- [ ] **T-09** Medición y calibración con embedding real: script opt-in `agent:measure` que genera su corpus, mide el p95 del primer fragmento y fija `MIN_SIMILARITY` y los plazos — CA: CA-2, CA-3 (umbral) — Prueba: unitaria del cálculo de p95 y del umbral; la corrida real queda anotada en el plan (no corre en CI) — Depende: T-07
- [ ] **T-10** **(humana, Adrián)** Recorrido de la demo por API en local con `GEMINI_API_KEY` real: pregunta con citas, «No encontré esto», ámbito, agotar consultas, quitar la clave, Soporte recibe 403 y `curl -N` a través de Traefik (PD-131); nota en el PR — CA: los visibles (CA-1 a CA-4, CA-7, CA-10 a CA-16), CA-2 medido — Depende: T-08, T-09

## Matriz CA → tarea

| CA | Tarea(s) | CA | Tarea(s) |
|---|---|---|---|
| CA-1 | T-04, T-06, T-07, T-10 | CA-10 | T-02, T-07 |
| CA-2 | T-07, T-09, T-10 | CA-11 | T-02, T-07, T-10 |
| CA-3 | T-04, T-05, T-06, T-09 | CA-12 | T-02, T-07 |
| CA-4 | T-04, T-06 | CA-13 | T-02, T-07 |
| CA-5 | Diferido a 012 (PD-132) | CA-14 | T-02, T-07 |
| CA-6 | T-01, T-06, T-07 | CA-15 | T-03, T-06, T-07, T-10 |
| CA-7 | T-06, T-07, T-10 | CA-16 | T-07, T-08, T-10 |
| CA-8 | Movido a 020b | CA-17 | T-05, T-08 |
| CA-9 | T-05, T-08 | CA-18 | T-01, T-06, T-07 |

## Notas del developer
<Desviaciones (con enlace al registro de cambios de la spec), DF o pendientes que surgieron.>
