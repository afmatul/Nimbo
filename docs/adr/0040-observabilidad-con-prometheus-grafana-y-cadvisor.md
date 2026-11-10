# ADR-0040 — Observabilidad con `prom-client`, Prometheus, Grafana Alerting por SMTP y cAdvisor

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-11-02 |
| Decisores | `architect` (redacción), Abel (dueño de 022), Adrián (aceptación) |
| Specs relacionadas | 022 (RNF-18; plan §1, §2, §5 y §7); 022d (instrumentación de módulos, reutiliza este stack); DF-28 (e), DF-29; PD-166, PD-167 |

## Contexto
RNF-18 pide métricas, un tablero de operación y **exactamente seis** alertas (`product-context.md` §7). `CLAUDE.md` ya
nombra Prometheus y Grafana en el stack, pero ninguna librería ni imagen tiene ADR y las prohibiciones duras exigen
uno para toda dependencia significativa. Fuerzas:

- **Equipo y plazo:** 4 personas y una sola persona (Abel) para 022, con ≈ 6,25 días-persona estimados (la suma de `tasks.md`). Cada
  componente de más es configuración, imagen y prueba que mantener.
- **Servidor:** producción con 4 vCPU / 8 GB y ONLYOFFICE con `mem_limit: 3g`. Los límites del compose ya suman
  7936 MiB con ONLYOFFICE (ADR-0038). Staging tiene 2 vCPU / 4 GB.
- **Superficie:** solo Traefik publica puertos (`architecture.md` §1). Las métricas no salen de la red interna
  (022 CA-2) y Grafana se usa por `localhost` o túnel SSH (P-6).
- **Privacidad:** sin identificadores ni contenido en series, tableros ni alertas (RN-2, CA-5). Los tableros solo leen
  Prometheus (RN-7).
- **Decisión P-3 de Adrián (PR #78):** el correo del equipo sale por el **canal SMTP propio de Grafana**, con Mailpit
  en local. No usa la cola `mail` ni las `SMTP_*` del `worker`. Sin Slack ni webhooks.
- **Sistema:** CA-3 y CA-14 piden CPU, memoria y disco por contenedor, y el uso del disco del anfitrión. El equipo
  desarrolla en Windows con Docker Desktop/WSL2, donde los cgroups y el sistema de archivos del anfitrión no son los de
  Linux nativo.

## Opciones consideradas

**A. Instrumentación de la app**
1. **`prom-client` directo en `shared/infrastructure` y `shared/presentation`**: es el cliente de facto para Node, de
   dos dependencias directas (`tdigest` y `@opentelemetry/api`, esta última para los *exemplars*, que 022 no usa). Admite un `Registry`
   por aplicación, que evita el registro global compartido entre pruebas. Contra: lleva 2 años sin versión nueva
   (15.1.3, 2024-06-27). Sigue siendo la última publicada y funciona en Node 22 (`engines: >=20`).
2. **OpenTelemetry SDK + exportador de Prometheus**: es neutral respecto al proveedor, pero suma media docena de paquetes,
   una capa de API que ninguna spec activa necesita (no hay trazas en el alcance) y más superficie de configuración.
3. **`@willsoto/nestjs-prometheus`**: es un envoltorio de Nest sobre `prom-client`. Ahorra poco, agrega una
   dependencia más y fija un controlador `/metrics` dentro de la app HTTP. El `api` sirve `/metrics` en un puerto aparte,
   fuera de `JwtAuthGuard` y de `/api/v1`.

**B. Recolección y almacenamiento**
1. **Prometheus**: es el estándar para el modelo *pull*, ya está en el stack y trae `promtool`, con el que se prueban
   las expresiones.
2. **VictoriaMetrics u otra TSDB compatible**: ahorra memoria, pero es tecnología nueva sin requisito que la pida.

**C. Presentación y alertas**
1. **Grafana con Grafana Alerting**: un solo componente para el tablero, las reglas y el contacto. Aprovisiona por
   archivo la fuente, el tablero, las reglas, el punto de contacto y la política (CA-10). Lo aprovisionado no se
   edita desde la interfaz (CA-9). El correo sale por su SMTP propio (P-3). Contra: las reglas están en el formato de
   Grafana (consulta + umbral) y no en el formato de reglas de Prometheus, y `promtool test rules` no las lee.
2. **Reglas de Prometheus + Alertmanager**: las reglas se prueban de forma nativa con `promtool test rules`. Contra:
   un contenedor y una configuración más (SMTP en Alertmanager), y el correo no saldría por Grafana, como pide P-3.
3. **Posponer las alertas** (solo tablero): incumple RNF-18 y CA-11 a CA-16.

**D. Métricas de sistema (CA-3, CA-14)**
1. **cAdvisor**: un solo contenedor da CPU, memoria y sistema de archivos por contenedor (`name`) y del sistema de
   archivos raíz (`id="/"`). Contra: necesita leer el socket de Docker y el sistema de archivos del anfitrión, que es un
   privilegio alto, y su comportamiento en Docker Desktop/WSL2 no está comprobado.
2. **node_exporter**: mide bien el disco y la CPU del anfitrión, pero no da memoria por contenedor. Haría falta
   cAdvisor igual, o aceptar un CA-3 incompleto. Con `pid: host` y `/` montado, su privilegio es comparable.
3. **Exporters por servicio** (`postgres_exporter`, `redis_exporter`, métricas nativas de MinIO): tres o cuatro
   componentes más. La disponibilidad ya la entrega `HealthService.ready()` (DRY) y ninguna spec activa pide métricas
   internas de esos motores.
4. **Posponer el sistema a una 022e** (opción b del plan §1): ver «Consecuencias».

## Decisión
**A.1 + B.1 + C.1 + D.1**, con estas versiones y restricciones:

| Componente | Versión fijada | Verificación (2026-11-02) |
|---|---|---|
| `prom-client` (solo `apps/api/package.json`) | `15.1.3` exacta | npm: `latest` = 15.1.3, publicada el 2024-06-27 |
| Prometheus | `prom/prometheus:v3.15.0` | Docker Hub, 2026-09-25. `v3.15.1` (2026-10-21) todavía no cumple dos semanas. T-01 revisa sus notas y pasa al parche si corrige algo que afecte a 022 |
| Grafana (edición OSS) | `grafana/grafana:13.2.4` | Docker Hub, 2026-10-13. **No** `grafana/grafana-oss`: ese repositorio dejó de publicar en 13.0.2 (2026-06-02) |
| cAdvisor | `ghcr.io/google/cadvisor:v0.60.6` | GitHub Releases y ghcr.io, 2026-09-18. **No** `gcr.io/cadvisor/cadvisor`: allí la última es v0.55.1 |
| Mailpit (local, ya existe) | `axllent/mailpit:v1.31.3` | sin cambio |

Licencias: Apache-2.0 (`prom-client`, Prometheus, cAdvisor) y AGPL-3.0 (Grafana, que se usa sin modificar y solo
internamente).

**Seguridad y operación (no negociables en el compose):**
- **Prometheus sin `ports:`.** Solo lo usa Grafana por la red interna. Retención acotada:
  `--storage.tsdb.retention.time=15d` y `--storage.tsdb.retention.size=1GB`. Los puertos de métricas (`METRICS_PORT`,
  `WORKER_PORT`, `WORKER_OPTIMIZER_PORT`) no aparecen en ningún `ports:`.
- **Grafana solo en `127.0.0.1:${GRAFANA_PORT}`**, sin etiquetas de Traefik, con `GF_AUTH_ANONYMOUS_ENABLED=false`,
  `GF_USERS_ALLOW_SIGN_UP=false`, `GF_ANALYTICS_REPORTING_ENABLED=false` (sin telemetría saliente), administrador y
  SMTP por variables `GRAFANA_*` y destinatario `ALERT_EMAIL_TO`. Fuente, tablero, reglas, punto de contacto y política
  se aprovisionan por archivo y no se editan desde la interfaz.
- **cAdvisor sin `ports:` y sin `privileged`**, con montajes `:ro` (`/`, `/var/run`, `/sys`, `/var/lib/docker`),
  `--docker_only=true`, `--store_container_labels=false` y `--enable_metrics=cpu,memory,disk` (una lista de lo
  permitido, no de lo prohibido). **El `:ro` del socket de Docker no limita la API:** quien controla el proceso puede
  dar órdenes al demonio. Es el mismo nivel de riesgo que ya se aceptó para Traefik. Se mitiga con la imagen fijada,
  sin puertos ni Traefik, en la red interna y sin etiquetas de contenedor (no exporta rutas ni metadatos del anfitrión).
  No se agrega un proxy del socket sin otro ADR.
- **Memoria:** `mem_limit` de 256m para Prometheus, 256m para Grafana y 128m para cAdvisor (+640 MiB). Con ONLYOFFICE,
  la suma de límites pasa a **8576 MiB en un servidor de 8 GB**. Los límites son topes y no reservas: ADR-0038 midió
  `MemAvailable` ≥ 68,9 % con todo encendido. Aun así, la demo de T-09 registra los picos de `docker stats` de los
  tres con ONLYOFFICE activo.
- **Grafana Alerting evalúa cada 1 min.** Las seis reglas usan `noDataState: OK` y `execErrState: Error`, así no
  aparece una «séptima alerta» por falta de datos (RN-1).

**Spike T-01 (≤ 0,5 día, código descartable):** ¿salen `container_memory_working_set_bytes{name=…}` por contenedor y
`container_fs_usage_bytes`/`container_fs_limit_bytes{id="/"}` con valores plausibles en Docker Desktop/WSL2 con los
flags de arriba? ¿Prometheus alcanza `host.docker.internal` (`host-gateway`) cuando las apps escuchan en `127.0.0.1`?
- **Sí:** se sigue igual y el resultado se anota aquí.
- **No:** CA-3 (contenedores) y CA-14 se demuestran con Docker Engine en WSL2 o en el runner Linux de CI, y la
  limitación va al runbook. **No** se agrega node_exporter ni otro componente sin volver a Adrián (plan R-1).

Resultado del spike (T-01, 2026-11-03): **parcial, no verificado en Docker Desktop/WSL2.** Esta sesión no tiene Docker Desktop ni WSL2; el motor es Docker Engine 29.9.2 nativo en Ubuntu 24.04 (kernel 6.18), con containerd. Sobre él:
- cAdvisor v0.55.1 (`gcr.io/cadvisor/cadvisor`; **v0.60.6 no se pudo descargar**: `ghcr.io` devolvió 403 en el blob desde el proxy de la sesión) con los flags y montajes de compose: `container_memory_working_set_bytes{name=…}` y `container_cpu_usage_seconds_total{name=…}` salen por contenedor. Solo con containerd conectado: sin `/run/containerd/containerd.sock` la fábrica Docker de cAdvisor no se registra y no hay series por `name`.
- `container_fs_usage_bytes` y `container_fs_limit_bytes` con `id="/"` salen **por dispositivo** (`/dev/vda`, `/dev/vdb`, `/dev`, `overlay`, rutas bind de contenedores…). La regla de disco no puede sumarlos: debe elegir el dispositivo raíz (PD-170, T-07).
- Prometheus 3.15.0 de compose recolecta cAdvisor (`up`), y `api`, `worker` y `worker-optimizer` por `extra_hosts` resuelven a la pasarela del anfitrión (172.17.0.1). Un proceso que escucha en `127.0.0.1` del anfitrión **no** es alcanzable (conexión rechazada); uno en `0.0.0.0` sí. Los `app.listen(puerto)` actuales escuchan en todas las interfaces; el servidor de métricas de T-02 también debe hacerlo.
- **Pendiente:** repetir el spike en Docker Desktop/WSL2 (la máquina del equipo) y confirmar las mismas series y el `host-gateway` con las apps en `pnpm dev`. Hasta entonces, CA-3 (contenedores) y CA-14 no están demostrados en el entorno de desarrollo del equipo.
- **Demo T-09 en Docker Desktop/WSL2 (2026-11-04, Abel):** CPU y memoria por contenedor sí salen. El disco por contenedor
  (`container_fs_usage_bytes{name!=""}`) **no**: con el almacenamiento de containerd cAdvisor no lee la capa de cada
  contenedor (limitación del entorno; PD-173, se comprueba en staging). WSL2 expone `/dev/loop0` y `/dev/loop1`, imágenes de solo
  lectura siempre al 100 %, que hacían disparar la regla de disco (H-1): la regla excluye `/dev/loop*` y `/dev/shm` y mira
  solo el dispositivo de bloque de mayor capacidad (`topk(1, container_fs_limit_bytes)`), que en WSL2 es el de datos de Docker.

## Consecuencias
- Positivas: un solo stack para 022 y 022d. Sin puertos públicos nuevos. CA-10 queda cubierto por aprovisionamiento.
  El correo de alertas no depende del `worker` ni de la cola `mail`, así que una alerta sobre Redis o el `worker` sí
  puede salir. Ninguna caída de Prometheus, Grafana o cAdvisor afecta a cargar, descargar, navegar ni cobrar (Art. XII,
  RN-6).
- Negativas / deuda aceptada: tres contenedores más que operar y actualizar; cAdvisor tiene un privilegio comparable
  al de Traefik; las reglas en el formato de Grafana exigen un banco de pruebas propio (Prometheus de Testcontainers),
  que es la parte más cara del plan; la suma de límites de memoria pasa de 8 GB en producción con ONLYOFFICE; las
  imágenes nuevas aumentan el tiempo de CI (plan R-7); `prom-client` sin versión nueva desde 2024. El diagrama de
  arquitectura debe sumar Prometheus, Grafana y cAdvisor (DF-28 (e), PD-05, Adrián).
- Cómo sabremos si fue un error: si el spike muestra que cAdvisor no da disco ni memoria por contenedor en ningún
  entorno disponible; si en T-09 alguno de los tres pasa el 80 % de su `mem_limit` o el `MemAvailable` del anfitrión
  baja del 10 % con ONLYOFFICE; si el banco de reglas cuesta más de 1 día (entonces conviene la opción C.2 y reabrir
  P-3 con Adrián); o si una spec necesita trazas distribuidas (entonces se evalúa A.2).

## Relación con otros ADR
- **ADR-0001 / ADR-0038:** no cambian. Cada proceso (`api`, `worker`, `worker-optimizer`) expone sus métricas en un
  puerto interno y se distingue por el `job` de Prometheus.
- **ADR-0018:** no cambia. El correo transaccional sigue por nodemailer y la cola `mail`; las alertas usan el SMTP de
  Grafana (P-3).
- **ADR-0015:** no se toca Testcontainers. Las pruebas de 022 usan `GenericContainer` con las imágenes fijadas aquí.
