# Spec 022 — Operación: métricas, tableros, alertas y respaldos

> Qué y por qué, en ≤ 150 líneas. Plan y tareas pendientes: Modo 2 bloqueado por §9.

| Campo | Valor |
|---|---|
| Estado | Borrador |
| Dueño | Abel (3) |
| Fase prevista | 3 (asignación original; calendario pendiente de reprogramación) |
| Requisitos | RNF-18 (métricas, tableros y alertas; la salud ya la entregó 000), RNF-20, RNF-21 (principales); aplican RF-05, RF-22, RNF-01, RNF-09, RNF-12, RNF-15, RNF-16, RNF-17 |
| Depende de | 000 (salud, bitácoras, CI; imágenes/staging y rollback CA-31 pendientes: `workflow.md` §7.2). Señales de 001, 002, 003, 004 (PD-67), 005, 010, 014, 015, 016, 019 y 021 (RN-3); agente 020: P-8 |
| Última actualización | 2026-11-01 |

## 1. Contexto y objetivo
Nimbo ya informa su salud y deja bitácoras (000). Esta spec permite al Operador observar el estado del sistema
mediante métricas y tableros, y recibir las seis alertas definidas (`product-context.md` §7, RNF-18).
También cubre volver a la imagen anterior en menos de 10 minutos (RNF-20), respaldar la base de datos a diario,
conservar objetos versionados y probar la restauración por fase (RNF-21). Los ambientes y el alcance del tablero
del agente dependen de P-2 y P-8. Ningún contenido, nombre de archivo ni correo de cliente aparece en métricas,
tableros, alertas ni bitácoras de respaldo.

**Frontera con 022b (Fátima, RF-37).** 022 mide y avisa; no lista trabajos ni los reintenta. La pantalla de
bitácoras técnicas y trabajos con reintento para Administrador, Soporte y Operador, y los conteos al momento de
cuentas (PD-74, PD-122), son de 022b. La alerta de «> 50 trabajos pendientes o uno reintentado 3 veces» es de 022.

## 2. Historias de usuario
- **HU-1** Como Operador, quiero que `api`, `worker`, `worker-optimizer` y las dependencias expongan métricas, para saber cómo está el sistema sin entrar al servidor.
- **HU-2** Como Operador, quiero tableros de operación y negocio, y el del agente si P-8 lo incluye en 022, para leer el estado de un vistazo.
- **HU-3** Como equipo, queremos alertas sobre las condiciones definidas, para enterarnos antes que el cliente.
- **HU-4** Como Operador, quiero un respaldo diario de la base de datos y objetos versionados, para restaurarlos con un procedimiento probado.
- **HU-5** Como Operador, quiero ensayar la vuelta a la versión anterior en cada fase, para saber que tarda menos de 10 minutos.
- **HU-6** Como cliente, quiero que la observabilidad no exponga el contenido de mis archivos ni datos sensibles (nombres de archivo, correos, claves de objeto, tokens; los identificadores, P-11), para que operar Nimbo no comprometa mi privacidad.

## 3. Criterios de aceptación
> Umbrales y ventanas: los de `product-context.md` §7 «Alertas definidas», sin repetirlos aquí. Métricas por grupo: RN-3.

### Métricas (HU-1, HU-6)
- **CA-1** (HU-1, RNF-18) Dados `api`, `worker` y `worker-optimizer` en marcha, cuando se recolectan sus métricas por la red interna, entonces se distinguen los tres procesos, las peticiones HTTP por ruta y código con latencia (p50, p95, p99) y, por cola, trabajos en espera, activos, completados y fallidos, con tiempo de espera y de ejecución; incluye `indexing`, `index-status`, `index-reconcile` y `optimization`.
- **CA-2** (HU-1, RNF-18, DF-29) — error: Dada una petición a las métricas desde fuera de la red interna (por Traefik o directa al host), cuando llega, entonces no recibe métricas; Traefik no enruta ningún host ni ruta hacia las métricas y lo público sigue siendo lo de 000.
- **CA-3** (HU-1, RNF-18) Dados los servicios del compose, cuando se consultan las métricas de sistema, entonces se ven CPU, memoria y disco por contenedor y la disponibilidad de Postgres, Redis, MinIO y, con su perfil activo, ONLYOFFICE.
- **CA-4** (HU-1, RNF-18) Dado cada grupo de RN-3 cuyo alcance en 022 está decidido (el del Agente depende de P-8), cuando ocurre su evento, entonces su serie cambia y se lee en un tablero.
- **CA-5** (HU-6, RNF-17) — privacidad: Dada cualquier serie, etiqueta, tablero o mensaje de alerta, cuando se inspecciona, entonces no contiene correos, nombres de archivo, claves de objeto, tokens ni contenido, ni identificadores de cuenta, de archivo o de documento fuera de lo que P-11 decida (RN-2); las rutas con identificadores aparecen por su plantilla.

### Tableros (HU-2)
- **CA-6** (HU-2, RNF-18) Dadas las métricas recolectadas, cuando el Operador abre el tablero de operación, entonces ve tasa de error, latencia p95, profundidad de cada cola, uso de disco y disponibilidad de cada dependencia, en el ambiente elegido (P-2).
- **CA-7** (HU-2, RNF-18) Dado el tablero de negocio, cuando se abre, entonces muestra como totales agregados por periodo los eventos de registro, contratación, renovación, vencimiento y cuentas degradadas a solo lectura (propuesta §4.3), no cuántas cuentas están hoy en cada estado (eso es PD-122, 022b); alcance sujeto a P-7.
- **CA-8** (HU-2, RNF-18) Dado que P-8 incluye el tablero del agente en 022, cuando se abre, entonces muestra el grupo «Agente» de RN-3 con los datos que P-8 defina; si queda fuera de 022, su entrega se asigna expresamente al resolver P-8.
- **CA-9** (HU-2, RF-05) — error: Dado alguien sin acceso autorizado a los tableros (P-6), cuando intenta abrirlos, entonces no ve ningún tablero ni dato.
- **CA-10** (HU-2, RNF-12) Dado un ambiente levantado desde cero, cuando termina de arrancar, entonces los tableros incluidos en 022 según P-8 y las reglas de alerta ya existen sin pasos manuales.

### Alertas y pérdida de auditoría (HU-1, HU-3)
- **CA-11** (HU-3, RNF-18) Dado el sistema monitorizado, cuando se cumple la condición de tasa de `5xx` de `product-context.md` §7 durante su ventana, entonces se dispara la alerta y llega al canal del equipo (P-3).
- **CA-12** (HU-3, RNF-18, RNF-01) Dado el sistema monitorizado, cuando se cumple la condición de latencia p95 de `product-context.md` §7 durante su ventana, entonces se dispara su alerta.
- **CA-13** (HU-3, RNF-18) Dadas las colas monitorizadas, cuando se cumple la condición de trabajos pendientes o reintentados de `product-context.md` §7, entonces se dispara su alerta (sin listar ni reintentar trabajos: 022b).
- **CA-14** (HU-3, RNF-18) Dado el disco monitorizado, cuando se cumple la condición de uso de disco de `product-context.md` §7, entonces se dispara su alerta.
- **CA-15** (HU-3, RNF-18, RNF-09, PD-113) Dadas las dependencias monitorizadas, cuando se detecta Postgres, Redis, MinIO u ONLYOFFICE caído, entonces se dispara la alerta de esa dependencia; con ONLYOFFICE caído, `/api/v1/health/ready` sigue en `200` (016 plan: sonda propia de 022).
- **CA-16** (HU-3, RF-22) Dada una pasada de renovación (010 CA-4), cuando falla, entonces se dispara la alerta «fallo del proceso de renovación».
- **CA-17** (HU-1, RNF-18, PD-67) Dada la auditoría de mejor esfuerzo, cuando se pierden eventos (`audit.record_failed`), entonces su contador sube y se ve en el tablero de operación; convertirlo en alerta no está entre las seis de `product-context.md` §7 y queda pendiente de decisión (PD-67).
- **CA-18** (HU-3, RNF-18) Dado el Operador que provoca una condición controlada (alerta de prueba), cuando se cumple la ventana, entonces la alerta llega al canal y vuelve a normal al retirar la condición; queda evidencia (captura y hora).

### Respaldos y vuelta atrás (HU-4, HU-5)
- **CA-19** (HU-4, RNF-21) Dado un día de operación en el ambiente de P-2, cuando llega la hora programada, entonces existe un respaldo de la base de datos de ese día y su resultado (éxito o fallo, tamaño, duración) consta en la bitácora técnica.
- **CA-20** (HU-4, RNF-21) — error: Dado un intento de respaldo, cuando falla, entonces los respaldos anteriores quedan intactos y el fallo consta con su `code` (una alerta por respaldo fallido no está en `product-context.md` §7: PD-167).
- **CA-21** (HU-4, RNF-21, RNF-16) Dado el respaldo más reciente de un ambiente con datos sintéticos, cuando el Operador sigue el procedimiento documentado sobre una base vacía, entonces la base queda restaurada, `migration:run` no tiene pendientes, `/api/v1/health/ready` responde `200` y los conteos de control coinciden (filas de un conjunto fijo de tablas y objetos del corpus, contados antes de respaldar y después de restaurar); el registro de la prueba (fecha, respaldo, duración, resultado) queda en la documentación de operación del repositorio.
- **CA-22** (HU-4, RNF-21, RNF-16) Dado, en un ambiente con datos sintéticos, un objeto sobrescrito o borrado fuera de los flujos de Nimbo, cuando el Operador sigue el procedimiento, entonces recupera su versión anterior del almacén versionado. Lo que Nimbo purga a propósito (papelera, poda de versiones) borra todas las versiones del objeto y no se recupera.
- **CA-23** (HU-5, RNF-20, RNF-15) Dada la imagen N desplegada y la N-1 publicada, cuando se ensaya la vuelta atrás de la fase, entonces en < 10 min `/api/v1/health/ready` da `200` con la versión N-1 en `x-nimbo-version` y el ensayo queda registrado. Requiere las imágenes y el staging de 000 (bloques 5–6); hasta entonces RNF-20 no se puede demostrar (P-2).

### Trazabilidad
RNF-18 → CA-1 a CA-18 · RNF-20 → CA-23 · RNF-21 → CA-19 a CA-22 · RNF-17 → CA-5 · RNF-16 → CA-21, CA-22 · RF-05 → CA-9 · RF-22 → CA-16 · RNF-01 → CA-12 · RNF-09 → CA-15, RN-6 · RNF-12 → CA-10 · RNF-15 → CA-23 · DF-29 → CA-2, CA-15 · PD-67 → CA-17.
Diseño y pendientes: DF-28, DF-29; PD-05, PD-60, PD-62, PD-67, PD-113, PD-165, PD-166, PD-167 (`docs/sdd/pendientes.md`).

## 4. Reglas de negocio
- **RN-1** Alertas y umbrales: exactamente los seis de `product-context.md` §7. Uno nuevo se agrega primero a ese documento (candidatas: PD-67 y PD-167).
- **RN-2** Ninguna serie lleva contenido, nombres de archivo, correos, claves de objeto ni tokens (CA-5). Si las métricas que la propuesta §4.3 pide «por cuenta» y «por documento» se mantienen así o se sustituyen por agregados y distribuciones sin identificadores lo decide P-11; su respuesta se traslada a esta regla (PD-167 (b)).
- **RN-3** Grupos de métricas (propuesta §4.3) y lo que otras specs difirieron a 022:
  - **API y colas**: CA-1. Fallos de la limpieza de cargas (005 plan §7). Versiones registradas, restauradas, podadas y podas fallidas (014 plan, «Métricas: diferidas a 022»).
  - **Almacenamiento**: las métricas declaradas en 005 plan §7 (cargas por resultado, rechazos por motivo, bytes cargados, enlaces de descarga emitidos, límites de frecuencia alcanzados y duración de la limpieza); espacio usado (por cuenta o total: P-11); tasa de error de MinIO.
  - **Identidad y acceso**: las diferidas por 001 plan §7 (registros, verificaciones y correos fallidos), 002 plan §7 (inicios de sesión por resultado, reúso de tokens de refresco y bloqueos) y 003 plan §7 (denegaciones de autorización).
  - **Edición** (016 existe): sesiones abiertas, editores concurrentes (por documento, o máximo y distribución: P-11), versiones generadas y guardados fallidos.
  - **Indexación**: duración y cola de indexación diferidas por 019 plan §5; distinguir espera de ejecución y resultados, sin exportar fragmentos ni identificadores. La lista de trabajos y su reintento siguen en 022b.
  - **Optimizador**: 021 plan §5 difiere las métricas sin fijar un catálogo. Se observan solicitudes, estimaciones y resultados (no conviene, no disponible, completada, descartada, fallida y caducada), bytes antes/después cuando existan, y espera/ejecución de `optimization` en `worker-optimizer`; solo JPEG/PNG, sin atribuir a 021 PDF, GIF ni WebP.
  - **Canal en vivo**: 015 difiere a 022 «Métricas y tableros del canal» (015 spec §7) y no define su conjunto concreto (§8).
  - **Negocio**: CA-7. **Auditoría**: CA-17. **Sistema**: CA-3.
  - **Agente** (consultas por plan, latencia hasta el primer fragmento, fragmentos recuperados por consulta, consumo y costo estimado): propuesta §4.3. 020/020b ya están integradas; 020 remite métricas y tablero a 022, pero su responsabilidad y alcance siguen abiertos en P-8; «por cuenta», P-11.
  - **Fuera**: las alertas candidatas de 001, 002 y 003 no se agregan sin decisión (PD-167).
- **RN-4** La salud no cambia: `live`/`ready` siguen como en 000 (públicos, sin topología) y ONLYOFFICE no entra en `ready` (PD-113).
- **RN-5** Respaldo de base de datos diario (RNF-21); restauración probada al menos una vez por fase (`workflow.md` §6) y vuelta atrás ensayada por fase desde la Fase 2, ambas con datos sintéticos (RNF-16).
- **RN-6** Una falla de métricas, tableros, alertas o respaldos no afecta a cargar, descargar ni navegar (Art. XII).
- **RN-7** Los tableros solo leen series del recolector de métricas; no consultan PostgreSQL ni otra fuente de datos de clientes, así que no hay una vía de lectura que salte la autorización ni RLS (Art. IX.2).

## 5. Seguridad y privacidad
- **¿Toca datos de un cliente?** Las métricas no llevan contenido, nombres ni correos (RN-2; los identificadores de cuenta o documento, P-11) y los tableros no consultan datos de clientes (RN-7). Los respaldos de producción sí contienen todos los datos de cuentas: viven fuera del repositorio, solo el Operador los administra (matriz §2) y su destino, retención y cifrado son P-5. Las pruebas de esta spec (CA-21, CA-22) usan solo datos sintéticos: ninguna toca contenido real de clientes.
- **No van a bitácoras, métricas ni alertas**: contenido, nombres de archivo, correos, contraseñas, tokens, claves de enlaces, cadenas de conexión ni credenciales de respaldo (RNF-17).
- **Roles**: «Ver métricas agregadas» es de Administrador y Operador; «Administrar respaldos» solo del Operador (matriz §2). Cliente y Soporte no ven tableros. Acceso a Grafana: P-6.
- **Superficie**: las métricas no se publican por Traefik (CA-2). 022 no agrega rutas a la API de clientes.
- Sin pruebas de aislamiento propias: no hay consultas por cuenta. Si P-11 mantiene métricas por cuenta, se revisa.

## 6. Experiencia de usuario
- Sin interfaz en `apps/web`: los tableros son de Grafana y no siguen Cielo Sereno (no hay fila en `ui-guidelines.md` §7). La pantalla de bitácoras y trabajos es 022b.

## 7. Fuera de alcance
- RF-37 completo (022b): lista de trabajos, reintento, pantalla de bitácoras técnicas, conteos al momento (PD-74, PD-122).
- Panel de métricas agregadas de la app (011, CA-12) y sus cambios.
- Pruebas de carga k6 y aislamiento global (023, `specs/README.md`), incluidas las mediciones con k6 de PD-60 y PD-62.
- Imágenes en ghcr.io, staging y el mecanismo de despliegue (000, bloques 5–6); 022 solo ensaya la vuelta atrás.
- Que Traefik retire del enrutamiento lo que deje de responder (propuesta §4.3): es configuración de despliegue y no está asignada (PD-167).
- Objetos huérfanos y credencial raíz de MinIO por proceso (005 plan R-7 y R-13, «revisar en 022»): no rastrean a RNF-18, 20 ni 21 y se tratan como endurecimiento de staging (PD-167).
- Restaurar un respaldo sobre cuentas reales: sería una acción interna sobre cuentas ajenas (RF-07, Art. IX.4) sin decisión que la defina.
- Alta disponibilidad multi-región y certificaciones de cumplimiento (`product-context.md` §9). Redibujar el diagrama (DF-28): Adrián (PD-05).

## 8. Supuestos
- Prometheus recolecta y Grafana presenta (stack de `CLAUDE.md` y propuesta §4.3); toda librería o imagen nueva va con su ADR en el plan.
- La alerta de prueba (CA-18) se provoca en un ambiente que no es producción.
- Canal en vivo (RN-3): como 015 no define su conjunto de métricas, el plan concreta las señales observables necesarias; si al hacerlo aparece una decisión que cambia comportamiento observable o un RF/RNF, se registra como pregunta bloqueante antes de cerrar el plan.
- Las métricas de RN-3 viven en módulos de Adrián, Juan Marcos y Abel; la recolección toca infraestructura de Adrián. Quién instrumenta y con qué autorización se acuerda con cada dueño antes del plan oficial; no se reasigna ownership.
- **Propuesta de partición, sin ejecutar:** 022 = RNF-18 (CA-1 a CA-18); posible 022c = RNF-21 (CA-19 a CA-22); CA-23/RNF-20 al cierre de 000, con su CA-31 e imágenes N/N-1. Adrián decide destino, alcance y tamaño según ADR-0034/`workflow.md` §4.1; partir no garantiza ≤ 12 archivos, una pantalla ni ≤ 3 días. Hasta decidir, permanecen aquí los 23 CA, HU-4/HU-5 y RN-5; no se crea ni reserva 022c.
- DF-28 y PD-05: redibujar arquitectura, incluida observabilidad, corresponde a Adrián como guardián de diagramas. PD-166 registra la actualización pendiente de DF-29; ningún puerto nuevo se presenta como aprobado o existente.
- Base documental: 020/020b y 021 integradas; 020 remite Grafana/métricas a 022 y 020b es el panel web del cliente (no resuelve P-8). 021 y ADR-0038 separan `worker-optimizer`; su imagen compartida con `worker` no entrega por sí sola publicación ni staging de 000, ni demuestra CA-23.
- Plan y tareas retirados del árbol por Modo 2, con originales verificados y propuestas corregidas fuera del repositorio. El [seguimiento documental](review.md) registra hallazgos y decisiones; no es una revisión de implementación ni aprobación. El exceso de tamaño y duración de la rama sigue pendiente de Adrián.

## 9. Preguntas
- [ABIERTA] **P-2** ¿Dónde se demuestran RNF-18, RNF-20 y RNF-21? Los bloques 5–6 de 000 siguen diferidos y no hay staging integrado (§8): ¿RNF-18/RNF-21 en local primero y repetición en staging cuando exista, o se espera? ¿CA-23/RNF-20 queda pendiente de esos bloques y de 000 CA-31? — bloquea: sí
- [ABIERTA] **P-3** ¿Cuál es «el canal del equipo» (propuesta §4.3) al que llegan las alertas? — bloquea: sí
- [ABIERTA] **P-5** Respaldos: ¿retención, destino (mismo servidor o externo) y cifrado? ¿Cuánto se retienen las versiones no vigentes que deja el versionado del almacén al sobrescribir o borrar fuera de la purga (CA-22)? — bloquea: sí
- [ABIERTA] **P-6** ¿Quién entra a Grafana (Operador; también Administrador por la matriz) y cómo: cuentas propias, red interna o túnel? ¿Se publica por Traefik? — bloquea: sí
- [ABIERTA] **P-7** ¿El tablero de negocio duplica el panel de métricas de 011 o lo complementa? — bloquea: sí
- [ABIERTA] **P-8** 020 y 020b están integradas (§8); 020 remite Grafana/métricas a 022, mientras 022 mantiene abierta su asignación: ¿se confirma aquí el tablero del agente con el grupo RN-3 completo, se difiere a otro entregable acordado con Adrián o se recorta? Definir responsable y datos; 020b es el panel del cliente. — bloquea: sí
- [ABIERTA] **P-11** ¿Las métricas que la propuesta §4.3 pide «por cuenta» y «por documento» (espacio usado, consumo y costo del agente, editores) se mantienen así, o Adrián aprueba sustituirlas por agregados y distribuciones para no llevar identificadores ni acceder a datos de clientes (RNF-17)? Cambia lo que RNF-18 entrega — bloquea: sí

## 10. Registro de cambios
| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-10-24 | Creación en Borrador | `/spec 022` | — |
| 2026-10-24 a 2026-10-30 | Auditorías del PR #78: purga no recuperable; restauración sintética; seis alertas; privacidad y agente condicionados a P-11/P-8; eventos frente a conteos actuales; trazabilidad y formato alineados | Coherencia con producto y roles | — |
| 2026-11-01 | Plan y tareas preparatorios incorporados sin aprobación; pendientes propios conciliados (historial único en `pendientes.md`) | Preparación documental | — |
| 2026-11-01 | Última auditoría: RN-3/CA-1 incluyen 019, 021 y `worker-optimizer`; base conciliada; plan/tareas archivados externamente y retirados por Modo 2; partición y destino de CA-23 siguen como propuestas | Corrección documental; siete preguntas abiertas, sin implementación | — |
