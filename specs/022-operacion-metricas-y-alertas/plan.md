# Plan preparatorio 022 — Operación, métricas y alertas

> Spec: [spec.md](spec.md) · Tareas: [tasks.md](tasks.md) · Estado: **Propuesto, documento preparatorio sin aprobación**.
> Fecha: 2026-10-30 · Dueño: Abel · No habilita implementación ni cambia el estado Borrador de la spec.
> Actualización documental: 2026-11-01 · PD-145/146/147 propios de 022 pasan a PD-165/166/167; historial en spec §10 y `docs/sdd/pendientes.md`.
> El Modo 2 de `.claude/agents/planner.md` impide planificar oficialmente con preguntas bloqueantes.
> Se redacta por petición humana para evaluar alternativas; no es una excepción aprobada al workflow ni al límite de tamaño.

## 1. Resumen técnico

- Igual que 000: mantener salud pública y Pino; añadir recolección privada, sin modificar `live`/`ready` (RN-4).
- Proponer un registro Prometheus por proceso, instrumentado mediante un puerto de `shared`; Grafana consume solo Prometheus.
- Instrumentar HTTP, BullMQ y resultados de los módulos; no convertir Grafana en cliente de PostgreSQL ni de la API de 011.
- Prometheus recolectaría aplicaciones y sistema; Grafana provisionaría tableros y evaluaría las seis alertas de RN-1.
- Propuesta de alertado: Grafana Alerting, sin agregar Alertmanager; canal y entrega dependen de P-3 y del ADR pendiente.
- Respaldo diario mediante herramientas operativas externas a las apps; recuperación solo sobre corpus sintético (CA-19 a CA-22).
- Rollback consume lo que entregue 000, no implementa su despliegue; CA-23 queda pendiente de imágenes y staging reales.
- Las siete preguntas siguen abiertas (§7); las recomendaciones de Matul en el [PR #78](https://github.com/afmatul/Nimbo/pull/78) no son aprobaciones.

### Base real y tamaño

Consulta: HEAD `1e427a99` más `spec.md` local revisado; `origin/main` conocido `6a2ccb1a`. Los tres documentos locales previos se conservan.
No aparecieron `plan_022_borrador.md` ni `tasks_022_borrador.md` en este worktree; se usan spec, auditorías y plantillas vigentes.
Existen NestJS, BullMQ, Pino, Testcontainers, Mailpit, versionado de MinIO y los indicadores Postgres/Redis/MinIO.
No existen `prom-client`, Prometheus/Grafana desplegados, listener de métricas, `BullMqInspector` ni una API pública de inspección de colas.
`IQueueInspector`/`BullMqInspector` aparecen en el diseño, no en el código: no se reutilizan como si estuvieran implementados.
020/020b están en `origin/main`, no en este checkout; 020 §7 y plan §5 remiten a 022, pero P-8 sigue abierta.
`AgentAskTrace` registra duración y fragmentos, no tiempo al primer fragmento ni consumo/costo; `GeminiFlashModel` descarta `usageMetadata`.
000 T-35 a T-44 siguen pendientes; no se presupone `compose.staging.yml`, publicación ghcr.io ni scripts de rollback disponibles.
**Exceso real:** §2 enumera 78 rutas físicas (49 E, 5 U, 24 N), más 23 pruebas nuevas en §6: 101 rutas preliminares, incluidas las condicionales y sin contar ADR ni adaptaciones de pruebas existentes. Supera 12 archivos y 12 filas; hay dos tableros base y un tercero condicionado, no una sola pantalla.
Las 12 tareas de `tasks.md` son unidades preliminares de 0,5–1 día: 6–12 días-persona, por encima de los ≤ 3 días de `workflow.md` §4 (regla 1).
Cumplir ≤ 250 líneas no subsana esos excesos; agrupar rutas en una fila tampoco. No se presenta este alcance como conforme a ADR-0034.
**Alternativa recomendada, no ejecutada:** 022 = RNF-18 (CA-1 a CA-18); posible 022c = RNF-21/RNF-20 (CA-19 a CA-23, HU-4/HU-5, RN-5).
Tras decidir, trasladar criterios con referencia de origen y ajustar ambas specs y tareas. No hay carpeta, numeración reservada ni rama 022c.
La división por sí sola puede dejar 022 sobre 12 archivos/más de una pantalla: Adrián debe decidir cortes verticales adicionales o tramitar una excepción expresa documentada al flujo; no se presume autorizada.

## 2. Módulos, archivos y diseño

Inventario **propuesto**, no archivos creados en este pase. Prefijos: `S/` = `apps/api/src/shared/`; `M/` = `apps/api/src/modules/`.
`A/` = `apps/api/src/`; `I/` = `apps/api/test/int/observability/`. Llaves enumeran archivos físicos, no un archivo único.
**E** = existente en el worktree; **U** = existente solo en `origin/main`, integrar antes de tocarlo; **N** = nuevo propuesto y actualmente ausente.
Las pruebas nuevas se enumeran en §6 y forman parte del inventario propuesto. No se excluyen para alegar cumplimiento del umbral.

| ID / estado | Archivo(s) | Responsabilidad / dueño que debe autorizar |
| --- | --- | --- |
| F01 N | `S/application/ports/i-metrics-recorder.port.ts`, `S/infrastructure/metrics/prometheus-metrics.recorder.ts`, `S/infrastructure/metrics/metrics-catalog.ts` | Puerto `IMetricsRecorder`, adaptador `PrometheusMetricsRecorder` y catálogo cerrado; Abel con Adrián (`shared`). |
| F02 N | `S/infrastructure/metrics/metrics-server.ts`, `S/infrastructure/metrics/metrics.module.ts`, `S/presentation/http-metrics.middleware.ts` | Listener privado, ciclo de vida y captura HTTP; distintos de `MetricsController` de 011. |
| F03 N | `S/infrastructure/metrics/queue-metrics.collector.ts`, `S/infrastructure/metrics/dependency-metrics.collector.ts` | Consultas acotadas de colas y sondas de infraestructura; sin trabajos/payloads ni contenido. |
| F04 E | `S/shared.module.ts`, `S/index.ts`, `S/index.spec.ts`, `A/app.module.ts`, `A/worker.module.ts`, `A/main.ts`, `A/worker.main.ts`, `S/presentation/configure-http-app.ts` | Componer y exportar telemetría, conectar middleware y cerrar recursos; Adrián. |
| F05 E | `S/infrastructure/config/env.schema.ts`, `S/infrastructure/config/secret-keys.ts`, `.env.example`, `apps/api/package.json`, `pnpm-lock.yaml` | Entorno por consumidor, redacción y dependencia tras ADR; sin credenciales ajenas en procesos; Adrián. |
| F06 E | `M/storage/application/{upload.service.ts,upload-registrar.ts,file.service.ts,storage-logger.ts,version-restore.service.ts,version-pruner.ts,edited-version.registrar.ts,usage-reconciler.ts}`, `M/storage/infrastructure/{upload-cleanup.processor.ts,minio-storage.adapter.ts}` | Resultados, bytes, descargas, versiones, espacio y error MinIO; sin alterar semántica ni leer cuentas desde `shared`; Adrián. |
| F07 E | `M/identity/application/{registration.service.ts,auth.service.ts,session.service.ts,password.service.ts}`, `M/notifications/infrastructure/mail.processor.ts`, `S/presentation/auth/{jwt-auth.guard.ts,roles.guard.ts}` | Registro/verificación, login, reúso, bloqueos, correo y denegaciones; Adrián. |
| F08 E | `M/audit/application/audit.service.ts` | Contar pérdidas de mejor esfuerzo en todos sus caminos, sin contar dos veces ni convertirlas en alerta; Adrián. |
| F09 E | `M/billing/application/{subscription.service.ts,personal-subscription.service.ts,subscription-renewer.ts,renewal-runner.ts}`, `M/billing/infrastructure/renewal.processor.ts` | Eventos efectivos tras confirmación, degradaciones y fallo de pasada; Juan Marcos, infraestructura con Adrián. |
| F10 E | `M/editing/application/{edit-session.service.ts,save-callback.handler.ts,save-version.service.ts}`, `M/realtime/infrastructure/socket-io-hub.ts`, `M/realtime/presentation/realtime.gateway.ts` | Sesiones, editores, versiones, guardados y señales del canal; Adrián. |
| F11 U | `M/intelligence/application/{agent.service.ts,agent-logger.ts,hybrid-retriever.ts}`, `M/intelligence/infrastructure/gemini-flash.model.ts`, `M/intelligence/application/ports/i-language-model.port.ts` | Grupo Agente solo según P-8/P-11; si se amplía el contrato, adaptar dobles y pruebas de 020; Adrián. |
| F12 N | `compose.observability.yml`, `infra/prometheus/prometheus.yml`, `infra/grafana/provisioning/datasources/prometheus.yml`, `infra/grafana/provisioning/dashboards/default.yml` | Despliegue reproducible y datasource único; Abel con autorización de Adrián. |
| F13 N | `infra/grafana/dashboards/{operation.json,business.json,agent.json}`, `infra/grafana/provisioning/alerting/{rules.yml,contact-points.yml}` | Tableros, seis condiciones y contactos; `agent.json` solo si P-8 lo incluye. Secretos por inyección, nunca en YAML. |
| F14 E | `compose.yml`, `compose.override.yml`, `infra/minio/init.sh` | Red privada, configuración local y eventual retención no vigente solo tras P-5; no modificar la purga de Nimbo; Adrián. |
| F15 N | `infra/backups/{backup.sh,restore.sh,verify-objects.sh,backup.service,backup.timer}`, `docs/operations/{observabilidad.md,respaldos.md}` | Programación diaria, publicación atómica, restauración sintética y procedimientos; alternativa ligada a P-2/P-5, no servicio Nest; Adrián con Abel. |
| F16 E | `docs/operations/ambientes.md`, `docs/sdd/{architecture.md,design-model.md,design-findings.md}`, `docs/adr/README.md` | Registrar decisiones técnicas aceptadas, exposición privada y DF-28/29; guardianía de Adrián. |

F01–F16 no son instrucciones para editar módulos ajenos: Abel propone; cada dueño autoriza alcance y revisa sus cambios, según spec §8 y `workflow.md` §5.
Antes de un plan oficial: conciliar `origin/main` y los conflictos de `pendientes.md`/`specs/README.md`, verificar de nuevo rutas y PD-165/166/167; no reemplazar otras filas.
Los ADR nuevos se enumeran por tema en §7, sin asignar número: el registro de esta rama está atrasado respecto de main y 021.

### Fronteras y recolección propuestas

- `IMetricsRecorder` pertenece a `shared`: justificación Art. V.2(a), aislar `prom-client`; contrato mínimo de contadores, observaciones y valores con nombres/etiquetas cerrados. No recibe `Actor`, contenido ni payloads de negocio.
- Los servicios conservan su `actor` y autorización actuales; llaman al puerto solo con escalares ya autorizados. Sin importaciones entre módulos de negocio nuevas ni un `IMetricsService` genérico.
- El registro es único **por proceso**, inyectable y reemplazable en pruebas; no singleton global de librería compartido entre apps Nest de una suite.
- HTTP se observa al terminar la respuesta, incluidos errores: método, ruta como plantilla, estado y duración en segundos; ruta no reconocida se agrupa sin URL ni query. Percentiles p50/p95/p99 derivados de histogramas.
- BullMQ se observa mediante registros de colas de cada raíz y métricas de ejecución en el proceso consumidor: también `editing-save` e `index-status` en `api`, no solo `WORKER_QUEUES`. Espera y ejecución no se confunden.
- Reutilizar BullMQ instalado y `runWithJobCorrelation` de `S/infrastructure/queue/repeatable-job.ts` cuando aplica; no importar infraestructura de otro módulo ni fingir que ese helper cubre todos los procesadores.
- El recolector consulta conteos, edad y un máximo/recuento agregado de intentos, con paginación acotada; no exporta `jobId` ni datos de trabajos. Detectar un trabajo con 3 reintentos, no sumar reintentos de distintos trabajos.
- Postgres/Redis/MinIO: reutilizar `PostgresHealthIndicator`, `RedisHealthIndicator`, `MinioHealthIndicator` en un muestreo separado; errores de sonda producen `down`, no excepciones en solicitudes de cliente.
- ONLYOFFICE: sonda HTTP propia sobre su healthcheck solo con el perfil activo; no registrar un indicador nuevo en `ready` (PD-113, PD-166).
- CPU/memoria/disco por contenedor: candidato cAdvisor; capacidad/uso de los volúmenes persistentes mediante node_exporter. Son componentes nuevos sujetos a ADR, montajes acotados y verificación en Docker Desktop/Linux, no capacidades ya disponibles.
- MinIO: medir errores en el adaptador y salud, no inferirlos de CPU. Espacio usado se publica desde el dueño de almacenamiento, sin scraper SQL sin actor; selección agregado/por cuenta queda bloqueada por P-11.
- Propuesta para el canal de 015: conexiones activas, admisiones rechazadas y eventos emitidos por tipo cerrado; sin salas, usuarios ni documentos en etiquetas. Es supuesto técnico sujeto a revisión, no nuevas alertas.
- No derivar métricas leyendo bitácoras: su nivel y formato no garantizan contabilización. Instrumentar resultados confirmados; las fallas de telemetría no revierten operaciones (RN-6).
- Modo contenerizado: listeners sin `ports`, accesibles solo por la red de recolección. Modo apps en host: listener en loopback y recolector en host; un contenedor no puede asumir que accede al loopback del host. Elegir y probar con P-2; no dar RNF-12/CA-10 por cumplidos con ese ensayo local.
- Grafana nunca recibe credenciales PostgreSQL/MinIO; P-6 decide su publicación, independiente de CA-2. Proponer cuentas propias sin anónimo y provisionar solo los tableros incluidos por P-8.

## 3. Datos

Sin tablas, columnas ni migración de Nimbo propuestas; `synchronize: false` permanece. No se justifican SQL ni `down` nuevos.
Prometheus/Grafana conservarían sus volúmenes propios; retención de series y límites de recursos se dimensionan con el ambiente de P-2, sin copiar la retención de respaldos de P-5.
Bytes de dominio y controles permanecen `bigint`; exportarlos como número de Prometheus requiere unidad y conversión explícitas, no reutilizarlos para validar cuota.
Respaldo: `pg_dump` compatible con PostgreSQL 17, salida temporal, cifrado y publicación atómica solo tras verificar éxito; rotar después, nunca eliminar copias sanas al fallar.
Propuesta P-5: siete diarios, volumen distinto de Postgres y cifrado (candidato `age`); ubicación externa y custodia de clave requieren decisión, no hay valores finales ni herramientas instaladas presupuestas.
`backup.timer`/`backup.service` son una alternativa systemd en Linux; en Windows/local habrá que elegir ejecutor verificable con P-2. No agregar una cola BullMQ que comparta el destino de fallo de la BD.
Restauración: descifrar en destino sintético aislado, restaurar sobre base vacía y ejecutar migraciones pendientes; verificar salud y conteos previos/posteriores de `usuario`, `archivo`, `version_archivo` y objetos del corpus con hashes.
CA-22 prueba versiones no vigentes de un objeto sobrescrito/borrado fuera de Nimbo. Versionado ya existe en `infra/minio/init.sh`; ILM solo tras P-5, sin afectar versiones funcionales ni prometer recuperar una purga deliberada.
Esto no equivale a una copia externa de todos los objetos ni autoriza restaurar sobre cuentas reales. El rollback no ejecuta `migration:revert` a ciegas: compatibilidad N/N-1 y restricciones son de 000 y de cada migración.

## 4. Contratos

| Superficie | Acceso / resultado propuesto | Error / frontera |
| --- | --- | --- |
| Listener dedicado `GET /metrics` por proceso | Solo recolector en red privada; texto Prometheus con tipos/unidades y etiquetas de lista blanca | Fuera de la red: sin conectividad; fallo interno: 5xx técnico sin detalle sensible; no añadir `/api/v1/metrics` público. |
| Rutas `live`/`ready` de 000 | Contratos actuales intactos; ONLYOFFICE no entra en readiness | Sin cambios de estados, roles o topología pública. |
| Grafana | Fuente Prometheus; acceso y privilegios pendientes de P-6 | Sin sesión o sin permiso no hay tablero ni consulta de datasource accesible (CA-9). |
| `GET /api/v1/backoffice/metrics` | Sigue siendo el `MetricsController` y `MetricsService` de 011 | No modificarlo ni usarlo como scraper (P-7). |
| Alertas / canal P-3 | Estado disparado/normal, ambiente, condición y hora; sin IDs ni valores sensibles | Fallo de entrega queda técnico; no puede bloquear las apps. |
| Respaldo / restauración | Procedimientos del Operador, salida por código y bitácora estructurada | `code` estable, resultado, bytes, duración y `correlationId`; nunca contenido, claves de objetos ni credenciales. |

Catálogo de series: conservar nombres ya declarados por 001/002/003/005 (sus planes §7) y completar RN-3 en F01; no renombrarlos para aparentar una implementación existente.
Histogramas HTTP deben permitir el umbral 0,3 s y percentiles; solo consultas UI alimentan CA-12 (RNF-01), excluyendo transferencia, agente y observabilidad. CA-11 mide 5xx sin filtrar errores reales.
Las seis reglas se provisionan desde `product-context.md` §7: CA-11/12 respetan sus ventanas; CA-13/14/15/16 no reciben ventanas nuevas de negocio.
CA-16 observa el fallo de la **pasada**, incluido un error del escáner, no solo rechazos de cobro de una cuenta; reintentar no borra la evidencia del fallo.
CA-17 expone contador y panel, sin séptima alerta. Respaldos fallidos, correo/reúso/denegaciones sostenidos siguen en PD-167/PD-67, pendientes de modificar primero las alertas del producto.
No se agregan contratos web, eventos Socket.IO ni puertos entre módulos de negocio. Si P-8 exige tokens/costo, acordar con Adrián la ampliación interna de `ILanguageModel` y adaptar dobles; nunca estimarlos contando caracteres como si fueran consumo real.

## 5. Seguridad y operación

- CA-5 rige series, etiquetas, dashboards, anotaciones y notificaciones. No usar correo, nombre, contenido, URL, token, clave, `correlationId` o `jobId` como etiquetas.
- P-11: diseño recomendado con totales/distribuciones sin identificadores; **no aprobado**. Si mantiene cuenta/documento, completar fuente autorizada, roles y pruebas de aislamiento antes del plan oficial, sin lectura directa de BD por Grafana ni excepción tácita a RN-7.
- Sin consultas nuevas por usuario en `shared`: mantener `actor`, `accessibleNodes(actor)` y RLS de cada productor. Un agregador global que requiera consultar cuentas necesita un diseño autorizado; no se inventa un escáner privilegiado.
- Pruebas de privacidad con cuentas sintéticas A/B y valores centinela; no confundirlas con nuevas pruebas de aislamiento SQL si el diseño final no consulta datos de cliente. Si los consulta, aislamiento bloqueante (Art. IX y workflow §4.5).
- Respaldos de producción contienen datos de cliente; administración solo por Operador, fuera del repo. CA-21/22 se verifican con corpus sintético; operar sobre cuentas reales permanece fuera de alcance.
- Cada operación de respaldo registra correlación propia y solo metadatos técnicos permitidos; las credenciales del Operador no llegan al `api`, navegador ni recolector.
- Registro/muestreo/entrega con fallos acotados, sin espera de red en transacciones de negocio; `metrics` no participa en `ready` ni en las dependencias necesarias para servir archivos.
- Verificar carga/descarga/navegación con Prometheus, Grafana y destino de respaldo caídos (RN-6), más ONLYOFFICE caído con readiness 200 (CA-15).
- Procedimientos y evidencia se incorporan en la tarea que entrega la capacidad, no en una tarea final de documentación. No hay pantalla nueva en `apps/web` ni imports desde mockups.

## 6. Estrategia de pruebas y trazabilidad

Todos los archivos de esta tabla son **N**, propuestos y ausentes. `U/` = `S/infrastructure/metrics/`; `P/` = `apps/api/test/int/operations/`.
Prueba roja antes de lógica; integración contra servicios reales con el arnés existente `apps/api/test/int/setup/containers.ts` y utilidades de `apps/api/test/support/`, nunca mocks de Postgres/Redis/MinIO.
Unitarias adicionales del núcleo: `U/prometheus-metrics.recorder.spec.ts`, `U/queue-metrics.collector.spec.ts`, `U/dependency-metrics.collector.spec.ts`; contrato compartido del puerto en `apps/api/test/support/metrics-recorder.contract.ts`.
Dobles y pruebas existentes de los productores se adaptan en su misma tarea; sus rutas finales se revisan tras integrar main y fijar el contrato, no se consideran inventario cerrado.

| CA | Diseño / tarea | Prueba principal propuesta y resultado observable |
| --- | --- | --- |
| CA-1 | F01–F04; T-01, T-02 | `I/metrics-http.int-spec.ts`, `I/metrics-queues.int-spec.ts`: HTTP real y cola Redis cambian series, espera y ejecución distinguibles. |
| CA-2 | F02/F12/F14; T-01 | `I/metrics-network.int-spec.ts`: scrape interno exitoso; Traefik, API pública y conexión directa exterior no entregan métricas. |
| CA-3 | F03/F12; T-02 | `I/metrics-system.int-spec.ts`: métricas de contenedores/volúmenes y caídas reales de dependencias; perfil ONLYOFFICE activo/inactivo. |
| CA-4 | F03/F06–F11; T-02, T-03, T-04, T-05, T-06, T-07 | `I/metrics-groups.int-spec.ts`: un caso por grupo decidido de RN-3, serie y consulta de panel; Agente condicionado a P-8. |
| CA-5 | F01 y productores; T-01, T-03, T-07 | `I/metrics-privacy.int-spec.ts`: centinelas A/B ausentes en scrape, dashboards y alerta; etiquetas acotadas y rutas normalizadas; ampliar a aislamiento si P-11 lo exige. |
| CA-6 | F03/F13; T-02, T-08 | `I/grafana-provisioning.int-spec.ts`: tablero de operación consulta series reales por ambiente P-2. |
| CA-7 | F09/F13; T-05 | `I/metrics-business.int-spec.ts`: eventos confirmados y degradación a solo lectura por periodo, no conteo de cuentas actuales; P-7. |
| CA-8 | F11/F13; T-07 | `I/metrics-agent.int-spec.ts`: grupo acordado por P-8; no panel vacío ni consumo inventado; si se excluye, registrar destino y no marcarlo implementado en 022. |
| CA-9 | F12/F13; T-08 | `I/grafana-provisioning.int-spec.ts`: sin sesión/sin permisos no se leen tablero, API de consultas ni datasource según P-6. |
| CA-10 | F12–F14; T-08 | `I/grafana-provisioning.int-spec.ts`: volúmenes vacíos, tableros incluidos por P-8 y seis reglas disponibles sin pasos manuales; ambiente P-2. |
| CA-11 | F13; T-09 | `I/alert-rules.int-spec.ts`: series controladas en Prometheus/Grafana reales comprueban condición/ventana; `I/alert-delivery.int-spec.ts` verifica entrega por P-3. |
| CA-12 | F02/F13; T-09 | `I/alert-rules.int-spec.ts`: p95, ventana y exclusión de agente/transferencia; sin ejecutar carga k6 (023). |
| CA-13 | F03/F13; T-09 | `I/alert-rules.int-spec.ts`: profundidad y un trabajo con 3 reintentos; no suma de trabajos distintos. |
| CA-14 | F12/F13; T-09 | `I/alert-rules.int-spec.ts`: uso/capacidad de volumen correcto, incluyendo límite exacto. |
| CA-15 | F03/F13; T-09 | `I/alert-dependencies.int-spec.ts`: sondas y alerta por caída; ONLYOFFICE no afecta readiness ni dispara apagado por perfil. |
| CA-16 | F09/F13; T-05, T-09 | `I/metrics-business.int-spec.ts`: error de pasada/escáner sube serie; `I/alert-rules.int-spec.ts` verifica regla sin confundir rechazo de pago. |
| CA-17 | F08/F13; T-04 | `I/metrics-audit.int-spec.ts`: fallo real de escritura de mejor esfuerzo sube contador/panel y operación principal permanece; sin alerta adicional. |
| CA-18 | F13; T-09, T-12 | `I/alert-delivery.int-spec.ts`: receptor real de prueba recibe disparo y recuperación; demo humana añade captura y hora en documento de operación. |
| CA-19 | F15; T-10 | `P/backup.int-spec.ts`: programación diaria y respaldo descifrable en destino P-5, bitácora con éxito/tamaño/duración. |
| CA-20 | F15; T-10 | `P/backup.int-spec.ts`: fallo controlado de dump/cifrado/escritura deja copias previas intactas y registra `code`. |
| CA-21 | F15; T-11 | `P/restore.int-spec.ts`: PostgreSQL y corpus reales, base vacía, migraciones sin pendientes, salud 200 y conteos/hashes coincidentes; registro por fase. |
| CA-22 | F14/F15; T-11 | `P/object-restore.int-spec.ts`: MinIO versionado real recupera sobrescritura/borrado externo; purga deliberada no recuperable. |
| CA-23 | Dependencia 000; T-12 | Ensayo humano con N y N-1 reales, cronómetro < 10 min, readiness 200 y `x-nimbo-version` anterior; registrar evidencia, no sustituir por mocks. |

La fuente única de alertas propuesta es `infra/grafana/provisioning/alerting/rules.yml`: pruebas con Grafana Alerting real, incluidos estados y ventanas originales; promtool valida configuración de Prometheus, no sustituye esa aceptación. Sin duplicar reglas para otro motor.
CA-11/12 requieren observar las ventanas reales de 5/10 minutos sin acortarlas en la evidencia; esperas por condición con plazo, no `sleep` fijo. Dimensionar una suite dedicada dentro del presupuesto CI y registrar duración antes del plan oficial.
`I/metrics-degradation.int-spec.ts` (N) cubre RN-6 con fallos de telemetría; `I/metrics-network.int-spec.ts` cubre superficie, no equivale a aislamiento de cliente.
Suite condicional `apps/api/test/isolation/metrics.iso-spec.ts` (N) si P-11 habilita identificadores/consultas por cuenta; agregarla al inventario y a la tarea afectada antes de aprobar.
Cobertura de lógica de negocio ≥ 60 %; funciones ≤ 30 líneas y ≤ 3 parámetros. No replicar el mismo CA en tres capas.
Al implementar: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:int`, `pnpm env:check` y aislamiento cuando corresponda; además validadores de Prometheus/Grafana/Compose con imágenes fijadas por ADR. Aquí solo se valida documentación.

## 7. Riesgos, decisiones y coherencia

| Decisión pendiente | Recomendación para Adrián (sin aprobar) | Impacto |
| --- | --- | --- |
| P-2 | RNF-18/21 primero local sintético y repetición en staging; CA-23 espera 000 CA-31 y bloques 5–6 | Topología del listener/recolector, ejecutor de respaldos y evidencia; RNF-12/15 no se declaran satisfechos por una demo local. |
| P-3 | Correo del equipo vía SMTP, Mailpit local | Grafana necesitaría su propia configuración SMTP autorizada; que exista SMTP en `worker` no habilita copiar sus secretos ni depender de su cola. |
| P-5 | Siete diarios, destino separado, cifrado con clave del Operador y destino externo antes de producción; 30 días no vigentes como propuesta | Ejecutor, restauración, retención y eventual ILM; valores no fijados. |
| P-6 | Cuentas propias, Operador editor y Administrador lector; sin anónimo, localhost local y HTTPS en staging | Provisionamiento de acceso y pruebas de permisos, sin aplicar JWT de Nimbo a Grafana por suposición. |
| P-7 | Complementar 011 con tendencias de eventos; el estado actual queda en 011/022b | Catálogo de negocio y CA-7, sin duplicar `MetricsService`. |
| P-8 | Confirmar expresamente grupo y tablero en 022, coordinación de Abel con Adrián; alternativa: otro entregable con dueño explícito | No reabrir 020/020b ni asumir asignación; instrumentar primer fragmento/uso/costo si entran. |
| P-11 | Totales y distribuciones por plan sin identificadores; alinear propuesta y contexto si se aprueba | Etiquetas, origen del espacio usado y consumo; alternativa por cuenta exige diseño de autorización y aislamiento. |

- **Tamaño/entregables:** decisión de partición previa al plan oficial; incluso 022/022c requiere volver a medir archivos, pantallas y esfuerzo. No hay excepción acordada ni autorización de ownership.
- **ADR necesarios, sin número asignado:** instrumentación privada con `prom-client` y nuevo puerto; despliegue de Prometheus/Grafana Alerting/exporters (imágenes, recursos, montajes, persistencia); herramientas y ejecutor de respaldo/cifrado tras P-5. Son dependencias propuestas, no instaladas ni aprobadas.
- `architect` debe revisar la arquitectura de recolección privada y tecnologías nuevas antes de la aprobación. No se invoca ni se inventa su veredicto en este pase documental.
- **DF/PD:** actualizar DF-29 con el listener privado y ONLYOFFICE fuera de `ready` (PD-166); DF-28/PD-05 para diagramas. Los nombres nuevos de F01/F02 requieren reflejo en `design-model.md` al aceptar el diseño, no se presentan como clases existentes.
- **Fuera:** RF-37/022b, k6/023 (PD-60/62), correcciones de referencias ajenas PD-165, alertas candidatas y endurecimiento de staging PD-167. Ninguna recomendación agrega una séptima alerta.
- **Colas y reinicios:** no duplicar contadores entre consumidores ni tratar reinicio de proceso como decremento; consultas Grafana con `rate`/`increase`, y límites sobre ventanas de observación explícitas. Persistencia/durabilidad exacta no se promete sin requisito.
- **Agregados de espacio y plan:** los productores no ofrecen hoy un total global autorizado listo para scrape; no sumar lecturas parciales de cuentas y presentarlas como total. Resolver su fuente y prueba con P-11/Adrián antes de completar el diseño.
- **Recursos/compatibilidad:** exporters pueden no medir el volumen esperado en Docker Desktop; comprobarlo contra el filesystem real. Sin imágenes de apps integradas, el perfil `apps` no es una demostración reproducible automática de CA-10.
- **Respaldos:** volumen distinto en el mismo servidor no cubre pérdida del servidor; la opción de destino externo y su plazo son decisión P-5. No restaurar automáticamente ni usar datos reales para la evidencia.

## 8. Aprobación

- `architect`: **pendiente**, por tecnología y arquitectura propuestas; sin dictamen.
- Adrián: **pendiente, sin aprobación**. No se interpreta esta petición de documentos como aprobación ni se registra aprobación por silencio.
- Compuerta para convertirlos en planificación oficial: resolver P-2/P-3/P-5/P-6/P-7/P-8/P-11 en la spec, decidir partición/excepción, conciliar main, completar inventario/diseño condicionado y ADR, obtener autorizaciones de dueños y aprobación expresa del resumen.
- Hasta entonces, todas las tareas son propuestas no ejecutables. Spec sigue Borrador; la fila 022 del backlog refleja los tres documentos preparatorios y la aprobación pendiente.
