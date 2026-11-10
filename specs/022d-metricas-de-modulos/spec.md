# Spec 022d — Grupos de los módulos en el tablero de operación

> Qué y por qué, en ≤ 150 líneas. El cómo va en `./plan.md`. Alcance recortado a solo tableros el 2026-11-08 (§9).

| Campo | Valor |
|---|---|
| Estado | En revisión |
| Dueño | Abel |
| Fase | 3 (prevista; calendario pendiente de reprogramación) |
| Requisitos | RNF-18 (tableros de los módulos); RNF-17 (privacidad de los tableros); RF-05 (acceso a tableros); RNF-12 (arranque aprovisionado, como 022 CA-10). Observa sin cambiar: RF-01, RF-02, RF-03, RF-04, RF-08, RF-09, RF-30, RF-32, RF-34, RF-35, RF-36 |
| Depende de | 022 (PR #78) **integrada en `main`** antes de `/implement`: series, Prometheus, Grafana y el tablero «Operación». No depende de 022c |
| Última actualización | 2026-11-08 |

## 1. Contexto y objetivo
El 2026-11-02 la instrumentación de los módulos salió de 022 por tamaño (PR #78) y vino aquí. Planificada completa,
no cabía (P-1: ≈ 9,5 días y 58 archivos). El 2026-11-08 el dueño propone recortarla a **solo tableros**: el tablero de
operación de 022 suma grupos de **Identidad, Almacenamiento, Indexación, Optimizador y Agente**, que leen las series
que 022 ya expone (HTTP por plantilla de ruta y código, colas y dependencias). No se toca código de `apps/`, ni
módulos de negocio, ni `shared`. Lo que esas series no permiten ver pasa a `pendientes.md` (§7). El Operador ubica en
qué módulo está un problema sin entrar al servidor, y ningún panel identifica a una cuenta, archivo ni sesión.

## 2. Historias de usuario
- **HU-1** Como Operador, quiero un grupo por módulo (identidad, almacenamiento, indexación y optimizador) en el tablero de operación, para ubicar en qué módulo está un problema.
- **HU-2** → PD-201 (tablero de negocio con tendencias por periodo).
- **HU-3** Como Operador, quiero un grupo del agente en el tablero de operación, para vigilar su uso, su latencia y sus errores.
- La privacidad es la de 022 HU-6, sin historia nueva (CA-12).

## 3. Criterios de aceptación
> «El grupo muestra» = una fila con ese nombre en el tablero «Operación» de 022, con paneles que leen solo las series
> de 022 (plan 022 §4). Las rutas aparecen por su plantilla (`POST /api/v1/auth/login`), nunca con valores reales.

### Grupos de los módulos (HU-1)
- **CA-1** (HU-1, RNF-18 · Identidad) Dado tráfico de registro, reenvío y verificación del correo, inicio de sesión, renovación y cierre de sesión, pedido y restablecimiento de contraseña, cambio de contraseña y cierre de las otras sesiones, cuando el Operador abre el grupo «Identidad», entonces ve la tasa de cada ruta por código de respuesta, los inicios de sesión separados en exitosos, fallidos (`401`) y limitados o bloqueados (`429`), y las denegaciones (`403`) de todo el `api` por ruta.
- **CA-2** (HU-1, RNF-18 · Almacenamiento) Dadas cargas iniciadas, reanudadas y completadas, y enlaces de descarga de archivos y de versiones, cuando el Operador abre el grupo «Almacenamiento», entonces ve las cargas por ruta y código (completadas `2xx` frente a rechazadas `4xx`), los enlaces de descarga emitidos y los límites de frecuencia (`429`) por ruta.
- **CA-7** (HU-1, RNF-18 · Indexación) Dados trabajos de `indexing` e `index-reconcile`, cuando el Operador abre el grupo «Indexación», entonces ve, por cola, los completados, los intentos fallidos por número de intento, la profundidad por estado y el p95 de ejecución.
- **CA-8** (HU-1, RNF-18 · Optimizador) Dadas estimaciones y optimizaciones de JPEG o PNG, cuando el Operador abre el grupo «Optimizador», entonces ve las solicitudes de estimar y de optimizar por código, y de la cola `optimization` los completados, los intentos fallidos por número de intento y el p95 de ejecución.

### Grupo del agente (HU-3)
- **CA-11** (HU-3, RNF-18, RF-34 · Agente) Dadas preguntas al agente, cuando el Operador abre el grupo «Agente», entonces ve las consultas por minuto, la latencia total p50 y p95 y la proporción de respuestas con error (incluido el `429` del límite del plan), en 0 si no hay errores; no muestra consultas por plan, fragmentos por consulta, primer fragmento ni consumo (§7).

### Privacidad, arranque y acceso
- **CA-12** (HU-1, HU-3, RNF-17; aplica 022 CA-5) — privacidad: Dados los paneles nuevos, cuando se inspeccionan sus consultas y leyendas, entonces solo usan las etiquetas cerradas `job`, `route`, `status`, `queue`, `state`, `attempts_made` y `le`, cada ruta citada existe como plantilla en el `api` y ninguno contiene correos, nombres de archivo, UUID ni identificadores.
- **CA-14** (HU-1, HU-3, RF-05; aplica 022 CA-9) — error: Dado alguien sin cuenta de Grafana (anónimo, Cliente o Soporte), cuando intenta abrir el tablero con los grupos nuevos, entonces no ve ningún dato; el Administrador los ve en solo lectura y no puede cambiarlos. Los grupos viven en el mismo tablero aprovisionado de 022, sin otro tablero.
- **CA-15** (HU-1, HU-3, RNF-12; aplica 022 CA-10) Dado el compose local levantado desde volúmenes vacíos, cuando termina de arrancar, entonces el tablero «Operación» ya trae los cinco grupos sin pasos manuales.

### Equivalencias con el borrador del 2026-11-02
| Antes | Ahora | Nota |
|---|---|---|
| HU-1 (señales de cada módulo) | HU-1 | Parcial: solo lo que dan HTTP y colas |
| HU-2, CA-10 (tablero de negocio) | PD-201 | Sin tablero de negocio (antigua P-4) |
| HU-3, CA-11 (agente por plan, fragmentos) | HU-3, CA-11 | Parcial: total, latencia y errores; por plan → PD-202; fragmentos → PD-200 |
| CA-1 (identidad) | CA-1 | Parcial: correos, reúso de token y motivo del bloqueo → PD-200 |
| CA-2 (almacenamiento) | CA-2 | Parcial: motivo de rechazo, bytes, limpieza y errores de MinIO → PD-200 |
| CA-3 (espacio total y por plan) | PD-201 | — |
| CA-4, CA-5, CA-6 (versiones, edición, canal en vivo) | PD-200 | Sin serie en 022 |
| CA-7 (indexación) | CA-7 | Parcial: resultado detallado (no indexable, descartado) → PD-200 |
| CA-8 (optimizador) | CA-8 | Parcial: resultado detallado y bytes antes y después → PD-200 |
| CA-9 (`audit.record_failed`, PD-67) | PD-200 | — |
| CA-12, CA-14 | CA-12, CA-14 | Adaptados a paneles; CA-14 sobre el tablero de operación |
| CA-13 (degradación) | — | No aplica: no se instrumenta código (RN-4) |
| — | CA-15 | Nuevo: aplica 022 CA-10 a los grupos |

### Trazabilidad
RNF-18 → CA-1, CA-2, CA-7, CA-8, CA-11, CA-15 · RNF-17 → CA-12 · RF-05 → CA-14 · RF-34 → CA-11 · RNF-12 → CA-15 ·
PD-67, PD-168 → fuera (§7; PD-200, PD-202).

## 4. Reglas de negocio
- **RN-1** Fuentes: solo `nimbo_http_request_duration_seconds` (`route`, `status`), `nimbo_queue_*` (`queue`, `state`, `attempts_made`) y `nimbo_dependency_up` de 022. Ninguna serie nueva.
- **RN-2** Igual que 022 RN-2: solo agregados y distribuciones; las rutas por plantilla, nunca con ids.
- **RN-3** Igual que 022 RN-1: exactamente las seis alertas de `product-context.md` §7. 022d no agrega ni cambia reglas.
- **RN-4** No se modifica código de `apps/` ni `packages/`, módulos de negocio ni `shared`: no hacen falta las autorizaciones de módulos del PR #78 (antigua P-2) y no hay degradación nueva que probar (022 RN-6 sigue igual).
- **RN-5** Igual que 022 RN-7: los paneles solo leen Prometheus; ninguna consulta toca PostgreSQL ni datos de clientes.

## 5. Seguridad y privacidad
- **¿Toca datos de un cliente?** No. Los paneles leen agregados de Prometheus sin identificadores (RN-2, RN-5). Sin pruebas de aislamiento, igual que 022 §5; CA-12 revisa consultas y leyendas.
- **No van a tableros**: contenido, nombres de archivo, correos, contraseñas, tokens, claves de enlaces, claves de objeto, preguntas o respuestas del agente ni identificadores (RNF-17).
- **Roles** igual que 022 §5 (P-6): Operador *Editor*, Administrador *Viewer*; Cliente y Soporte sin cuenta de Grafana. Ningún rol interno ve contenido; no hay suplantación.
- **Auditoría (RF-07)**: no aplica; un tablero no es una acción sobre cuentas.
- **Superficie**: igual que 022 CA-2; 022d no agrega puertos, rutas, hosts ni tableros.

## 6. Experiencia de usuario
- Sin interfaz en `apps/web`: los paneles son de Grafana y no siguen Cielo Sereno (igual que 022 §6; no hay fila en `ui-guidelines.md` §7). No requiere mockup.

## 7. Fuera de alcance
- Toda señal que exija instrumentar código (PD-200): correos enviados o fallidos, reúso de token de refresco, motivo del bloqueo de inicio de sesión, motivo de rechazo y bytes de las cargas, errores de MinIO por operación, limpieza de cargas, versiones (014), edición (016), canal en vivo (015), resultado detallado de indexación y optimizador, `audit.record_failed` (PD-67), fragmentos por consulta y buckets HTTP por encima de 10 s.
- Tablero de negocio con tendencias por periodo, retención mayor a 15 días, y espacio total y por plan (PD-201).
- Consultas del agente por plan (PD-202); primer fragmento y consumo o costo (PD-168).
- Alertas nuevas (RN-3; PD-67, PD-167 (a)). El núcleo de 022 (paneles 1 a 15, seis reglas) no cambia.
- Conteos al momento y pantalla de trabajos (022b, PD-74, PD-122); el panel de 011. Ruido de PD-172 (exige código).
- Grupos de versiones, edición, canal en vivo, búsqueda (018), compartición (012, 013), papelera y backoffice.
- Métricas por cuenta, archivo, documento o sesión (P-11). Optimización de PDF, GIF o WebP. Pruebas de carga (023).

## 8. Supuestos
- **S-1** (discutible) Códigos leídos de los controladores y errores del `api` (2026-11-08): el inicio de sesión fallido es `401` (`IDENTITY_INVALID_CREDENTIALS`); el bloqueo por correo (`IDENTITY_LOGIN_LOCKED`) y el límite por IP comparten `429`, así que el panel los muestra juntos. El reúso de un token de refresco es un `401` más de `session/refresh`.
- **S-2** (discutible) «Denegaciones» = todo `403` del `api`: incluye roles internos en rutas de cliente (`SHARED_FORBIDDEN`) y cuentas en solo lectura (`STORAGE_ACCOUNT_READ_ONLY`). Se ven por ruta, no por motivo.
- **S-3** (discutible) «Carga rechazada» = respuesta `4xx` al iniciar o completar (límites y tipo `422`, partes faltantes `409`, vencida `410`, cuota `422`); el motivo exacto es de PD-200.
- **S-4** (discutible) La latencia del agente es la de la respuesta completa (flujo SSE). Un error que llega dentro del flujo, después del primer evento, sale como `200` y no cuenta como error. El histograma HTTP de 022 llega a 10 s: una respuesta más larga satura el p95 en 10 s (PD-200).
- **S-5** Se demuestra en local con el compose y tráfico sintético desde la web y el runbook, igual que 022 P-2.

## 9. Preguntas
- [RESUELTA] P-1 → recorte a solo tableros (≈ 1 día, 3 archivos de autor); cabe en tamaño sin partir (2026-11-08, propuesta del dueño, aprobado el 2026-11-08 (indicación en la sesión de Claude Code)).
- [RESUELTA] P-2 → no se modifican módulos ni `shared` (RN-4); no hacen falta las autorizaciones del PR #78. Se retoman con PD-200 (2026-11-08, propuesta del dueño, aprobado el 2026-11-08 (indicación en la sesión de Claude Code)).
- [RESUELTA] P-3 → sin desglose por plan; el total va en CA-11 y el desglose a PD-202 (2026-11-08, propuesta del dueño, aprobado el 2026-11-08 (indicación en la sesión de Claude Code)).
- [RESUELTA] P-4 → sin tablero de negocio; la retención y las tendencias van a PD-201 (2026-11-08, propuesta del dueño, aprobado el 2026-11-08 (indicación en la sesión de Claude Code)).
- [RESUELTA] P-7 → complementa 011 con tendencias por periodo (2026-11-02, Adrián, PR #78). Con el recorte, va a PD-201.
- [RESUELTA] P-8 → grupo del agente en el tablero de operación; primer fragmento y costo, PD-168 (2026-11-02, Adrián). Con el recorte, el desglose por plan va a PD-202 y los fragmentos a PD-200.
- [RESUELTA] P-11 → solo agregados y distribuciones, sin identificadores (2026-11-02, Adrián).

## 10. Registro de cambios
| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-11-02 | Creación en Borrador desde 022 CA-4, CA-7, CA-8, CA-17, HU-2 (negocio y agente) y los grupos de módulo de RN-3; sin plan ni tareas por P-1 (inventario fuera de tamaño) | Corte de 022 por tamaño (PR #78) | — |
| 2026-11-08 | Recorte a solo tableros: grupos Identidad, Almacenamiento, Indexación, Optimizador y Agente sobre las series de 022. CA-1, CA-2, CA-7, CA-8, CA-11, CA-12 y CA-14 reescritos; CA-15 nuevo; CA-3 a CA-6, CA-9, CA-10 y CA-13 y HU-2 salen (PD-200 a PD-202). P-1 a P-4 resueltas; plan y tareas escritos | Petición del dueño; P-1 sin otra salida en tamaño | Plan aprobado 2026-11-08 (sesión de Claude Code) |
| 2026-11-10 | Cierre de T-06: la validación automatizada de Abel cuenta como demo; CA-7 y CA-11 se cierran **parciales** (sin clave de Gemini no hubo indexación exitosa ni respuesta del modelo, plan R-6). H-2: Grafana pasa a `mem_limit: 768m` con `GOMEMLIMIT=690MiB` en esta spec (ADR-0040, plan R-8; staging en PD-203). Pendientes renumerados a PD-200 a PD-202 al rehacer la rama sobre `main` | Demo T-06 y choque de números con 013b | Adrián |
