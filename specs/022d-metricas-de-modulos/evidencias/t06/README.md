# T-06 (spec 022d): demo en local, resultados y evidencias

| Campo | Valor |
|---|---|
| Fecha | 2026-11-08, de 14:51 a 19:43 (hora de Guatemala, UTC−6), sobre `5a5dc5c8` |
| Ejecutó | Abel, con apoyo de Claude Code. La demo no cambió ningún archivo versionado; las correcciones posteriores se listan abajo |
| Estado | **Cerrada (Adrián, 2026-11-10).** CA-7 y CA-11 parciales; T-06 marcada en `tasks.md`. Ver «Decisiones» |
| Hallazgo principal | **H-2:** con el límite versionado de 256 MiB, Grafana sufrió un OOM. La demo solo fue estable con una adaptación local a 512 MiB |

Todas las horas de este documento son de Guatemala (UTC−6). Las de cada archivo están en su nombre, con el formato `AAAAMMDD-HHMMSS`. La numeración tiene huecos porque se quitaron archivos redundantes (ver «Archivos no incluidos»).

## Cómo se obtuvo la evidencia

La T-06 está designada como tarea **humana**, pero esta validación **se ejecutó con automatización**. Abel autorizó y revisó cada etapa; no hubo un recorrido manual completo de los cinco grupos. Si eso basta para la tarea es parte de las decisiones de abajo.

- **Capturas:** salen de Google Chrome real, controlado por el protocolo de depuración (CDP), una sesión cada vez. No hay mocks, respuestas inventadas ni imágenes editadas.
- **Modo de Chrome:** de la 02 a la 28, en modo sin ventana (`--headless=new`) con la página en estado visible. De la 31 a la 36 y de la 39 a la 44, con ventana real.
- **Tráfico:** contra el `api` real del entorno aislado, con scripts espaciados al menos 18 s para que `rate()` tuviera dos muestras. Además, un inicio de sesión, una carga y una descarga desde la web con Chrome (16:23:42 a 16:24:07). No se tocaron colas, Redis ni workers para provocar resultados.
- **Comprobaciones:** consultas reales a Prometheus y a la API de Grafana, con los resultados en los registros `.txt`.

## Ambiente

| Componente | Detalle |
|---|---|
| Máquina | Windows 11, Docker Desktop 29.8.1 sobre WSL2, Node 22.23.4 y pnpm 10.33.0 |
| Compose | Proyecto aislado `nimbo-022d-t06`, arrancado desde volúmenes vacíos (volumen de Grafana creado a las 14:49:47, registro 08). Las 48 migraciones se aplicaron solo en su base. Los proyectos de 021, 022 y 022c en la misma máquina no se tocaron: 37 contenedores sin cambios frente a la línea base |
| Observabilidad | Prometheus v3.15.0, Grafana 13.2.4, cAdvisor v0.60.6 y Mailpit v1.31.3 |
| Datos | Solo sintéticos, en el dominio `nimbo.local` |
| Cuentas de Grafana | `operador` (*Editor*) y `administrador` (*Viewer*). Sus contraseñas, aleatorias, quedaron solo en la máquina local |

## Adaptaciones locales

Ninguna está versionada. El repositorio sigue con sus valores.

| Adaptación | Valor en el ensayo | Valor del repositorio | Motivo |
|---|---|---|---|
| Memoria de Grafana | 512 MiB, desde las 15:41:10 | `mem_limit: 256m` | H-2 |
| Procesos Nest | `api`, `worker` y `worker-optimizer` con `nest start`, sin `--watch`, desde las 16:43:41 | `pnpm dev`, con `--watch` | H-6 |
| Puertos | Puertos propios en `127.0.0.1` (Grafana 23030, `api` 23000, web 23002) | 3030, 3000 y 3002 | No chocar con los otros proyectos de la máquina |
| Prometheus | Copia local de su configuración, en la que solo cambian los objetivos de `api`, `worker` y `worker-optimizer` | `infra/` | Los puertos aislados |
| Traefik | Sin socket de Docker, con rutas locales | `compose.yml` | Aislamiento |
| `index-reconcile` | `INDEX_RECONCILE_INTERVAL_MINUTES=5` | Valor por omisión | Ver varias ejecuciones durante la demo |
| Gemini | `GEMINI_API_KEY` vacía | Se configura por ambiente | La asignación permite la demo sin clave. Limita CA-7 y CA-11 |
| ONLYOFFICE | Sin perfil y `ONLYOFFICE_INTERNAL_URL` vacía | Perfil opcional | No interviene en esta spec |

## Estado por criterio

| CA | Estado | Resumen | Evidencia |
|---|---|---|---|
| CA-15 | ✅ Aprobado | Desde volúmenes vacíos, el tablero trae los cinco grupos sin pasos manuales | 02, 08 |
| CA-1 | ✅ Aprobado | Las diez rutas de identidad; `401` hasta el `429`; `403` por ruta | 09, 10, 11, 15 |
| CA-2 | ✅ Aprobado | Cargas iniciadas, reanudadas, completadas y rechazadas; enlaces; `429`. R-3 confirmado | 12, 13, 14, 15 |
| CA-7 | ⚠️ Parcial | Colas, profundidad y ejecución programada verificadas. **Ninguna indexación terminó bien** | 17, 20, 21, 22, 29, 39, 45 |
| CA-8 | ✅ Aprobado en su flujo | Estimación y optimización reales de JPEG y PNG, con códigos de error. **Sin fallos reales por intento** | 18, 23, 24, 25, 29, 40, 41, 45 |
| CA-11 | ⚠️ Parcial | Consultas, latencia y errores reales, incluido el `429` de tasa. **Ninguna respuesta del modelo** | 19, 26, 27, 28, 29, 42, 43, 44, 45 |
| CA-12 | ✅ Aprobado | Revisión formal de consultas, series y canarios | 38, 45 |
| CA-14 | ✅ Aprobado | Anónimo, Cliente, *Viewer* y *Editor* | 31 a 34, 36, 37 |

### Qué quedó sin comprobar

| CA | Sin comprobar | Motivo |
|---|---|---|
| CA-7 | Indexación exitosa con embeddings | Sin clave de Gemini, los 16 documentos terminaron en `fallido` |
| CA-7 | Incrementos reales de los intentos fallidos por número de intento | El fallo por falta de clave no se reintenta; los demás exigen caída de infraestructura |
| CA-7 | Profundidad `waiting` mayor que 0 en `indexing` | Solo se observó `active = 1`, en una recolección |
| CA-7 | Estado `no_indexable` | `complete` rechazó con `422` el ZIP que no era un DOCX, antes de encolar |
| CA-8 | Intentos fallidos reales | `OptimizationRunner` solo lanza errores transitorios: exigen una caída de infraestructura, que no se provocó |
| CA-11 | Respuesta real del modelo y su latencia | Sin clave ni archivos indexados |
| CA-11 | `503 AGENT_UNAVAILABLE`, `429` por cuota del plan y errores dentro del flujo | Sin archivos indexados se responde antes de llamar al modelo y no se descuenta cuota. Se verificó el `429` **de tasa**, que no es el de cuota |
| CA-14 | Guardado del *Editor* sobre el tablero aprovisionado | No se intentó, para no arriesgar `nimbo-operacion`. La demo T-09 de 022 ya registró `400` para ese caso |

## Cronología

| Hora | Evento | Evidencia |
|---|---|---|
| 14:51:16 | Tablero desde volúmenes vacíos, con los cinco grupos | 02 |
| 15:18:00 | **OOM de Grafana con 256 MiB** | 06 |
| 15:19:44 | Fallo de carga del tablero, unos 100 s después del reinicio | 05 |
| 15:41:10 | Grafana recreado con 512 MiB; cargas repetidas hasta las 15:49 | 08 |
| 16:03 a 16:29 | Tráfico de Identidad y Almacenamiento | 15 |
| 16:21:36 a 16:23 | Reinicios en cadena con `--watch` (H-6) | 15 |
| 16:31 a 16:35 | Capturas de Identidad y Almacenamiento | 09 a 14 |
| 16:43:41 | API y workers sin `--watch` | 29 |
| 16:44:56 a 16:54 | Tráfico de Indexación, Optimizador y Agente | 29 |
| 16:55:42 a 16:58:03 | Capturas de los tres módulos | 17 a 28 |
| 18:14:34 a 18:15:59 | CA-14: anónimo, *Viewer* y *Editor* | 31 a 34, 36, 37 |
| 18:19:13 | CA-12: revisión formal | 38 |
| 19:11 a 19:27 | Cobertura adicional: PNG, códigos de error, profundidad y agente | 45 |
| 19:28:29 a 19:31:11 | Capturas de la cobertura adicional | 39 a 44 |
| 19:33 a 19:39 | Medición controlada de la memoria de Grafana | 46 |

## CA-15: arranque desde volúmenes vacíos

Antes de generar tráfico, los paneles de los grupos muestran «No data», que es lo esperado.

![Cinco grupos del tablero tras el arranque limpio](02-ca15-grupos-de-modulos-20261108-145116.png)

## CA-1: Identidad

Tráfico real: registro, verificación, reenvío, inicio y renovación de sesión, cierre, cambio y recuperación de contraseña, y cierre de otras sesiones. Los intentos fallidos dieron la secuencia `401` ×5 y `429` ×3 ([registro 15](15-identidad-almacenamiento-trafico-20261108-163612.txt)).

![Grupo Identidad, paneles 16 a 19](09-ca01-identidad-paneles-16-19-20261108-163151.png)

![Panel 17: respuestas por ruta y código](10-ca01-panel-17-registros-20261108-163423.png)

![Panel 18: inicios de sesión 200, 401 y 429](11-ca01-panel-18-401-429-20261108-163439.png)

## CA-2: Almacenamiento

Cargas simples y por partes con reanudación, rechazos `422` (tamaño y tipo) y `409` (partes faltantes), descargas de archivo y de versión con integridad comprobada, y `429` en una ráfaga acotada. **R-3 confirmado:** la etiqueta real es `POST /api/v1/uploads`, sin barra final (captura 13).

![Grupo Almacenamiento, paneles 20 a 23](12-ca02-almacenamiento-paneles-20-23-20261108-163151.png)

![Panel 21: cargas por ruta y código](13-ca02-panel-21-etiqueta-cargas-r3-20261108-163455.png)

![Panel 22: enlaces de descarga emitidos](14-ca02-panel-22-descargas-20261108-163511.png)

## CA-7: Indexación (parcial)

| Elemento | Resultado |
|---|---|
| Carga | 16 DOCX sintéticos en total: 3 a las 16:45, 12 en dos tandas a las 19:18 y 19:19, y 1 de otra prueba |
| Estado real de los documentos | **Los 16 en `fallido`, motivo `proveedor_no_disponible`**, 0 fragmentos. **No se indexaron** |
| Cola `indexing` | 16 trabajos terminados y 16 ejecuciones |
| `index-reconcile` | Automático, sin disparo manual: 33 ejecuciones hasta las 19:27, cada 5 min desde las 16:44:52 |
| Panel 25 | Completados con datos; intentos fallidos en 0 |
| Panel 26 | `index-reconcile · delayed` en 1 (la próxima ejecución). **`indexing · active` en 1** en una recolección de la segunda tanda, hacia las 19:19 (captura 39) |
| Panel 27 | p95 de `indexing` ≈ 380 a 480 ms y de `index-reconcile` ≈ 95 ms en su valor habitual |

Para ver la profundidad, 6 cargas se completaron juntas justo antes de una recolección. Son cargas normales por la API; no se tocó la cola. La primera tanda no llegó a coincidir con una recolección y la segunda sí.

Los trabajos cuentan como terminados en BullMQ aunque el documento acabe en `fallido` (H-8). En la captura 21, dos series comparten color; el [registro 29](29-indexacion-optimizador-agente-20261108-165935.txt) aclara cuál vale 1. Ese registro recoge también el tráfico y los contadores de CA-8 y CA-11 de la primera ronda; el [registro 45](45-cobertura-adicional-modulos-20261108-194302.txt), los de la segunda.

![Grupo Indexación, paneles 24 a 27](17-ca07-indexacion-paneles-24-27-20261108-165542.png)

![Panel 25: completados y fallidos por intento](20-ca07-panel-25-completados-fallidos-20261108-165557.png)

![Panel 26: profundidad por estado](21-ca07-panel-26-profundidad-20261108-165613.png)

![Panel 27: ejecución p95](22-ca07-panel-27-p95-20261108-165629.png)

![Panel 26: indexing active en 1 durante la tanda de cargas](39-ca07-panel-26-active-indexing-20261108-192829.png)

## CA-8: Optimizador

| Elemento | Resultado |
|---|---|
| JPEG | 3 sintéticos de 3000×2000, unos 5,7 MB: 732.807, 731.592 y 733.450 bytes; ahorro del 87,1 %; mismas dimensiones; decodifican sin error |
| PNG | RGB de 1800×1200 y RGBA de 1600×1000, unos 6,4 MB: 28.011 y 27.748 bytes; ahorro del 99,5 %. **Píxeles idénticos al original**, alfa conservado, 2 versiones por archivo |
| Solicitudes | `estimate` `202` ×6 y `run` `202` ×5 |
| Códigos de error | `401` sin sesión, `404` archivo inexistente, `409` estimación vencida, `422` tipo no soportado y `429` de tasa (límite 10 por minuto) |
| PNG truncado | `estimate` `202`; estado `no_disponible`, motivo `ilegible`. El trabajo cuenta como completado |
| Cola `optimization` | 11 completados; intentos fallidos en 0 |
| Panel 31 | p95 ≈ 2,37 a 2,43 s en la primera ronda, con solo 6 observaciones |

Los gradientes sintéticos se comprimen mucho: el 99,5 % no representa fotografías reales. Las series de `401`, `422` y `409` coinciden en la captura 40; el registro 45 las separa.

![Grupo Optimizador, paneles 28 a 31](18-ca08-optimizador-paneles-28-31-20261108-165542.png)

![Panel 29: solicitudes por ruta y código](23-ca08-panel-29-solicitudes-20261108-165644.png)

![Panel 30: completados y fallidos por intento](24-ca08-panel-30-cola-20261108-165700.png)

![Panel 31: ejecución p95](25-ca08-panel-31-p95-20261108-165716.png)

![Panel 29 con los códigos de error](40-ca08-panel-29-codigos-20261108-192901.png)

![Panel 30 durante las optimizaciones de PNG](41-ca08-panel-30-png-20261108-192934.png)

## CA-11: Agente (parcial)

| Elemento | Resultado |
|---|---|
| Preguntas válidas | 28 con `200` en flujo SSE (eventos `delta` y `done`), con `outcome=no_indexed`. **No son respuestas del modelo** |
| Errores de validación | `422 AGENT_INVALID_QUESTION` ×4: 2 vacías y 2 demasiado largas |
| Otros códigos | `401` sin sesión ×2, `404 AGENT_SCOPE_NOT_FOUND` ×2 y `429 SHARED_TOO_MANY_REQUESTS` ×4 |
| Cuota | `used` sigue en 0 |
| Panel 33 | Hasta ≈ 5,96 consultas por minuto, con las dos ráfagas acotadas |
| Panel 34 | p50 ≈ 7 a 35 ms y p95 ≈ 10 a 48 ms. No representa la latencia del modelo |
| Panel 35 | 0 % con solo `200`, y entre 9 % y 100 % con errores. El 100 % se ve cuando en la ventana de 5 min solo quedan errores |
| Desglose por plan | Ninguno en consultas ni etiquetas (PD-203) |

El `429` observado es el del límite de 10 preguntas por minuto y cuenta, no el de cuota del plan. El panel 35 cuenta todo lo que no es `2xx`, así que el comportamiento del panel ante un `429` sí queda demostrado.

![Grupo Agente, paneles 32 a 35](19-ca11-agente-paneles-32-35-20261108-165542.png)

![Panel 33: consultas por minuto](26-ca11-panel-33-consultas-20261108-165731.png)

![Panel 34: latencia p50 y p95](27-ca11-panel-34-latencia-20261108-165747.png)

![Panel 35: proporción de respuestas con error](28-ca11-panel-35-errores-20261108-165803.png)

![Panel 33 con las ráfagas acotadas](42-ca11-panel-33-consultas-codigos-20261108-193007.png)

![Panel 34 en la segunda ronda](43-ca11-panel-34-latencia-codigos-20261108-193039.png)

![Panel 35 con 401, 404, 422 y 429](44-ca11-panel-35-errores-codigos-20261108-193111.png)

## CA-14: acceso

Resultados completos en el [registro 37](37-ca14-acceso-20261108-181559.txt), que menciona también una captura del *Editor* idéntica a la 33, no incluida.

| Perfil | Comprobación | Resultado |
|---|---|---|
| Anónimo | Tablero, búsqueda, fuentes de datos, proxy, consultas, usuarios, instantáneas | `401` en las 8 rutas |
| Anónimo | Abre el tablero, `viewPanel`, `/explore` y `/dashboards` | Redirige a `/login`, sin datos |
| Cliente | Cuenta sintética de Nimbo contra Grafana | `401` |
| Soporte | Sin cuenta | El servidor solo tiene `administrador`, `nimbo-admin` y `operador` |
| *Viewer* | Abre el tablero | 30 paneles, cinco grupos; `canSave` y `canEdit` en falso; sin botón de edición |
| *Viewer* | Guarda `nimbo-operacion` con el mismo contenido, o crea un tablero | `403` en ambos; versión sin cambios |
| *Editor* | Abre el tablero | 30 paneles, cinco grupos y consultas `200` |
| *Editor* | Tablero temporal, sin tocar `nimbo-operacion` | Creado, guardado (versión 2) y eliminado (`404` después) |

El *Editor* ve «Make editable» porque el tablero está aprovisionado; es una restricción del tablero, no del rol. Por eso su permiso se probó en un tablero temporal. El único «No data» con ambos roles es el panel 15 (PD-173). La captura 33 no distingue el rol por sí sola; lo hacen la 32, la 34 y el registro 37.

![Anónimo redirigido al inicio de sesión](31-ca14-anonimo-redirige-a-login-20261108-181440.png)

![Barra del tablero con Viewer, sin botón de edición](32-ca14-viewer-barra-del-tablero-20261108-181514.png)

![Los cinco grupos vistos con Viewer](33-ca14-viewer-cinco-grupos-20261108-181514.png)

![Barra del tablero con Editor, con Make editable](34-ca14-editor-barra-del-tablero-20261108-181552.png)

![Tablero temporal guardado por el Editor](36-ca14-editor-tablero-temporal-guardado-20261108-181558.png)

## CA-12: privacidad

Resultados completos en el [registro 38](38-ca12-privacidad-20261108-181913.txt). Su inventario de archivos es anterior a la selección de esta carpeta, por eso cita también archivos que no se incluyen. El registro 45 repite la revisión de etiquetas tras el tráfico nuevo: 0 valores con datos prohibidos.

| Comprobación | Resultado |
|---|---|
| Paneles 16 a 35 | 18 consultas, iguales en el repositorio y en Grafana |
| Etiquetas | Solo `job`, `route`, `status`, `queue`, `state`, `attempts_made` y `le` |
| Rutas citadas | 18 de 18 existen como plantilla en un controlador |
| Series `nimbo_*` desde las 14:30 | 991, sin correos, UUID, nombres de archivo ni tokens (el registro 45 cuenta 725, porque su ventana es de 2 h) |
| Valores de `route` | 33: 32 plantillas y `GET <sin patrón>` |
| Canarios del ensayo (IDs, correos, nombres, claves de objeto y secretos locales) | Sin coincidencias en etiquetas, `/metrics`, tablero ni registros |
| PD-203 (el registro 38 lo cita con su número anterior, PD-192) | Sin desglose por plan en consultas ni etiquetas |

**Limitaciones:**
- Se ejercitaron 33 rutas de las 90 declaradas.
- Las capturas se revisaron visualmente, sin OCR.
- Las series de cAdvisor quedan fuera de los paneles 16 a 35. Incluyen nombres de contenedor y un `boot_id`, que identifica el arranque del anfitrión y no a un usuario.

## Hallazgos

La demo no cambió nada. Después de ella solo se aplicaron las dos correcciones de ownership claro de 022d indicadas en H-5 y H-9. No se modificaron el runbook, los límites versionados ni el código de `apps/`. Tras la decisión de Adrián (2026-11-10) se aplicaron H-2 (`compose.yml`, ADR-0040) y H-9 (runbook §4); el código de `apps/` no cambió.

### H-2: OOM de Grafana con 256 MiB (prioritario)

**Qué pasó.** Con el `mem_limit: 256m` de `compose.yml`, el kernel mató a Grafana a las 15:18:00 con `Memory cgroup out of memory` (`anon-rss` de 234.964 kB, unos 229 MiB). Fue un OOM real, registrado en el [registro 06](06-h2-grafana-oom-20261108-152513.txt).

**Qué hizo la adaptación.** Con 512 MiB, en el entorno aislado, no hubo más OOM ni reinicios, pero **eso solo mitigó el problema durante el ensayo; no lo resuelve**:

Medidas con 512 MiB ([registro 08](08-grafana-512mib-estabilidad-20261108-154927.txt) y [registro 46](46-h2-memoria-grafana-medicion-20261108-200344.txt)):

| Medida | Qué mide | Resultado |
|---|---|---|
| Memoria anónima (`anon`) | Memoria del proceso que el kernel no puede descartar como caché | Máximo de 477,3 MiB, el 93 % del límite, con cargas simultáneas. En la medición secuencial, 412 a 464 MiB |
| Heap en uso (`heap_inuse`) | Heap de Go ocupado, incluida basura aún sin recolectar | 289 a 458 MiB en todas las ventanas, **también en reposo** (289, 437 y 314 MiB) |
| Memoria asignada | Lo que Go asignó en 30 s; es acumulado, no lo retenido | Reposo ≈ 5 MiB; 15 paneles ≈ 124 a 133 MiB (346 MiB en su primera carga); 35 paneles ≈ 208 a 211 MiB |
| Eventos de presión (`memory.max`) | Veces que el contenedor tocó su tope y el kernel tuvo que recuperar memoria | 57.922 a las 19:39: sigue llegando a su tope |
| Reinicios y `oom_kill` | Muertes del proceso | 0 con 512 MiB |
| `GOMEMLIMIT` | Límite suave del recolector de Go | **Sin configurar**, con `GOGC=100`: el recolector no conoce el límite del contenedor |

**Qué se puede afirmar.** Con 512 MiB, cargar 35 paneles asigna unas 1,6 veces lo que asignan 15, en las rondas 2 y 3. Pero asignar no es retener, y el heap ya estaba por encima de 256 MiB en reposo, tras cargas anteriores, así que esta medición no aísla el efecto de los paneles. **No está demostrado que los paneles nuevos causaran el OOM**: se midió con 512 MiB, no con 256, y son solo tres rondas.

**Sin demostrar:** la causa exacta, si 512 MiB bastan a largo plazo y cómo se comporta en staging. El Grafana de 022, en la misma máquina con 256 MiB, seguía con 0 reinicios, pero no recibió la misma carga, así que no sirve de comparación. La captura [05](05-h2-grafana-falla-al-cargar-tras-oom-20261108-151944.png) muestra un fallo de carga unos 100 s después del reinicio; la causa de ese fallo concreto tampoco está demostrada.

**Recomendación.**
- No dar por válidos los 256 MiB para el tablero de 35 paneles sin medirlos.
- Usar 512 MiB solo como valor provisional: el margen con cargas simultáneas fue del 7 %.
- Probar `GOMEMLIMIT` cerca del 90 % del límite como candidato. Es una hipótesis sin verificar.
- Cambiar el límite toca `compose.yml`, el runbook §1 y la prueba R-4 de `observability.spec.ts`, de 022, y debe registrarse en la spec.

### Consolidado

| # | Hallazgo | Evidencia | Impacto | Tipo | Estado | Recomendación |
|---|---|---|---|---|---|---|
| **H-2** | OOM de Grafana con 256 MiB | 05, 06, 08, 46 | **Alto** | Defecto probable de capacidad | ✅ Resuelto: `mem_limit: 768m` y `GOMEMLIMIT=690MiB` (plan R-8) | Medir en staging (PD-204) |
| H-1 | El runbook §2 borra volúmenes con nombres fijos (`nimbo_grafana_data`). Hoy no coincide con ninguno, pero coincidiría con un proyecto llamado `nimbo` | Runbook §2 y listado de volúmenes | Bajo | Discrepancia documental | ⏳ Pendiente; cambio preparado | Línea de 022: variable con el nombre del proyecto |
| H-3 | Grafana registra un error por no existir `provisioning/plugins`, una vez por arranque (15:41:15). No afecta al tablero | Registro de Grafana, no incluido | Bajo | Defecto menor | ⏳ Pendiente | Infra de 022: crear el directorio o aceptarlo |
| H-4 | Los paneles 1 y 2 muestran contenedores de otros proyectos de la máquina | Capturas 01, 04 y 07, no incluidas por esos nombres | Bajo | Limitación del ensayo | Sin acción | No aparece con un solo proyecto |
| H-5 | 6 de 90 casos de `observability.spec.ts` fallaban en Windows | Ver abajo | Medio | Defecto de portabilidad de las pruebas | ✅ 2 corregidos en 022d; ⏳ 4 de 022 con parche verificado | Aplicar el parche de 022 y confirmar en CI |
| H-6 | Reinicios en cadena con `nest start --watch`. **Causa no demostrada** | 15, 29 | Medio | Limitación del ensayo, causa sin determinar | ⚠️ Mitigado solo en local | Reproducir fuera de OneDrive |
| H-7 | Un evento único no eleva `rate()` (`session/refresh · 401` en 0) | 10, 15 | Bajo | Observación | Mitigado en el ensayo; cambio preparado | Avisar en el runbook §4 |
| H-8 | «Completados» de BullMQ incluye documentos que terminan en `fallido` | 20, 29, 45; plan 019, línea 41 | Bajo | **Observación de diseño, no defecto** | Documentado; cambio preparado | Aclararlo en el runbook; detalle en PD-201 |
| H-9 | El runbook §4 dice `503` o `422` sin clave o sin corpus, y el plan R-6 dice `503` sin clave; sin archivos indexados lo real es `200 no_indexed` | 26 a 29, 42 a 45; spec 020, CA-7 | Medio | **Discrepancia documental** | ✅ R-6 y runbook §4 corregidos | — |
| H-10 | El runbook §5 cita el estado `failed` en el panel 7; el colector solo mide `waiting`, `prioritized`, `active` y `delayed` | 38 | Bajo | **Discrepancia documental** | ⏳ Pendiente; cambio preparado | Línea de 022: corregir la fila |

**H-5.** Fallaban dos casos de 022d («CA-12: cada ruta citada…» y «R-2: el lector de controladores…») y cuatro de 022 T-01 («CA-10: Grafana monta el aprovisionamiento…» y «Prometheus lee su configuración…», en `base` y en `local`). Todos por el separador `\` de Windows.
- **022d:** corregida la expresión del filtro de `declaredRoutes`, de autoría 022d. Ahora pasan 86 de 90.
- **022:** no se modificaron esos casos. El parche propuesto cambia tres aserciones para aceptar `/` o `\` sin relajar la ruta exigida. Verificado en una copia temporal: 90 de 90. No se ejecutó en CI Linux.

**H-6.** Entre las 16:21:36 y las 16:22:59, `nest start --watch` detectó cambios 15 veces y los objetivos estuvieron caídos unos 90 s. Las detecciones coinciden al segundo en los tres procesos, lo que apunta a un evento común. Una búsqueda en todo el worktree, incluido `node_modules`, no halló archivos ni directorios con fecha en esa ventana fuera de `apps/web/.next`, y el primer archivo de `.next` es posterior a la primera detección. Una segunda compilación web no lo reprodujo. Hubo otras detecciones a las 16:41:30 y 16:41:31, poco antes de pasar a `nest start`. Sin `--watch` hubo 0 detecciones. Límite: un archivo escrito después pierde su fecha anterior. El repositorio está dentro de OneDrive, pero **eso no demuestra la causa**.

**H-9.** R-6 también indicaba que el optimizador necesita la clave de Gemini; CA-8 funcionó sin ella. Corregido en `plan.md`.

**H-10.** Esa fila pertenece a 022, no a los paneles nuevos.

## Decisiones (Adrián, 2026-11-10)

1. **H-2:** se resuelve en 022d. Grafana pasa a `mem_limit: 768m` con `GOMEMLIMIT=690MiB` (ADR-0040, plan R-8). El
   pico real se mide en staging (PD-204).
2. **Tarea humana:** la validación automatizada de esta demo cuenta como la demo de T-06.
3. **Cierre parcial:** CA-7 y CA-11 se cierran parciales; lo no comprobado (§«Qué quedó sin comprobar») se debe a la
   falta de clave de Gemini, que el plan R-6 permite.
4. **Integración:** 022 ya está en `main` (#78). La rama se rehízo (`feat/022d-tableros-de-modulos`, PR #106) sobre `main` con
   solo los commits de 022d y va en un PR propio; el #92 queda reemplazado. Los pendientes de 022d pasan a PD-201 a
   PD-203 (el registro 38 conserva el número con el que se capturó).
5. **T-06:** completada en `tasks.md`.

Sin decidir y fuera del cierre: H-1, H-3, H-5 (los 4 casos de 022), H-7, H-8 y H-10, con cambios preparados por Abel (PD-205).
H-9 se corrigió en el runbook §4 junto con H-2.

## Archivos no incluidos

Se dejaron fuera por redundantes o por llevar identificadores técnicos prescindibles: 01, 03, 04, 07, 16, 30 y 35. Se conservan fuera del repositorio. El registro 08 cita la captura 07, que mostraba el tablero tras la adaptación.

## Estado final de los servicios

Al cierre (19:43), los 8 servicios de `nimbo-022d-t06` seguían en marcha, los 4 objetivos de Prometheus en `up`, y `api`, web y workers respondían `200`. Grafana tenía 0 reinicios y 0 OOM desde la adaptación. Los proyectos de 021, 022 y 022c no cambiaron: 37 contenedores iguales a la línea base.
