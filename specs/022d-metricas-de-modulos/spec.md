# Spec 022d — Métricas de los módulos, tablero de negocio y grupo del agente

> Qué y por qué, en ≤ 150 líneas. El cómo va en `./plan.md` (obligatorio; no se escribe hasta resolver P-1, §9).

| Campo | Valor |
|---|---|
| Estado | Borrador |
| Dueño | Abel |
| Fase | 3 (prevista; calendario pendiente de reprogramación) |
| Requisitos | RNF-18 (métricas y tableros de los módulos); RNF-17 (privacidad de las series); RF-05 (acceso a tableros). Observa sin cambiar: RF-01, RF-03, RF-09, RF-12, RF-13, RF-20, RF-22, RF-23, RF-26, RF-30, RF-32, RF-34, RF-35 |
| Depende de | 022 (núcleo: registro de métricas, exposición privada, Prometheus, Grafana y tablero de operación). No depende de 022c |
| Última actualización | 2026-11-02 |

## 1. Contexto y objetivo
El 2026-11-02, al planificar la 022 con todos los grupos de su RN-3, el inventario no cabía en 12 filas y se aplicó
el corte que Adrián autorizó en el PR #78: la 022 conserva el núcleo (HTTP, colas, sistema, tablero de operación y
las seis alertas) y la instrumentación de los módulos pasa a esta spec. Aquí cada módulo de negocio informa sus
señales como agregados, el Operador ve una tendencia del negocio por periodo que complementa el panel de 011, y el
tablero de operación suma los grupos de los módulos, de la auditoría y del agente. Ninguna serie identifica a una
cuenta, archivo, documento, usuario ni sesión (022 RN-2).

## 2. Historias de usuario
- **HU-1** Como Operador, quiero que cada módulo informe sus señales agregadas (identidad, almacenamiento, versiones, edición, canal en vivo, indexación, optimizador y auditoría), para ubicar en qué módulo está un problema.
- **HU-2** Como Operador, y como Administrador en solo lectura, quiero un tablero de negocio con tendencias por periodo, para ver cómo evolucionan registros, contrataciones, renovaciones, vencimientos y cuentas en solo lectura.
- **HU-3** Como Operador, quiero un grupo del agente en el tablero de operación, para vigilar su uso por plan, su latencia y lo que recupera.
- La privacidad de las series es la de 022 HU-6, sin historia nueva (CA-12).

## 3. Criterios de aceptación
Equivalencias con la spec 022 anterior al corte (022, «Traslados»):

| 022 (original) | 022d | Nota |
|---|---|---|
| HU-1 (señales de módulo, vía CA-4) | HU-1 | Procesos, HTTP, colas y sistema siguen en 022 |
| HU-2 (tablero de negocio) | HU-2 | P-7 |
| HU-2 (grupo del agente) | HU-3 | P-8 |
| CA-4 | CA-1 a CA-8 | Dividido: un CA por grupo de RN-3 para verificarlo por separado |
| CA-17 | CA-9 | Igual; la alerta sigue en PD-67 |
| CA-7 | CA-10 | Sin «sujeto a P-7»: tendencias por periodo, no conteos actuales |
| CA-8 | CA-11 | Reescrito con el alcance de P-8 |
| RN-3 «En 022d» y «Agente (P-8)» | RN-1, RN-3 | Mismos grupos y fuentes |
| — | CA-12, CA-13, CA-14 | Nuevos: aplican 022 CA-5, RN-6 y CA-9 a lo que agrega 022d; no añaden comportamiento |
| CA-16 | — | Se queda en 022 (métricas de la cola `subscription-renewal`, sin tocar `billing`) |

> «Su serie cambia» = tras el evento, el valor agregado correspondiente aumenta en la recolección siguiente y se lee en
> el tablero de operación, sin identificadores (RN-2). Las fuentes de cada grupo están en RN-1.

### Señales de los módulos (HU-1)
- **CA-1** (HU-1, RNF-18; antes CA-4 · Identidad y acceso) Dados un registro, una verificación, un correo enviado o fallido, un inicio de sesión exitoso, fallido o bloqueado, un reúso de token de refresco o una denegación de acceso, cuando ocurren, entonces cambia su serie por resultado o motivo.
- **CA-2** (HU-1, RNF-18; antes CA-4 · Almacenamiento) Dadas una carga completada o rechazada, un enlace de descarga emitido, un límite de frecuencia alcanzado, una pasada de limpieza de cargas o un error de MinIO, cuando ocurren, entonces cambian sus series (cargas por resultado, rechazos por motivo, bytes cargados, enlaces, límites por operación, duración y fallos de la limpieza, errores de MinIO por operación).
- **CA-3** (HU-1, RNF-18; antes CA-4 · Almacenamiento, P-11) Dado el espacio usado por las cuentas, cuando se recalcula (S-3), entonces el tablero muestra el espacio total y por plan, nunca por cuenta.
- **CA-4** (HU-1, RNF-18; antes CA-4 · Versiones de 014) Dadas una versión registrada, restaurada o podada, o una poda fallida, cuando ocurren, entonces cambia su serie.
- **CA-5** (HU-1, RNF-18; antes CA-4 · Edición, P-11) Dadas sesiones de edición, cuando se abren, generan una versión, fallan al guardar o cambian de participantes, entonces cambian sus series, y los editores concurrentes se ven como máximo y como distribución, sin identificar el documento.
- **CA-6** (HU-1, RNF-18; antes CA-4 · Canal en vivo) Dado el canal en vivo, cuando una conexión se abre, se cierra o se rechaza, o falla una publicación, entonces se ven las conexiones activas, los rechazos por motivo y los fallos de publicación.
- **CA-7** (HU-1, RNF-18; antes CA-4 · Indexación) Dado un trabajo de indexación, cuando termina como indexado, no indexable, fallido o descartado, o se reintenta, entonces cambia su serie por resultado (la espera y la ejecución de la cola son de 022 CA-1).
- **CA-8** (HU-1, RNF-18; antes CA-4 · Optimizador) Dada una optimización de JPEG o PNG, cuando se solicita, se estima (no conviene o no disponible) o termina (completada, descartada, fallida o caducada), entonces cambia su serie por resultado y, si existen, los bytes antes y después; no hay series de PDF, GIF ni WebP.
- **CA-9** (HU-1, RNF-18, PD-67; antes CA-17) Dada la auditoría de mejor esfuerzo, cuando se pierde un evento (`audit.record_failed`), entonces su contador sube por motivo y se ve en el tablero de operación; no dispara ninguna alerta (RN-5).

### Tableros (HU-2, HU-3)
- **CA-10** (HU-2, RNF-18, P-7; antes CA-7) Dado el tablero de negocio, cuando el Operador o el Administrador lo abre, entonces ve, por periodo y como totales agregados (por plan donde aplique), los registros, contrataciones, renovaciones, vencimientos y cuentas que pasan a solo lectura; no muestra cuántas cuentas hay hoy en cada estado (PD-122, 022b) ni repite el panel de 011.
- **CA-11** (HU-3, RNF-18, RF-34, P-8; antes CA-8) Dado el tablero de operación, cuando se abre, entonces su grupo «Agente» muestra consultas por plan, latencia total (p50 y p95) y la distribución de fragmentos recuperados por consulta; no muestra latencia hasta el primer fragmento ni consumo o costo (PD-168).

### Privacidad, degradación y acceso
- **CA-12** (HU-1 a HU-3, RNF-17; aplica 022 CA-5) — privacidad: Dado tráfico sintético con correos, nombres de archivo y UUID en entradas y rutas, cuando se inspeccionan las series y los tableros de 022d, entonces ninguno contiene esos valores ni identificadores; las etiquetas solo toman valores de conjuntos cerrados (resultado, motivo, operación, plan).
- **CA-13** (HU-1, RNF-18, RN-6; aplica 022 RN-6) — error: Dado que registrar una métrica falla, cuando un módulo hace su operación (cargar, renovar, preguntar al agente, guardar una edición), entonces la operación responde igual que sin métricas y queda una línea técnica sin datos sensibles.
- **CA-14** (HU-2, RF-05; aplica 022 CA-9) — error: Dado alguien sin cuenta de Grafana (anónimo, Cliente o Soporte), cuando intenta abrir el tablero de negocio, entonces no ve ningún dato; el Administrador lo abre en solo lectura y no puede cambiarlo.

### Trazabilidad
RNF-18 → CA-1 a CA-11, CA-13 · RNF-17 → CA-12 · RF-05 → CA-14 · RF-34 → CA-11 · PD-67 → CA-9 · PD-168 → fuera (§7).

## 4. Reglas de negocio
- **RN-1** Grupos (022 RN-3, «En 022d»): Identidad y acceso (001, 002 y 003 plan §7) → CA-1 · Almacenamiento (005 plan §7; espacio total y por plan; error de MinIO) → CA-2, CA-3 · Versiones (014 plan) → CA-4 · Edición (016) → CA-5 · Canal en vivo (015 §7) → CA-6 · Indexación (019) → CA-7 · Optimizador (021, solo JPEG/PNG) → CA-8 · Auditoría (PD-67) → CA-9 · Negocio (P-7) → CA-10 · Agente (P-8) → CA-11.
- **RN-2** Igual que 022 RN-2: solo agregados y distribuciones. «Por plan» usa el plan del catálogo (tabla `plan`), nunca la cuenta.
- **RN-3** Agente (P-8): consultas por plan, latencia total y fragmentos por consulta, como grupo del tablero de operación; sin tercer tablero. Primer fragmento y consumo/costo: PD-168.
- **RN-4** Negocio (P-7): complementa el panel de 011, que sigue mostrando el estado actual; aquí solo tendencias por periodo. No se modifica ni se consulta `MetricsService` de 011.
- **RN-5** Igual que 022 RN-1: exactamente las seis alertas de `product-context.md` §7. `audit.record_failed` (PD-67) y las candidatas de 001, 002 y 003 (PD-167 (a)) no son alertas.
- **RN-6** Igual que 022 RN-6, y además instrumentar no cambia el comportamiento de ningún módulo (condición del PR #78).
- **RN-7** Igual que 022 RN-7: los tableros solo leen series del recolector; no hay consultas nuevas sin `actor` (condición del PR #78).

## 5. Seguridad y privacidad
- **¿Toca datos de un cliente?** No como lectura nueva: las series son agregados sin identificadores (RN-2) y los tableros no consultan datos de clientes (RN-7). Sin pruebas de aislamiento propias, igual que 022 §5; CA-12 revisa series, etiquetas y tableros.
- **No van a métricas, bitácoras ni tableros**: contenido, nombres de archivo, correos, contraseñas, tokens, claves de enlaces, claves de objeto, preguntas o respuestas del agente, fragmentos ni identificadores (RNF-17).
- **Roles** (igual que 022 §5, P-6): «Ver métricas agregadas» es de Administrador (*Viewer*) y Operador (*Editor*); Cliente y Soporte no tienen cuenta de Grafana. El tablero de negocio sigue la misma regla (CA-14). No hay suplantación ni vista de contenido para ningún rol interno.
- **Auditoría (RF-07)**: no aplica; métricas y tableros no son acciones sobre cuentas.
- **Superficie**: igual que 022 CA-2; 022d no agrega puertos, rutas ni hosts.

## 6. Experiencia de usuario
- Sin interfaz en `apps/web`: los tableros son de Grafana y no siguen Cielo Sereno (igual que 022 §6; no hay fila en `ui-guidelines.md` §7). No requiere mockup.

## 7. Fuera de alcance
- Núcleo de 022: procesos, HTTP, colas (incluidas espera y ejecución de `indexing` y `optimization`), sistema, dependencias, las seis alertas y CA-16.
- Latencia hasta el primer fragmento y consumo/costo del agente (PD-168); un tercer tablero para el agente (P-8).
- Conteos al momento de cuentas por estado y la pantalla de trabajos (022b, PD-74, PD-122); cambios o consultas al panel de 011.
- Alertas nuevas (RN-5): `audit.record_failed` (PD-67) y las candidatas de PD-167 (a).
- Métricas de `storage/search` (018) y de `sharing` (012, 013): esos módulos no se tocan. Papelera (006), búsqueda y backoffice no están en 022 RN-3.
- Métricas por cuenta, archivo, documento o sesión (P-11). Métricas del frontend.
- Optimización de PDF, GIF o WebP (021 solo entrega JPEG/PNG). Pruebas de carga (023).

## 8. Supuestos
- **S-1** (discutible) Definiciones de CA-10: *registro* = registro de cliente aceptado; *contratación* = pago aprobado al contratar un plan de pago; *renovación* = periodo renovado con pago, automática o manual por separado; *vencimiento* = periodo de pago que termina sin renovarse (sin cobro o con cobro rechazado); *solo lectura* = cuenta que entra en solo lectura. La bajada programada a Personal no es una de las cinco tendencias de P-7.
- **S-2** «Por plan» muestra el nombre del plan del catálogo. Un plan nuevo del catálogo aparece como un valor más.
- **S-3** (discutible) El espacio total y por plan se actualiza con la conciliación diaria de espacio (007), no en tiempo real; así no hay consultas nuevas sin `actor`.
- **S-4** Los editores concurrentes se ven como máximo simultáneo y como distribución del número de editores por sesión, sin el documento.
- **S-5** El mecanismo para emitir métricas lo fija el plan; si cambia la arquitectura de `shared` o agrega un puerto entre módulos, lo revisa `architect` antes de Adrián.
- **S-6** Se demuestra en local con el compose y el corpus sintético, igual que 022 P-2.

## 9. Preguntas
- [ABIERTA] **P-1 Tamaño y partición** — bloquea: sí. El inventario da 16 filas, 58 archivos (38 de autor, 20 pruebas) y ≈ 9,5 días-persona: no cabe en ≤ 12 filas ni en ~3 días (`workflow.md` §4.1, ADR-0034). Propuesta (recomendada): **022d** «mecanismo, negocio, auditoría y optimizador» (CA-8, CA-9, CA-10, CA-12 a CA-14; ≈ 3,75 días); **022d-2** «identidad y almacenamiento» (CA-1 a CA-4; ≈ 3,25 días); **022d-3** «edición, canal, indexación y agente» (CA-5 a CA-7, CA-11; ≈ 3,5 días); CA-12 y CA-13 se verifican en cada parte sobre sus series. Alternativas: dos partes (≈ 5,75 y ≈ 4,25 días) o excepción de tamaño como en 021. ¿Cuál se aplica y qué números reciben las partes nuevas? (022e ya lo propone el plan de 022).
- [ABIERTA] **P-2 Autorizaciones** — bloquea: sí. Confirmar que las autorizaciones de módulos del PR #78 se aplican a 022d. Literal: Abel puede modificar, «solo en los archivos que nombre el plan oficial aprobado» y «sin cambiar el comportamiento de los módulos»: `shared` (puerto y adaptador de métricas, servidor privado, middleware HTTP, montaje en `app.module`, `worker.module` y los tres `main`, `env.schema` y `secret-keys`); `identity`, `notifications`, `storage`, `audit`, `editing`, `realtime` e `intelligence` «solo para emitir métricas», vía preferida el punto de logging con el catálogo dentro del módulo; `billing` solo en «los servicios de suscripción y renovación, y `renewal.processor`», vía `billing-logger`, y «Adrián revisa esos cambios dentro del PR de 022». Condiciones: sin consultas nuevas sin `actor`, ninguna etiqueta con datos sensibles, una falla de métricas no afecta la operación (RN-6) y Adrián revisa todo cambio en el PR. `storage/search` y `sharing` no se tocan; `optimizer` es de Abel. Puntos a confirmar: el PR es el de 022d y no el de 022; el logger de `shared` y los `*.module.ts` de cada módulo (para registrar su catálogo) no están en la lista literal.
- [ABIERTA] **P-3 Consultas del agente por plan** — bloquea: sí (CA-11). Hoy el agente no conoce el plan de quien pregunta: obtenerlo exige leerlo de otro módulo (sin cambiar contratos, con el actor de la pregunta) o ampliar un contrato de `billing`. ¿Se acepta la lectura sin cambiar contratos, o CA-11 entrega el total sin plan hasta decidirlo?
- [ABIERTA] **P-4 Alcance de «por periodo»** — bloquea: sí (CA-10). El plan de 022 limita la retención de Prometheus a 15 días: las tendencias serían por día o semana dentro de esa ventana. ¿Basta así, o se pide ver meses (amplía la retención de 022, con más disco y memoria)?
- [RESUELTA] P-7 → complementa 011 con tendencias por periodo; no toca ni consulta `MetricsService` (2026-11-02, Adrián, PR #78).
- [RESUELTA] P-8 → consultas por plan, latencia total y fragmentos por consulta como grupo del tablero de operación; primer fragmento y costo, PD-168 (2026-11-02, Adrián).
- [RESUELTA] P-11 → solo agregados y distribuciones, sin identificadores (2026-11-02, Adrián).

## 10. Registro de cambios
| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-11-02 | Creación en Borrador desde 022 CA-4, CA-7, CA-8, CA-17, HU-2 (negocio y agente) y los grupos de módulo de RN-3; sin plan ni tareas por P-1 (inventario fuera de tamaño) | Corte de 022 por tamaño (PR #78) | — |
