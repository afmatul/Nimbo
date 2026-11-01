# Spec 021 — Optimizador de imágenes

> Qué y por qué, en ≤ 150 líneas. El cómo va en `./plan.md` (obligatorio).

| Campo | Valor |
|---|---|
| Estado | En curso (implementación local); plan y enmienda de alcance aprobados por Adrián el 2026-10-26; T-09 humana pendiente |
| Dueño | Abel (3) |
| Fase | 3 |
| Requisitos | RF-35 (Debe) y RF-36 (Debería) para imágenes (el PDF es 021b); aplican RF-05, RF-07, RF-11, RF-12, RF-13, RF-14, RF-23, RF-29, RNF-05, RNF-07, RNF-09, RNF-13, RNF-14, RNF-17 |
| Depende de | 014 (versiones, historial y restauración), 014b (original conservado: cuota, `keptUntil` y purga), 005 (tipo real por contenido), 010 (solo lectura, PD-121), 003 (roles y aislamiento), 004 (auditoría) |
| Módulo | M7 `optimizer` |
| DF / PD / ADR | DF-21 (Aceptado, 014b), DF-22 (Abierto, para 022b); PD-121, PD-130, PD-156 (PD-124 queda fuera, §7); ADR-0013 (Aceptado), ADR-0037 (`sharp`, Aceptado) |
| Última actualización | 2026-10-29 |

## 1. Contexto y objetivo
Cuando el espacio se agota, hoy la única salida es pagar más (propuesta, «Espacio agotado»). Esta spec entrega el
optimizador para **imágenes JPEG y PNG**, archivo por archivo desde la ficha: **estima** cuánto se recupera y solo lo ofrece si el
ahorro no es marginal (RF-35); si el cliente confirma, recomprime la imagen **sin cambiar su formato ni sus dimensiones**,
verifica el resultado antes de reemplazar y conserva el original restaurable (RF-36; propuesta, «Optimizador de
almacenamiento»). El PDF se hace después en **021b** (decisión de Adrián, 2026-10-25) y WebP y GIF en esa u otra spec posterior (§7). Un fallo del optimizador nunca
bloquea los archivos (RNF-09).

**Qué se toma de 014 y 014b sin redefinirlo.** La optimización crea una versión nueva con origen «optimización»
(014 HU-7, CA-5). Lo que pasa con el original lo fija 014b (ADR-0013, DF-21): la versión optimizada debe ser
estrictamente menor; la anterior queda como **original conservado**, deja de contar en `espacio_usado` en la misma
transacción (sin exigir cuota libre), sigue restaurable hasta `keptUntil` (retención en papelera del plan vigente al
registrar) y después se purga sola. 021 consume esa política y no la cambia.

## 2. Historias de usuario
- **HU-1** Como cliente, quiero saber cuánto espacio recuperaría al optimizar una imagen, para decidir si lo hago.
- **HU-2** Como cliente, quiero que no se me ofrezca optimizar cuando el ahorro es mínimo o la imagen no se puede optimizar, para no arriesgar un archivo a cambio de casi nada.
- **HU-3** Como cliente, quiero optimizar una imagen en segundo plano sin que cambie lo que se ve, para recuperar espacio mientras sigo trabajando.
- **HU-4** Como cliente, quiero recuperar el original, para deshacer una optimización que no me sirve.
- **HU-5** Como cliente, quiero que un resultado dañado o inútil nunca reemplace a mi archivo, para no perder nada al optimizar.
- **HU-6** Como equipo, queremos que nadie estime ni optimice archivos ajenos y que los roles internos no lleguen al contenido, para cumplir el aislamiento (RNF-05).

## 3. Criterios de aceptación
> Códigos: los fija el plan (`OPTIMIZER_*`; los de nodos, versiones y solo lectura son los de 005, 014 y 010). Umbral y límites: RN-2 y RN-8.

### Estimar (HU-1, HU-2)
- **CA-1** (HU-1, RF-35, RNF-14) Dada una imagen propia (RN-1), cuando pido calcular el ahorro, entonces veo «Calculando el ahorro…» mientras se calcula en segundo plano y después el tamaño actual, el estimado y el ahorro en bytes y en porcentaje, sin que el archivo cambie.
- **CA-2** (HU-2, RF-35) Dada una estimación que no alcanza el mínimo de bytes **y** el mínimo de porcentaje (RN-2), entonces «Optimizar» no aparece y veo «El ahorro sería mínimo; no vale la pena optimizar esta imagen.».
- **CA-3** (HU-1, RN-1) — error: Dado un GIF, un WebP, un PDF, `.docx`, `.xlsx`, `.pptx`, texto, video u «otros», entonces la ficha no ofrece optimizar y, si se pide a la API estimar u optimizar, responde `422` `OPTIMIZER_UNSUPPORTED_TYPE` sin crear nada.
- **CA-4** (HU-1, RF-14) — error: Dado un archivo cuyo contenido real no es un JPEG ni un PNG aunque la extensión lo diga, cuando pido calcular, entonces se rechaza como en CA-3.
- **CA-5** (HU-2, RN-1, RN-8) Dada una imagen por encima del máximo de bytes o de píxeles decodificados, un PNG animado o una imagen que no se puede leer, cuando pido calcular, entonces no se ofrece y veo, sin error técnico y con un solo mensaje para todos esos casos, «No se puede optimizar esta imagen. Tu archivo no cambió.».

### Optimizar (HU-3, HU-5)
- **CA-6** (HU-3, RF-36, RNF-14) Dada una estimación que conviene, cuando confirmo, entonces la optimización corre en segundo plano, veo «Optimizando…» y puedo seguir usando Nimbo; mientras no llega a un estado final la ficha vuelve a consultar el estado, deja de hacerlo al llegar a uno y, si vuelvo a abrir la ficha, veo el último estado.
- **CA-7** (HU-3, RF-36, RF-29) Dada una optimización que termina bien, entonces el archivo conserva su `id` y nombre, la versión nueva (origen «optimización») es la actual, el historial la muestra con su tamaño y el cambio frente a la anterior (014 CA-6) y veo «Optimizamos tu imagen: ahorraste {bytes} ({porcentaje}).».
- **CA-8** (HU-3, RF-36, RN-6) Dada una imagen optimizada, cuando se compara con el original, entonces tiene el mismo formato real, las mismas dimensiones, la misma orientación efectiva, el mismo perfil de color si lo tenía y el canal alfa si lo tenía; en PNG los píxeles son idénticos.
- **CA-9** (HU-5, Art. XI.1) — error: Dado un resultado que no se puede leer o no cumple CA-8, entonces no se crea versión, el original sigue como actual y veo «No pudimos optimizar este archivo sin dañarlo. Tu archivo no cambió y puedes seguir usándolo como está.»; no se invita a repetir la misma optimización.
- **CA-10** (HU-5, RN-2) Dado un resultado real que no es menor que el original o no alcanza el umbral de RN-2, entonces se descarta sin crear versión ni ocupar espacio y veo «El ahorro real fue mínimo. Tu archivo no cambió.».
- **CA-11** (HU-5, Art. XI.1) — error: Dado que la versión actual cambia mientras se optimiza (reemplazo, edición o restauración), cuando termina, entonces el resultado se descarta, la nueva versión actual no cambia y veo «Tu archivo cambió mientras se optimizaba. No aplicamos la optimización; puedes calcular el ahorro de nuevo.».
- **CA-12** (HU-3, Art. XI.2) Dado el mismo trabajo entregado dos veces o «Optimizar» pulsado dos veces, entonces se registra una sola versión y hay una sola optimización en curso por archivo.
- **CA-13** (HU-3, RF-13) Dado un archivo en el límite de versiones retenidas de su plan, cuando voy a confirmar, entonces se me avisa qué versión se eliminará (igual que 014 CA-15; el original conservado ocupa un lugar, 014b RN-5).
- **CA-14** (HU-3, RNF-09) — error: Dado el optimizador caído o lento, entonces subir, descargar, navegar, editar y restaurar funcionan, y la operación queda fallida con «El optimizador no está disponible ahora. Tu archivo no cambió; vuelve a intentarlo más tarde.»; puedo volver a calcular el ahorro. El reintento por el Operador es de 022b.

### Original y espacio (HU-4)
- **CA-15** (HU-4, RF-12) Dada una optimización completada, entonces `espacio_usado` baja en (original − optimizada) sin exigir espacio libre (014b CA-1, CA-2) y el historial marca la versión anterior con «Original conservado hasta {fecha} · no ocupa tu espacio» (014b CA-4, PD-130).
- **CA-16** (HU-4, RF-13) Dado un original conservado, cuando lo restauro, entonces se aplican 014 CA-9 y CA-12 con 014b CA-5: versión nueva de origen restauración que **sí** cuenta en el espacio, o `422` `STORAGE_QUOTA_EXCEEDED` si no cabe.

### Cuenta, aislamiento y roles (HU-6)
- **CA-17** (HU-6, RF-23, RN-7) — error: Dada una cuenta en solo lectura por vencimiento, cuando el propietario pide calcular, entonces lo recibe como en CA-1; cuando confirma optimizar, entonces `403` `STORAGE_ACCOUNT_READ_ONLY` con el mensaje de 010 CA-13 y nada cambia.
- **CA-18** (HU-6, RF-11) — error: Dado un archivo en la papelera, cuando se calcula, optimiza o consulta, entonces `404` como 014 CA-16.
- **CA-19** (HU-6, RNF-05) Dados los clientes A y B, cuando B calcula, optimiza o consulta una imagen de A, entonces `404` idéntico salvo `correlationId`, resuelto dentro de la consulta (prueba de aislamiento).
- **CA-20** (HU-6, RF-05) — error: Dado un Administrador, Soporte u Operador, cuando llama cualquier ruta del optimizador, entonces `403` `SHARED_FORBIDDEN`; sin token, `401` `SHARED_UNAUTHENTICATED`.
- **CA-21** (HU-6, RF-07, RNF-17) Dada una optimización completada, descartada o fallida, cuando se revisan auditoría y bitácoras, entonces constan actor, archivo, optimización y versiones por UUID, bytes antes y después, resultado y `correlationId`, y **nunca** nombres de archivo, contenido, URLs firmadas, claves de objeto ni rutas temporales.

### Interfaz (RNF-13, RNF-14)
- **CA-22** (HU-1 a HU-4) Dada la ficha de una imagen JPEG o PNG, cuando la abro, entonces veo los 8 estados de §6 a 360 y 1440 px, en español y sin violaciones serias de axe.

## 4. Reglas de negocio
- **RN-1** Solo **JPEG y PNG**, decididos por el contenido real (RF-14), con las extensiones `png`, `jpg` y `jpeg` (005 plan D-9). GIF y WebP, estáticos o animados, no se ofrecen (§7); un PNG animado tampoco, porque recomprimirlo perdería los cuadros. PDF → 021b. Office y video, nunca.
- **RN-2** Estimar no cambia nada ni consume espacio. Se ofrece optimizar, y se registra el resultado, solo si el ahorro alcanza a la vez un mínimo de bytes **y** un mínimo de porcentaje, configurables (valores en el plan).
- **RN-3** El resultado es siempre una versión nueva con origen «optimización» del mismo archivo (mismo `id` y nombre); ninguna versión existente se sobrescribe (014 RN-2).
- **RN-4** Cuota, numeración, retención y original conservado: los de 014 (RN-1, RN-4) y 014b (RN-1 a RN-7). La optimizada debe ser estrictamente menor (014b RN-2) **y** superar RN-2; si no, no se registra.
- **RN-5** Solo el propietario estima y optimiza, como 014 RN-7.
- **RN-6** Sin conversión: el formato real y las dimensiones no cambian; se conservan la orientación EXIF y el perfil de color. El JPEG admite pérdida controlada (calidad en el plan); el PNG, solo sin pérdida.
- **RN-7** En solo lectura (010 RN-6, PD-121): calcular se permite porque no crea ni modifica contenido; optimizar se rechaza porque crea una versión.
- **RN-8** Límites configurables y únicos para todos los planes: tamaño en bytes, píxeles decodificados (ancho × alto) y tiempo de proceso (valores en el plan). Por encima, la optimización «no está disponible» (CA-5), nunca un error técnico.
- **RN-9** Cada optimización guarda su estado y su resultado; hay a lo sumo una en curso por archivo. La ficha muestra el último aplicable a la versión activa: una completada sigue visible mientras su versión resultante sea la actual; tras restaurar o reemplazar por otra, vuelve a «sin estimación», conservando el trabajo y el historial para poder calcular sobre la nueva versión.
- **RN-10** El estado se consulta mientras no es final, sin canal en vivo (decisión de Adrián; el porqué, en el plan).

## 5. Seguridad y privacidad
- **¿Toca datos de un cliente?** Sí, el contenido de sus imágenes → pruebas de aislamiento (CA-19).
- **Auditoría (RF-07)**: CA-21. **Nunca** en bitácoras: nombres, contenido, URLs firmadas, claves de objeto ni rutas temporales.
- **Roles internos**: `403` (CA-20); ninguno ve estimaciones ni resultados. El reintento por el Operador es de 022b.
- **Procesamiento**: una imagen maliciosa, corrupta, enorme o lenta termina en «no disponible» o en error con tiempo límite y no afecta a otros trabajos ni cuentas (RN-8).
- **Límite de tasa** en calcular y optimizar (RNF-07): cifra en el plan.

## 6. Experiencia de usuario
| Pantalla | Mockup (`docs/design/mockups/…`) | Estados requeridos (8) | Estado del mockup |
|---|---|---|---|
| Ficha de archivo (tarjeta «Optimizar espacio» e historial) | `storage/ficha-archivo/` (`ui-guidelines.md` §7) | 1 sin estimación · 2 estimando · 3 conviene · 4 confirmar (con aviso de poda) · 5 no conviene · 6 no disponible (un solo mensaje, CA-5) · 7 optimizando · 8 resultado final: completada (con «Original conservado hasta…» y el aviso efímero existente) o error (descartada, integridad o servicio no disponible, cada una con su mensaje) | Existe con 14 estados y capturas a 360 y 1440 px con axe sin violaciones (PD-156); la 021 usa 8 y agrupa el resto (§10). Solo lectura no es un estado: es el banner existente de 010 con «Optimizar» deshabilitado en «conviene» |

- Sin pantalla global ni entrada «Optimizador» en la barra lateral (P-3). Para tipos que no son imagen, la tarjeta no aparece.
- Mensajes clave (español, tuteo, con acción): los de CA-2, CA-5, CA-7, CA-9, CA-10, CA-11, CA-14 y CA-15 · confirmar: «Se creará una versión optimizada. El original se conserva hasta el {fecha} y no ocupa tu espacio.» · aviso de poda de 014 CA-15 · solo lectura de 010 CA-13.

## 7. Fuera de alcance
- **PDF → spec 021b**: Ghostscript para optimizar PDF, firmas digitales (P-6), PDF cifrados, validación de páginas y texto, la reindexación de la versión optimizada y el oyente de versiones en el `worker` (019 §7.7), y mover `ICommandRunner` a `shared` (DF-80).
- **WebP y GIF** (estáticos y animados) y el PNG animado: 021b o una spec posterior. 021 no los ofrece (RN-1, CA-3).
- **PD-124** (lector común de la versión vigente): 021 no lo extrae; su fachada lee como `EditableFileGateway` e `IndexableFileGateway` y la extracción queda para quien integre 017.
- Pantalla global de candidatos, lotes y ahorro acumulado (el mockup `optimizer/optimizador/`): spec futura.
- Aviso en vivo (canal de 015), cancelar una optimización en curso y optimización automática sin confirmación.
- Optimizar Office o video, OCR y conversión de formato (`product-context.md` §9).
- Cambiar reglas de 014 y 014b. Lista y reintento de trabajos por el Operador, alertas y métricas (022b, 022).

## 8. Supuestos
- Disponible en todos los planes: el catálogo (`product-context.md` §3) no lo limita.
- Solo JPEG y PNG (recorte del 2026-10-26): el spike de ADR-0037 sobre WebP animado y GIF estático queda como antecedente para la spec que los retome.
- La fachada que 021 necesita de `storage` (leer la versión vigente, registrar la optimizada con resultados explícitos, exportar la solo lectura) la implementa Abel con revisión de Adrián (PD-130, PD-121; autorización de Adrián, 2026-10-25). PD-124 queda fuera. No cambia el comportamiento de 014 ni de 014b.
- Si 012 concede al Editor «generar versiones» (014 RN-7 y D-5), se revisa RN-5.

## 9. Preguntas
- [RESUELTA 2026-10-25] **P-1** Política del original → 014b (original sin contar desde el registro, restaurable hasta `keptUntil`, purga automática; restaurar valida cuota) → §1, CA-15, CA-16, RN-4. Fuente: spec 014b, ADR-0013 y DF-21 (Aceptados).
- [RESUELTA 2026-10-25] **P-2** Umbral → mínimo de bytes **y** mínimo de porcentaje, configurables; el resultado real por debajo se descarta sin versión y con mensaje propio → RN-2, CA-2, CA-10. Fuente: Adrián.
- [RESUELTA 2026-10-25] **P-3** Experiencia → archivo por archivo desde la ficha; sin pantalla global ni lotes → §6, CA-22. Fuente: Adrián.
- [RESUELTA 2026-10-25] **P-5** (imágenes) Pérdida → JPEG con pérdida controlada; PNG sin pérdida; siempre formato, dimensiones, orientación y perfil → RN-1, RN-6, CA-8. (WebP y GIF salieron el 2026-10-26.) Fuente: Adrián. La parte de PDF pasa a 021b.
- [RESUELTA] **P-9** Solo lectura → calcular sí, optimizar `403` `STORAGE_ACCOUNT_READ_ONLY` → RN-7, CA-17. Fuente: 010 RN-6 y CA-13, PD-121 (2026-10-24).
- [RESUELTA 2026-10-25] **P-11** Límites → bytes, píxeles decodificados y tiempo, configurables y únicos; por encima, «no disponible» → RN-8, CA-5. Fuente: Adrián (valores medidos en el plan; la medición es compuerta del plan).
- [RESUELTA 2026-10-25] **P-12** Estado → consulta periódica mientras no es final, se detiene al llegar a uno y relee al abrir; sin canal en vivo → RN-10, CA-6. Fuente: Adrián.
- [MOVIDA A 021b] **P-6** PDF con firma digital: no aplica a imágenes; no bloquea 021.

## 10. Registro de cambios
| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-10-24 | Creación en `Borrador` con P-1 a P-12; revisión documental (P-9, P-11 y P-12 bloqueantes; supuestos P-4, P-7, P-8, P-10) | `/spec 021` y revisión del PR #77 | — |
| 2026-10-24 | P-9 resuelta por fuentes; PD-156; pulido de CA-8, CA-12, CA-13 y CA-17 | Revisión del PR #77 y auditoría de cierre | — |
| 2026-10-25 | 014b integrada: P-1 resuelta, ADR-0013 y DF-21 aceptados; de 7 a 6 preguntas bloqueantes | Incorporación de 014b | — |
| 2026-10-25 | **Alcance: solo imágenes; el PDF pasa a 021b.** P-2, P-3, P-5 (imágenes), P-11 y P-12 resueltas; P-6 movida a 021b; CA reescritos y renumerados (CA-5 no disponible, CA-10 descarte por ahorro real, CA-11 versión cambiada, CA-15 y CA-16 con 014b, CA-22 en la ficha); se quita la reindexación (las imágenes no se indexan, 019); RN-8 a RN-10; ADR-0037; plan y tareas | Decisiones de Adrián | Adrián (decisiones); plan pendiente |
| 2026-10-25 | WebP animado dentro de 021 (solo el GIF animado queda fuera, como decidió Adrián), con integridad de cuadros, tiempos y bucle (CA-8); límite por píxeles decodificados totales (RN-8); mensajes de límite sin cifras (CA-5); solo lectura y éxito con patrones existentes (§6) | Revisión del plan | — |
| 2026-10-25 | Spike de ADR-0037: WebP animado confirmado; GIF estático sin recompresión sin pérdida (supuesto en §8); mockup completo con capturas y axe (§6) | Spike y capturas | — |
| 2026-10-26 | **Lista.** Plan aprobado (con precisiones en plan §2 a §5 y la nota del mockup en tareas), ADR-0037 y DF-87 aceptados, excepción de ADR-0034 | Aprobación del plan | Adrián |
| 2026-10-26 | **Recorte de alcance.** (1) Solo JPEG y PNG: WebP y GIF, estáticos y animados, salen de 021 (RN-1, CA-3, CA-5, CA-8, RN-6, RN-8); se agrega el PNG animado como «no disponible» porque `sharp` leería solo su primer cuadro (T-03 lo confirma). (2) PD-124 fuera: la fachada lee como las otras dos y el lector común lo extrae quien integre 017 (§7, §8). (3) La interfaz baja a 8 estados y «no disponible» a un solo mensaje (CA-5, §6, CA-22). Plan y tareas ajustados | Pedido de reducir la complejidad | Aprobada (2026-10-26, en la rama de la spec) |
| 2026-10-28 | **T-08 cerrada sobre la imagen real de T-10 (ADR-0038).** `nimbo-worker` glibc, `worker` y `worker-optimizer` desde compose con 768 MiB y `memswap_limit` igual (sin swap). Reposo: 83 y 80 MiB. A2 reducido en `worker-optimizer` (JPEG 12 MP y PNG 36 MP, n=3): pico 424,1 MiB (44,8 % libre), PNG 36 MP en ~54 s (tope 100 s). Escenario C (indexación pesada sostenida en el general, 89 documentos, mientras el optimizador procesa PNG 36 MP RGB y RGBA, JPEG 36 MP y PNG 12 MP de 38 MB, n=3): general 543,9 MiB (29,2 %), optimizador 486,0 MiB (36,7 %). Con ONLYOFFICE activo (n=2): 527,6 MiB (31,3 %) y 490,8 MiB (36,1 %). OOM 0 y 0 reinicios en todas las series; `MemAvailable` mínimo del host 68,9 % (VM Docker de 11,6 GiB). Un solo consumidor por cola (`optimization` solo en `worker-optimizer`); libvips mapeada solo en ese proceso. SIGKILL al `worker-optimizer` a mitad de una estimación: compose lo reinicia en ~2 s, el trabajo se retoma y termina `estimada` una sola vez y el general sigue sano, sin reinicios, indexando. Los valores de plan §6 no cambian | Medición final de T-08 (ADR-0038) | — |
| 2026-10-28 | **T-08 repetida tras la auditoría previa al commit**, sobre la imagen nueva (`node:22.23.3-trixie-slim`, Ghostscript 10.05.1, `sharp` 0.35.5 / libvips 8.18.7; ADR-0038 y ADR-0037 enmendados) y con la confirmación que bloquea la versión vigente. Reposo: 83,0 y 76,9 MiB. A2 reducido: 427,7 MiB en `worker-optimizer` (44,3 % libre), PNG 36 MP en ~54 s. Escenario C (87 documentos pesados en el general): general 543,0 MiB (29,3 %), optimizador 478,0 MiB (37,8 %), `MemAvailable` mínimo 80,1 %. Con ONLYOFFICE activo: 527,4 MiB (31,3 %) y 466,5 MiB (39,3 %), `MemAvailable` mínimo 71,0 %, PNG 36 MP hasta 65,5 s (tope 100 s). OOM 0 y 0 reinicios. SIGKILL al `worker-optimizer` con una indexación activa en el general: compose lo reinicia, el trabajo se retoma y termina una vez, y el general sigue sano y sin reinicios. Los picos no cambian de forma significativa respecto de la imagen anterior | Auditoría previa al commit (sharp, base Debian) | — |
| 2026-10-28 | **Revisión independiente previa al commit (sin cambio de alcance).** Cierre ordenado: SIGTERM con una estimación PNG 36 MP activa espera el trabajo (48,4 s), lo termina (`estimada`, cola vacía) y sale; el `worker` general sin trabajo cierra en 0,56 s (`WorkerDrainModule`, `init: true`, `stop_grace_period` 90 s / 330 s). SIGKILL: compose reinicia el optimizador, el trabajo se retoma y termina una vez y el general no se reinicia. Un trabajo atascado más de `maxStalledCount` (BullMQ lo falla con `UnrecoverableError` sin agotar intentos) ahora queda `fallida(servicio_no_disponible)` en vez de en curso hasta la caducidad. `worker-optimizer` valida su propio entorno (PD-159, partes 1 a 3). No cambian la imagen base, `sharp`, `MALLOC_ARENA_MAX`, los límites ni la composición pesada: la T-08 del 2026-10-28 sigue vigente | Revisión independiente | — |
| 2026-10-28 | **Configuración por consumidor.** El general deja de validar variables del optimizador; el schema especializado queda en 17 claves. Los intentos los fija solo la API al encolar; ambos conservan el tiempo límite para sus consumidores reales (caducidad y sharp). Harnesses adaptados al schema especializado. Estado documental alineado a `En curso` (`workflow.md` §2); T-09 sigue pendiente. Inyección física mínima y enmienda Trixie/sharp siguen esperando decisión de Adrián; loopback preexistente registrado en PD-162. Sin cambio de retries, imagen, límites ni T-08 | Corrección local autorizada tras auditoría | — |
| 2026-10-28 | **Regresión focalizada de configuración:** Node 22.23.3; unitarias 194/194 (10 suites) + catálogo de entorno 8/8; integración 48/48 (bootstrap, salud especializada, estimate-worker, run y logs-and-audit); aislamiento solo optimizer 21/21. Typecheck, env:check, ESLint con cero avisos, Prettier focalizado, diff --check y compose config (base, apps y onlyoffice) correctos. Sin repetir T-08 ni baterías completas; T-09 humana y decisiones externas siguen pendientes | Verificación local de la corrección | — |
| 2026-10-28 | **Aprobación humana posterior a `7f9285ff`:** Matul/Adrián acepta A (node:22.23.3-trixie-slim, sharp 0.35.5/libvips 8.18.7, Ghostscript de Trixie y MALLOC_ARENA_MAX=2) sin cambiar C + glibc aprobada el 2026-10-27, y B (entorno físico mínimo explícito). B implementada: 17 claves derivadas del schema, sin env_file, rol nimbo_app y hosts postgres/redis/minio internos; prueba Compose ↔ schema y PD-159 cerrado. **No se enmienda ningún CA**: CA-19 de 000 exige catálogo completo, no inyección completa. Ghostscript es para 019/futuro 021b, no para JPEG/PNG. Las entradas anteriores conservan el estado previo a esta respuesta. Única tarea restante: T-09 humana de Abel; `/review 021` después de T-09 y estos ajustes, sin cerrar la spec | Resolución formal de las dos decisiones de auditoría | Matul/Adrián |
| 2026-10-28 | **Validación de A/B:** prueba Compose ↔ schema 6/6 (roja antes del cambio), catálogo 8/8, config/exports/composición 174/174, bootstrap 7/7 y salud especializada 3/3. El diagnóstico del teardown al apagar Redis encontró una Queue productora viva: su backend se cierra a la fuerza solo en la prueba; salud pasa también con detectOpenHandles. Typecheck, ESLint, Prettier, env:check y config de Compose correctos. Build real: sharp 0.35.5/libvips 8.18.7, gs 10.05.1 y glibc 2.41. Servicio real: healthy, live/ready 200, nimbo_app, solo optimization, 17 claves explícitas y cero secretos ajenos; detenido y retirado tras el humo. Sin repetir T-08 ni ejecutar review; T-09 humana pendiente | Verificación focalizada tras aprobación | — |
| 2026-10-29 | **Regresión detectada en T-09:** optimizar V1→V2 y restaurar V1→V3 dejaba el éxito anterior en la tarjeta incluso tras F5. Precisión de RN-9: la completada conserva su fila y sus versiones, pero solo describe la ficha mientras su resultado sea vigente; otra versión devuelve `null`. La tarjeta relee al cambiar la versión activa. Regresiones rojas antes del arreglo; después: dominio/servicio 89/89, UI 116/116, integración 45/45 (restauración y reemplazo con descargas byte a byte de V1/V2/V3, nueva estimación concurrente y cuota intacta) y aislamiento 21/21; typecheck API/web, ESLint y Prettier focalizados correctos. Sin cambios de contratos, esquema, retención ni cuota. T-09 humana sigue pendiente | Corrección local solicitada tras la prueba manual; CA-1, CA-6, CA-7, CA-15 y CA-16 | — |
