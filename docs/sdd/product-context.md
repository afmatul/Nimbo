# Contexto del producto — Nimbo

> Resumen operativo de la Propuesta V2 para que cualquier agente entienda qué se construye.
> Si hay conflicto, manda la propuesta; si la propuesta cambia, se actualiza este archivo en el mismo PR.

## 1. Problema y propuesta de valor

Trabajar documentos en equipo obliga a saltar entre herramientas: una nube guarda, otra app edita, un chat coordina,
y nadie sabe con certeza quién escribió qué. Las nubes existentes guardan bien pero no entienden el contenido, rompen
el formato al editar y no registran autoría.

**Nimbo guarda tus archivos, entiende qué dicen por dentro y registra quién participó en cada versión.**

Segmento inicial: académico (acceso directo a usuarios reales). El producto no se limita a ese segmento.

## 2. Roles del sistema

Regla madre: **el rol nunca otorga acceso al contenido de los archivos.**

| Rol | Quién | Hace | Alcance de datos |
|---|---|---|---|
| Cliente | Cualquiera que se registra | Sube, organiza, comparte, edita y consulta sus archivos | Sus archivos y los compartidos con él |
| Administrador | Cuenta interna | Cuentas, catálogo de planes, cuotas, métricas agregadas | Cuenta, suscripciones, metadatos. **Nunca contenido** |
| Soporte técnico | Atención al cliente | Verifica estado de operaciones, reintenta procesos, explica errores | Metadatos, estados, bitácoras. **Nunca contenido ni vistas previas** |
| Operador de infraestructura | Equipo técnico | Despliegues, migraciones, respaldos, colas, alertas | Infraestructura, métricas, trabajos. No opera cuentas |

### Matriz de permisos (servidor)

| Capacidad | Cliente | Admin | Soporte | Operador |
|---|:-:|:-:|:-:|:-:|
| Gestionar su propia sesión | ✔ | ✔ | ✔ | ✔ |
| Subir/descargar/organizar archivos propios | ✔ | ✘ | ✘ | ✘ |
| Ver contenido o vista previa de otra cuenta | ✘ | ✘ | ✘ | ✘ |
| Compartir y generar enlaces públicos | ✔ | ✘ | ✘ | ✘ |
| Editar `.docx` en línea | ✔ | ✘ | ✘ | ✘ |
| Consultar al agente | ✔ | ✘ | ✘ | ✘ |
| Restaurar papelera de un cliente | ✔ (propia) | ✘ | Limitado¹ | ✘ |
| Ver metadatos de archivos de un cliente | ✔ (propios) | ✔ | ✔ | ✘ |
| Crear/suspender/reactivar cuentas | ✘ | ✔ | ✘ | ✘ |
| Gestionar catálogo de planes y precios | ✘ | ✔ | ✘ | ✘ |
| Ajustar cuota o vigencia de una cuenta | ✘ | ✔ | ✘ | ✘ |
| Ver métricas agregadas | ✘ | ✔ | ✘ | ✔ |
| Consultar bitácoras técnicas y trabajos | ✘ | ✔ | ✔ | ✔ |
| Ejecutar despliegues y migraciones | ✘ | ✘ | ✘ | ✔ |
| Administrar respaldos, llaves, configuración | ✘ | ✘ | ✘ | ✔ |
| Consultar su propia bitácora de auditoría | ✔ | ✔ | ✔ | ✔ |

¹ La condición exacta de «Limitado» debe fijarse en la spec de roles (p. ej. solo sobre una incidencia abierta por el cliente, con registro en auditoría). Es una pregunta abierta para el equipo.

### Niveles de acceso sobre un recurso (dentro del rol Cliente)

| Nivel | Puede | No puede |
|---|---|---|
| Propietario | Todo: ver, editar, compartir, enlaces, historial de versiones y accesos, mover, eliminar | — |
| Editor | Ver, descargar, editar, generar versiones, consultar con el agente | Compartir, crear enlaces, eliminar original, ver quién más tiene acceso |
| Lector | Ver, descargar, consultar con el agente | Modificar, compartir, ver historial de accesos |
| Enlace público | Descargar el recurso apuntado (con contraseña si la tiene) | Navegar fuera, editar, ver otros accesos |

### Reglas transversales
- Sin suplantación, ni siquiera para diagnóstico.
- Toda acción interna sobre cuenta ajena → auditoría visible para el cliente (RF-07).
- Autorización en la consulta de datos, no en la UI ni filtrando resultados (RNF-05).
- Cuentas internas ≠ cuentas de cliente; un usuario no acumula roles.
- El Operador interviene datos de cliente solo mediante una tarea administrativa registrada.

## 3. Planes (catálogo comercial)

| | Personal | Pro | Equipo | Institucional |
|---|---|---|---|---|
| Precio mensual | Q0.00 | Q45.00 | Q110.00 | Q450.00 |
| Almacenamiento | 15 GB | 100 GB | 350 GB | 2 TB |
| Máx. por archivo | 50 MB | 500 MB | 1 GB | 2 GB |
| Edición `.docx` | Solo lectura | Sí | Sí | Sí |
| Editores simultáneos | — | 3 | 5 | 5 |
| Consultas al agente | 20/mes | 500/mes | 2 000/mes | 10 000/mes |
| Historial con autoría | Sí | Sí | Sí | Sí |
| Versiones retenidas | 3 | 30 | 60 | 100 |
| Retención en papelera | 7 días | 30 días | 60 días | 90 días |

- Planes **por cuenta**; no hay organizaciones con administración delegada.
- Estos valores viven en la BD (semilla por migración) y se leen con `IPlanLimitsProvider` (valor `PlanLimits`). Nunca se escriben en código. Dinero en centavos, tamaños en bytes.
- El ambiente de demo usa cuotas reducidas: se valida que el control funcione, no se cargan 2 TB.
- Pagos 100 % simulados. Cambio de plan con efecto en el siguiente ciclo. Al vencer: cuenta en **solo lectura** sin perder contenido.

## 4. Formatos

| Formato | Guarda | Previsualiza | Edita en línea | Indexa |
|---|:-:|:-:|:-:|---|
| `.docx` | ✔ | ✔ | ✔ | ✔ (sección + párrafo) |
| `.pdf` | ✔ | ✔ | ✘ | ✔ si tiene capa de texto (página) |
| `.txt`, `.md` | ✔ | ✔ | ✘ | ✔ (línea) |
| `.xlsx`, `.pptx` | ✔ | ✔ | ✘ | Fase 3, «Debería» (hoja / diapositiva) |
| Imágenes | ✔ | ✔ | ✘ | Solo metadatos |
| Otros | ✔ | ✘ | ✘ | ✘ |

Un PDF escaneado sin texto se guarda y se busca por nombre; la ficha indica que no se pudo indexar.
El tipo real se valida por contenido (magic bytes), no por extensión (RF-14).

## 5. Módulos funcionales

- **Cuentas y accesos**: registro con enlace firmado y vigencia; recuperación con token de un uso que invalida sesiones; Argon2id; access token corto + refresh rotativo por dispositivo; sesiones revocables; aviso por dispositivo no reconocido.
- **Archivos y carpetas**: carga simple y por partes reanudable con progreso real; descarga por URL firmada; árbol jerárquico; papelera; versionado; cuota aplicada **antes** de subir con mensaje explicativo; medidor con desglose por tipo.
- **Compartición**: por usuario (lector/editor) y enlaces públicos con expiración, contraseña opcional y revocación; vista de accesos vigentes.
- **Suscripciones y pagos**: catálogo, comparador, contratación simulada, historial, facturas descargables, aviso de vencimiento, renovación automática y manual.
- **Edición colaborativa**: ONLYOFFICE sobre `.docx` original, presencia, límite de editores por plan; al cerrar sesión → nueva versión con participantes → reindexación.
- **Historial con autoría**: línea de tiempo (cuándo, quiénes, cuánto cambió), restauración registrada como acción.
- **Inteligencia documental**: extracción con procedencia → particionado sin cruzar ubicaciones → índice léxico + vectorial (pgvector) → respuestas en streaming con citas. Si no se puede ubicar un fragmento con certeza, la respuesta lo dice.
- **Optimizador**: solo PDF e imágenes; estima ahorro primero, no se ofrece si es marginal; valida que el resultado abra; conserva original restaurable.
- **Soporte con privacidad por diseño**: ve metadatos y estados, nunca contenido; cada consulta queda registrada para el cliente.
- **Operación**: tablero de estado y trabajos con reintento (RF-37), tres tableros Grafana (operación, negocio, agente), alertas.

## 6. Requisitos funcionales (línea base)

| ID | Requisito (resumen) | Prio. | Módulo | Fase |
|---|---|---|---|---|
| RF-01 | Registro con validación de correo por enlace con vigencia | Debe | auth | 1 |
| RF-02 | Recuperación con token de un uso que invalida sesiones | Debe | auth | 1 |
| RF-03 | Credenciales de vigencia limitada con renovación controlada | Debe | auth | 1 |
| RF-04 | Consultar/revocar sesiones; aviso por dispositivo no reconocido | Debe | auth | 1 |
| RF-05 | Cuatro roles según matriz; roles internos sin acceso a contenido | Debe | access | 1 |
| RF-06 | Admin gestiona cuentas, catálogo y ve métricas agregadas | Debe | admin | 1–2 |
| RF-07 | Bitácora de auditoría consultable por el cliente afectado | Debe | audit | 1 |
| RF-08 | Carga por partes reanudable con progreso en tiempo real | Debe | storage | 1 |
| RF-09 | Descarga por enlaces de vigencia limitada | Debe | storage | 1 |
| RF-10 | CRUD de carpetas jerárquicas | Debe | storage | 1 |
| RF-11 | Eliminación lógica con papelera y retención por plan | Debe | storage | 1 |
| RF-12 | Espacio consumido en tiempo real; bloquear exceso de cuota/tamaño | Debe | storage (quota) | 1 |
| RF-13 | Versiones de archivo restaurables según retención del plan | Debe | versioning | 2 |
| RF-14 | Validar tipo real por contenido | Debe | storage | 1 |
| RF-15 | Buscar por nombre, tipo, fecha y contenido | Debe | search | 2 (3 semántica) |
| RF-16 | Compartir con usuarios como lector o editor | Debe | sharing | 2 |
| RF-17 | Enlaces públicos con expiración, contraseña opcional, revocables | Debe | sharing | 2 |
| RF-18 | Ver y revocar accesos vigentes de un recurso | Debe | sharing | 2 |
| RF-19 | Catálogo con nombre, descripción, precio y vigencia | Debe | billing | 2 |
| RF-20 | Contratación con pago simulado e historial | Debe | billing | 2 |
| RF-21 | Factura descargable por transacción exitosa | Debería | billing | 2 |
| RF-22 | Renovación automática, manual anticipada y aviso previo | Debe | billing | 2 |
| RF-23 | Solo lectura al vencer, preservando contenido | Debe | billing | 2 |
| RF-24 | Cambio de plan efectivo en el siguiente ciclo | Debe | billing | 2 |
| RF-25 | Editar `.docx` en navegador sin conversión | Debe | editing | 2 |
| RF-26 | Edición simultánea con presencia hasta el límite del plan | Debe | editing | 2 |
| RF-27 | Previsualizar pdf, xlsx, pptx, texto e imagen | Debería | preview | 2 |
| RF-28 | Nueva versión al cerrar sesión con participantes + reindexar | Debe | editing / versioning | 2 |
| RF-29 | Historial de versiones con participantes y restauración | Debe | versioning | 2 |
| RF-30 | Indexar docx, pdf y texto con procedencia; informar estado | Debe | indexing | 3 |
| RF-31 | Indexar xlsx (hoja) y pptx (diapositiva) | Debería | indexing | 3 |
| RF-32 | Respuestas en lenguaje natural con cita exacta | Debe | agent | 3 |
| RF-33 | Recuperación restringida a archivos propios o compartidos | Debe | agent | 3 |
| RF-34 | Límite de consultas por plan | Debe | agent | 3 |
| RF-35 | Estimar ahorro antes de optimizar; no ofrecer si es marginal | Debe | optimizer | 3 |
| RF-36 | Reducir PDF/imagen validando integridad y conservando original | Debería | optimizer | 3 |
| RF-37 | Tablero de estado y trabajos con reintento para el Operador | Debe | ops | 3 |

## 7. Requisitos no funcionales (línea base)

| ID | Requisito (resumen) | Verificación |
|---|---|---|
| RNF-01 | p95 < 300 ms en consultas de UI (sin transferencia ni agente) | k6 |
| RNF-02 | Archivos hasta 2 GB, 25 usuarios concurrentes, 5 editores por doc | Prueba de esfuerzo |
| RNF-03 | Indexar 50 páginas < 60 s; primer fragmento del agente < 3 s | Corpus de prueba |
| RNF-04 | Hash resistente a hardware (Argon2id); todo sobre TLS | Revisión |
| RNF-05 | Aislamiento dentro de la consulta de datos | Pruebas de aislamiento bloqueantes |
| RNF-06 | URLs de descarga de 5 min a un objeto; IDs no predecibles | Revisión |
| RNF-07 | Origen aislado + descarga forzada; rate limit en operaciones sensibles | Cabeceras + prueba de exceso |
| RNF-08 | Claves de enlaces cifradas; intentos fallidos limitados y registrados | Fuerza bruta controlada |
| RNF-09 | Caída de indexación/optimizador/ONLYOFFICE no bloquea archivos | Degradación controlada |
| RNF-10 | Migraciones versionadas y reversibles | Prueba de reversión en CI |
| RNF-11 | Cobertura de lógica de negocio ≥ 60 % | Reporte en CI |
| RNF-12 | Todo en contenedores con paridad entre ambientes | Despliegue desde cero |
| RNF-13 | Usable desde 360 px, en español, contraste AA | Auditoría de accesibilidad |
| RNF-14 | Progreso en operaciones > 2 s; errores con acción correctiva | Revisión de flujos |
| RNF-15 | CI, staging y producción desde la misma imagen, recursos separados | Revisión de config |
| RNF-16 | Datos sintéticos fuera de producción, generados por script | Revisión de seed |
| RNF-17 | `correlationId` en toda bitácora; sin contenido, contraseñas ni tokens | Rastreo punta a punta |
| RNF-18 | Health checks, métricas, tableros y alertas | Demo + alerta de prueba |
| RNF-19 | Nada llega a producción sin CI verde y aprobación de otro integrante (ver nota) | Historial de PRs |
| RNF-20 | Rollback < 10 min redesplegando imagen previa | Ensayo documentado |
| RNF-21 | Respaldo diario de BD, versionado de objetos, restauración probada por fase | Registro de prueba |

**Nota sobre RNF-19 (cambio respecto de la propuesta, `workflow.md` §7).** En los PRs del diseñador principal, la
aprobación de otro integrante se sustituye por la verificación automática, `/review` sin bloqueantes y un comentario de
autoaprobación (§7.1). Hasta que el CI esté en `main` (desde el 30/09/2026), «CI verde» se sustituye por las
verificaciones locales con su resumen en el PR (§7.2). Los PRs del resto del equipo cumplen RNF-19 sin cambios.

### Alertas definidas
5xx > 2 % por 5 min · p95 > 300 ms por 10 min · > 50 trabajos pendientes o un trabajo reintentado 3 veces ·
disco > 80 % · caída de Postgres/Redis/MinIO/ONLYOFFICE · fallo del proceso de renovación.

## 8. Ambientes

| Ambiente | Uso | Despliegue | Datos |
|---|---|---|---|
| Local | Desarrollo | `docker compose up` | Semilla sintética |
| CI | Verificar cada cambio | GitHub Actions con servicios efímeros | Vacía; cada prueba crea lo suyo |
| Staging | Validar fase y ensayar demo | Automático desde `main` | Corpus sintético |
| Producción | URL pública para el docente | Manual desde etiqueta probada en staging | Usuarios de demostración |

Infra mínima producción: 4 vCPU, 8 GB RAM, 80 GB SSD (ONLYOFFICE ≈ 4 GB). Staging: 2 vCPU, 4 GB, ONLYOFFICE encendido solo cuando se necesita.

Proveedor y dominio (spec 000, D-3 a D-6): DigitalOcean (crédito del GitHub Student Pack), Droplets Ubuntu LTS con
Docker Compose; imágenes en `ghcr.io/afmatul/nimbo-{api,worker,web}`. Dominio `nimbo.me` (Namecheap, Student Pack) con
TLS de Let's Encrypt vía Traefik. Staging: `staging.nimbo.me` (web), `api.staging.nimbo.me` (api),
`docs.staging.nimbo.me` (ONLYOFFICE, bajo perfil), `s3.staging.nimbo.me` (MinIO para URLs firmadas, desde 005).
Producción (Fase 4): `nimbo.me` / `api.nimbo.me` / `docs.nimbo.me` / `s3.nimbo.me` en un Droplet separado.

## 9. Fuera de alcance (no implementar)

Edición en línea de `.xlsx`/`.pptx` · motor de atribución párrafo a párrafo y reportes de contribución ·
carpetas inteligentes · generación de documentos por el agente · optimización de documentos Office ·
organizaciones con administración delegada · OCR de PDF escaneados · cobro proporcional al cambiar de plan ·
API pública con emisión de llaves · apps móviles y cliente de escritorio · cifrado extremo a extremo ·
alta disponibilidad multi-región · certificaciones de cumplimiento · dinero real · TOTP · antivirus · compresión de video ·
segunda implementación de pagos.

## 10. Entregables del curso

Repositorio GitHub con acceso al docente · Documento de Requisitos (PDF) · Documento de Diseño (PDF: arquitectura,
UML, E-R, diseño de BD) · Manual Técnico (tecnologías, instalación, configuración, despliegue, rollback) ·
Manual de Usuario (registro, inicio de sesión, contratación, administración de recursos) · Sistema en URL pública
con credenciales por rol · Evidencia de pruebas y operación · Backlog de recortes · Exposición con defensa de arquitectura.

## 11. Glosario

| Término | Significado |
|---|---|
| Sesión de edición | Intervalo entre que el primer editor abre un `.docx` y ONLYOFFICE notifica que el documento está listo para guardar |
| Versión | Objeto inmutable en MinIO + registro en BD con participantes, tamaño y autor de la acción |
| Fragmento (`Chunk`, tabla `fragmento`) | Trozo de texto indexado con procedencia única (archivo, versión, página/sección-párrafo/línea) y `vector(768)` |
| Procedencia | Ubicación exacta de un fragmento dentro de su archivo |
| Actor | Quién ejecuta una operación (id + rol); lo reciben todos los servicios sobre datos de usuario |
| Nodos accesibles | Conjunto de archivos y carpetas que un actor puede ver (propios + compartidos + heredados); se calcula dentro de la consulta |
| Degradación a solo lectura | Estado de cuenta con suscripción vencida: puede ver y descargar, no subir ni editar |
