# Hallazgos de la revisión de diagramas

> Revisión cruzada de `Diagrama_de_Arquitectura`, `Diagramas_de_Clases`, `Diagramas_ER` y el sistema de diseño Cielo Sereno contra la propuesta V2.
> Cada hallazgo se cierra con una decisión del equipo (ADR si es estructural) y la actualización del diagrama.
> Estados: `Abierto` · `Aceptado` (se aplicará la propuesta) · `Descartado` (con razón) · `Resuelto` (diagrama y código actualizados).
> Severidad: **Alta** = seguridad, pérdida de datos o ciclo de dependencias · **Media** = inconsistencia que causará retrabajo · **Baja** = claridad.

## Resumen por spec

| Resolver antes de | Hallazgos |
|---|---|
| 000 fundaciones | DF-02, DF-03, DF-06, DF-23, DF-24, DF-30, DF-34, DF-49 (DF-29 parcial: indicador de Redis) |
| 001–004 identidad y acceso | DF-01, DF-11, DF-12, DF-13, DF-32 |
| 005–007 almacenamiento | DF-15, DF-16, DF-17, DF-33, DF-38, DF-40 |
| 008–011 billing y backoffice | DF-04, DF-25, DF-26, DF-27, DF-36 |
| 012–013 compartición | DF-09, DF-10, DF-31 |
| 014–016 versiones y edición | DF-05, DF-18, DF-19, DF-20, DF-39 |
| 019–020 inteligencia | DF-07, DF-08, DF-14, DF-37 |
| 021 optimizador | DF-21, DF-22 |
| 022 operación | DF-28, DF-29 |
| 000b sistema de diseño (y toda spec con UI) | DF-41, DF-42, DF-43, DF-44, DF-45, DF-46, DF-47, DF-48 |

---

## Seguridad y arquitectura

| ID | Sev. | Dónde | Hallazgo | Propuesta | Estado |
|---|---|---|---|---|---|
| DF-01 | Alta | Clases M2, M3, M5, M8 | Varios métodos de servicio no reciben quién actúa: `FileService.getDownloadUrl(id)`, `rename(id, name)`, `trash(id)`, `SharingService.share(nodeId, uid, lvl)` (¿quién comparte?), `BackofficeController.suspend(id)`. Sin actor no hay forma de autorizar dentro de la consulta (RNF-05). | Todo método de servicio de aplicación recibe `actor: Actor` como primer parámetro. Repositorios de datos de cliente: `findAccessible(actor, …)`. Actualizar firmas en el diagrama. | Abierto |
| DF-02 | Alta | Clases M2 ↔ M3 | Ciclo: `FileService` necesita `PermissionResolver` (M3) y `PublicLinkService.resolve()` devuelve `StorageNode` (M2). Además `inheritedGrants` necesita la jerarquía de carpetas. En NestJS esto obliga a `forwardRef`. | Separar M3 en `access` (lectura: `PermissionResolver`, políticas, consulta de nodos accesibles; lee `archivo`, `carpeta`, `comparticion` por SQL) y `sharing` (escritura: comparticiones y enlaces). DAG: `storage → access`, `sharing → storage, access`. ADR-0010. | Abierto |
| DF-03 | Alta | Clases M3, M8 | `SharingService` usa `IAuditLogger` y la única implementación es `AuditService` en M8, que a su vez depende de repos de M1, M2 y M4 → ciclo con cualquier módulo que audite. | Extraer `AuditService` + `AuditEntry` a un módulo transversal `audit` sin dependencias, que implementa `IAuditLogger`. M8 lo consume. | Abierto |
| DF-04 | Media | Clases M8 | `AdminService` usa `IUserRepository` (M1) e `ISubscriptionRepository` (M4) directamente: rompe las fronteras (Art. VIII). | M1 y M4 exponen fachadas pequeñas (`IAccountAdministration`, `ISubscriptionAdministration`) que `AdminService` consume. | Abierto |
| DF-30 | Media | Clases M5, Arquitectura | Solo existe `PresenceGateway` en M5, pero también necesitan Socket.IO el progreso de carga (RF-08), el streaming del agente (RF-32) y las notificaciones. | Módulo transversal `realtime` con un gateway y salas por usuario / documento; M5 publica presencia a través de él. | Abierto |
| DF-32 | Alta | Clases M3 | `PermissionResolver.can(uid, nodeId, a)` solo sirve para un recurso puntual. Listados, búsqueda y el agente necesitan filtrar un conjunto en SQL. | Agregar `accessibleNodes(actor)`: un fragmento SQL/CTE reutilizable por repositorios de M2 y M6. Es la única implementación de «qué puede ver este actor» (DRY). | Abierto |
| DF-14 | Alta | Clases M6, E-R | `Chunk` tiene `ownerId`: filtrar por dueño excluye archivos compartidos (RF-33 los incluye). En el E-R, `fragmento` no tiene referencia directa a archivo ni a dueño, lo que complica RLS y el rendimiento. | Recuperación con `accessibleNodes(actor)`. En `fragmento` agregar `archivo_id` y `version_archivo_id` (desnormalizados, indexados) para RLS y filtro previo al `ORDER BY embedding <=> …`. | Abierto |
| DF-05 | Alta | Clases M5 | La idempotencia del guardado depende solo de `RedisIdempotencyStore` con TTL: si expira o Redis reinicia, un callback repetido crea dos versiones. | Garantía en BD: `UNIQUE (sesion_edicion_id)` en `version_archivo` (una sesión genera como máximo una versión). Redis queda solo como candado para evitar trabajo duplicado. | Abierto |
| DF-09 | Alta | E-R compartición | `enlace_publico` usa `token` en claro como PK; la clase usa `tokenHash`. Quien lea la BD obtiene enlaces válidos. | PK `id uuid`; guardar `token_hash` único; el token solo existe en la URL entregada al usuario. | Abierto |
| DF-10 | Media | Clases M3, E-R, RNF-08 | Contradicción en la contraseña del enlace: E-R `clave_hash`, clase `passwordEnc` + `ISecretCipher`, RNF-08 dice «cifradas». | Usar hash Argon2id (nunca hace falta recuperar la clave) reutilizando `IPasswordHasher` (DRY) y eliminar `ISecretCipher` (YAGNI). Ajustar la redacción de RNF-08 a «almacenadas con hash» en el documento de requisitos. | Abierto |
| DF-11 | Alta | E-R usuarios | `dispositivo` no tiene huella ni IP, así que no se puede detectar un dispositivo no reconocido (RF-04). La clase `Session` sí tiene `deviceFingerprint` e `ipAddress`. | `dispositivo`: `huella_hash`, `agente_usuario`, `ultima_ip`, `ultimo_acceso`. Agregar clase `Device` a M1. | Abierto |
| DF-31 | Media | Clases M3 | `AccessLevel.OWNER` se puede asignar a un `UserShare`, pero la propiedad nace de `ownerId`. | `share()` solo acepta `EDITOR` o `VIEWER` (validado en dominio); `OWNER` solo lo devuelve `levelFor`. | Abierto |

## Modelo de datos

| ID | Sev. | Dónde | Hallazgo | Propuesta | Estado |
|---|---|---|---|---|---|
| DF-06 | Alta | E-R almacenamiento | `version_archivo.tamano_bytes` es `int`: el máximo es 2 147 483 647 y un archivo de 2 GB (2 147 483 648 bytes, RNF-02) lo desborda. | `bigint` para todo tamaño o cuota en bytes. | Abierto |
| DF-07 | Alta | E-R inteligencia | `fragmento.procedencia` es `int`, pero la ubicación es página, sección+párrafo o línea, además de la confianza (`SourceLocation`). | `jsonb` con forma `{ "tipo": "pdf", "pagina": 3, "confianza": 1 }`, validada en el mapeo a `SourceLocation`. | Abierto |
| DF-08 | Alta | E-R inteligencia | `cita` (N:M `consulta_agente`–`fragmento`) se rompe al reindexar, porque los fragmentos de la versión anterior se reemplazan y el historial de conversaciones pierde sus citas. | La tabla `cita` guarda una instantánea: `archivo_id`, `version_archivo_id`, `etiqueta_ubicacion`, `extracto_corto`. El `fragmento_id` pasa a ser opcional (`ON DELETE SET NULL`). | Abierto |
| DF-12 | Media | E-R usuarios, Clases M8 | La relación única `ejecuta/afecta` no permite distinguir al actor del afectado; `AuditEntry` tiene `actorId`, `targetUserId` y `resourceId`. | `evento_auditoria`: `actor_id`, `rol_actor`, `usuario_afectado_id`, `recurso_id` (nullable). Dos relaciones en el E-R. | Abierto |
| DF-13 | Media | E-R usuarios, Clases M1 | E-R tiene tabla `rol` (N:1); las clases usan el enum `Role` fijo. | Los 4 roles son fijos: columna `usuario.rol` con `CHECK`/enum y eliminar la tabla `rol` (YAGNI). Si se mantiene la tabla, debe sembrarse por migración y el enum reflejarla. Decidir y alinear ambos diagramas. | Abierto |
| DF-25 | Media | E-R suscripciones, Clases M4 | `suscripcion` solo muestra la relación `cambia` con `plan`; se necesitan dos: plan actual y plan pendiente. `uso_agente` está en el E-R, pero `Subscription` no lo tiene. | `plan_id` y `plan_pendiente_id` (nullable); `uso_agente` se reinicia al renovar; agregar `agentQueriesUsed` a `Subscription`. | Abierto |
| DF-26 | Media | Clases M8, E-R | `AdminService.adjustQuota` no tiene dónde guardarse en el E-R. | `suscripcion.cuota_extra_bytes bigint default 0`; `QuotaService` suma límite del plan + ajuste. `adjustValidity` modifica `suscripcion.fin` y se audita. | Abierto |
| DF-33 | Media | E-R almacenamiento, usuarios | Faltan columnas que las clases usan: `archivo` (tamano_bytes, version_actual, estado_indexacion); `version_archivo` (clave_objeto, checksum, creado_por, sesion_edicion_id); `carga` (upload_id, clave_objeto, nombre, carpeta_destino_id, partes_totales, expira_en); `usuario` (correo_verificado, codigo_empleado). | Agregarlas al E-R antes de la migración inicial de cada módulo. | Abierto |
| DF-38 | Baja | E-R usuarios | `usuario.espacio_usado`: no queda claro si es derivado o almacenado. | Contador almacenado que se actualiza en la misma transacción de carga y purga (RF-12 en tiempo real), con conciliación nocturna. Documentarlo como atributo almacenado. | Abierto |
| DF-39 | Baja | E-R colaboración | `sesion_edicion genera version_archivo` está como 1:1, pero una sesión fallida o cerrada sin cambios (estado 4 de ONLYOFFICE) no genera versión. | Cardinalidad 1:0..1. | Abierto |
| DF-40 | Media | E-R compartición, Clases M2 | `comparticion` y `enlace_publico` apuntan a `archivo` **o** a `carpeta` (dos FK), mientras que la clase unifica ambos en `StorageNode` (Composite). | Opción A: `CHECK` de exclusividad (exactamente una FK). Opción B: tabla única `nodo` con `tipo`, que simplifica permisos heredados y RLS. Decidir en ADR-0011. | Abierto |
| DF-23 | Media | E-R, Clases M4 | Dinero con tipos distintos: `Plan.priceGtq: number`, E-R `precio int`, `transaccion.monto numeric`. | `Money` como value object en centavos (`integer`) en todas las tablas; Q45.00 = 4500. | Abierto |
| DF-24 | Baja | E-R, Clases M4 | Unidades distintas: E-R `cuota_gb` y `max_archivo_mb`; `PlanLimits` en bytes. | La conversión ocurre en un solo lugar (mapper de `plan`). Recomendado: guardar en bytes (`bigint`) y eliminar la conversión. | Abierto |

## Diseño de clases

| ID | Sev. | Dónde | Hallazgo | Propuesta | Estado |
|---|---|---|---|---|---|
| DF-15 | Media | Clases M1, M2, M6, M8 | Faltan puntos de entrada para requisitos «Debe»: sesiones (RF-04), bitácora propia (RF-07), carpetas/renombrar/restaurar/versiones/cuota (RF-10–13), búsqueda (RF-15), vista previa (RF-27), `AgentController` y entidades `Conversation`/`AgentQuery` (RF-32), CRUD de planes para el Administrador (RF-06). | Agregar `SessionsController`, `AuditController`, `FoldersController`, `SearchService`, `PreviewService`, `AgentController`, `Conversation`, `AgentQuery`, y endpoints de catálogo en backoffice. | Abierto |
| DF-16 | Media | Clases M2, Arquitectura | `UploadService.uploadPart(id, n, data)` hace que los bytes pasen por la API; el diagrama de arquitectura muestra el navegador conectado directo a MinIO. Con archivos de 2 GB y un servidor de 8 GB, pasar todo por la API es costoso. | URLs firmadas por parte: `IObjectStorage.presignUploadPart(key, uploadId, n)` y `listParts(uploadId)` para reanudar. La API solo inicia, completa y valida. | Abierto |
| DF-17 | Media | Clases M2, M5 | Restauración duplicada: `FileService.restoreVersion` y `VersionHistoryService.restore`. | Un solo dueño del ciclo de vida de versiones (M2: registrar, podar, restaurar). M5 solo aporta la autoría (sesión → participantes) y la línea de tiempo. | Abierto |
| DF-18 | Media | Clases M5, E-R | `DocumentVersion` hereda de `FileVersion` de otro módulo, y `authorIds` duplica lo que ya dice `Participant`. El E-R tiene una sola `version_archivo`. | Composición en lugar de herencia: `version_archivo.origen` + `sesion_edicion_id`; los autores se derivan de `participacion`. | Abierto |
| DF-19 | Baja | Clases M1, M5 | Hay dos `ISessionRepository` con significados distintos (sesión de login y sesión de edición). | Renombrar a `IEditSessionRepository` en M5. | Abierto |
| DF-20 | Media | Clases M5, Arquitectura | `SaveCallbackHandler.handle` descarga y verifica dentro del callback (síncrono), pero la arquitectura pone «Actualizado de Versiones» en procesamiento asíncrono. ONLYOFFICE reintenta si el callback tarda. | El callback valida el JWT, encola el trabajo y responde `{"error":0}`. Un `SaveVersionProcessor` descarga, verifica y registra la versión. | Abierto |
| DF-21 | Alta | Clases M7, E-R | `swapObjects` sobrescribe el objeto (rompe la inmutabilidad de versiones). Además, conservar el original restaurable no libera espacio, que es el objetivo del optimizador. | El resultado se guarda como nueva `version_archivo` con `origen = optimizacion` (como ya indica el E-R). El original queda como versión anterior durante la retención de papelera del plan y luego se purga. La UI lo explica. `optimizacion` referencia la versión original y la resultante. **Requiere decisión de producto.** | Abierto |
| DF-22 | Media | E-R operación | La tabla `trabajo` duplica el estado que BullMQ ya guarda en Redis, lo que crea dos fuentes de verdad. | `JobMonitorService` lee el estado desde BullMQ; `indexacion` y `optimizacion` guardan el estado de negocio. Eliminar `trabajo` (YAGNI) o definirla como historial escrito solo al terminar. | Abierto |
| DF-27 | Media | Clases M2, M4, M5, M6, M8 | Puertos sin implementación asignada: `IPlanLimitsProvider`, `IAgentQuota`, `INotifier`, `IIndexQueue`, `INodeMetadataReader`, `IAuditLogger`. | Asignación: `IPlanLimitsProvider` e `IAgentQuota` → billing; `INotifier` → notifications; `IIndexQueue` → intelligence; `INodeMetadataReader` → storage; `IAuditLogger` → audit. | Abierto |
| DF-34 | Baja | Clases M1, M4 | Dos puertos de notificación (`IMailer`, `INotifier`) sin módulo dueño; la tabla `notificacion` tampoco tiene dueño. | Módulo `notifications` que implementa ambos (segregación por consumidor) y es dueño de `notificacion`. | Abierto |
| DF-36 | Baja | Clases M8 | `BackofficeController` atiende a tres roles distintos. | `AdminController`, `SupportController` y `OpsController`, cada uno con su `@Roles`. | Abierto |
| DF-37 | Baja | Clases M6 | `ITextExtractor.extract(b: Buffer)` carga el archivo completo en memoria. | Tamaño máximo indexable configurable (p. ej. 50 MB); los archivos mayores quedan como `not_indexable` con motivo. | Abierto |

## Arquitectura y operación

| ID | Sev. | Dónde | Hallazgo | Propuesta | Estado |
|---|---|---|---|---|---|
| DF-28 | Media | Diagrama de arquitectura | (a) La flecha naranja hacia Gemini 3.5 Flash sale de **Pino** y debería salir de **Agente**. (b) Falta Agente → gemini-embedding (la pregunta también se vectoriza). (c) No aparecen los módulos Edición, Administración/Soporte ni Notificaciones. (d) Falta el servidor de correo (SMTP). (e) Faltan Prometheus y Grafana. (f) El navegador llega a ONLYOFFICE y a MinIO sin pasar por Traefik, cuando MinIO debe servirse desde un origen aislado (RNF-07). (g) El worker no aparece como proceso desplegable separado. (h) Redis no tiene conexiones. | Corregir el diagrama; `architecture.md` ya refleja la versión propuesta. | Abierto |
| DF-29 | Media | Clases M8 | Solo existen indicadores de salud para Postgres y MinIO, pero las alertas cubren también Redis y ONLYOFFICE. No hay endpoint para exponer las métricas a Prometheus. | Agregar `RedisHealthIndicator` (000, en `shared`) y `OnlyOfficeHealthIndicator` (016/022, en `editing`, registrado en la raíz de composición), y un `MetricsController` (`GET /metrics`, solo red interna; 022). | Abierto (Redis: en 000) |
| DF-49 | Media | Clases M8, Arquitectura §3/§5 | `HealthController` e `IHealthIndicator` están en M8 `backoffice`, pero la salud la necesitan `api` **y** `worker` desde 000, y `backoffice` no existe hasta 003/011 y depende de `identity`, `billing` y `storage`. Si el worker importara `backoffice` para la salud, arrastraría esos módulos; si la salud espera a 011, 000 no cumple CA-20 a CA-23. La salud es infraestructura sin reglas de negocio ni rol. | Mover `HealthController`, `HealthService` (nuevo, orquesta los indicadores), `IHealthIndicator`, `PostgresHealthIndicator`, `MinioHealthIndicator` y `RedisHealthIndicator` al módulo transversal T1 `shared`. `HealthModule.forRoot({ indicators })` permite que cada módulo aporte un indicador (`OnlyOfficeHealthIndicator` desde `editing`) sin que `shared` dependa de nadie. M8 conserva `MetricsService`, `JobMonitorService` y `IQueueInspector`. Redibujar: diagrama de clases M8 (quitar salud) y agregar el bloque T1 `shared`; `architecture.md` §3/§5 y `design-model.md` §3 ya actualizados. Resolver antes de: 000 (PR-2 «shared»). | Aceptado (aprobación del plan 000, 2026-09-15) |
| DF-35 | Baja | Clases M1, E-R | `ClientUser.subscriptionId` y `suscripcion.usuario_id` duplican la relación. | Mantener solo la FK en `suscripcion`; la suscripción vigente se consulta. Quitar `subscriptionId` de `ClientUser`. | Abierto |

## Sistema de diseño y UI (Cielo Sereno)

Detalle de los cálculos y valores propuestos: `docs/sdd/ui-guidelines.md` §2.

| ID | Sev. | Dónde | Hallazgo | Propuesta | Estado |
|---|---|---|---|---|---|
| DF-41 | Alta | Colores de marca | Texto blanco sobre `#6B8DD6` = 3.28:1 (botones CTA) y `#6B8DD6` como link = 3.05:1. Ninguno cumple AA (4.5:1), que RNF-13 exige. | Relleno CTA y links en `#4A6FA5` (5.11 / 4.76); hover `#3B5A8A`; `#6B8DD6` queda como color decorativo. | Abierto |
| DF-42 | Alta | Texto | `text-muted #7A90A8` = 3.06:1 sobre fondo y 2.61:1 sobre fila seleccionada; se usa en metadatos y fechas, que son texto pequeño. | `#5E7389` (4.56 / 4.76); en filas seleccionadas usar `text-secondary`. | Abierto |
| DF-43 | Alta | Semánticos | Success, warning y danger como texto quedan entre 2.11 y 3.09:1; texto blanco sobre danger = 3.18:1. | Variantes de texto `#3A7560`, `#8A6424`, `#A34F4F`; botón destructivo en `#A34F4F`. Los tonos originales se usan solo para rellenos decorativos (barras, íconos). | Abierto |
| DF-44 | Media | Chips de tipo de archivo | El texto sobre su propio color al 12 % queda entre 1.70 y 2.83:1. | Texto con tono oscuro por tipo (4.77–5.46) manteniendo el fondo al 12 %. | Abierto |
| DF-45 | Media | Bordes y foco | Borde `#DDE6F0` de inputs = 1.23:1 (WCAG 1.4.11 pide 3:1 para límites de controles). | Borde de input `#7F93AA` (3.07); foco `#4A6FA5`; el borde de cards se mantiene porque es decorativo. | Abierto |
| DF-46 | Media | Colores de autoría | La paleta se describe para un «visor de atribución de párrafo», funcionalidad **fuera de alcance** (propuesta §10.4). | Reutilizar la secuencia para participantes en presencia e historial por versión, como anillo de avatar con nombre visible. | Abierto |
| DF-47 | Media | Implementación CSS | La guía indica `src/index.css` con tokens `--color-text-*`: en Next.js App Router el archivo es `app/globals.css`, shadcn/ui usa otra convención de variables y `--color-text-primary` genera la utilidad `text-text-primary`. | Un solo `globals.css` que asigna Cielo Sereno a las variables de shadcn más tokens propios de Nimbo (`ui-guidelines.md` §3). | Abierto |
| DF-48 | Baja | Afirmación de accesibilidad | El documento dice que todos los pares cumplen AA sin mostrar la verificación. | Reemplazar esa afirmación por la tabla de contraste verificada y volver a verificar cada vez que cambie un color. | Abierto |

## Lo que está bien resuelto (conservar y defender)
- **Composite** `StorageNode`/`Folder`/`File`: modela el árbol y el cálculo de tamaño sin condicionales.
- **Strategy** en políticas de acceso y **Registry** de extractores: agregar un nivel o un formato no toca lo existente (OCP).
- **Template Method** en `BaseOptimizer` e `InternalActionService`: la auditoría de acciones internas no se puede olvidar.
- `SourceLocation` con `confidence` e `isCertain()`: implementa directamente «si no hay certeza, la respuesta lo dice».
- `SavingsEstimate.isWorthIt(min)`: RF-35 queda como regla de dominio probada unitariamente.
- `IPaymentGateway`, `ILanguageModel` e `IEmbeddingProvider`: la sustituibilidad que la propuesta promete.
- `vector(768)` fijo en el E-R y `tsvector` para búsqueda híbrida.
- `IClock` en `RenewalScheduler`: las vigencias se pueden probar sin esperar días.
- Cielo Sereno: la regla «el color nunca es el único diferenciador», el mínimo de 360 px, `prefers-reduced-motion`, `tnum` en cifras y el panel oscuro del agente (8.87:1) ya están bien pensados.
