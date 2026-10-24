# Spec 022 — Operación: métricas, tableros, alertas y respaldos

> Qué y por qué, en ≤ 150 líneas. El cómo va en `./plan.md` (obligatorio).

| Campo | Valor |
|---|---|
| Estado | Borrador |
| Dueño | Abel (3) |
| Fase | 3 |
| Requisitos | RNF-18 (métricas, tableros y alertas; la salud ya la entregó 000), RNF-20, RNF-21 (principales); aplican RF-05, RF-22, RNF-01, RNF-09, RNF-12, RNF-15, RNF-16, RNF-17 |
| Depende de | 000 (salud CA-20 a CA-23, bitácoras con `correlationId`, CI; rollback CA-31; bloques 5–6 de imágenes y staging **sin integrar**, `workflow.md` §7.2). Toma las señales que difirieron a 022 las specs 001, 002, 003, 004 (PD-67), 005, 010, 014, 015 y 016 (RN-3) |
| DF / PD | DF-28, DF-29; PD-67, PD-113, PD-130, PD-131 |
| Última actualización | 2026-10-24 |

## 1. Contexto y objetivo
Hoy Nimbo solo dice si está vivo (`/health/live` y `/health/ready`, spec 000) y deja bitácoras. RNF-18 pide además
métricas, tableros y alertas de tasa de error, latencia, profundidad de cola y uso de disco; RNF-20, volver a la
imagen anterior en menos de 10 minutos; RNF-21, respaldo diario de la base de datos, objetos versionados y una
restauración probada por fase. Esta spec deja al Operador de infraestructura (matriz `product-context.md` §2:
«respaldos, colas, alertas») viendo el estado del sistema en tres tableros, recibiendo las seis alertas definidas
(`product-context.md` §7) y con respaldos que se restauran de verdad. Ningún dato de un cliente sale en métricas,
tableros, alertas ni bitácoras de respaldo.

**Frontera con 022b (Fátima, RF-37).** 022 mide y avisa; no lista trabajos ni los reintenta. La pantalla de
bitácoras técnicas y trabajos con reintento para Administrador, Soporte y Operador, y los conteos al momento de
cuentas (PD-74, PD-122), son de 022b. La alerta de «> 50 trabajos pendientes o uno reintentado 3 veces» es de 022.

## 2. Historias de usuario
- **HU-1** Como Operador, quiero que `api`, `worker` y las dependencias expongan métricas, para saber cómo está el sistema sin entrar al servidor.
- **HU-2** Como Operador, quiero tres tableros (operación, negocio, agente), para leer el estado de un vistazo.
- **HU-3** Como equipo, queremos alertas sobre las condiciones definidas, para enterarnos antes que el cliente.
- **HU-4** Como Operador, quiero un respaldo diario de la base de datos y objetos versionados, restaurables con un procedimiento probado.
- **HU-5** Como Operador, quiero ensayar la vuelta a la versión anterior en cada fase, para saber que tarda menos de 10 minutos.
- **HU-6** Como cliente, quiero que la observabilidad nunca exponga mis archivos, nombres ni datos.

## 3. Criterios de aceptación
> Umbrales y ventanas: los de `product-context.md` §7 «Alertas definidas», sin repetirlos aquí. Métricas por grupo: RN-3.

### Métricas (HU-1, HU-6)
- **CA-1** (HU-1, RNF-18) Dado `api` y `worker` en marcha, cuando el recolector los consulta por la red interna, entonces obtiene peticiones por ruta y código, latencia (p50, p95, p99) y, por cola, trabajos en espera, activos, completados y fallidos, con su tiempo de espera y de ejecución.
- **CA-2** (HU-1, RNF-18, DF-29) — error: Dada una petición a las métricas desde fuera de la red interna (por Traefik o directa al host), cuando llega, entonces no recibe métricas; Traefik no enruta ningún host ni ruta hacia las métricas y lo público sigue siendo lo de 000.
- **CA-3** (HU-1, RNF-18) Dados los servicios del compose, cuando se consultan las métricas de sistema, entonces se ven CPU, memoria y disco por contenedor y la disponibilidad de Postgres, Redis, MinIO y, con su perfil activo, ONLYOFFICE.
- **CA-4** (HU-1, RNF-18) Dado cada grupo de RN-3 que esta spec cubre, cuando ocurre su evento, entonces su serie cambia y se lee en un tablero; lo diferido (agente) no aparece como dato inventado.
- **CA-5** (HU-6, RNF-17) — privacidad: Dada cualquier serie, etiqueta, tablero o mensaje de alerta, cuando se inspecciona, entonces no contiene identificadores de cuenta, de archivo o de documento, correos, nombres de archivo, claves de objeto, tokens ni contenido; las rutas con identificadores aparecen por su plantilla.

### Tableros (HU-2)
- **CA-6** (HU-2, RNF-18) Dadas las métricas recolectadas, cuando el Operador abre el tablero de operación, entonces ve tasa de error, latencia p95, profundidad de cada cola, uso de disco y disponibilidad de cada dependencia, en el ambiente elegido (P-2).
- **CA-7** (HU-2, RNF-18) Dado el tablero de negocio, cuando se abre, entonces muestra como totales agregados por periodo los eventos de registro, contratación, renovación, vencimiento y cuentas degradadas a solo lectura (propuesta §4.3), no cuántas cuentas están hoy en cada estado (eso es PD-122, 022b); alcance sujeto a P-7.
- **CA-8** (HU-2, RNF-18) Dado el tablero del agente, cuando se abre, entonces muestra el grupo «Agente» de RN-3 (alcance sujeto a P-8: 020 no existe).
- **CA-9** (HU-2, RF-05) — error: Dado alguien sin acceso autorizado a los tableros (P-6), cuando intenta abrirlos, entonces no ve ningún tablero ni dato.
- **CA-10** (HU-2, RNF-12) Dado un ambiente levantado desde cero, cuando termina de arrancar, entonces los tres tableros y las reglas de alerta ya existen sin pasos manuales.

### Alertas (HU-3)
- **CA-11** (HU-3, RNF-18) Dada la condición de tasa de `5xx` de §7 durante su ventana, entonces se dispara la alerta y llega al canal del equipo (P-3).
- **CA-12** (HU-3, RNF-18, RNF-01) Dada la condición de latencia p95 de §7 durante su ventana, entonces se dispara su alerta.
- **CA-13** (HU-3, RNF-18) Dada la condición de trabajos pendientes o reintentados de §7, entonces se dispara su alerta (sin listar ni reintentar trabajos: 022b).
- **CA-14** (HU-3, RNF-18) Dada la condición de uso de disco de §7, entonces se dispara su alerta.
- **CA-15** (HU-3, RNF-18, RNF-09, PD-113) Dado Postgres, Redis, MinIO u ONLYOFFICE caído, entonces se dispara la alerta de esa dependencia; con ONLYOFFICE caído, `/api/v1/health/ready` sigue en `200` (016 plan: sonda propia de 022).
- **CA-16** (HU-3, RF-22) Dado un fallo de la pasada de renovación (010 CA-4), entonces se dispara la alerta «fallo del proceso de renovación».
- **CA-17** (HU-1, PD-67) Dados eventos de auditoría perdidos (`audit.record_failed`), entonces su contador sube y se ve en el tablero de operación; convertirlo en alerta es P-9 (no está entre las seis de §7).
- **CA-18** (HU-3, RNF-18) Dado el Operador que provoca una condición controlada (alerta de prueba), cuando se cumple la ventana, entonces la alerta llega al canal y vuelve a normal al retirar la condición; queda evidencia (captura y hora).

### Respaldos y vuelta atrás (HU-4, HU-5)
- **CA-19** (HU-4, RNF-21) Dado un día de operación en el ambiente de P-2, cuando llega la hora programada, entonces existe un respaldo de la base de datos de ese día y su resultado (éxito o fallo, tamaño, duración) consta en la bitácora técnica.
- **CA-20** (HU-4, RNF-21) — error: Dado un respaldo que falla, entonces los respaldos anteriores quedan intactos y el fallo consta con su `code` (alerta según P-10).
- **CA-21** (HU-4, RNF-21, RNF-16) Dado el respaldo más reciente de un ambiente con datos sintéticos, cuando el Operador sigue el procedimiento documentado sobre una base vacía, entonces la base queda restaurada, `migration:run` no tiene pendientes, `/health/ready` responde `200` y los conteos de control coinciden (filas de un conjunto fijo de tablas y objetos del corpus, contados antes de respaldar y después de restaurar); el registro de la prueba (fecha, respaldo, duración, resultado) queda en la documentación de operación del repositorio.
- **CA-22** (HU-4, RNF-21, RNF-16) Dado, en un ambiente con datos sintéticos, un objeto sobrescrito o borrado fuera de los flujos de Nimbo, cuando el Operador sigue el procedimiento, entonces recupera su versión anterior del almacén versionado. Lo que Nimbo purga a propósito (papelera, poda de versiones) borra todas las versiones del objeto y no se recupera.
- **CA-23** (HU-5, RNF-20, RNF-15) Dada la imagen N desplegada y la N-1 publicada, cuando se ensaya la vuelta atrás de la fase, entonces en < 10 min `/api/v1/health/ready` da `200` con la versión N-1 en `x-nimbo-version` y el ensayo queda registrado. Requiere las imágenes y el staging de 000 (bloques 5–6); hasta entonces RNF-20 no se puede demostrar (P-2).

### Trazabilidad
RNF-18 → CA-1 a CA-18 · RNF-20 → CA-23 · RNF-21 → CA-19 a CA-22 · RNF-17 → CA-5 · RNF-16 → CA-21, CA-22 · DF-29 → CA-2, CA-15 · PD-67 → CA-17.

## 4. Reglas de negocio
- **RN-1** Alertas y umbrales: exactamente los seis de `product-context.md` §7. Uno nuevo se agrega primero a ese documento (candidatas: P-9, P-10).
- **RN-2** Las métricas son agregadas: ninguna serie lleva identificadores de cuenta, de archivo o de documento (CA-5). Lo que la propuesta pide «por cuenta» o «por documento» queda en P-11.
- **RN-3** Grupos de métricas (propuesta §4.3) y lo que otras specs difirieron a 022:
  - **API y colas**: CA-1. Fallos de `upload-cleanup` dentro de colas (005 plan §7). Métricas de versiones registradas, restauradas, podadas y podas fallidas (014 plan, «Métricas: diferidas a 022»).
  - **Almacenamiento**: `nimbo_storage_*` declaradas en 005 plan §7; espacio usado total; tasa de error de MinIO.
  - **Identidad y acceso**: las candidatas de 001 plan (`nimbo_identity_registrations_total`, `nimbo_identity_verifications_total`, `nimbo_notifications_mail_failed_total`), 002 plan (`nimbo_identity_logins_total`, `nimbo_identity_refresh_reuse_total`, `nimbo_identity_lockouts_total`) y 003 plan (`nimbo_shared_auth_denied_total`).
  - **Edición** (016 existe): sesiones abiertas, editores concurrentes (máximo y distribución, sin identificar el documento), versiones generadas y guardados fallidos. **Canal en vivo**: las de 015 (spec §fuera de alcance).
  - **Negocio**: CA-7. **Auditoría**: CA-17. **Sistema**: CA-3.
  - **Agente** (consultas por plan, latencia hasta el primer fragmento, fragmentos recuperados por consulta, consumo y costo estimado): **diferido** porque 020 no existe (P-8); «por cuenta» choca con RN-2 (P-11).
  - **Fuera**: las alertas candidatas de 001, 002 y 003 no se agregan sin decisión (P-9).
- **RN-4** La salud no cambia: `live`/`ready` siguen como en 000 (públicos, sin topología) y ONLYOFFICE no entra en `ready` (PD-113).
- **RN-5** Respaldo de base de datos diario (RNF-21); restauración probada al menos una vez por fase (`workflow.md` §6) y vuelta atrás ensayada por fase desde la Fase 2, ambas con datos sintéticos (RNF-16).
- **RN-6** Una falla de métricas, tableros, alertas o respaldos no afecta a cargar, descargar ni navegar (Art. XII).
- **RN-7** Los tableros solo leen series agregadas del recolector de métricas; no consultan PostgreSQL ni otra fuente de datos de clientes, así que no hay una vía de lectura que salte la autorización ni RLS (Art. IX.2).

## 5. Seguridad y privacidad
- **¿Toca datos de un cliente?** Las métricas y los tableros no (RN-2, RN-7). Los respaldos de producción sí contienen todos los datos de cuentas: viven fuera del repositorio, solo el Operador los administra (matriz §2) y su destino, retención y cifrado son P-5. Las pruebas de esta spec (CA-21, CA-22) usan solo datos sintéticos: ninguna toca contenido real de clientes.
- **No van a bitácoras, métricas ni alertas**: contenido, nombres de archivo, correos, contraseñas, tokens, claves de enlaces, cadenas de conexión ni credenciales de respaldo (RNF-17).
- **Roles**: «Ver métricas agregadas» es de Administrador y Operador; «Administrar respaldos» solo del Operador (matriz §2). Cliente y Soporte no ven tableros. Acceso a Grafana: P-6.
- **Superficie**: las métricas no se publican por Traefik (CA-2). 022 no agrega rutas a la API de clientes.
- Sin pruebas de aislamiento propias: no hay consultas por cuenta. Si P-11 agrega datos por cuenta, se revisa.

## 6. Experiencia de usuario
- Sin interfaz en `apps/web`: los tableros son de Grafana y no siguen Cielo Sereno (no hay fila en `ui-guidelines.md` §7). La pantalla de bitácoras y trabajos es 022b.

## 7. Fuera de alcance
- RF-37 completo (022b): lista de trabajos, reintento, pantalla de bitácoras técnicas, conteos al momento (PD-74, PD-122).
- Panel de métricas agregadas de la app (011, CA-12) y sus cambios.
- Pruebas de carga k6 y aislamiento global (023); PD-60 y PD-62 (mediciones con k6): P-12.
- Imágenes en ghcr.io, staging y el mecanismo de despliegue (000, bloques 5–6); 022 solo ensaya la vuelta atrás.
- Restaurar un respaldo sobre cuentas reales: sería una acción interna sobre cuentas ajenas (RF-07, Art. IX.4) sin decisión que la defina.
- Alta disponibilidad multi-región y certificaciones de cumplimiento (`product-context.md` §9). Redibujar el diagrama (DF-28): Adrián.

## 8. Supuestos
- Prometheus recolecta y Grafana presenta (stack de `CLAUDE.md` y propuesta §4.3); toda librería o imagen nueva va con su ADR en el plan.
- La alerta de prueba (CA-18) se provoca en un ambiente que no es producción.
- Las métricas de RN-3 y los cambios de infraestructura se acuerdan con el dueño de cada módulo en el plan (P-1); 022 no cambia el comportamiento de esos módulos.

## 9. Preguntas
- [ABIERTA] **P-1** Dueños e instrumentación (riesgo de ownership, para el plan): las métricas de RN-3 viven en módulos de Adrián y de Juan Marcos, y la recolección toca infraestructura de Adrián. ¿Quién instrumenta cada una y con qué autorización (como en la 011)? — bloquea: no
- [ABIERTA] **P-2** ¿Dónde se demuestran RNF-18, RNF-20 y RNF-21? Staging no existe (`workflow.md` §7.2) y RNF-20 pide redesplegar la imagen previa, que solo existe con los bloques 5–6 de 000: ¿local primero y staging cuando exista, o se espera a staging? — bloquea: sí
- [ABIERTA] **P-3** ¿Cuál es «el canal del equipo» (propuesta §4.3) al que llegan las alertas? — bloquea: sí
- [ABIERTA] **P-4** Comprobación del flujo antes del plan (`workflow.md` §4.1): si el esbozo pasa de 12 archivos, ¿se parte en observabilidad (RNF-18) y respaldos y vuelta atrás (RNF-20, RNF-21)? — bloquea: no
- [ABIERTA] **P-5** Respaldos: ¿retención, destino (mismo servidor o externo) y cifrado? ¿Cuánto se retienen las versiones no vigentes que deja el versionado del almacén al sobrescribir o borrar fuera de la purga (CA-22)? — bloquea: sí
- [ABIERTA] **P-6** ¿Quién entra a Grafana (Operador; también Administrador por la matriz) y cómo: cuentas propias, red interna o túnel? ¿Se publica por Traefik? — bloquea: sí
- [ABIERTA] **P-7** ¿El tablero de negocio duplica el panel de métricas de 011 o lo complementa? — bloquea: sí
- [ABIERTA] **P-8** El tablero del agente depende de 020 (Pendiente): ¿se difiere a 020, se entrega con lo que exista o se corta? — bloquea: sí
- [ABIERTA] **P-9** Alertas candidatas fuera de las seis de §7: `audit.record_failed` (PD-67), `mail.failed` sostenido (001 plan), `identity.session.reuse_detected` sostenido (002 plan) y racha de `auth.forbidden` con `undeclared_route` (003 plan). ¿Cuáles entran a §7 y con qué umbral? — bloquea: no
- [ABIERTA] **P-10** ¿Un respaldo fallido dispara alerta? No está en la lista de §7 (RN-1). — bloquea: no
- [ABIERTA] **P-11** «Espacio usado por cuenta», «consumo y costo por cuenta» y «editores por documento» (propuesta §4.3) contradicen RN-2: ¿solo totales y distribuciones? — bloquea: no
- [ABIERTA] **P-12** PD-60 y PD-62 piden medir con k6 «en 021/022 (carga)»; k6 es de 023. ¿Quién? — bloquea: no
- [ABIERTA] **P-13** «Traefik retira del enrutamiento lo que deje de responder» (propuesta §4.3): ¿000 o 022? — bloquea: no
- [ABIERTA] **P-14** DF-28 se resuelve «antes de 022» (redibujo del diagrama con Prometheus y Grafana): ¿lo hace Adrián antes del plan? — bloquea: no
- [ABIERTA] **P-15** 005 deja «revisar en 022» los objetos huérfanos (plan R-7) y la credencial raíz de MinIO en `api` y `worker` (plan R-13, «endurecimiento de 022/staging»). Ninguno rastrea a RNF-18, 20 o 21: ¿entran en 022 o en el endurecimiento de staging (000)? — bloquea: no

## 10. Registro de cambios
| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-10-24 | Creación en `Borrador`; plan y tareas pendientes porque existen preguntas bloqueantes según el flujo de `/spec` (Modo 2). P-1 a P-14 | `/spec 022` | — |
| 2026-10-24 | Revisión documental: P-1 (dueños e instrumentación) y P-4 (partir por tamaño) pasan a no bloqueantes; P-2 se acota al ambiente de RNF-20; se retiran rutas de archivos | Regla de bloqueo del planner (solo comportamiento, RF o RNF) | — |
| 2026-10-24 | Revisión del PR #78: P-5 sin la premisa falsa (la purga borra todas las versiones del objeto); CA-17 queda como contador y la alerta pasa a P-9; CA-21/CA-22 con datos sintéticos (RNF-16) y restaurar sobre cuentas reales fuera de alcance; RN-3 completo con 001, 002, 003, 005, 014, 015 y 016, edición y agente (diferido); CA-7 como eventos «degradadas a solo lectura»; RN-7 (tableros sin acceso a datos de clientes); P-15; PD-130 y PD-131; menores (encabezado, trazabilidad, umbrales citados de §7, CA-2, CA-23, §7, concordancia) | Hallazgos M-1 a M-8 y menores de la revisión | — |
