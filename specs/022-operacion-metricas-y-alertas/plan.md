# Plan 022 — Operación: métricas, tablero de operación y alertas

> Spec: `./spec.md` · Estado del plan: **Aprobado (2026-11-03)**
> Obligatorio y ≤ 250 líneas. Dice **qué** archivos se tocan y **qué** se espera de cada uno; no es el código en
> prosa (sin cuerpos de funciones ni pseudocódigo). Lo aprueba Adrián antes de escribir código.

## 1. Resumen técnico

Núcleo de RNF-18 (CA-1, 2, 3, 5, 6, 9, 10, 11 a 16 y 18). Todo vive en `shared`, en las raíces de arranque y en `infra/`.
No se toca ningún módulo de negocio (eso es 022d), y no hay puertos nuevos ni tablas.

- **Señales de la app:** un `MetricsModule` en `shared/infrastructure/metrics/` (registro propio de `prom-client`) entra
  por `SharedModule` (`@Global`), así que llega a `api`, `worker` y `worker-optimizer` sin tocar `app.module.ts` ni
  `worker-base.ts`. Un middleware mide HTTP por plantilla de ruta (`routePatternOf`, CA-5). Un recolector descubre los
  `WorkerHost` de cada proceso y cubre todas las colas sin listas fijas. Un recolector de dependencias reutiliza
  `HealthService.ready()` y suma una sonda propia de ONLYOFFICE que no entra en `ready` (RN-4, PD-113).
- **Exposición privada (CA-2):** el `api` sirve `/metrics` en un servidor HTTP aparte (`METRICS_PORT`), fuera de
  `/api/v1` y de Traefik. Los `worker` lo sirven en su puerto de salud interno, que ya existe y nunca se publica.
- **Sistema (CA-3, CA-14):** cAdvisor da CPU, memoria y disco por contenedor y el sistema de archivos del anfitrión.
  Su compatibilidad con Docker Desktop/WSL2 se comprueba en un spike de ≤ 0,5 día (T-01).
- **Presentación y alertas:** Prometheus (sin `ports:`) recolecta y Grafana (solo `127.0.0.1`) muestra un tablero de
  operación y evalúa **exactamente seis** reglas (§7 de `product-context.md`). La fuente de datos, el tablero, las reglas
  y el canal SMTP de Grafana (Mailpit en local) se aprovisionan por archivo (CA-10). Cada proceso se distingue por el
  `job` de Prometheus, sin código.

**Tamaño, sin maquillar.** Plan recortado el 2026-11-03 por instrucción de Adrián (YAGNI y pruebas por riesgo; recortes
R1 a R6 abajo). Son **25 archivos** de autor (10 de TS, 9 de configuración, 1 documento y 5 pruebas nuevas) frente a 12, y
**≈ 5,15 días-persona** (la suma de `tasks.md`) frente a ~3; el plan anterior era de 35 archivos y ≈ 6,25 días. Sigue
haciendo falta una excepción de `workflow.md` §4.1 y ADR-0034, menor que antes: solo la infraestructura declarativa ya suma 9
archivos, y bajar de 12 exigiría cuatro specs no demostrables por separado. Precedente: 021 (45 archivos). Decide Adrián:
- **(a) Excepción** (este plan): una spec, un PR y 9 tareas. Respeta «el núcleo (HTTP, colas, sistema, tableros y alertas) queda
  en 022». La rama vive más de 3 días (§4.6) y ≈ 5 días pasa de la referencia (§4.3).
- **(b) Corte «ver / avisar»** (022 + **022e**): descrito en [seguimiento](seguimiento.md) («Evaluación de 022e») con las cifras
  del plan anterior. Cambia la partición de Adrián; con este plan recortado no se recomienda.

**Recortes frente al plan anterior** (cada uno con su costo): **R1** no se extrae `worker-hosts.ts` ni se toca `WorkerDrain`:
es la segunda aparición del descubrimiento de `WorkerHost` y se extrae a la tercera (Art. VI.2). **R2** `metrics-server` va
dentro de `metrics.module.ts`, la sonda de ONLYOFFICE dentro del recolector de dependencias, y `shared/index.ts` no cambia
(Art. V). **R3** sin `prometheus.local.yml`: el override del compose resuelve `api`, `worker` y `worker-optimizer` hacia el
anfitrión con `extra_hosts` y `prometheus.yml` usa los mismos nombres en local y staging. **R4** sin cambios a `ambientes.md`:
servicios y puertos van en `observabilidad.md`. **R5** menos archivos de prueba (colas dentro de `metrics-endpoint.int-spec.ts`;
compose y reglas en `scripts/observability.spec.ts`). **R6** se elimina `grafana.int-spec.ts`: CA-9 y CA-10 se cubren con la
prueba estática de la configuración y la demo humana de T-09, que suma «anónimo sin acceso y *Viewer* sin guardar». Es el
recorte de más riesgo (sin prueba automática de acceso real a Grafana) y queda decidido por Adrián.


## 2. Módulos, archivos y diseño

**A = con lógica · B = cableado o configuración declarativa.** Dueño: Abel. Los cambios en `shared`, las raíces,
`env.schema` y la infraestructura los revisa Adrián en el PR (spec §8).

| Módulo / capa | Archivo (nuevo o cambiado) | | Responsabilidad |
|---|---|---|---|
| shared/infrastructure/metrics | `metrics.module.ts` (nuevo); `shared.module.ts` (cambia) | B | `MetricsModule`: un `Registry` propio por aplicación (token `METRICS_REGISTRY`; así no hay registro global compartido entre pruebas) con las métricas de proceso de `prom-client`. `SharedModule` lo importa. El mismo archivo tiene el manejador de `/metrics` (formato de texto de Prometheus) y el arranque del servidor privado del `api`. Un fallo al recolectar o al escuchar se registra y no tumba el proceso (RN-6) |
| shared/presentation | `http-metrics.middleware.ts` (nuevo); `configure-http-app.ts` (cambia) | A | Histograma `nimbo_http_request_duration_seconds{route,status}`. La etiqueta `route` es `routePatternOf(request)` al terminar la respuesta (sin ids ni consulta; una ruta no encontrada queda como `<sin patrón>`). Se instala antes del analizador para contar también sus `4xx`. El arnés de integración lo hereda |
| shared/infrastructure/metrics | `queue-metrics.collector.ts` (nuevo) | A | `QueueMetricsCollector` descubre los `WorkerHost` del proceso (con el resguardo del getter que lanza, R-6) y se suscribe en `onApplicationBootstrap` a `active`, `completed` y `failed`; en cada recolección consulta `getJobCounts` de las colas que **consume** el proceso, así una cola no se cuenta dos veces si el `api` solo la produce. El descubrimiento queda duplicado con el de `WorkerDrain` hasta una tercera aparición (R1, Art. VI.2); `WorkerDrain` no se toca |
| shared/infrastructure/metrics | `dependency-metrics.collector.ts` (nuevo); `shared/health.module.ts` (cambia) | A | `nimbo_dependency_up{dependency}` en cada recolección. Postgres, Redis y MinIO salen de `HealthService.ready()` (DRY: los mismos indicadores y el mismo límite de 1500 ms). `HealthModule` registra el recolector, así que cada proceso informa lo que comprueba (los `worker`, solo Redis). La sonda de ONLYOFFICE está en el mismo archivo: `GET ONLYOFFICE_INTERNAL_URL/healthcheck` con el mismo límite, solo publica si la variable existe (solo la tiene el `api`). No se registra en `ready` ni se agrega `onlyoffice` a `HealthCheckName` |
| raíces de arranque | `apps/api/src/main.ts`, `apps/api/src/worker-bootstrap.ts`, `shared/infrastructure/config/env.schema.ts` (cambian) | B | `main.ts` arranca el servidor privado en `METRICS_PORT`, que solo está en `apiEnvSchema`. `startWorker` monta `/metrics` en el puerto interno del proceso (`WORKER_PORT`, `WORKER_OPTIMIZER_PORT`), fuera de `/api/v1` (000 CA-23) |
| dependencias | `apps/api/package.json` (cambia; `pnpm-lock.yaml` generado) | B | `prom-client` **solo después de que ADR-0040 esté `Aceptado`** |
| compose | `compose.yml`, `compose.override.yml` (cambian) | B | Base: `prometheus` (sin `ports:`; `--storage.tsdb.retention.time=15d` y `--storage.tsdb.retention.size=1GB`), `grafana` (`127.0.0.1:${GRAFANA_PORT}:3000`, sin etiquetas de Traefik, `environment` explícito con `GF_AUTH_ANONYMOUS_ENABLED=false`, `GF_USERS_ALLOW_SIGN_UP=false`, `GF_ANALYTICS_REPORTING_ENABLED=false`, `GF_SECURITY_ADMIN_*` y `GF_SMTP_*` desde variables `GRAFANA_*`) y `cadvisor` (sin `ports:`, sin `privileged`, montajes de solo lectura, `--docker_only=true`, `--store_container_labels=false` y `--enable_metrics=cpu,memory,disk`). Volúmenes `prometheus_data` y `grafana_data`. Override: Prometheus con `extra_hosts` que resuelve `api`, `worker` y `worker-optimizer` hacia `host-gateway` (R3; el mismo patrón de Traefik); Grafana con SMTP `mailpit:1025` |
| infra/prometheus | `prometheus.yml` (nuevo) | B | Trabajos `api`, `worker`, `worker-optimizer` y `cadvisor`, uno por proceso (CA-1), por nombre de servicio. En local el override los resuelve hacia el anfitrión, porque las apps corren con `pnpm dev` (R3) |
| infra/grafana | `provisioning/datasources/prometheus.yml`, `provisioning/dashboards/dashboards.yml`, `dashboards/operacion.json` (nuevos) | B | Fuente de datos con `uid` fijo. Proveedor con `allowUiUpdates: false`. Tablero «Operación» (CA-6): tasa de `5xx`; latencia p50, p95 y p99; peticiones por ruta; profundidad, espera y ejecución por cola; completados y fallidos; disponibilidad por dependencia; disco; CPU y memoria por contenedor; procesos (`up` por `job`). Lee solo Prometheus (RN-7) |
| infra/grafana | `provisioning/alerting/alertas.json` (nuevo) | B | En un solo archivo: el grupo con **las seis reglas** de §5, el punto de contacto de correo (destinatario `$ALERT_EMAIL_TO`) y la política de notificación. Va en JSON, que Grafana admite, para que las pruebas lo lean sin agregar un analizador YAML. Las anotaciones solo usan las etiquetas `queue` y `dependency` |
| configuración | `.env.example` (cambia) | B | `METRICS_PORT=9464` (del schema) y las claves extra de compose: `GRAFANA_PORT=3030`, `GRAFANA_ADMIN_USER`, `GRAFANA_ADMIN_PASSWORD`, `GRAFANA_SMTP_HOST`, `GRAFANA_SMTP_USER`, `GRAFANA_SMTP_PASSWORD`, `GRAFANA_SMTP_FROM` y `ALERT_EMAIL_TO`. Pasa `pnpm env:check` |
| docs/operations | `observabilidad.md` (nuevo) | — | Runbook: acceso (`localhost:3030` en local, túnel SSH en staging), alta de cuentas (Operador *Editor*, Administrador *Viewer*), tráfico sintético con comandos (sin `pnpm seed`, PD-135), alerta de prueba (CA-18), arranque desde volúmenes vacíos, la limitación de cAdvisor si aplica y una sección con los servicios y puertos nuevos (R4) |

**Conteo real:** TS 10 (4 nuevos, 6 cambiados) · configuración declarativa 9 (+ `pnpm-lock.yaml` generado) ·
documento 1 del developer (+ ADR-0040 y `architecture.md` §1, §3, §5 y §10, que redacta `architect`) · pruebas 5 nuevas
(§6; `worker-drain.module.spec.ts` no cambia). **Total: 25 archivos de autor y ≈ 5,15 días-persona**
(desglose en `tasks.md`), por encima de los 12 archivos y ~3 días de ADR-0034 (§1).

- **Clases y puertos:** no hay nombres en `design-model.md` para métricas, salvo `MetricsController`, que no se crea (DF-29, §7).
  **Puertos nuevos: ninguno.** `prom-client` se usa directamente desde `shared/infrastructure` y `shared/presentation`. No se
  propone `IMetricsRecorder`: hoy ningún módulo de dominio o aplicación registra métricas, así que no cumple el Art. V.2.
  Lo decidirá 022d si llega a tenerlo. La sonda de ONLYOFFICE no implementa `IHealthIndicator`
  (su `name` es `HealthCheckName`, un contrato público que no cambia).
- **Dependencias nuevas entre módulos:** ninguna. `shared` no importa de `editing`. La sonda repite el `GET /healthcheck` de
  `OnlyOfficeEditor.isAvailable`, que es la segunda aparición (Art. VI.2), así que no se extrae.
- **Frontend:** ninguno (spec §6).

## 3. Datos

No hay tablas, columnas ni migraciones. Prometheus y Grafana guardan sus datos en volúmenes propios. Grafana guarda sus
cuentas en su SQLite interno. Ninguno tiene datos de clientes (RN-7).
- `down`: no aplica. La vuelta atrás de la infraestructura es retirar los servicios y los volúmenes nuevos.

## 4. Contratos

| Método | Ruta | Rol | Request → Respuesta | Errores (`code`) |
|---|---|---|---|---|
| GET | `/metrics` en `api:${METRICS_PORT}`, `worker:${WORKER_PORT}` y `worker-optimizer:${WORKER_OPTIMIZER_PORT}` | ninguno: solo red interna, sin publicar (CA-2) | — → `200` texto de exposición de Prometheus | sin `code`. La `GET /api/v1/metrics` pública sigue en `404` |

No se agrega ninguna ruta a la API de clientes. Catálogo de series (etiquetas cerradas, sin ids, CA-5):

| Serie | Tipo | Etiquetas |
|---|---|---|
| `nimbo_http_request_duration_seconds` | histograma (`_count` da la tasa y los códigos) | `route` (plantilla con método), `status` |
| `nimbo_queue_jobs` | gauge | `queue`, `state` ∈ `waiting`, `prioritized`, `active`, `delayed` |
| `nimbo_queue_jobs_completed_total` | contador | `queue` |
| `nimbo_queue_job_failures_total` | contador de intentos fallidos | `queue`, `attempts_made` ∈ `1`, `2`, `3+` |
| `nimbo_queue_job_wait_seconds`, `nimbo_queue_job_run_seconds` | histogramas | `queue` |
| `nimbo_dependency_up` | gauge 0/1 | `dependency` ∈ `postgres`, `redis`, `minio`, `onlyoffice` |
| `process_*`, `nodejs_*` (de `prom-client`); `container_*` (cAdvisor) | — | `job`; `name` del contenedor |

La espera se mide en el primer intento, desde que el trabajo queda listo (`timestamp` + `delay`) hasta `processedOn`. La
ejecución va de `processedOn` a `finishedOn`, en `completed` y en `failed`. Un `failed` sin trabajo no se cuenta.

## 5. Seguridad y operación

- **Sin `actor` ni `accessibleNodes`:** no hay consultas de datos de cuentas (spec §5). Las etiquetas salen de conjuntos
  cerrados: plantilla de ruta, nombre de cola, código HTTP y dependencia. Nunca de la URL real, del `data` del trabajo
  ni del mensaje de error.
- **Superficie (CA-2):** `METRICS_PORT`, `WORKER_PORT` y `WORKER_OPTIMIZER_PORT` no aparecen en ningún `ports:`.
  Prometheus y cAdvisor no tienen `ports:`. Grafana solo escucha en `127.0.0.1`. Ninguno lleva etiquetas de Traefik y
  `local-routes.yml` no cambia.
- **Acceso (CA-9, P-6):** Grafana sin anónimo ni registro. El tablero aprovisionado no se edita desde la interfaz, y las
  reglas aprovisionadas tampoco. El Administrador tiene rol *Viewer*: no edita ni explora.
- **Correo (P-3):** el canal SMTP es el de Grafana, con credenciales `GRAFANA_SMTP_*`. No usa la cola `mail` ni las
  `SMTP_*` del `worker`.
- **Bitácoras:** `metrics.collect_failed` y `metrics.server_failed` con `errorClass`, sin mensaje ni URL (el
  `ONLYOFFICE_INTERNAL_URL` no se registra).
- **Degradación (RN-6, Art. XII):** recolectar no bloquea peticiones ni trabajos. Si Redis falla en `getJobCounts`, se
  omite esa serie. Si el servidor de métricas no puede escuchar, el `api` sigue sirviendo. Con Prometheus o Grafana caídos
  no cambia nada para el cliente.
- **Valores técnicos (no son de negocio):** recolección cada 15 s; buckets HTTP de 5 ms a 10 s, que incluyen 0,3 s; buckets
  de cola de 0,1 s a 600 s (el optimizador tarda hasta 100 s); evaluación de reglas cada 1 min. `mem_limit`: Prometheus
  256m, Grafana 256m, cAdvisor 128m (R-4).

**Las seis reglas** (umbrales de §7; la ventana de §7 es el `for` de la regla; las tasas usan `rate[1m]`):

| # | Regla | Condición | `for` | CA |
|---|---|---|---|---|
| 1 | 5xx | proporción de `status=~"5.."` sobre el total del `api` > 0,02 | 5m | CA-11 |
| 2 | Latencia | `histogram_quantile(0.95)` del `api` > 0,3 s, sin las rutas excluidas por RNF-01 (S-5) | 10m | CA-12 |
| 3 | Colas | `waiting`+`prioritized` de alguna cola > 50, **o** algún aumento de `attempts_made="3+"` en 5 min | 1m (S-3) | CA-13 |
| 4 | Disco | `container_fs_usage_bytes / container_fs_limit_bytes` del sistema de archivos raíz (`id="/"`) > 0,8 | 1m (S-3) | CA-14 |
| 5 | Dependencia caída | `nimbo_dependency_up == 0`, el mínimo por `dependency` | 1m (S-3) | CA-15 |
| 6 | Renovación | aumento de fallos de `queue="subscription-renewal"` en 15 min > 0 | 0 (S-4) | CA-16 |

En las seis, `noDataState: OK` y `execErrState: Error`. Si no, Grafana manda avisos «DatasourceNoData», que equivaldrían a
una séptima alerta. CA-16 no toca `billing`: `RenewalRunner.runOnce()` lanza `RenewalRunIncompleteError` y la pasada queda
como trabajo `failed`. **Ninguna de las seis depende de 022d:** las reglas 1 y 2 usan `nimbo_http_*`; la 3, `nimbo_queue_*`;
la 4, `container_fs_*` (cAdvisor); la 5, `nimbo_dependency_up`; y la 6, `nimbo_queue_job_failures_total{queue="subscription-renewal"}`.

**Supuestos del plan** (se construyen así; los **discutibles** los confirma Adrián al aprobar):
- **S-1 (discutible)** «Reintentado 3 veces» = un trabajo con 3 intentos fallidos (`attemptsMade ≥ 3` en `failed`).
  `architecture.md` §8 llama «Reintentos: 3» a `attempts: 3` (`repeatable-job.ts`, `indexing`, `optimization`,
  `editing-save`), pero la fila `mail` usa la otra convención («5 (`attempts: 6`)»), así que las fuentes no la fijan.
  Con la lectura literal (4 intentos), la alerta no dispararía nunca en las colas de 3 intentos; con esta, `mail` avisa
  en su tercer fallo aunque le queden tres intentos. La confirma Adrián.
- **S-2 (discutible)** «Pendientes» = `waiting` + `prioritized` **por cola**. No cuenta `delayed`, porque ahí viven los
  programas repetibles (renovación, reconciliaciones) y las esperas entre reintentos.
- **S-3 (discutible)** Las condiciones sin ventana en §7 (colas, disco y caída) deben sostenerse 1 min, dos evaluaciones,
  para que no dispare una sola muestra perdida.
- **S-4 (discutible)** La renovación dispara con el primer intento fallido y se resuelve sola tras 15 min sin fallos nuevos.
  Prometheus no lee `SUBSCRIPTION_RENEWAL_INTERVAL_MINUTES`.
- **S-5 (resuelto por las fuentes)** El 5xx es global del `api`, como dice §7. El p95 vigila RNF-01, que cita CA-12
  («consultas de UI, sin transferencia ni agente»), y por eso excluye dos plantillas, `POST …/agent/ask` (flujo SSE) y
  `GET …/editing/content/:token` (el `.docx` hacia ONLYOFFICE). Las descargas y cargas de archivos y facturas devuelven
  URL firmadas y no transfieren por el `api`, así que se quedan. La lista cerrada vive en `alertas.json` (R-8) y se
  compara entera con la etiqueta (`route!~"POST /api/v1/agent/ask|GET /api/v1/editing/content/:token"`: `routePatternOf`
  da `MÉTODO baseUrl+path` con el prefijo global y `baseUrl` vacío). Son las dos únicas rutas del `api` que responden
  con `@Res()` o `StreamableFile` (revisado en `apps/api/src`, 2026-11-02).
- **S-6 (resuelto por las fuentes)** El administrador de servidor de Grafana (`GRAFANA_ADMIN_*`) lo custodia el Operador
  (roles de `product-context.md` §2: «métricas, alertas»; P-6) y solo sirve para crear cuentas según el runbook.
- **S-7** En local, sin el perfil `onlyoffice`, `ONLYOFFICE_INTERNAL_URL` se deja vacía (el runbook lo indica). Con la
  variable puesta y ONLYOFFICE apagado, la regla 5 dispara, y eso es correcto.
- **S-8** En local, Prometheus recolecta las apps del anfitrión (`pnpm dev`). Con el perfil `apps` no se recolecta (limitación documentada).

## 6. Estrategia de pruebas (por riesgo)

| CA | Nivel | Archivo |
|---|---|---|
| CA-1 (HTTP), CA-5 (ruta como plantilla, `<sin patrón>`, código) | unit | `shared/presentation/http-metrics.middleware.spec.ts` |
| CA-3 y CA-15 (arriba, abajo, límite de tiempo, ONLYOFFICE ausente sin variable, cuerpo distinto de `true`) | unit | `shared/infrastructure/metrics/dependency-metrics.collector.spec.ts` |
| CA-1 (HTTP, procesos y **todas las colas** consumidas: en espera, activos, completados, fallidos, espera y ejecución), CA-2 (`/api/v1/metrics` y `/metrics` públicos en `404`), CA-5 (tráfico con UUID y correos en ruta y consulta, y `data` de trabajos con correo y nombre de archivo; ninguna serie los contiene), CA-12 (las dos plantillas que excluye la regla 2 coinciden con las que emite el middleware), CA-15 (ONLYOFFICE caído: `ready` `200` y la serie en 0) | int (Redis) | `test/int/observability/metrics-endpoint.int-spec.ts` |
| CA-11 a CA-16: cada expresión leída de `alertas.json` (sin copiarla) se evalúa con `/api/v1/query?time=` contra series sintéticas en OpenMetrics, cargadas con `promtool` en un Prometheus de Testcontainers con tiempo fijo; dispara por encima del umbral y no por debajo | int (Prometheus) | `test/int/observability/alert-rules.int-spec.ts` |
| RN-1: exactamente seis reglas, con los umbrales y `for` de §5, `noDataState: OK` y anotaciones sin otras etiquetas (CA-5). CA-2: sin `ports:` para Prometheus ni cAdvisor; Grafana solo en `127.0.0.1`; ningún puerto de métricas publicado; sin etiquetas de Traefik (base, local y staging si existe), como `optimizer-compose.spec.ts`. CA-9 y CA-10 estáticos: `GF_AUTH_ANONYMOUS_ENABLED=false`, `GF_USERS_ALLOW_SIGN_UP=false`, `allowUiUpdates: false`, fuente, tablero, seis reglas y punto de contacto aprovisionados | unit (estática, `docker compose config`) | `scripts/observability.spec.ts` |
| CA-6, CA-9 (anónimo sin acceso; *Viewer* no guarda tablero ni regla), CA-10 (volúmenes vacíos), CA-11 y CA-18 (correo de disparo y de resolución con Redis detenido, en Mailpit) | demo humana | T-09, evidencia en el PR |

Sin aislamiento (spec §5). Sin esperas reales de 5 o 10 min: el `for` se comprueba de forma estática y la expresión,
por instante.

## 7. Riesgos y coherencia con el diseño

- **R-1 cAdvisor en Docker Desktop/WSL2.** Puede no ver el disco del anfitrión ni los cgroups. El spike de T-01 (≤ 0,5 día)
  tiene una pregunta concreta: ¿salen `container_memory_working_set_bytes` por contenedor y `container_fs_*{id="/"}` en Windows?
  Alternativa si no: la demo de CA-3 y CA-14 se hace con Docker Engine en WSL2 o en el runner Linux de CI, y la
  limitación queda en el runbook. No se agrega otro componente (node_exporter) sin volver a Adrián. El resultado va al ADR-0040.
  **Resultado (T-01, 2026-11-03): parcial.** En Linux nativo (no Docker Desktop/WSL2) cAdvisor da memoria y CPU por `name` y `container_fs_*{id="/"}` por dispositivo (regla de disco pendiente de PD-170). `host-gateway` alcanza solo procesos en `0.0.0.0`, no en `127.0.0.1`. Docker Desktop/WSL2 sigue **sin verificar** (ver ADR-0040).
- **R-2 cAdvisor monta `docker.sock` y `/` con `:ro`.** El `:ro` del socket no limita la API de Docker: el privilegio es
  alto, como el de Traefik. Queda en la red interna, sin `privileged`, con imagen fijada y sin etiquetas de contenedor (no
  exporta rutas del anfitrión). Un proxy del socket necesitaría otro ADR (ADR-0040).
- **R-3 `METRICS_PORT` en local** escucha en las interfaces del anfitrión, igual que el `api` en 3000 con `pnpm dev`. CA-2 se
  verifica sobre la topología del compose, que es la de staging. El spike comprueba si basta con `127.0.0.1` vía `host-gateway`.
- **R-4 Memoria:** suma 640 MiB de límites. En producción (8 GB) con ONLYOFFICE, los límites pasan de 7936 a **8576 MiB**:
  son topes y no reservas (ADR-0038 midió `MemAvailable` ≥ 68,9 %), pero T-09 registra los picos de `docker stats` de los
  tres con ONLYOFFICE activo. En staging (4 GB) ONLYOFFICE ya se enciende solo cuando hace falta (§8 del producto). Se anota para 000.
- **R-5 Variables de Grafana en `.env`:** el `api` y el `worker` cargan `env_file: .env`, así que también verían las
  `GRAFANA_*`. No las leen, pero las tienen. Separar los archivos de entorno es endurecimiento de staging (PD-167 (d)).
- **R-6 Orden de arranque:** `WorkerHost.worker` lanza antes de `onModuleInit`. El recolector se suscribe en
  `onApplicationBootstrap` y aplica el mismo resguardo del getter, copiado de `WorkerDrain` (R1).
- **R-7 Las pruebas de integración descargan Prometheus y la de reglas usa `promtool`:** suben el tiempo de CI. Grafana y Mailpit ya no entran en pruebas automáticas (R6). Imágenes fijadas en ADR-0040.
- **R-8 Rutas de transferencia futuras:** si una spec agrega una ruta que transmite contenido por el `api` (por ejemplo, 013
  o 017), suma su plantilla a la exclusión de la regla 2. Si no, el p95 subiría sin que se incumpla RNF-01.
- **Desviaciones (para que el orquestador actualice `design-findings.md`):**
  - **DF-29 → Resuelto con 022.** Redis ya estaba (000). `OnlyOfficeHealthIndicator` se sustituye por la sonda de ONLYOFFICE del recolector de dependencias
    (solo métricas, no está en `ready`; PD-113). `MetricsController` no se crea, porque el nombre es de 011
    (`GET /backoffice/metrics`): `/metrics` lo sirve `metrics.module.ts` en `METRICS_PORT` (`api`) y en el puerto interno de
    cada `worker`. Así se cierra **PD-166**.
  - **DF-28 (e)** sigue abierto (Adrián, PD-05): el diagrama debe sumar Prometheus, Grafana **y cAdvisor**.
- **Pendientes que deja fuera (filas o notas para `pendientes.md`):** PD-167 (a) suma la candidata «caída de un proceso
  propio o de Prometheus» (`up == 0`), que no está entre las seis. La memoria de staging (R-4) y la separación de
  `env_file` (R-5) van a PD-167 (d). PD-113 se mantiene.
- **ADR requerido:** **ADR-0040** (`Propuesto`, redactado por `architect`): `prom-client` 15.1.3; `prom/prometheus:v3.15.0`,
  `grafana/grafana:13.2.4` (no `grafana-oss`, congelado desde 13.0.2) y `ghcr.io/google/cadvisor:v0.60.6` (no `gcr.io`,
  congelado en v0.55.1); Grafana Alerting en lugar de Alertmanager (P-3); resultado del spike. Ningún paquete ni imagen
  entra antes de que esté `Aceptado`.

## 8. Aprobación

- `architect` (tecnología nueva: `prom-client`, Prometheus, Grafana y cAdvisor; ADR-0040; sin puerto nuevo entre módulos):
  **Aprobado con cambios — 2026-11-02.** Fronteras, DAG, capas, degradación y privacidad sin objeción (todo en `shared`, raíces e
  `infra/`; sin puertos, tablas ni aristas; la sonda no importa `editing`). Cambios, ya aplicados por `architect` en este plan:
  (1) imágenes corregidas y fijadas (§7, ADR-0040); (2) retención de Prometheus acotada (§2); (3) cAdvisor sin `privileged`, con
  lista de métricas permitidas, y Grafana sin telemetría (§2); (4) R-2 reescrito, porque el `:ro` del socket no es una barrera;
  (5) R-4 con el presupuesto real de 8 GB y su medición en T-09; (6) referencia a `architecture.md` corregida. Condición:
  **ADR-0040 `Aceptado`** antes de T-01. **Ciclo 2 — 2026-11-02: se mantiene «Aprobado con cambios».** El corte (b)
  «ver / avisar» es coherente: no cruza fronteras (las dos mitades viven en `shared`, raíces e `infra/`), 022d depende
  solo de 022, cada CA tiene dueño y los números cuadran con §2 y `tasks.md` (28 + 18 archivos con 11 compartidos; 3 + 3,5 d).
  Las dos objeciones con que recomendé (a) ya no valen (022 en ≈ 4 d y RN-1 partida), así que **retiro la recomendación
  de (a)**: en arquitectura las dos son válidas, y (b) cumple los días de §4.1, §4.3 y §4.6 en cada mitad a cambio de
  +0,25 d y una tabla de equivalencias. Elige Adrián, porque (b) cambia su partición. Cambios de este ciclo, aplicados por `architect`:
  (7) S-1 vuelve a «discutible», porque la fila `mail` de `architecture.md` §8 usa la otra convención; (8) S-5 con la
  expresión exacta de la exclusión y la comprobación de que no hay otra ruta de transferencia; (9) en el
  [seguimiento](seguimiento.md), las partes de CA-2, CA-5 y CA-9 que pasan a 022e en el corte (b). S-5 y S-6 se dan por
  resueltos por las fuentes (RNF-01 y CA-12; §2 y P-6).
- **Cambio posterior (2026-11-03):** Adrián ordenó reemplazar el plan por la versión recortada (R1 a R6, §1). Reduce archivos y
  pruebas sin puertos, tablas ni aristas nuevas. No se pidió una nueva pasada de `architect`: la aprobación del plan anterior
  cubría tecnología, fronteras y degradación, que no cambian.
- Adrián (Matul, `afmatul`): **Aprobado — 2026-11-03.** Decide (a): una spec, un PR y la excepción de tamaño de §1; los recortes R1 a R6 (incluido R6, sin prueba automática de Grafana); los supuestos S-1 a S-4 tal como están escritos en §5; y acepta **ADR-0040** con este plan.
