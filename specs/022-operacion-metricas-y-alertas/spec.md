# Spec 022 — Operación: métricas, tablero de operación y alertas

> Qué y por qué, en ≤ 150 líneas. Respaldos: 022c. Vuelta atrás: 000. Instrumentación de los módulos: 022d.

| Campo | Valor |
|---|---|
| Estado | En revisión |
| Dueño | Abel (3) |
| Fase prevista | 3 (asignación original; calendario pendiente de reprogramación) |
| Requisitos | RNF-18 (métricas, tableros y alertas; la salud ya la entregó 000); aplican RF-05, RF-22, RNF-01, RNF-09, RNF-12, RNF-16, RNF-17 |
| Depende de | 000 (salud, bitácoras, CI, compose). Usa las colas BullMQ que ya existen (CA-1), incluidas las de 010, 019 y 021 |
| Última actualización | 2026-11-03 |

## 1. Contexto y objetivo
Nimbo ya informa su salud y deja bitácoras (000). Esta spec permite al Operador observar el sistema con métricas y
un tablero de operación, y recibir las seis alertas definidas (`product-context.md` §7, RNF-18). Se demuestra en
local con el compose y el corpus sintético, y se repite en staging cuando exista, sin bloquear el cierre (P-2).
Ninguna métrica, tablero ni alerta lleva contenido, nombres de archivo, correos ni identificadores (P-11).

**Partición (decisión de Adrián en el PR #78, 2026-11-02).** 022 cubre RNF-18. Los respaldos y la restauración
(RNF-21) pasan a **022c**, con rama y PR propios. La vuelta atrás (RNF-20) pasa al cierre de **000**, junto con su
CA-31 (PD-169). Además, al planificar con todos los grupos de RN-3, el inventario no cabía en 12 filas. Por eso se
aplicó el corte que la misma decisión autoriza: la instrumentación de los módulos de negocio pasa a **022d**, y 022
conserva el núcleo (HTTP, colas, sistema, tablero de operación y alertas). Los números de CA no se reutilizan (§3).

**Frontera con 022b (Fátima, RF-37).** 022 mide y avisa; no lista trabajos ni los reintenta. La pantalla de
bitácoras técnicas y trabajos con reintento para Administrador, Soporte y Operador, y los conteos al momento de
cuentas (PD-74, PD-122), son de 022b. La alerta de «> 50 trabajos pendientes o uno reintentado 3 veces» es de 022.

## 2. Historias de usuario
- **HU-1** Como Operador, quiero que `api`, `worker`, `worker-optimizer` y las dependencias expongan métricas, para saber cómo está el sistema sin entrar al servidor.
- **HU-2** Como Operador, quiero un tablero de operación, para leer el estado de un vistazo. El tablero de negocio y el grupo del agente son de 022d.
- **HU-3** Como equipo, queremos alertas sobre las condiciones definidas, para enterarnos antes que el cliente.
- **HU-6** Como cliente, quiero que la observabilidad no exponga el contenido de mis archivos ni datos que me identifiquen (nombres de archivo, correos, claves de objeto, tokens, identificadores), para que operar Nimbo no comprometa mi privacidad.
- HU-4 pasó a 022c y HU-5 a 000 (§3, «Traslados»).

## 3. Criterios de aceptación
> Umbrales y ventanas: los de `product-context.md` §7 «Alertas definidas», sin repetirlos aquí. Grupos: RN-3.

### Métricas (HU-1, HU-6)
- **CA-1** (HU-1, RNF-18) Dados `api`, `worker` y `worker-optimizer` en marcha, cuando se recolectan sus métricas por la red interna, entonces se distinguen los tres procesos, las peticiones HTTP por ruta y código con latencia (p50, p95, p99) y, por cola, trabajos en espera, activos, completados y fallidos, con tiempo de espera y de ejecución; incluye `indexing`, `index-status`, `index-reconcile` y `optimization`.
- **CA-2** (HU-1, RNF-18, DF-29) — error: Dada una petición a las métricas desde fuera de la red interna (por Traefik o directa al host), cuando llega, entonces no recibe métricas; Traefik no enruta ningún host ni ruta hacia las métricas, Prometheus no se publica y lo público sigue siendo lo de 000.
- **CA-3** (HU-1, RNF-18) Dados los servicios del compose, cuando se consultan las métricas de sistema, entonces se ven CPU, memoria y disco por contenedor y la disponibilidad de Postgres, Redis, MinIO y, con su perfil activo, ONLYOFFICE.
- **CA-4** → 022d (señales de los grupos de módulo de RN-3).
- **CA-5** (HU-6, RNF-17) — privacidad: Dada cualquier serie, etiqueta, tablero o mensaje de alerta, cuando se inspecciona, entonces no contiene correos, nombres de archivo, claves de objeto, tokens, contenido ni identificadores de cuenta, archivo, documento, usuario o sesión; solo agregados y distribuciones (RN-2), y las rutas aparecen por su plantilla.

### Tablero (HU-2)
- **CA-6** (HU-2, RNF-18) Dadas las métricas recolectadas, cuando el Operador abre el tablero de operación, entonces ve tasa de error, latencia p95, profundidad de cada cola, uso de disco y disponibilidad de cada dependencia.
- **CA-7** → 022d (tablero de negocio: tendencias por periodo, P-7).
- **CA-8** → 022d (grupo del agente en el tablero de operación, P-8).
- **CA-9** (HU-2, RF-05) — error: Dado alguien sin cuenta de Grafana (anónimo, Cliente o Soporte), cuando intenta abrir los tableros, entonces no ve ningún tablero ni dato; el Administrador entra con una cuenta de solo lectura y no puede cambiar tableros ni reglas (P-6).
- **CA-10** (HU-2, RNF-12) Dado el compose local levantado desde volúmenes vacíos, cuando termina de arrancar, entonces la fuente de datos, el tablero de operación, las seis reglas de alerta y el canal de correo ya existen sin pasos manuales (las cuentas de personas siguen el procedimiento de operación, P-6).

### Alertas (HU-3)
- **CA-11** (HU-3, RNF-18) Dado el sistema monitorizado, cuando se cumple la condición de tasa de `5xx` de `product-context.md` §7 durante su ventana, entonces se dispara la alerta y llega al correo del equipo (en local, a Mailpit; P-3).
- **CA-12** (HU-3, RNF-18, RNF-01) Dado el sistema monitorizado, cuando se cumple la condición de latencia p95 de `product-context.md` §7 durante su ventana, entonces se dispara su alerta.
- **CA-13** (HU-3, RNF-18) Dadas las colas monitorizadas, cuando se cumple la condición de trabajos pendientes o reintentados de `product-context.md` §7, entonces se dispara su alerta (sin listar ni reintentar trabajos: 022b).
- **CA-14** (HU-3, RNF-18) Dado el disco monitorizado, cuando se cumple la condición de uso de disco de `product-context.md` §7, entonces se dispara su alerta.
- **CA-15** (HU-3, RNF-18, RNF-09, PD-113) Dadas las dependencias monitorizadas, cuando se detecta Postgres, Redis, MinIO u ONLYOFFICE caído, entonces se dispara la alerta de esa dependencia; con ONLYOFFICE caído, `/api/v1/health/ready` sigue en `200` (016 plan: sonda propia de 022).
- **CA-16** (HU-3, RF-22) Dada una pasada de renovación (010 CA-4), cuando falla, entonces se dispara la alerta «fallo del proceso de renovación».
- **CA-17** → 022d (contador de `audit.record_failed`, PD-67).
- **CA-18** (HU-3, RNF-18) Dado el Operador que provoca en local una de las seis condiciones (por ejemplo, detener Redis), cuando se cumple su ventana, entonces el correo llega a Mailpit y, al retirar la condición, llega el de resolución; queda evidencia (captura y hora). No se crea una séptima regla.

### Traslados (decisión de Adrián, PR #78, 2026-11-02)
| Origen en esta spec | Destino | Contenido |
|---|---|---|
| CA-19, CA-20, CA-21, CA-22, HU-4, RN-5 | 022c (RNF-21) | Respaldo diario, fallo sin perder copias, restauración probada y versión anterior de MinIO; su tabla de equivalencias está en 022c |
| CA-23, HU-5 | 000 (RNF-20), PD-169 | Ensayo de vuelta atrás < 10 min con imágenes N/N-1, junto con 000 CA-31 |
| CA-4, CA-7, CA-8, CA-17; HU-2 (tablero de negocio y grupo del agente); grupos de módulo de RN-3 | 022d (RNF-18, por crear con `/spec`) | Instrumentación de los módulos de negocio con su catálogo local |

### Trazabilidad
RNF-18 → CA-1 a CA-3, CA-5, CA-6, CA-9 a CA-16, CA-18 · RNF-17 → CA-5 · RF-05 → CA-9 · RF-22 → CA-16 · RNF-01 → CA-12 ·
RNF-09 → CA-15, RN-6 · RNF-12 → CA-10 · RNF-16 → P-2 (corpus sintético) · DF-29 → CA-2, CA-15.
Diseño y pendientes: DF-28, DF-29; PD-05, PD-60, PD-62, PD-67, PD-113, PD-165, PD-166, PD-167, PD-168, PD-169 (`docs/sdd/pendientes.md`).

## 4. Reglas de negocio
- **RN-1** Alertas y umbrales: exactamente las seis de `product-context.md` §7. Una nueva se agrega primero a ese documento (candidatas: PD-67 y PD-167 (a)).
- **RN-2** Solo agregados y distribuciones, sin identificadores de cuenta, archivo, documento, usuario ni sesión (P-11). Lo que la propuesta §4.3 pedía «por cuenta» o «por documento» se entrega como total, por plan o como distribución (022d). Ninguna serie lleva contenido, nombres de archivo, correos, claves de objeto ni tokens (CA-5).
- **RN-3** Grupos de la propuesta §4.3:
  - **En 022**: API y colas (CA-1; todas las colas BullMQ, con espera y ejecución, que cubren la duración y la cola de indexación diferidas por 019 plan §5 y la espera y ejecución de `optimization`, 021 plan §5) y Sistema (CA-3).
  - **En 022d**: Almacenamiento (005 plan §7; espacio total y por plan; error de MinIO), Identidad y acceso (001, 002 y 003 plan §7), Edición (016; editores como máximo y distribución), Canal en vivo (015 §7), Indexación y Optimizador por resultado (019, 021, solo JPEG/PNG), versiones de 014, limpieza de cargas de 005, Negocio (tendencias por periodo, P-7), Auditoría (`audit.record_failed`, PD-67) y Agente (P-8).
  - **Agente (P-8)**: consultas por plan, latencia total y fragmentos recuperados por consulta, como grupo del tablero de operación; latencia hasta el primer fragmento y consumo/costo, PD-168.
  - **Fuera**: las alertas candidatas de 001, 002 y 003 no se agregan sin decisión (PD-167 (a)).
- **RN-4** La salud no cambia: `live`/`ready` siguen como en 000 (públicos, sin topología) y ONLYOFFICE no entra en `ready` (PD-113).
- **RN-6** Una falla de métricas, tableros o alertas no afecta a cargar, descargar, navegar, cobrar ni renovar (Art. XII).
- **RN-7** Los tableros solo leen series del recolector de métricas; no consultan PostgreSQL ni otra fuente de datos de clientes, así que no hay una vía de lectura que salte la autorización ni RLS (Art. IX.2).

## 5. Seguridad y privacidad
- **¿Toca datos de un cliente?** No. Las métricas no llevan contenido, nombres, correos ni identificadores (RN-2) y los tableros no consultan datos de clientes (RN-7). No hay consultas por cuenta: sin pruebas de aislamiento propias; la prueba de CA-5 revisa las series y etiquetas.
- **No van a bitácoras, métricas ni alertas**: contenido, nombres de archivo, correos, contraseñas, tokens, claves de enlaces, cadenas de conexión ni credenciales SMTP (RNF-17).
- **Roles (P-6)**: «Ver métricas agregadas» es de Administrador y Operador (matriz §2). Grafana usa cuentas propias, sin acceso anónimo ni registro abierto: Operador con rol *Editor*, Administrador con rol *Viewer*; Cliente y Soporte no tienen cuenta. No se integra el JWT de Nimbo.
- **Superficie**: Grafana y Prometheus no se publican por Traefik; en local se entra por `localhost` y en staging por túnel SSH (P-6). Las métricas no salen de la red interna (CA-2). 022 no agrega rutas a la API de clientes.
- **Correo de alertas (P-3)**: el destinatario y las credenciales SMTP son variables de entorno de Grafana; no reutiliza los secretos ni la cola `mail` del `worker`.

## 6. Experiencia de usuario
- Sin interfaz en `apps/web`: el tablero es de Grafana y no sigue Cielo Sereno (no hay fila en `ui-guidelines.md` §7). La pantalla de bitácoras y trabajos es 022b.

## 7. Fuera de alcance
- RF-37 completo (022b): lista de trabajos, reintento, pantalla de bitácoras técnicas, conteos al momento (PD-74, PD-122).
- Panel de métricas agregadas de la app (011, CA-12): no se modifica ni se consulta su `MetricsService` (P-7).
- Respaldos y restauración (022c), vuelta atrás (000, PD-169) e instrumentación de los módulos de negocio (022d).
- Slack, webhooks u otro canal que no sea el correo de Grafana (P-3); integrar el JWT de Nimbo en Grafana (P-6); un tercer tablero para el agente (P-8).
- Pruebas de carga k6 y aislamiento global (023, `specs/README.md`), incluidas las mediciones con k6 de PD-60 y PD-62.
- Imágenes en ghcr.io, staging y el mecanismo de despliegue (000, bloques 5–6).
- Que Traefik retire del enrutamiento lo que deje de responder (propuesta §4.3): es configuración de despliegue y no está asignada (PD-167 (c)).
- Objetos huérfanos y credencial raíz de MinIO por proceso (005 plan R-7 y R-13): endurecimiento de staging (PD-167 (d)).
- Alta disponibilidad multi-región y certificaciones de cumplimiento (`product-context.md` §9). Redibujar el diagrama (DF-28): Adrián (PD-05).

## 8. Supuestos
- Prometheus recolecta y Grafana presenta y alerta (stack de `CLAUDE.md` y propuesta §4.3); toda librería o imagen nueva va con su ADR en el plan.
- La alerta de prueba (CA-18) se provoca en local, nunca en producción.
- Autorizaciones de Adrián (PR #78, 2026-11-02): Abel modifica `shared`, las raíces de composición, `env.schema`, `secret-keys` y la infraestructura de observabilidad **solo en los archivos que nombre el plan aprobado**, sin cambiar el comportamiento y con revisión de Adrián en el PR. Las de los módulos de negocio (incluida `billing`) se ejercen en 022d; 022 no toca módulos de negocio. `storage/search` y `sharing` no se tocan.
- DF-28 y PD-05: redibujar la arquitectura, incluida la observabilidad, corresponde a Adrián como guardián de diagramas.
- 021 y ADR-0038 separan `worker-optimizer`; su imagen compartida con `worker` no entrega publicación ni staging de 000.
- El [seguimiento documental](seguimiento.md) registra las auditorías del PR #78 y sus decisiones; no es la revisión de implementación (`review.md`, `/review`).

## 9. Preguntas
Resueltas por Adrián en el PR #78 el 2026-11-02; ninguna queda abierta.
- **P-2** Ambiente: RNF-18 se demuestra en local con el compose y el corpus sintético; se repite en staging cuando exista, sin bloquear el cierre. CA-10 se verifica desde volúmenes vacíos. RNF-20 pasa a 000.
- **P-3** Canal: correo del equipo por el canal SMTP propio de Grafana; Mailpit en local. Destinatario y credenciales en variables de entorno de Grafana. Sin Slack ni webhooks.
- **P-5** Respaldos: pasa a 022c con la partición.
- **P-6** Grafana: no se publica por Traefik; `localhost` en local y túnel SSH en staging. Cuentas propias sin anonimato ni registro: Operador *Editor*, Administrador *Viewer*, Cliente y Soporte sin cuenta. Sin el JWT de Nimbo.
- **P-7** Negocio frente a 011: lo complementa con tendencias por periodo; no toca ni consulta `MetricsService` (022d).
- **P-8** Agente: consultas por plan, latencia total y fragmentos por consulta, como grupo del tablero de operación (022d); primer fragmento y consumo/costo, PD-168 de Adrián (requieren ampliar `ILanguageModel`).
- **P-11** Identificadores: solo agregados y distribuciones (RN-2); `product-context.md` §7 lo anota (PD-167 (b)).

## 10. Registro de cambios
| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-10-24 | Creación en Borrador | `/spec 022` | — |
| 2026-10-24 a 2026-11-01 | Auditorías del PR #78: privacidad, seis alertas, eventos frente a conteos actuales, RN-3 con 019, 021 y `worker-optimizer`; plan y tareas preparatorios retirados por Modo 2 | Coherencia con producto, roles y flujo | — |
| 2026-11-02 | Partición: CA-19 a CA-22, HU-4 y RN-5 → 022c; CA-23 y HU-5 → 000 (PD-169). P-2, P-3, P-5, P-6, P-7, P-8 y P-11 resueltas; RN-2, RN-3, CA-5, CA-9, CA-10, CA-11 y CA-18 ajustados; PD-168 del agente | Decisiones del PR #78 | Adrián |
| 2026-11-02 | Corte al planificar: CA-4, CA-7, CA-8, CA-17 y los grupos de módulo de RN-3 → 022d; 022 conserva el núcleo | El plan con los módulos pasaba de 12 filas (condición autorizada en el PR #78) | Adrián (condición); confirma con el plan |
| 2026-11-03 | Plan reemplazado por la versión recortada (25 archivos, ≈ 5,15 d); la spec no cambia | Instrucción de Adrián (YAGNI y pruebas por riesgo) | Adrián |
| 2026-11-03 | Plan aprobado, ADR-0040 aceptado y spec en Lista | Aprobación de Adrián (opción a, R1 a R6, S-1 a S-4) | Adrián |
| 2026-11-03 | T-02, discrepancia de plan: el cableado de `/metrics` en `main.ts` y `worker-bootstrap.ts` necesita exportar `startMetricsServer` y `attachMetricsRoute` desde `shared/index.ts`. El plan (R2) dice que el índice no cambia y `shared/index.spec.ts` (CA-17) fija la lista. T-02 queda parcial hasta decidir (PD-171) | Discrepancia detectada al implementar (workflow §4.5, punto 7); el developer se detiene en el cableado | Pendiente de Adrián |
| 2026-11-03 | T-02: se amplía la fachada de `shared` con `startMetricsServer` y `attachMetricsRoute` (desviación de plan R2) y se acepta el cambio transitivo del lockfile (resolución de `next` por el peer `@opentelemetry/api` de `prom-client`). PD-171 cerrado | Resolver la discrepancia anterior | Adrián |
| 2026-11-03 | T-07: la regla 4 identifica el disco del anfitrión como el máximo sobre los dispositivos de bloque reales (`container_fs_*{id="/",device=~"/dev/.+"}`, sin tmpfs ni overlay) y alerta si alguno supera el 80 %. PD-170 cerrado; la comprobación en Docker Desktop/WSL2 sigue pendiente (spike de ADR-0040) | cAdvisor emite una serie por dispositivo con `id="/"` (spike T-01) | Adrián |
| 2026-11-03 | Panel 15 «Disco usado por contenedor» en el tablero de operación (CA-3, disco por contenedor); sin regla nueva (siguen seis) | El panel 14 solo cubre el disco del anfitrión | Adrián |
| 2026-11-04 | Correcciones de la demo T-09: regla 4 solo sobre el `/dev/*` de mayor capacidad (H-1, revisa la decisión de PD-170); tasa 5xx con `or vector(0)` (H-4); `GF_SERVER_ROOT_URL` para los enlaces de los correos (H-6); PD-173 (H-2, disco por contenedor) y PD-189 (H-7; antes PD-174, renumerado al integrar main) | Hallazgos de Abel en la demo en Docker Desktop/WSL2 | Adrián |
