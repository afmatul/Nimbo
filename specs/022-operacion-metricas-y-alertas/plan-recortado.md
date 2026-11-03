# Plan 022 (versión recortada) — propuesta para comparar con `plan.md`

> Borrador de trabajo, **no es el plan oficial**. Base: `plan.md` de la rama `spec/022-operacion-metricas-y-alertas`
> (Propuesto, 2026-11-02). Los **criterios de aceptación no cambian** (CA-1, 2, 3, 5, 6, 9, 10, 11 a 16 y 18), ni la
> spec, ni los contratos (§4), las seis reglas (§5), los supuestos S-1 a S-8 y el ADR-0040. Solo cambia **cómo** se
> construye y **cuánto se prueba de forma automática**. Si Adrián lo adopta, estas secciones reemplazan §1, §2, §6 y `tasks.md`.

## 1. Resultado frente al plan original

| | Original | Recortado |
|---|---|---|
| Archivos de autor | 35 (TS 15 · config 10 · docs 2 · pruebas 8) | **25** (TS 10 · config 9 · docs 1 · pruebas 5) |
| Días-persona (suma de tareas) | ≈ 6,25 | **≈ 5,15** |
| Excepción de tamaño | Sí (archivos y días) | **Sí**, menor: sigue sobre 12 archivos y ~3 días |

Corrección a lo que dije antes: estimé ~20–25 archivos y ~4 días. Al contar archivo por archivo salen 25 y ≈ 5. No baja
de ahí sin quitar criterios de aceptación: solo la infraestructura declarativa ya son 9 archivos.

## 2. Recortes, con su costo

| # | Recorte | Ahorro | Qué se pierde / riesgo | Regla que lo respalda |
|---|---|---|---|---|
| R1 | No se extrae `worker-hosts.ts` ni se toca `worker-drain.module.ts`. `QueueMetricsCollector` hace su propio descubrimiento de `WorkerHost` | 2 archivos, ~0,25 d | Es la **segunda** aparición del mismo código sobre `@nestjs/bullmq`; si aparece una tercera, se extrae. No se arriesga el cierre ordenado de `WorkerDrain` | Art. VI.2 (regla de tres), plan 021/ADR-0034 |
| R2 | `metrics-server.ts` se fusiona en `metrics.module.ts`; `onlyoffice.probe.ts` en `dependency-metrics.collector.ts`; no se cambia `shared/index.ts` | 3 archivos, ~0,2 d | Archivos algo más largos (siguen ≤ 30 líneas por función). Nada se reexporta porque ningún módulo de negocio lo usa en 022 | Art. V (YAGNI) |
| R3 | Sin `prometheus.local.yml`. El override del compose da a Prometheus `extra_hosts: api, worker, worker-optimizer → host-gateway`, así `prometheus.yml` usa los mismos nombres de servicio en local y en staging | 1 archivo, ~0,1 d | Truco de resolución de nombres; con el perfil `apps` no se recolecta (ya era S-8). Se verifica en el spike de T-01 | DRY (un solo archivo de trabajos) |
| R4 | Sin cambios a `ambientes.md`: los servicios y puertos nuevos van en una sección de `observabilidad.md` | 1 archivo, ~0,1 d | Hay que mirar dos documentos de operación; se deja un enlace en el runbook | Artefactos cortos |
| R5 | Pruebas de `queue-metrics.int-spec.ts` pasan a `metrics-endpoint.int-spec.ts` (mismo Redis); `observability-compose.spec.ts` se une a `alert-rules.spec.ts` en `scripts/observability.spec.ts` | 2 archivos, ~0,3 d | Archivos de prueba más grandes; misma cobertura | Pruebas por riesgo |
| R6 | **Se elimina `grafana.int-spec.ts`** (Grafana + Mailpit en Testcontainers) | 1 archivo, ~0,5 d (T-08 baja de 0,75 a 0,25) | CA-9 (anónimo `401`, *Viewer* `403`) y CA-10 ya no tienen prueba automática de runtime. Se cubren con: prueba estática de que el compose fija `GF_AUTH_ANONYMOUS_ENABLED=false`, `GF_USERS_ALLOW_SIGN_UP=false` y `allowUiUpdates: false`, más la demo humana de T-09 que sube a incluir «anónimo no entra y *Viewer* no guarda» con captura en el PR. **Es el recorte de más riesgo: lo decide Adrián** | Pruebas por riesgo (workflow) |

**Lo que no se recorta, y por qué:**
- `alert-rules.int-spec.ts` (Prometheus + `promtool`): es la única forma de comprobar que las seis expresiones, incluida la
  exclusión de rutas de S-5, disparan donde deben. Una regla mal escrita falla en silencio y es el entregable de RNF-18.
- `http-metrics.middleware.spec.ts`: protege CA-5 (privacidad), que es de lo más sensible de la spec.
- `OnlyOfficeProbe` (ahora dentro del recolector): CA-15 pide la alerta de ONLYOFFICE caído. Se podría mover a 022d
  solo cambiando la spec; no es un recorte de plan.
- cAdvisor: sin él no hay CA-3 (CPU, memoria, disco) ni la regla 4 de disco.

## 3. Módulos, archivos y diseño (reemplaza §2)

**A = con lógica · B = cableado o configuración.** Mismo dueño y misma revisión de Adrián (spec §8).

| Capa | Archivo | | Responsabilidad |
|---|---|---|---|
| shared/infrastructure/metrics | `metrics.module.ts` (nuevo); `shared.module.ts` (cambia) | B | `MetricsModule` con `Registry` propio (`METRICS_REGISTRY`), métricas de proceso de `prom-client` y el manejador de `/metrics`. Un fallo al recolectar o escuchar se registra y no tumba el proceso (RN-6) |
| shared/presentation | `http-metrics.middleware.ts` (nuevo); `configure-http-app.ts` (cambia) | A | Igual que el plan original: histograma por `routePatternOf`, `<sin patrón>`, antes del analizador |
| shared/infrastructure/metrics | `queue-metrics.collector.ts` (nuevo) | A | Descubre sus `WorkerHost` (resguardo del getter que lanza), se suscribe en `onApplicationBootstrap` y consulta `getJobCounts` de las colas que consume. Sin extraer nada (R1) |
| shared/infrastructure/metrics | `dependency-metrics.collector.ts` (nuevo, incluye la sonda de ONLYOFFICE); `shared/health.module.ts` (cambia) | A | `nimbo_dependency_up{dependency}` desde `HealthService.ready()` y `GET ONLYOFFICE_INTERNAL_URL/healthcheck`, que no entra en `ready` (RN-4, PD-113) |
| raíces | `apps/api/src/main.ts`, `apps/api/src/worker-bootstrap.ts`, `shared/infrastructure/config/env.schema.ts` (cambian) | B | `METRICS_PORT` solo en `apiEnvSchema`; `/metrics` en los puertos internos de los `worker` |
| dependencias | `apps/api/package.json` (cambia) | B | `prom-client` solo con ADR-0040 `Aceptado` |
| compose | `compose.yml`, `compose.override.yml` (cambian) | B | Igual que el original, más `extra_hosts` para `api`, `worker` y `worker-optimizer` en el override (R3) |
| infra/prometheus | `prometheus.yml` (nuevo) | B | Cuatro trabajos (`api`, `worker`, `worker-optimizer`, `cadvisor`) por nombre de servicio |
| infra/grafana | `provisioning/datasources/prometheus.yml`, `provisioning/dashboards/dashboards.yml`, `dashboards/operacion.json`, `provisioning/alerting/alertas.json` (nuevos) | B | Igual que el original |
| configuración | `.env.example` (cambia) | B | Igual que el original; pasa `pnpm env:check` |
| docs | `docs/operations/observabilidad.md` (nuevo) | — | Runbook más una sección de servicios y puertos (R4) |

**Conteo:** TS 10 (4 nuevos, 6 cambiados) · config 9 (+ `pnpm-lock.yaml` generado) · docs 1 · pruebas 5 = **25**.
Sin puertos, tablas, rutas de clientes ni dependencias entre módulos; no cambia lo ya dicho en el plan original.

## 4. Pruebas por riesgo (reemplaza §6)

| CA | Nivel | Archivo |
|---|---|---|
| CA-1 (HTTP), CA-5 (plantilla, `<sin patrón>`, código) | unit | `shared/presentation/http-metrics.middleware.spec.ts` |
| CA-3 y CA-15 (arriba, abajo, tiempo límite, ONLYOFFICE sin variable) | unit | `shared/infrastructure/metrics/dependency-metrics.collector.spec.ts` |
| CA-1 (HTTP, procesos y **todas las colas**), CA-2 (`404` público), CA-5 (UUID y correos en ruta, consulta y `data` de trabajos), CA-12 (las dos plantillas excluidas coinciden con las del middleware), CA-15 (ONLYOFFICE caído: `ready` `200`) | int (Redis) | `test/int/observability/metrics-endpoint.int-spec.ts` |
| CA-11 a CA-16: cada expresión leída de `alertas.json` contra series sintéticas con `promtool`; dispara sobre el umbral y no bajo él | int (Prometheus) | `test/int/observability/alert-rules.int-spec.ts` |
| RN-1 (seis reglas, umbrales, `for`, `noDataState: OK`, anotaciones sin otras etiquetas); CA-2 (sin `ports:` para Prometheus y cAdvisor, Grafana solo en `127.0.0.1`, sin etiquetas de Traefik); **CA-9 y CA-10 estáticos** (anónimo y registro apagados, `allowUiUpdates: false`, fuente y tablero aprovisionados) | unit (estática, `docker compose config`) | `scripts/observability.spec.ts` |
| CA-6, CA-9 (anónimo y *Viewer*), CA-10 (volúmenes vacíos), CA-18 (disparo y resolución con Redis detenido) | demo humana | T-09, evidencia en el PR |

## 5. Tareas (reemplaza `tasks.md`; ≈ 5,15 días)

- [ ] **T-01** Spike de cAdvisor en Docker Desktop/WSL2 (≤ 0,5 d; resultado a ADR-0040 y R-1, y comprobar `extra_hosts` de R3), luego Prometheus, Grafana con fuente aprovisionada y cAdvisor en compose con el panel de CPU y memoria (1,25 d) — CA-2, CA-3, CA-10 — Prueba: `scripts/observability.spec.ts` (parte de compose) en rojo primero y `pnpm env:check` — Depende: ADR-0040 `Aceptado`
- [ ] **T-02** `MetricsModule`, `/metrics` del `api` y los `worker`, middleware HTTP y paneles de errores, p50/p95/p99 y procesos (0,75 d) — CA-1, CA-2, CA-5 — Prueba: unitaria del middleware primero; `metrics-endpoint.int-spec.ts` — Depende: T-01
- [ ] **T-03** Banco de reglas con `promtool`, punto de contacto de correo, política y reglas 1 y 2 (0,75 d) — CA-11, CA-12 — Prueba: `observability.spec.ts` y `alert-rules.int-spec.ts` en rojo antes de cada regla — Depende: T-02
- [ ] **T-04** `QueueMetricsCollector` con su descubrimiento propio, paneles de colas y regla 3 (0,75 d) — CA-1, CA-5, CA-6, CA-13 — Prueba: casos de colas en `metrics-endpoint.int-spec.ts` primero y de la regla 3 — Depende: T-02, T-03
- [ ] **T-05** Regla 6 de renovación sobre `subscription-renewal`, sin tocar `billing` (0,25 d) — CA-16 — Prueba: casos de la regla 6 — Depende: T-04
- [ ] **T-06** `DependencyMetricsCollector` con la sonda de ONLYOFFICE, panel y regla 5 (0,4 d) — CA-3, CA-15, RN-4 — Prueba: `dependency-metrics.collector.spec.ts` primero; caso de `ready` `200` — Depende: T-03
- [ ] **T-07** Panel de disco y regla 4 con `container_fs_*{id="/"}` (0,25 d) — CA-3, CA-14 — Prueba: casos de la regla 4; `observability.spec.ts` exige exactamente seis reglas — Depende: T-01, T-03
- [ ] **T-08** Runbook `observabilidad.md` y cuentas de Grafana (0,25 d) — CA-9, CA-10 — Prueba: parte estática de `observability.spec.ts` — Depende: T-07
- [ ] **T-09** **(humana)** Demo en local desde volúmenes vacíos: cuentas, tráfico, tablero, anónimo sin acceso, *Viewer* sin guardar, Redis detenido y correos de disparo y resolución en Mailpit; capturas y hora en el PR (0,5 d) — CA-6, CA-9, CA-10, CA-18 — Depende: T-08

## 6. Decisiones que quedan para Adrián

1. ¿Se acepta **R6** (sin prueba automática de Grafana, cubierta con prueba estática y demo)? Es el único recorte que baja la verificación automática de un CA con riesgo de acceso (CA-9).
2. ¿Se acepta **R1** (descubrimiento duplicado hasta la tercera aparición)? Contradice la lectura de Art. VI.1 del plan original.
3. Con 25 archivos y ≈ 5 días sigue haciendo falta la excepción de tamaño, ahora menor. Opción (a) o (b) del plan original: con esta versión recomiendo **(a)**.
