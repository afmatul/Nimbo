# Spec 019 — Indexación de documentos

> Qué y por qué, en ≤ 150 líneas. El cómo va en `./plan.md` (obligatorio).

| Campo | Valor |
|---|---|
| Estado | En revisión |
| Dueño | Adrián |
| Fase | 3 |
| Requisitos | RF-30, RF-31 (Debería), RNF-03, RNF-05, RNF-09, RNF-17. Casos de uso 07, 14, 37 |
| Depende de | 005 (archivo, versión vigente, tipo real), 014 (versiones y restauración), 003 (`Actor`, `accessibleNodes`), 015 (aviso en vivo). Sustituye el encolado directo que 016 ya hace (CA-12) por el evento `FileVersionCreated` (RN-11). Alimenta a 020 (agente) y 018 (búsqueda por contenido) |
| DF / PD | DF-07, DF-08, DF-14, DF-37; PD-18, PD-90 |
| Última actualización | 2026-10-23 |

## 1. Contexto y objetivo
Nimbo «entiende qué dicen por dentro» los archivos: cada documento de texto del cliente se lee en segundo plano y
queda preparado para responder con cita exacta (020) y buscarse por contenido (018). Cada fragmento recuerda su
procedencia (página, sección y párrafo, línea, hoja o diapositiva). El cliente ve en la ficha del archivo si ya
está indexado, si falló o si no se puede indexar. Un fallo o retraso de la indexación nunca bloquea subir, descargar
ni editar (RNF-09).

## 2. Historias de usuario
- **HU-1** Como cliente, quiero que mis `.docx`, `.pdf` y de texto queden indexados al subirlos, para poder consultarlos después.
- **HU-2** Como cliente, quiero que el índice siga a la versión vigente (edición, reemplazo, restauración), para no citar texto viejo.
- **HU-3** Como cliente, quiero ver el estado de indexación de cada archivo y por qué falló, para saber qué esperar y qué hacer.
- **HU-4** Como cliente, quiero que un fallo del indexador no afecte mis archivos, para seguir trabajando.
- **HU-5** Como cliente, quiero que mi contenido indexado solo sea alcanzable por quien ya puede ver el archivo.
- **HU-6** Como rol interno, nunca accedo al texto indexado de un cliente.

## 3. Criterios de aceptación
Estados de indexación de un archivo: `pendiente`, `indexando`, `indexado`, `no_indexable` (con motivo) y `fallido`.
- **CA-1** (HU-1, RF-30) Dado un `.docx` recién subido, cuando termina la indexación, entonces su estado es `indexado` y cada fragmento guarda archivo, versión y ubicación sección + párrafo.
- **CA-2** (HU-1, RF-30) Dado un `.pdf` con capa de texto, cuando se indexa, entonces cada fragmento guarda su página y ninguno mezcla páginas.
- **CA-3** (HU-1, RF-30) Dado un `.txt` o `.md`, cuando se indexa, entonces cada fragmento guarda su rango de líneas y ninguno mezcla ubicaciones distintas.
- **CA-4** (HU-1, RF-30) — error: Dado un PDF sin capa de texto (escaneado), cuando se procesa, entonces queda `no_indexable` con motivo «sin texto» y el archivo sigue disponible y buscable por nombre; no hay OCR (§9).
- **CA-5** (HU-1, RF-14) — error: Dado un archivo cuyo contenido real no corresponde a un formato indexable aunque la extensión lo diga, cuando se procesa, entonces queda `no_indexable` con motivo «formato no soportado» y no se crea ningún fragmento.
- **CA-6** (HU-1, RF-31) Dado un `.xlsx` o `.pptx`, cuando se indexa, entonces cada fragmento guarda su hoja o su diapositiva. Imágenes y otros formatos no entran a la cola ni muestran estado de error (solo metadatos, §4 del contexto).
- **CA-7** (HU-1, RNF-09) — error: Dado un archivo que supera el tope indexable, cuando se procesa, entonces queda `no_indexable` con motivo «demasiado grande» (DF-37) y sigue disponible.
- **CA-8** (HU-2, RF-30) Dado una nueva versión vigente (carga de reemplazo, edición 016 o restauración 014), cuando se registra, entonces el archivo pasa a `pendiente` y, al terminar, solo los fragmentos de esa versión son recuperables.
- **CA-9** (HU-2, RF-30) Dado el mismo trabajo de indexación entregado dos veces, o una versión ya indexada, cuando se procesa, entonces no se duplican fragmentos ni se vuelve a gastar proceso de embeddings.
- **CA-10** (HU-2, DF-08) Dado una versión reemplazada, cuando termina la reindexación, entonces los fragmentos anteriores dejan de existir y lo ya citado en conversaciones conserva su extracto (instantánea, lo fija 020).
- **CA-11** (HU-1, RNF-03) Dado un PDF de 50 páginas del corpus de prueba, cuando se indexa, entonces tarda menos de 60 s desde que el trabajo empieza.
- **CA-12** (HU-4, RNF-09) — error: Dado el proveedor de embeddings caído o lento, cuando se indexa, entonces el trabajo se reintenta automáticamente y, agotados los intentos (RN-6), queda `fallido` con motivo; subir, descargar, listar, editar y compartir responden con normalidad.
- **CA-13** (HU-3, RF-30) Dado un archivo `fallido`, cuando el propietario o un editor pulsa «Reintentar», entonces vuelve a `pendiente` y se reprocesa; un lector no ve la acción.
- **CA-14** (HU-3, RF-30) Dado un archivo en cualquier estado, cuando lo abro en su ficha, entonces veo el estado con el motivo cuando aplica; si cambia mientras la miro, se actualiza sin recargar.
- **CA-15** (HU-4, RF-11) Dado un archivo en la papelera, cuando se pide su contenido indexado, entonces no es recuperable; al restaurarlo vuelve sin reindexar si su versión no cambió; al purgarlo se eliminan sus fragmentos y su estado.
- **CA-16** (HU-4, RNF-09) — error: Dado un archivo purgado o versión eliminada por retención mientras se indexa, cuando el trabajo termina, entonces se descarta sin dejar fragmentos huérfanos ni marcar error.
- **CA-17** (HU-5, RNF-05, aislamiento) Dado A y B con archivos distintos, cuando se consultan fragmentos como B con filtro previo por `accessibleNodes(B)`, entonces no aparece ningún fragmento de A, ni con identificadores directos ni por similitud (`test/isolation`).
- **CA-18** (HU-5, RNF-05) — error: Dado un archivo ajeno sin acceso, en la papelera o inexistente, cuando pido su estado de indexación o reintentar, entonces se responde como inexistente (igual que 005 CA-16).
- **CA-19** (HU-5, RF-18) Dado un archivo compartido conmigo como lector, cuando lo abro, entonces veo su estado de indexación; si dejo de tener acceso, no veo nada.
- **CA-20** (HU-6, RNF-05) — error: Dado un Administrador, Soporte u Operador, cuando pide fragmentos, texto o estado por la API de cliente, entonces `SHARED_FORBIDDEN` y no se expone contenido; ninguna vista interna muestra texto indexado.
- **CA-21** (HU-4, RNF-17) Dado cualquier ciclo de indexación, cuando se revisa la auditoría y los registros técnicos, entonces constan identificadores, estado, motivo, duración y `correlationId`, y nunca texto, nombres de archivo, extractos ni vectores.
- **CA-22** (HU-4, RF-23) Dado una cuenta en solo lectura por suscripción vencida, cuando se necesita indexar su contenido ya guardado, entonces se indexa igual (no es una acción del cliente).
- **CA-23** (HU-4, RN-12) Dado archivos indexables sin estado de indexación (anteriores a 019 o con evento perdido), cuando el Operador ejecuta la tarea administrativa (o corre `pnpm seed`), entonces quedan encolados y terminan `indexado` sin acción del cliente; repetirla no duplica trabajo ni fragmentos y su ejecución consta en la bitácora técnica con conteos e identificadores, sin nombres ni texto.

## 4. Reglas de negocio
- **RN-1** Se indexa únicamente la **versión vigente** de cada archivo; las versiones anteriores no tienen fragmentos.
- **RN-2** Formatos y ubicación (contexto §4): `.docx` sección + párrafo; `.pdf` con texto, página; `.txt`/`.md`, línea; `.xlsx` hoja y `.pptx` diapositiva (RF-31, «Debería», cortable sin romper RF-30). El tipo se decide por el contenido real.
- **RN-3** Un fragmento nunca une texto de ubicaciones distintas y lleva siempre una procedencia única; si la ubicación no se puede fijar con certeza, el fragmento lo indica (confianza) para que 020 lo diga.
- **RN-4** Todo fragmento pertenece a un archivo y a una versión, y solo es alcanzable por quien tiene acceso al archivo (nodos accesibles, calculados en la consulta). Indexar no cambia permisos ni propietario.
- **RN-5** La indexación es asíncrona: nunca ocurre dentro de la petición de subida o edición (Art. IX.2) y su ausencia no falla el guardado (016 CA-12).
- **RN-6** Reintentos automáticos: 3 intentos con espera creciente; después `fallido` (alinea con la alerta de «trabajo reintentado 3 veces»). El valor es configurable.
- **RN-7** Tope indexable configurable por entorno, inicial 50 MB (DF-37). No varía por plan: los topes por archivo del catálogo (50 MB a 2 GB) rigen la carga, no la indexación.
- **RN-8** Indexar es trabajo de plataforma: no descuenta del cupo de consultas al agente (RF-34, es de 020) ni del almacenamiento del cliente.
- **RN-9** Dimensión, modelo y proveedor de embeddings viven detrás de puertos propios; la clave del proveedor solo existe en el backend.
- **RN-10** El mismo contenido (misma versión) no se reindexa; reprocesar una versión es idempotente.
- **RN-11** Disparo: cada versión vigente nueva (carga nueva o de reemplazo, edición, restauración, optimización) se anuncia con el evento `FileVersionCreated`, emitido por `storage` después del commit; la indexación lo consume. Perder el evento no deja archivos sin índice de forma permanente (conciliación, RN-12).
- **RN-12** Los archivos anteriores a 019 (demo, staging) y los que perdieron su evento se indexan con una tarea administrativa registrada que ejecuta el Operador, y con `pnpm seed`. El cliente no tiene botón para esto.

## 5. Seguridad y privacidad
- ¿Toca datos de un cliente? **Sí** → pruebas de aislamiento bloqueantes (CA-17, CA-18, CA-20) y política RLS sobre fragmentos e indexación.
- Auditoría (RF-07): indexación terminada, `no_indexable`, `fallido` y reintento manual, con ids y motivo. Nunca texto, nombres de archivo, extractos ni vectores (CA-21).
- Roles internos: sin acceso a fragmentos ni a texto (CA-20, Art. IX.1). Ven estados de trabajos solo en el tablero del Operador (022).
- Riesgos: fuga entre cuentas por similitud vectorial sin filtro previo (DF-14); texto de un documento enviado al proveedor de embeddings (se documenta en la Política de privacidad, 001 D-14); clave del proveedor en el navegador (prohibido); fragmentos huérfanos tras purga (CA-15, CA-16).

## 6. Experiencia de usuario
Rutas relativas a `docs/design/`. No hay mockup propio: el estado vive en la ficha del archivo (014), extendida con los 10 estados de 019 (README: `mockups/storage/ficha-archivo/README.md`; capturas: `capturas/storage/ficha-archivo/ficha-archivo--<estado>--<360|1440>.png`).
| Pantalla | Mockup | Estados requeridos | Estado del mockup |
|---|---|---|---|
| Ficha de archivo (estado de indexación) | `mockups/storage/ficha-archivo/ficha-archivo--<estado>.html` (extiende el de 014; `--vision` solo referencia) | `indexando`, `indexado`, `indexado-aviso`, `no-indexable` (+ `-formato`, `-grande`), `fallido` (+ `-reintentando`, `-error-reintento`), `solo-lectura-lector` | Borrador (2026-10-21, `ui-designer`): los 10 estados con capturas a 360 y 1440 px; lo aprueba el equipo |

- Mensajes clave (tuteo): «Indexando… ya puedes seguir trabajando», «Listo para consultar con el agente», «No pudimos leer el texto de este PDF. Se busca solo por nombre», «No pudimos indexar este archivo. Reintenta».
- Sin columna de indexación en el explorador (decisión previa de 005/014); sin panel del agente (020).

## 7. Fuera de alcance
- Agente, conversaciones, citas, cupo de consultas y recuperación híbrida de respuestas (020, RF-32 a RF-34). Búsqueda por contenido en la interfaz (018).
- OCR de PDF escaneados, optimizador (021), vista previa (017), tablero de trabajos y reintento por el Operador (022, RF-37).
- Botón de «Indexar todo» o de reindexado masivo para el cliente (P-6).
- Indexar versiones anteriores, imágenes (más allá de metadatos) o formatos no listados; edición en línea de `.xlsx`/`.pptx` (§9).
- Atribución por párrafo, carpetas inteligentes y cualquier otro elemento de §9.

## 8. Preguntas
- [RESUELTA] P-1 Disparo → se reindexa con cada versión vigente nueva (carga, edición, restauración, optimización) por el evento `FileVersionCreated`, que `FileVersionService` emite después del commit (PD-90); solo se indexa la vigente; el puerto de cola lo define el plan (PD-18) → RN-1, RN-11 (2026-10-21, Adrián)
- [RESUELTA] P-2 Formatos → RF-31 (`.xlsx` por hoja, `.pptx` por diapositiva) entra, como última tarea cortable → CA-6, RN-2 (2026-10-21, Adrián)
- [RESUELTA] P-3 Estado en pantalla → solo en la ficha del archivo (chip + banner con motivo, aviso en vivo por 015), sin columna en el explorador; el mockup de 014 se extiende con `/mockup` (pendiente antes de `Lista`) → §6 (2026-10-21, Adrián)
- [RESUELTA] P-4 Fallos → 3 reintentos automáticos y luego `fallido` con «Reintentar» para propietario y editor; el reintento del Operador es 022 → RN-6, CA-12, CA-13 (2026-10-21, Adrián)
- [RESUELTA] P-5 Tope indexable → único de 50 MB configurable, no por plan; se valida con el corpus de 50 páginas en staging → RN-7, CA-7 (2026-10-21, Adrián)
- [RESUELTA] P-6 Archivos previos a 019 → se indexan con una tarea administrativa registrada del Operador y con `pnpm seed`; sin botón para el cliente → RN-12, CA-23 (2026-10-21, Adrián)
- [RESUELTA] P-7 Papelera → los fragmentos se conservan hasta la purga y solo dejan de ser recuperables → CA-15 (2026-10-21, Adrián)

## 9. Registro de cambios
| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-10-21 | Creación en `Borrador` | `/spec 019` | — |
| 2026-10-21 | P-1 a P-7 resueltas con la recomendación de cada una; se agregan RN-11 (disparo por `FileVersionCreated`), RN-12 y CA-23 (archivos previos), y «Fuera de alcance» suma el botón masivo del cliente. Sigue `Borrador`: falta el plan aprobado y el mockup de la ficha | Respuestas de Adrián | Adrián |
| 2026-10-21 | Pasa a `Lista` con el plan aprobado. CA-19 queda sin verificar al cerrar 019 hasta que exista 012 (PD-123). Mockup de la ficha pendiente con `/mockup` | Aprobación del plan | Adrián |
| 2026-10-21 | Mockup de la ficha hecho (§6). Decisiones de UI: la ficha se implementa primero para la propietaria y la vista de lector llega con 012 (PD-123); `pendiente` e `indexando` comparten el chip «Indexando…»; el aviso «sin texto» sugiere reemplazar el archivo por una versión con texto (sin OCR). Ghostscript solo en CI y en `ambientes.md` (PD-128) | Respuestas de Adrián | Adrián |
| 2026-10-21 | Pasa a `En curso` con T-01 (fundaciones) | Inicio de la implementación | Adrián |
