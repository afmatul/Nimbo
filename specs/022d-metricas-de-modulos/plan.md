# Plan 022d — Grupos de los módulos en el tablero de operación

> Spec: `./spec.md` · Estado del plan: **Aprobado** (2026-11-08)
> Obligatorio y ≤ 250 líneas. Dice **qué** archivos se tocan y **qué** se espera de cada uno; no es el código en
> prosa (sin cuerpos de funciones ni pseudocódigo). Lo aprueba Adrián antes de escribir código.

## 1. Resumen técnico

Solo configuración declarativa, su prueba estática y el runbook. El tablero aprovisionado «Operación» de 022
(`uid` `nimbo-operacion`) suma cinco filas de Grafana (`type: "row"`): **Identidad, Almacenamiento, Indexación,
Optimizador y Agente**, con 15 paneles de series temporales en PromQL sobre las series del plan 022 §4. Los paneles 1 a
15 de 022 no cambian y las seis reglas de `alertas.json` tampoco (RN-3).

- **Sin código de `apps/` ni `packages/`**, sin migraciones, sin contratos, sin puertos, sin dependencias ni imágenes
  nuevas: `architect` no interviene (§8).
- **Prueba primero:** `scripts/observability.spec.ts` (la de 022) suma un bloque `022d` que localiza cada grupo por el
  título de su fila y exige sus consultas, las etiquetas permitidas (CA-12) y que cada ruta citada exista como plantilla
  en los controladores del `api`. Así, cambiar o borrar una ruta rompe la prueba y no deja un panel vacío sin aviso.
- **Tamaño:** 3 archivos de autor (1 JSON, 1 prueba, 1 documento), más `compose.yml` y una nota en ADR-0040 por H-2 de
  T-06 (R-8), y **≈ 1 día-persona** (suma de `tasks.md`), dentro
  de los 12 archivos y ~3 días de ADR-0034. Resuelve P-1 sin partir la spec.
- **Precondición:** 022 (PR #78) integrada en `main`. Los tres archivos que se cambian nacen en esa rama (R-1).

## 2. Módulos, archivos y diseño

Dueño: Abel. Ningún archivo de un módulo de negocio ni de `shared` (spec RN-4).

| Módulo / capa | Archivo (nuevo o cambiado) | Responsabilidad |
|---|---|---|
| infra/grafana | `infra/grafana/dashboards/operacion.json` (cambia) | Cinco filas y 15 paneles nuevos, ids 16 a 35 a continuación del 15 y debajo de él (`gridPos.y` ≥ 72). Filas con `collapsed: false`, así los paneles quedan en `panels` del primer nivel, que es donde los lee la prueba de 022 (`dashboardExprs`) y Grafana los aprovisiona igual. Misma fuente (`uid` `prometheus`), mismas ventanas (`rate[5m]`) y mismo estilo de leyendas que los paneles de 022. `uid`, `title`, `editable: false` y `version` no cambian |
| scripts | `scripts/observability.spec.ts` (cambia) | Bloque `022d` con tres ayudantes locales al archivo: paneles de un grupo (los que siguen a la fila de ese título hasta la siguiente fila), etiquetas usadas por una consulta y rutas declaradas por los controladores (`apps/api/src/modules/**/presentation/*.controller.ts`, `@Controller` más `@Get`/`@Post`/`@Put`/`@Patch`/`@Delete` con cadena literal, prefijo `/api/v1`). Casos por grupo (§6) |
| raíz | `compose.yml` (cambia, H-2 de T-06) | Grafana pasa de `mem_limit: 256m` a `768m` con `GOMEMLIMIT=690MiB`; prueba R-4 de `observability.spec.ts` y nota en ADR-0040 (decisión de Adrián, 2026-11-10) |
| docs/operations | `docs/operations/observabilidad.md` (cambia) | §5: filas de los paneles 16 a 35 con su lectura. §4: cómo generar tráfico de cada grupo en local (curl para identidad; la web para cargas, descargas, optimización y agente) y qué grupo queda vacío sin la clave de Gemini o sin corpus (PD-135). §8: límites conocidos (S-1 a S-4 de la spec) |

**Paneles nuevos** (todas las consultas filtran `job="api"` en HTTP; las rutas, como lista cerrada de plantillas completas
unidas con `|`, sin comodines):

| Id | Grupo / panel | Serie y agregación | CA |
|---|---|---|---|
| 16 | Fila «Identidad» | — | — |
| 17 | Identidad: respuestas por ruta y código | `_count` por `route, status`; rutas `POST /api/v1/auth/{register, resend-verification, verify-email, login, session/refresh, session/logout, forgot-password, reset-password, change-password}` y `POST /api/v1/sessions/revoke-others` | CA-1 |
| 18 | Inicios de sesión por resultado (2xx, 401, 429) | `_count` por `status` de `POST /api/v1/auth/login` | CA-1 |
| 19 | Accesos denegados (403) por ruta | `_count{status="403"}` por `route`, todo el `api` | CA-1 |
| 20 | Fila «Almacenamiento» | — | — |
| 21 | Cargas por ruta y código | `_count` por `route, status`; `POST /api/v1/uploads`, `POST /api/v1/uploads/:uploadId/resume`, `POST /api/v1/uploads/:uploadId/complete` | CA-2 |
| 22 | Enlaces de descarga emitidos | `_count{status=~"2.."}` por `route`; `POST /api/v1/files/:fileId/download-url`, `POST /api/v1/files/:fileId/versions/:versionId/download-url` | CA-2 |
| 23 | Límite de frecuencia (429) por ruta | `_count{status="429"}` por `route` sobre las rutas de 21 y 22 | CA-2 |
| 24 | Fila «Indexación» | — | — |
| 25 | Indexación: completados y fallidos por intento | `nimbo_queue_jobs_completed_total` por `queue` y `nimbo_queue_job_failures_total` por `queue, attempts_made`, `queue=~"indexing\|index-reconcile"` | CA-7 |
| 26 | Indexación: profundidad por estado | `nimbo_queue_jobs` por `queue, state`, mismas colas | CA-7 |
| 27 | Indexación: ejecución p95 | `histogram_quantile(0.95, … nimbo_queue_job_run_seconds_bucket … by (queue, le))`, mismas colas | CA-7 |
| 28 | Fila «Optimizador» | — | — |
| 29 | Optimizador: solicitudes por ruta y código | `_count` por `route, status`; `POST /api/v1/files/:fileId/optimization/estimate`, `…/optimization/run` | CA-8 |
| 30 | Cola `optimization`: completados y fallidos por intento | como 25 con `queue="optimization"` | CA-8 |
| 31 | Cola `optimization`: ejecución p95 | como 27 con `queue="optimization"` | CA-8 |
| 32 | Fila «Agente» | — | — |
| 33 | Agente: consultas por minuto | `sum(rate(_count{route="POST /api/v1/agent/ask"}[5m])) * 60` | CA-11 |
| 34 | Agente: latencia total (p50, p95) | `histogram_quantile(0.5 y 0.95, sum by (le) (…_bucket{route="POST /api/v1/agent/ask"}))` | CA-11 |
| 35 | Agente: proporción de respuestas con error | `(sum(… status!~"2.." …) or vector(0)) / sum(…)`, mismo patrón que el panel 3 (H-4 de 022) | CA-11 |

- **Clases y puertos:** no aplica; no hay código. **Puertos nuevos: ninguno.** No se propone abstracción nueva (Art. V).
- **DRY (Art. VI):** la prueba reutiliza `read`, `dashboardExprs` y la forma de los casos de 022. Los tres ayudantes nuevos
  tienen un solo uso fuera de este bloque, así que viven en el mismo archivo. Las rutas no se copian en una lista aparte:
  la prueba las lee del tablero y las cruza con los controladores.
- **Dependencias nuevas entre módulos:** ninguna. La prueba lee archivos de `apps/api` como texto; no importa código.
- **Frontend:** ninguno (spec §6).

## 3. Datos

No hay tablas, columnas ni migraciones. `down`: no aplica; la vuelta atrás es revertir el JSON.

## 4. Contratos

Ninguna ruta nueva ni cambiada. Las rutas citadas en el tablero son plantillas de `routePatternOf` (`MÉTODO baseUrl+path`,
prefijo global `/api/v1`), comprobadas el 2026-11-08 en:

| Grupo | Controlador | Códigos que se esperan ver (de sus errores de dominio) |
|---|---|---|
| Identidad | `identity/presentation/auth.controller.ts`, `password.controller.ts`, `sessions.controller.ts` | `200`/`202`/`204`; `401` credenciales y renovación; `429` bloqueo de correo y límite por IP; `422` validación |
| Almacenamiento | `storage/presentation/uploads.controller.ts`, `files.controller.ts`, `file-versions.controller.ts` | `2xx`; `422` límites, tipo y cuota; `409` partes faltantes; `410` carga vencida; `404`; `403` solo lectura; `429` |
| Optimizador | `optimizer/presentation/optimizer.controller.ts` | `202`; `403` rol interno (`SHARED_FORBIDDEN`); `404`; `422`; `429` |
| Agente | `intelligence/presentation/agent.controller.ts` | `200` (SSE); antes del primer evento `422`, `404`, `429`, `503`; `403` rol interno |

Eventos y Socket.IO: no aplica.

## 5. Seguridad y operación

- **Sin `actor` ni `accessibleNodes`:** no hay consultas a datos de cuentas; los paneles leen solo Prometheus (RN-5).
- **Etiquetas permitidas (CA-12):** `job`, `route`, `status`, `queue`, `state`, `attempts_made` y `le`. Las leyendas
  solo interpolan `{{route}}`, `{{status}}`, `{{queue}}`, `{{state}}` y `{{attempts_made}}`. Los valores de `route` son
  plantillas declaradas en código, así que no pueden traer UUID, correos ni nombres.
- **Acceso (CA-14):** sin cambios de acceso en `compose.yml` (solo la memoria de Grafana, R-8), `dashboards.yml` ni la fuente: los grupos heredan de 022 el
  aprovisionamiento con `allowUiUpdates: false`, Grafana sin anónimo ni registro y *Viewer* sin edición. No se crea otro
  archivo en `infra/grafana/dashboards/`.
- **Alertas:** `alertas.json` no cambia; la prueba de 022 sigue exigiendo exactamente seis reglas (RN-3).
- **Bitácoras y métricas nuevas:** ninguna. **Degradación:** no aplica (no hay código; 022 RN-6 sigue igual).
- **Valores técnicos:** ventanas de `rate[5m]` como los paneles de 022; consultas por minuto como tasa × 60.

## 6. Estrategia de pruebas (por riesgo)

El riesgo está en tres sitios: una consulta que no lee lo que dice el CA, una etiqueta que filtre datos, y una ruta que
cambia y deja el panel en blanco sin que nadie lo note. Todo es estático y barato; lo visual va a la demo.

| CA | Nivel | Archivo |
|---|---|---|
| CA-1: la fila «Identidad» existe; un panel agrupa por `route, status` las diez rutas de identidad; otro, `POST /api/v1/auth/login` por `status`; otro, `status="403"` por `route` | unit (estática) | `scripts/observability.spec.ts` |
| CA-2: fila «Almacenamiento»; cargas por `route, status`; descargas `2..` por `route`; `429` por `route` | unit (estática) | ídem |
| CA-7 y CA-8: filas «Indexación» y «Optimizador»; completados, fallidos por `queue, attempts_made`, profundidad por `queue, state` (indexación) y p95 por `queue, le` de sus colas; solicitudes del optimizador por `route, status` | unit (estática) | ídem |
| CA-11: fila «Agente»; consultas por minuto, `histogram_quantile(0.5` y `(0.95` sobre `POST /api/v1/agent/ask`, proporción de error con `or vector(0)) / ` | unit (estática) | ídem |
| CA-12: en los paneles 16 a 35, toda etiqueta de un selector, de un `by (…)` o de una leyenda está en la lista permitida; toda ruta citada está entre las declaradas por los controladores; ningún valor coincide con un UUID ni contiene `@` | unit (estática) | ídem |
| CA-14 y CA-15 (estático): `infra/grafana/dashboards/` contiene solo `operacion.json`; `uid`, `title` y `editable: false` sin cambios (caso de 022); ids crecientes y únicos (caso de 022); seis reglas (caso de 022) | unit (estática) | ídem |
| Runbook: nombra las cinco filas | unit (estática) | ídem |
| CA-1, CA-2, CA-7, CA-8, CA-11 (los paneles se llenan con tráfico real), CA-14 (anónimo `401`, *Viewer* ve y no guarda), CA-15 (volúmenes vacíos) | demo humana | T-06, capturas en el PR |

Cada caso nuevo se escribe en rojo antes de su panel (falta la fila). La aserción de rutas se comprueba también en rojo
con una ruta inventada en una copia local del tablero, sin commitearla. Sin pruebas de integración ni de aislamiento:
no hay código ni datos de clientes (spec §5). No se repite en la demo lo que la prueba estática ya fija (etiquetas).

## 7. Riesgos y coherencia con el diseño

- **R-1 Dependencia de PR #78.** `operacion.json`, `observability.spec.ts` y `observabilidad.md` existen solo en la rama
  de 022. `/implement 022d` arranca desde `main` con 022 integrada; si 022 agrega paneles después, los ids de 022d se
  corren al final (la prueba exige orden y unicidad) y se resuelve en el rebase.
- **R-2 Rutas que cambian.** Una ruta renombrada deja el panel en 0 sin error en Grafana. Lo cubre la aserción cruzada
  de CA-12. Límite conocido: el lector de controladores es por expresión regular y solo entiende decoradores con cadena
  literal (todo el `api` hoy). Si un controlador usa una constante, la ruta no aparece y la prueba falla en rojo, que es el
  lado seguro.
- **R-3 `@Post()` sin ruta.** El inicio de carga es `POST /api/v1/uploads` (sin barra final): el lector normaliza la barra
  y la demo confirma la etiqueta real en el panel 21 (si difiere, se corrige la consulta y el lector).
- **R-4 Latencia del agente por encima de 10 s.** Los buckets HTTP de 022 llegan a 10 s: el p95 se satura en 10 s (S-4).
  Cambiarlo es código de `shared`: va a PD-201. El panel lo dice en su descripción.
- **R-5 Errores dentro del flujo SSE.** Salen como `200`; el panel 35 los omite (S-4). Medirlos exige instrumentar
  `intelligence` (PD-201).
- **R-6 Demo del agente y del optimizador.** El optimizador solo necesita una imagen JPEG o PNG. Las respuestas del
  modelo necesitan la clave de Gemini y un corpus indexado. Sin archivos indexados, el agente responde `200` sin llamar
  al modelo (020 CA-7) y el panel 35 queda en 0 %; sus errores se ven con `401`, `404`, `422` o el `429` de tasa, y el
  `503` exige archivos indexados y el proveedor caído (corregido tras la demo T-06, H-9).
- **R-7 Un tablero más largo.** 35 paneles; las filas permiten plegarlas a mano en la vista, sin guardar (aprovisionado).
- **R-8 Memoria de Grafana (H-2 de T-06).** Con 256 MiB Grafana murió por OOM con los 35 paneles; con 512 MiB llegó al
  93 %. Decisión de Adrián (2026-11-10): resolverlo en esta rama con `mem_limit: 768m` y `GOMEMLIMIT=690MiB` (ADR-0040,
  nota del 2026-11-10). El pico real en staging queda en PD-204.
- **Desviaciones de los diagramas:** ninguna. DF-28 (e) y DF-29 siguen como los dejó 022.
- **Pendientes que deja fuera** (filas nuevas en `pendientes.md`): **PD-201** señales que exigen instrumentar código
  (incluye PD-67 y los buckets de R-4); **PD-202** tablero de negocio, retención y espacio por plan; **PD-203**
  consultas del agente por plan (junto a PD-168). PD-172 y PD-173 siguen en 022.
- **ADR requeridos:** ninguno.

## 8. Aprobación

- `architect`: **no aplica** (sin puerto entre módulos, sin tecnología nueva, sin cambio de arquitectura).
- **Aprobado** — 2026-11-08, indicación en la sesión de Claude Code. Cubre el recorte de alcance de la spec (§9, P-1 a P-4) y los supuestos S-1 a S-4.
