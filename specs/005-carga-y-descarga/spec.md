# Spec 005 — Carga y descarga de archivos

| Campo | Valor |
|---|---|
| Estado | En revisión (2026-10-07) — antes: Lista (2026-09-28), spec aprobada por Adrián; [`plan.md`](./plan.md) aprobado por `architect` (segunda pasada) y confirmado por Adrián |
| Dueño | Adrián (1) |
| Fase | 1 |
| Requisitos | RF-08, RF-09, RF-14, RNF-06, RNF-07 (principales); aplican RF-07, RF-12 (parcial), RNF-05, RNF-13, RNF-14, RNF-17 |
| Depende de | **003** (`Actor`, guards, `accessibleNodes`, RLS de `archivo`, `version_archivo` y `carga` que se escriben en el PR de 005, D-1 y D-7 de 003); **006a** (solo su implementación de `IPlanLimitsProvider`: 005 declara el puerto y `PlanLimits`, DF-51 opción A; mientras tanto, doble de prueba); **001** (`IRateLimiter`, `TooManyRequestsError`, `ZodValidationPipe`). **004 llega después de 005**: 005 declara el puerto `IAuditLogger` con un adaptador provisional (bitácora técnica sin datos sensibles) que 004 sustituye |
| Módulo | M2 `storage` |
| DF | DF-06, DF-16, DF-38, DF-52 (se cierran en el plan); **DF-51 resuelto** (opción A, Fátima, 2026-09-28: `storage` declara `IPlanLimitsProvider`/`PlanLimits`; `billing` lo implementa); DF-17 y DF-33 (resto) no bloquean. La contradicción «progreso en tiempo real» (RF-08 / `architecture.md` §7.1 con `realtime`) quedó **resuelta** (DF-58): el progreso se mide en el cliente |
| Última actualización | 2026-10-07 |

## 1. Contexto y problema

Nimbo es una nube: sin poder subir y bajar archivos no hay producto. Subir un archivo de cientos de MB en una sola
petición falla con cortes de red y castiga al servidor; bajarlo con un enlace permanente es un riesgo de privacidad.
Además, el cliente debe saber **antes** de subir si el archivo cabe en su plan, y Nimbo debe garantizar que lo que se
guarda es lo que dice ser. Esta spec entrega la carga (simple y por partes reanudable), la validación de límites y de
tipo real, y la descarga temporal, todo sobre el espacio de un solo propietario.

## 2. Objetivo

Un cliente sube archivos a la raíz de su espacio (con progreso visible y reanudación de las cargas grandes), recibe un
rechazo explicado si excede su plan o si el archivo no es de su tipo declarado, y descarga sus archivos por un enlace
firmado que dura 5 minutos, apunta a un solo objeto y fuerza la descarga. Ninguna cuenta alcanza cargas o archivos de otra.

## 3. Actores

- **Cliente**: sube y descarga sus archivos (propietario; la compartición ampliará luego «quién descarga» sin cambiar esta spec).
- **Administrador, Soporte, Operador**: no suben ni descargan (`403 SHARED_FORBIDDEN`); ven a lo sumo metadatos (003).
- **Sistema (trabajo programado)**: expira las cargas (simples o por partes) que pasan 24 h sin completarse, limpia sus partes u objeto y libera su reserva de cuota.
- **Visitante**: sin sesión no llega a ninguna ruta de esta spec (`401`).

## 4. Historias de usuario

- **HU-1** Como cliente, quiero subir un archivo a mi espacio y ver cuánto falta, para saber que se está guardando.
- **HU-2** Como cliente, quiero pausar, reanudar o cancelar cualquier carga (simple o por partes), y que las grandes se reanuden donde quedaron si se corta la red, para no empezar de cero.
- **HU-3** Como cliente, quiero saber antes de subir si el archivo supera mi tamaño máximo o mi espacio, y qué hacer.
- **HU-4** Como cliente, quiero que Nimbo rechace un archivo que finge ser de otro tipo, para no guardar contenido engañoso.
- **HU-5** Como cliente, quiero decidir qué pasa si ya tengo un archivo con ese nombre.
- **HU-6** Como cliente, quiero descargar mis archivos con un enlace que caduque y que solo sirva para ese archivo.
- **HU-7** Como equipo, queremos que ninguna cuenta complete, reanude o descargue cargas o archivos de otra.

## 5. Criterios de aceptación

> Dado/Cuando/Entonces breves. Los valores (tamaño máximo, cuota) salen de `PlanLimits` vía `IPlanLimitsProvider`
> (catálogo de `product-context.md` §3), nunca del código. Los códigos de error siguen el patrón `STORAGE_*` (003 D-6).

### Carga: inicio, límites y nombre (HU-1, HU-3, HU-5)

- **CA-1** (HU-1, RF-08) — carga simple
  - **Dado** un cliente con sesión y un archivo pequeño (por debajo del umbral de configuración, fijado en el plan, RN-2),
  - **Cuando** inicia y completa la carga,
  - **Entonces** existe el archivo en la raíz de su espacio, con `tamano_bytes` real, y aparece en el explorador; la
    carga queda `completada`.
- **CA-2** (HU-1, HU-2, RF-08) — carga por partes
  - **Dado** un archivo por encima del umbral,
  - **Cuando** inicia la carga,
  - **Entonces** recibe una sesión de carga con URLs firmadas por parte, sube las partes directo al almacenamiento de
    objetos y, al completar, el archivo existe íntegro (mismo tamaño y mismo orden de bytes que el original).
- **CA-3** (HU-3, RF-08, RF-12) — tamaño máximo por archivo
  - **Dado** un cliente cuyo plan permite un máximo por archivo (p. ej. Personal 50 MB, Equipo 1 GB según catálogo),
  - **Cuando** inicia la carga de un archivo mayor,
  - **Entonces** se responde `422` `STORAGE_FILE_TOO_LARGE` con el mensaje «Este archivo pesa {tamaño} y tu plan permite hasta {máximo} por archivo. Reduce su tamaño o cambia de plan.», no se crea sesión ni objeto.
- **CA-4** (HU-3, RF-12) — cuota total
  - **Dado** un cliente con `espacio_usado` + reservas activas + tamaño declarado > cuota del plan,
  - **Cuando** inicia la carga,
  - **Entonces** se responde `422` `STORAGE_QUOTA_EXCEEDED` con el mensaje «Te faltan {bytes faltantes} de espacio para subir este archivo. Libera espacio o cambia de plan.», sin sesión, reserva ni objeto. La validación de CA-3 y CA-4 ocurre en el inicio, antes de transferir bytes.
  - **Y** el aviso ofrece la acción «Liberar espacio», que lleva al Resumen de espacio (spec 007) y, mientras 007 no exista, a Mis archivos; y la acción secundaria «Ver planes», que se oculta mientras la spec 008 (catálogo) no exista.
- **CA-5** (HU-3, HU-1) — tamaño real verificado al completar
  - **Dado** una carga cuyos bytes reales exceden el tamaño declarado o el máximo del plan,
  - **Cuando** se intenta completar,
  - **Entonces** el objeto se elimina, la carga queda `rechazada` con motivo `tamaño`, no se registra archivo ni se suma espacio, y se responde `422` `STORAGE_UPLOAD_SIZE_MISMATCH` (o `STORAGE_FILE_TOO_LARGE`, con el mensaje de CA-3, si lo que se excede es el máximo del plan). El texto de `STORAGE_UPLOAD_SIZE_MISMATCH` es «El archivo cambió durante la carga. Vuelve a subirlo.»
- **CA-6** (HU-5, decisión 6) — nombre repetido
  - **Dado** que el cliente ya tiene en su raíz un archivo con el mismo nombre (sin distinguir mayúsculas; los archivos en la papelera no cuentan),
  - **Cuando** inicia la carga,
  - **Entonces** se responde `409` `STORAGE_NAME_CONFLICT` con las opciones «Conservar ambos» y «Cancelar»; con «Conservar ambos» el archivo nuevo se guarda como «nombre (1).ext» (o «(2)», «(3)»… el primer número libre); con «Cancelar» no se crea nada. No existe «Reemplazar».
  - **Y** el diálogo («¿Conservar ambos archivos?») muestra el nombre con el que se guardará, con el foco inicial en «Conservar ambos», y el panel de cargas indica el nombre final de la fila.
  - **Y** si una misma selección trae varios nombres repetidos, se muestra un diálogo por archivo, con la casilla «Aplicar a los demás», que aplica la respuesta elegida («Conservar ambos» o «Cancelar») al resto de los repetidos.
  - **Y** si dos cargas simultáneas comparten nombre, la que completa en segundo lugar se guarda con «(1)». El «(n)» lo calcula el servidor (plan D-4).
- **CA-7** (HU-1, RF-08) — entrada inválida
  - **Dado** un inicio con nombre vacío o con separadores de ruta, tamaño no entero o negativo, o campos faltantes,
  - **Cuando** se envía,
  - **Entonces** se responde `400` `STORAGE_INVALID_UPLOAD_REQUEST` con el campo en falla (`fields`) y no se crea nada. (Se mantiene `400` por decisión de Adrián, aunque la convención de 001 usa `422` para entrada inválida.)
  - **Y** con tamaño 0 se responde `422` `STORAGE_EMPTY_FILE` con «El archivo está vacío. Revisa que tenga contenido y súbelo de nuevo.»; tampoco se acepta que al completar el objeto tenga 0 bytes.

### Reanudación, pausa, cancelación y limpieza (HU-2)

- **CA-8** (HU-2, RF-08) — reanudar en la misma pestaña
  - **Dado** una carga interrumpida (corte de red) o pausada, con menos de 24 h desde su inicio y la misma pestaña abierta,
  - **Cuando** el cliente reanuda (automáticamente tras el corte o con «Reanudar»),
  - **Entonces** en una carga por partes se consulta qué partes están completas y solo se suben las faltantes; una carga **simple** pausada empieza de cero. En ambos casos, al completar, el archivo es idéntico al original.
  - **Y** durante el corte el panel se titula «Carga en espera» con «Se cortó la conexión. Tu carga se reanudará donde quedó. No cierres ni recargues esta pestaña.»
  - **Y** si la pestaña se cierra o se recarga, la carga no se recupera desde la interfaz (no hay lista de «cargas pendientes») y expira a las 24 h (CA-9).
- **CA-9** (HU-2, decisión 7) — expiración a las 24 h
  - **Dado** una carga (simple o por partes) sin completar 24 h después de iniciada (RN-7),
  - **Cuando** corre la limpieza o se intenta reanudar,
  - **Entonces** la sesión pasa a `expirada`, las partes u objeto se eliminan del almacenamiento, se libera su reserva de cuota (CA-23), y reanudar responde `410` `STORAGE_UPLOAD_EXPIRED` con «Esta carga caducó. Vuelve a subir el archivo.»; la interfaz reutiliza el aviso de rechazo de la fila, con el botón «Subir de nuevo», que abre el selector de archivos.
- **CA-10** (HU-2, RF-08) — completar con partes faltantes
  - **Dado** una sesión con partes faltantes,
  - **Cuando** se intenta completar,
  - **Entonces** se responde `409` `STORAGE_UPLOAD_INCOMPLETE` y la sesión sigue reanudable dentro de su plazo.
- **CA-22** (HU-2, RF-08) — pausar y cancelar
  - **Dado** una carga en curso, simple o por partes,
  - **Cuando** el cliente la pausa, no se suben más bytes y la reserva se mantiene; con «Reanudar» sigue (CA-8; la simple empieza de cero);
  - **Y cuando** la cancela, la interfaz pide confirmación solo si ya se subió más de 0 %; con 0 % cancela directo. Mientras el diálogo de confirmación está abierto, la carga queda en pausa; con «Seguir subiendo» se reanuda. Al cancelar, la sesión pasa a `cancelada`, se eliminan las partes u objeto, se libera la reserva y no se registra archivo ni se suma espacio; cualquier intento posterior de completarla responde `404` `STORAGE_UPLOAD_NOT_FOUND`.
  - **Y** la fila muestra «Cancelaste esta carga. Liberamos el espacio que tenía reservado.»

### Validación de tipo real (HU-4)

- **CA-11** (HU-4, RF-14, decisión 3) — firma contradice la extensión
  - **Dado** un archivo `.docx`, `.pdf`, `.xlsx`, `.pptx` o imagen cuya firma real no corresponde (`.docx`/`.xlsx`/`.pptx` deben ser ZIP con estructura OOXML del tipo correcto), o un `.txt`/`.md` que no es texto UTF-8 válido,
  - **Cuando** se completa la carga,
  - **Entonces** el objeto se elimina, la carga queda `rechazada` con motivo `tipo inválido`, no se crea `archivo`
    ni se suma espacio, la reserva se libera, y se responde `422` `STORAGE_INVALID_FILE_TYPE` con «Este archivo no es un {extensión} válido. Comprueba que sea el archivo correcto.»
- **CA-12** (HU-4, RF-14) — tipo coherente y «otros»
  - **Dado** un archivo cuyo contenido coincide con su extensión (formatos de §4 de `product-context.md`), o un archivo de extensión «otros» que no es ejecutable,
  - **Cuando** se completa,
  - **Entonces** se guarda con su tipo detectado; los «otros» se aceptan sin validar firma.
- **CA-24** (HU-4, RF-14, decisión 1) — ejecutables siempre rechazados
  - **Dado** un archivo cuya cabecera es un ejecutable (PE, ELF o Mach-O), con cualquier extensión,
  - **Cuando** se completa la carga,
  - **Entonces** se rechaza igual que en CA-11, con `STORAGE_INVALID_FILE_TYPE` y «No se permiten archivos ejecutables. Sube otro archivo.»

### Descarga (HU-6, RF-09, RNF-06, RNF-07)

- **CA-13** (HU-6, RF-09, RNF-06) — URL firmada
  - **Dado** un cliente propietario de un archivo,
  - **Cuando** pide descargarlo,
  - **Entonces** recibe una URL firmada válida 5 minutos, que apunta a **un solo objeto**; el identificador del archivo es un UUID no predecible; pasados los 5 minutos la URL deja de servir.
- **CA-14** (HU-6, RNF-07) — origen aislado y descarga forzada
  - **Dado** una URL de descarga emitida,
  - **Cuando** el navegador la abre,
  - **Entonces** el host es el origen de objetos aislado de la web y la API (no comparte cookies ni origen con la app) y la respuesta lleva `Content-Disposition: attachment`; el archivo no se ejecuta ni se muestra dentro de la app.
- **CA-15** (HU-6) — descarga íntegra
  - **Dado** un archivo cargado,
  - **Cuando** se descarga con su URL,
  - **Entonces** los bytes coinciden con los subidos y el nombre sugerido es el del archivo.

### Aislamiento, roles y solo lectura (HU-7, RNF-05)

- **CA-16** (HU-7, RNF-05, 003 D-6) — cargas y archivos ajenos
  - **Dado** dos clientes A y B,
  - **Cuando** B intenta completar, reanudar, cancelar o pedir URLs de partes de una carga de A, o descargar un archivo de A (o un identificador inexistente). (Pausar es una acción local del navegador: no llama al servidor y no aplica aquí.)
  - **Entonces** todas responden `404` idénticas salvo `correlationId` (`STORAGE_UPLOAD_NOT_FOUND` / `STORAGE_NODE_NOT_FOUND`); la descarga se resuelve con `accessibleNodes(actor)` en la consulta, no filtrando después. Cierra CA-10, CA-11 y CA-14 de 003 con archivos reales; se añade a `pnpm test:isolation`.
- **CA-17** (HU-7, RF-05) — roles internos
  - **Dado** un Administrador, un Soporte y un Operador,
  - **Cuando** llaman cualquier ruta de carga o descarga,
  - **Entonces** reciben `403` `SHARED_FORBIDDEN`; sin token, `401` `SHARED_UNAUTHENTICATED`.
- **CA-18** — *retirado* (2026-09-28): el bloqueo de carga en solo lectura pasa a la spec 010 (§11). El ID no se reutiliza.
- **CA-23** (HU-3, RF-12) — reserva de cuota concurrente
  - **Dado** una cuota con espacio para un solo archivo más,
  - **Cuando** el cliente inicia dos cargas seguidas,
  - **Entonces** la primera reserva su tamaño declarado y la segunda responde `STORAGE_QUOTA_EXCEEDED` (CA-4). La reserva se libera al completar (se convierte en uso real, sin contarse dos veces), cancelar, expirar (CA-9) o rechazar.

### Seguridad operativa (RNF-07, RNF-17, RF-07)

- **CA-19** (RNF-07) — límite de tasa
  - **Dado** un cliente que excede el límite de tasa del inicio de carga o de la emisión de URLs de descarga,
  - **Cuando** repite la solicitud,
  - **Entonces** se responde `429` `STORAGE_TOO_MANY_REQUESTS` con `Retry-After` y «Hiciste demasiadas solicitudes. Espera un momento e inténtalo de nuevo.»; las cifras salen de configuración (RN-16). La interfaz reutiliza el aviso de rechazo de la fila, sin cuenta regresiva y con el botón «Reintentar» siempre habilitado.
- **CA-20** (RF-07, RNF-17) — auditoría y bitácoras
  - **Dado** una carga completada, una carga rechazada y una descarga (emisión de URL),
  - **Cuando** se revisan la auditoría y las bitácoras,
  - **Entonces** cada una deja un evento por `IAuditLogger` (con el adaptador provisional que 004 sustituye) con actor, tipo de evento, identificador de recurso (UUID), tamaño y `correlationId`, y **nunca** el nombre del archivo, su contenido, la URL firmada ni sus firmas.
- **CA-21** (RNF-14, RNF-13) — progreso y errores en la interfaz
  - **Dado** una carga en curso o un rechazo,
  - **Cuando** el cliente mira la pantalla,
  - **Entonces** ve el progreso medido por su navegador (porcentaje, bytes, velocidad y tiempo restante), y todo error trae su causa y una acción correctiva, en español, a 360 y 1440 px, sin violaciones serias de axe.
  - **Y** mientras haya cargas activas el panel solo se puede minimizar; «Cerrar» aparece cuando no queda ninguna, y las filas terminadas persisten hasta cerrar el panel.
  - **Y** si falla la emisión de la URL de descarga (`429` o `404`), se muestra un `Alert` arriba de la lista (no un toast) con la causa y la acción correctiva; si la URL tarda más de 2 s, el ítem «Descargar» del menú ⋮ queda deshabilitado con el texto «Preparando…» (el toast queda como mejora futura, fuera de alcance).
  - **Y** en el estado de error del listado no se muestra el `correlationId` (sin código de soporte visible) y «Subir archivos» sigue habilitado.
  - **Y** cada archivo del explorador tiene un menú ⋮ por fila cuya única acción en esta spec es «Descargar» (CA-13); las demás acciones llegan con 006 y posteriores. La barra lateral de 005 oculta «Carpetas» y el contador de la Papelera hasta 006.
  - **Y** si falla el listado del explorador, se muestra un estado de error con causa y la acción «Reintentar», que vuelve a pedir el listado; las cargas en curso no se ven afectadas.

## 6. Reglas de negocio

- **RN-1** El tamaño máximo por archivo y la cuota total salen de `PlanLimits` (`IPlanLimitsProvider`); ningún valor vive en el código ni en la spec.
- **RN-2** El umbral entre carga simple y por partes es configuración técnica, no regla de negocio; lo fija el plan.
- **RN-3** El progreso lo mide el navegador; esta spec no lo difunde a otras pestañas o dispositivos (015).
- **RN-4** Los archivos se suben solo a la raíz del usuario; elegir carpeta llega con 006.
- **RN-5** Nombre repetido: «conservar ambos» (renombrar a «nombre (n).ext», con el primer n libre) o «cancelar». Comparación sin distinguir mayúsculas; la papelera no cuenta; con cargas simultáneas del mismo nombre, la segunda en completar recibe «(1)». Varios repetidos en una selección: un diálogo por archivo, con «Aplicar a los demás»; el diálogo y el panel muestran el nombre final. El «(n)» lo calcula el servidor (plan D-4). Reemplazar (nueva versión) es de 014.
- **RN-6** Validación estricta por contenido: `.docx`/`.xlsx`/`.pptx` (ZIP/OOXML), `.pdf` e imágenes exigen su firma; `.txt`/`.md` deben ser UTF-8 válido; los «otros» no validan firma. Si falla, el objeto se elimina y la carga queda `rechazada` con motivo.
- **RN-7** Toda carga (simple o por partes) se puede pausar, reanudar (misma pestaña) o cancelar; una simple pausada empieza de cero al reanudar; cancelar pide confirmación solo si ya se subió más de 0 %. Sin completarse, expira a las 24 h desde su inicio y se limpian las partes. Tras cerrar o recargar la pestaña no se recupera desde la interfaz.
- **RN-8** Solo el propietario descarga, decidido por `accessibleNodes(actor)`; la compartición lo amplía después sin cambiar esta spec.
- **RN-9** URL de descarga: 5 minutos, un solo objeto, origen aislado, `Content-Disposition: attachment`.
- **RN-10** El espacio usado solo se suma al registrar el archivo, en la misma transacción que `archivo` y `version_archivo(origen=carga)` (DF-38). Rechazos, expiraciones y cancelaciones no suman espacio.
- **RN-11** Tamaños en bytes, siempre `bigint` (DF-06); identificadores UUID.
- **RN-12** *Retirada* (solo lectura pasa a 010). El ID no se reutiliza.
- **RN-13** Al iniciar se reserva el tamaño declarado; tamaño máximo y cuota se validan con `espacio_usado` + reservas activas. La reserva se libera al completar (pasa a uso real), cancelar, expirar o rechazar.
- **RN-14** No se aceptan archivos de 0 bytes.
- **RN-15** Los ejecutables (PE, ELF, Mach-O) se rechazan siempre, con cualquier extensión.
- **RN-16** El límite de tasa y su respuesta `429` son obligatorios; las cifras las fija el plan como configuración.

## 7. Requisitos no funcionales aplicables

| RNF | Cómo aplica aquí | Cómo se verifica |
|---|---|---|
| RNF-06 | URL de 5 min, un objeto, IDs UUID | CA-13, revisión |
| RNF-07 | Origen aislado, descarga forzada, límite de tasa | CA-14, CA-19 (cabeceras + prueba de exceso) |
| RNF-05 | Autorización en la consulta y RLS en `archivo`/`version_archivo` | CA-16, `pnpm test:isolation` |
| RNF-13 | 360 px, español, AA | CA-21 |
| RNF-14 | Progreso en operaciones > 2 s; errores con acción correctiva | CA-21 |
| RNF-17 | `correlationId`; sin contenido, nombres ni tokens en bitácoras | CA-20 |
| RNF-02 (contexto) | Archivos hasta 2 GB (plan Institucional): la carga por partes no pasa los bytes por la API | Plan y prueba de esfuerzo de 023 |

## 8. Seguridad y privacidad

- **¿Toca contenido?** Sí: recibe y sirve bytes. Solo el propietario (RN-8); ningún rol interno (CA-17). Los bytes van directo navegador ↔ almacenamiento de objetos con URLs firmadas; la API no los relaya.
- **Auditoría (RF-07)**: carga completada, carga rechazada (con motivo) y descarga, con actor, UUID de recurso, tamaño y `correlationId`, **sin nombre de archivo ni contenido** (CA-20). Usa el puerto `IAuditLogger`, que 005 declara con un adaptador provisional (bitácora técnica sin datos sensibles) porque 004 llega después; 004 lo sustituye.
- **Límite de tasa**: inicio de carga y emisión de URL de descarga (CA-19); cifras en configuración vía `IRateLimiter`, decididas en el plan.
- **Nunca en bitácoras**: nombres de archivo, contenido, URLs firmadas o sus firmas, claves de objeto, tokens.
- **Aislamiento**: cargas y archivos ajenos responden como inexistentes (CA-16); la clave de objeto no se expone y sale del `version_archivo` que los roles internos no ven (ADR-0005).
- **Integridad**: el objeto se valida al completar (tamaño real y tipo, CA-5, CA-11) y se elimina si falla. No hay antivirus (fuera de alcance).
- **Solo lectura**: fuera de esta spec (010).

## 9. Experiencia de usuario

> Rutas relativas a `docs/design/`.

| Pantalla | Mockup | Capturas | Estados requeridos | Estado del mockup |
|---|---|---|---|---|
| Carga en progreso (panel) | `mockups/storage/carga/` | `capturas/storage/carga/` | progreso, pausa, sin-conexion, rechazo-tamano, rechazo-cuota, tipo-invalido (incluye ejecutable y vacío), nombre-repetido, nombre-repetido-varios, confirmar-cancelar; caducada y límite de tasa reutilizan el aviso de fila | Borrador (barra lateral de 005 sin «Carpetas» ni contador de Papelera; lista con menú ⋮; «Ver planes» oculto hasta 008) |
| Explorador («Subir archivos», arrastrar y soltar, menú ⋮ con «Descargar») | `mockups/storage/explorador/` | `capturas/storage/explorador/` | default, vacio, cargando, arrastre, error, acciones, descarga-preparando, descarga-fallida; otras fallas de descarga reutilizan el aviso | Borrador; textos aprobados |

- **Mensajes clave** (español, tuteo, con acción correctiva):
  - Tamaño: «Este archivo pesa X y tu plan permite hasta Y por archivo. Reduce su tamaño o cambia de plan.»
  - Cuota: «Te faltan X de espacio para subir este archivo. Libera espacio o cambia de plan.» Acciones: «Liberar espacio» (Resumen de espacio de 007; hasta entonces, Mis archivos) y «Ver planes» (oculta hasta que exista 008).
  - Explorador vacío: «Aún no tienes archivos» / «Sube tus documentos con el botón o arrástralos a esta página. Tu plan permite hasta {máximo} por archivo.» (sin arrastre: «Sube tus documentos desde tu dispositivo…») · Cargando: «Cargando tus archivos…» · Arrastre: «Suelta para subir» / «Se guardarán en Mis archivos · hasta {máximo} por archivo».
  - Error del listado: «No pudimos cargar tus archivos.» / «Tus archivos siguen guardados. Inténtalo de nuevo.» con «Reintentar» (sin código de soporte; «Subir archivos» sigue habilitado).
  - Menú de fila: «Acciones de {nombre}» con «Descargar»; si la URL tarda más de 2 s, «Preparando…» (anuncio «Preparando la descarga de {nombre}…»).
  - Descarga fallida (aviso arriba de la lista, con «Cerrar aviso»): `429` «No pudimos preparar la descarga de «{nombre}».» / «Hiciste demasiadas solicitudes. Espera un momento e inténtalo de nuevo.» con «Reintentar»; `404` «No encontramos «{nombre}».» / «Puede que ya no esté en Mis archivos. Actualiza la lista para ver tus archivos.» con «Actualizar lista»; red o `5xx` «No pudimos preparar la descarga de «{nombre}».» / «Revisa tu conexión e inténtalo de nuevo.» con «Reintentar».
  - Tipo: «Este archivo no es un .ext válido. Comprueba que sea el archivo correcto.»
  - Ejecutable: «No se permiten archivos ejecutables. Sube otro archivo.»
  - Vacío: «El archivo está vacío. Revisa que tenga contenido y súbelo de nuevo.»
  - Nombre repetido: diálogo «¿Conservar ambos archivos?» (foco inicial en «Conservar ambos», casilla «Aplicar a los demás», muestra el nombre final).
  - Corte: título «Carga en espera» y «Se cortó la conexión. Tu carga se reanudará donde quedó. No cierres ni recargues esta pestaña.»
  - Cancelada: «Cancelaste esta carga. Liberamos el espacio que tenía reservado.»
  - Caducada: «Esta carga caducó. Vuelve a subir el archivo.» con «Subir de nuevo» · Tasa: «Hiciste demasiadas solicitudes. Espera un momento e inténtalo de nuevo.» con «Reintentar» (ambas en el aviso de rechazo de la fila).
  - Cancelar (más de 0 %): diálogo «¿Cancelar esta carga?», «Ya subiste {subido} de {total} de «{nombre}». La pausamos mientras decides.», nota «Si la cancelas, se perderá lo que ya subiste y liberaremos el espacio reservado. Para subir el archivo tendrás que empezar de cero.», botones «Seguir subiendo» (foco inicial) y «Cancelar carga».
  - Ayuda de «Aplicar a los demás»: «Usaremos la misma respuesta para el otro archivo con nombre repetido.» (con varios: «…para los otros {n} archivos con nombre repetido.»).
  - Panel: solo minimizable mientras haya cargas activas; «Cerrar» aparece cuando no queda ninguna; las filas terminadas persisten hasta cerrar.
- **Diferencias aceptadas respecto al mockup**: `carga--progreso.html` (propuesta, p. 10) se conserva como referencia histórica y no se reemplaza. Sus diferencias con los estados nuevos, que suben a la raíz, usan tokens, llevan el botón con el token corregido de DF-41 y no tienen columna «Autor», están en el README del mockup.

## 10. Enfoque técnico

- **Módulos afectados**: `storage` (M2: dominio, aplicación, infraestructura, presentación; `worker` para la limpieza), `access` (rama de propiedad de `accessibleNodes`), `audit` (puerto `IAuditLogger` y adaptador provisional, porque 004 llega después), `shared` (`details` en `ErrorResponse`, variables de entorno), `packages/contracts/storage`, `apps/web` (`features/storage`, panel de cargas y explorador mínimo en `/archivos`).
- **Tablas/columnas**: `archivo`, `version_archivo` (con `origen`) y `carga` nuevas; `usuario.espacio_usado bigint` (excepción documentada: `storage` escribe solo esa columna); RLS en `archivo`, `version_archivo` y `carga`; función `SECURITY DEFINER` `carga_expiradas` para la limpieza sin actor (DF-52, opción B). Cuatro migraciones reversibles. Se sigue el E-R vigente (tablas separadas; ADR-0011/0012 como Propuestos).
- **Contratos**: `POST /uploads`, `POST /uploads/:id/resume`, `POST /uploads/:id/complete`, `DELETE /uploads/:id`, `GET /files` (listado mínimo de la raíz, para CA-1 y «Descargar»; 007 lo extiende), `POST /files/:id/download-url`; cola BullMQ `upload-cleanup`; sin eventos de dominio ni tiempo real. Los bytes van directo navegador ↔ MinIO con URLs prefirmadas.
- **Riesgos**: (1) la 005 completa debe demostrarse el 30/09 y depende de 001, 003 y de la implementación de 006a (con doble de prueba entre tanto), sin Docker disponible hoy para las pruebas de integración y aislamiento; (2) comportamientos de MinIO por verificar (firma de tamaño, cabeceras `response-*`, CORS); (3) `SECURITY DEFINER` con RLS forzada es fácil de configurar mal; (4) DF-51 resuelto (opción A): `storage` declara `IPlanLimitsProvider` y `PlanLimits`, y se elimina `storage → billing`; solo falta la implementación de 006a.
- `plan.md`: ver [`./plan.md`](./plan.md) (obligatorio: agrega un puerto entre módulos y un ADR que enmienda ADR-0005); aprobado por `architect` (segunda pasada) y confirmado por Adrián el 2026-09-28.

## 11. Fuera de alcance

- Carpeta destino y jerarquía (006); carga a carpetas.
- «Reemplazar» un archivo con el mismo nombre / nueva versión (014).
- Difusión del progreso a otras pestañas o dispositivos por tiempo real (015).
- Descarga de carpetas y `.zip`; descarga por enlace público (013) y por compartición (012).
- Vista previa (017), búsqueda (018), indexación (019), optimización (021).
- Cuota mostrada y desglose por tipo (007); planes y estado de suscripción (008–010).
- **Bloqueo de carga en solo lectura (plan vencido)**: lo añade la spec 010 (RF-23); 005 no lee estado de suscripción.
- Lista de «cargas pendientes» y recuperar una carga tras cerrar o recargar la pestaña.
- Archivos de 0 bytes; antivirus más allá del rechazo de ejecutables por firma.
- Antivirus, OCR, cifrado extremo a extremo (`product-context.md` §9).

## 12. Preguntas

**Abiertas**

Ninguna.

- [RESUELTA] DF-51: `storage` declara `IPlanLimitsProvider` y `PlanLimits` (opción A); `billing` (006a) lo implementa importándolo de `storage`; se elimina `storage → billing`. Único bloqueo restante: la implementación de 006a (doble de prueba entre tanto) (2026-09-28, Fátima)
- [RESUELTA] UI de descarga: fallo de emisión (`429`/`404`) → `Alert` arriba de la lista, no toast; URL > 2 s → «Descargar» deshabilitado con «Preparando…»; toast fuera de alcance (2026-09-28, Adrián)
- [RESUELTA] Error del listado: sin `correlationId` visible; «Subir archivos» sigue habilitado (2026-09-28, Adrián)
- [RESUELTA] Destino de «Ver planes» (CA-4) mientras 008 no exista → se oculta hasta 008 (2026-09-28, Adrián)
- [RESUELTA] CA-7 conserva `400` para entrada inválida (2026-09-28, Adrián)
- [RESUELTA] Estados vacío, cargando y arrastre del explorador: se dibujan (ui-designer) (2026-09-28, Adrián)
- [RESUELTA] Texto de `STORAGE_UPLOAD_SIZE_MISMATCH` (CA-5) → «El archivo cambió durante la carga. Vuelve a subirlo.» (2026-09-28, Adrián)

**Resueltas**

- [RESUELTA] DF-52: opción B con RLS en `carga`; ADR nuevo que enmienda ADR-0005 y prueba en `test/isolation` → plan D-6 (2026-09-28, usuario)
- [RESUELTA] `usuario.espacio_usado`: excepción documentada, `storage` escribe solo esa columna; se sigue el E-R vigente → plan D-5 (2026-09-28, usuario)
- [RESUELTA] ADR-0011 y ADR-0012: se sigue el E-R vigente (tablas separadas, versión con `origen`); el architect los redacta como Propuestos (2026-09-28, usuario)
- [RESUELTA] 004 llega después de 005; 005 declara `IAuditLogger` con adaptador provisional sobre Pino → «Depende de», plan D-11 (2026-09-28, usuario)
- [RESUELTA] Conciliación nocturna de `espacio_usado`: se difiere a 007 → plan D-14 (2026-09-28, usuario)
- [RESUELTA] 30/09: la 005 completa debe ser demostrable en la entrega, sin recortar alcance → plan R-1 y R-3 (2026-09-28, usuario)
- [RESUELTA] Decisiones técnicas del plan: extensiones de imagen (`png`, `jpg`, `jpeg`, `gif`, `webp`; el resto «otros»), `.txt`/`.md` sin bytes NUL, código de CA-5, listado mínimo `GET /files`, métricas diferidas a 022 → plan D-9, D-15, D-16 (2026-09-28, planner)

- [RESUELTA] Magic bytes estricta + bloquear ejecutables: `.docx`/`.xlsx`/`.pptx` (ZIP/OOXML), `.pdf` e imágenes exigen firma; `.txt`/`.md` texto UTF-8 válido; «otros» sin validar firma, salvo ejecutables PE/ELF/Mach-O, siempre rechazados → CA-11, CA-12, CA-24, RN-6, RN-15 (2026-09-28, usuario (sesión /spec 005))
- [RESUELTA] Mockups: el ui-designer crea los estados faltantes (reanudar, rechazo-cuota, tipo-inválido, nombre-repetido, cancelar/pausa); solo-lectura ya no aplica → §9 (2026-09-28, usuario (sesión /spec 005))
- [RESUELTA] Cancelar, pausar y reanudar los tres; cancelar aborta la sesión, borra las partes y libera la reserva → CA-8, CA-22, RN-7 (2026-09-28, usuario (sesión /spec 005))
- [RESUELTA] Límite de tasa: la spec exige el límite y el `429`; las cifras las decide el /plan como configuración → CA-19, RN-16 (2026-09-28, usuario (sesión /spec 005))
- [RESUELTA] Solo lectura fuera de 005; lo añade 010 → CA-18 y RN-12 retirados, §11 (2026-09-28, usuario (sesión /spec 005))
- [RESUELTA] Cuota concurrente: se reserva el tamaño declarado al iniciar; se libera al completar, cancelar, expirar o rechazar; validación con `espacio_usado` + reservas → CA-4, CA-23, RN-13 (2026-09-28, usuario (sesión /spec 005))
- [RESUELTA] Auditoría: dependencia blanda de 004 con adaptador provisional de `IAuditLogger` → «Depende de», CA-20, §8 (2026-09-28, usuario (sesión /spec 005))
- [RESUELTA] Nombre repetido: sin distinguir mayúsculas, la papelera no cuenta, con cargas simultáneas la segunda en completar recibe «(1)» → CA-6, RN-5 (2026-09-28, usuario (sesión /spec 005))
- [RESUELTA] Archivos de 0 bytes: no, «El archivo está vacío» → CA-7, RN-14 (2026-09-28, usuario (sesión /spec 005))
- [RESUELTA] Reanudar solo en la misma pestaña; al cerrar o recargar no se recupera y expira a las 24 h; sin lista de «cargas pendientes» → CA-8, RN-7, §11 (2026-09-28, usuario (sesión /spec 005))
- [RESUELTA] Pausa en todas las cargas, incluidas las simples; una simple pausada empieza de cero al reanudar → HU-2, CA-8, CA-22, RN-7 (2026-09-28, usuario (sesión /spec 005))
- [RESUELTA] Cancelar pide confirmación solo si ya se subió más de 0 %; con 0 % cancela directo → CA-22, RN-7 (2026-09-28, usuario (sesión /spec 005))
- [RESUELTA] Varios nombres repetidos: un diálogo por archivo con «Aplicar a los demás», foco en «Conservar ambos», el diálogo y el panel muestran el nombre final; el cálculo del «(n)» lo decide el plan → CA-6, RN-5 (2026-09-28, usuario (sesión /spec 005))
- [RESUELTA] «Liberar espacio» lleva al Resumen de espacio (007) y, mientras no exista, a Mis archivos; acción secundaria «Ver planes» → CA-4 (2026-09-28, usuario (sesión /spec 005))
- [RESUELTA] Mensajes de la interfaz aprobados (ejecutable, vacío, tamaño, cuota, tipo, corte con «Carga en espera», cancelada, diálogo) → CA-7, CA-8, CA-22, CA-24, §9 (2026-09-28, usuario (sesión /spec 005))
- [RESUELTA] Panel: solo minimizable con cargas activas, «Cerrar» cuando no queda ninguna, filas terminadas persisten; caducada y límite de tasa reutilizan el aviso de la fila → CA-9, CA-19, CA-21 (2026-09-28, usuario (sesión /spec 005))
- [RESUELTA] §9 con la tabla de pantallas y estados definitiva, sin rastro de solo lectura; `carga--progreso.html` queda como referencia histórica (2026-09-28, usuario (sesión /spec 005))
- [RESUELTA] Contradicción RF-08 / `architecture.md` §7.1 («progreso en tiempo real» con `realtime`): se alinean con el progreso medido en el cliente; el architect actualiza `architecture.md` (2026-09-28, usuario (sesión /spec 005))
- [RESUELTA] Con el diálogo de cancelar abierto la carga se pausa; «Aplicar a los demás» aplica cualquier respuesta, incluida «Cancelar»; textos aprobados del diálogo de cancelar, la casilla y la caducada; límite de tasa sin cuenta regresiva, con «Reintentar» siempre habilitado → CA-6, CA-9, CA-19, CA-22, §9 (2026-09-28, usuario (sesión /spec 005))

- [RESUELTA] Alcance de carga: simple (pequeños) + por partes reanudable (grandes), según `architecture.md` §7.1; el umbral se decide en el plan, como configuración (2026-09-28, usuario (sesión /spec 005))
- [RESUELTA] Límites: depende de 006a; se valida tamaño máximo y cuota total con `IPlanLimitsProvider` antes de subir, con mensaje explicativo (2026-09-28, usuario (sesión /spec 005))
- [RESUELTA] RF-14: magic bytes contradicen la extensión → objeto eliminado y carga `rechazada` con motivo (2026-09-28, usuario (sesión /spec 005))
- [RESUELTA] Progreso calculado en el cliente; difusión por tiempo real fuera de alcance (015), que no es dependencia (2026-09-28, usuario (sesión /spec 005))
- [RESUELTA] Destino: solo la raíz del usuario; carpeta destino con 006 (2026-09-28, usuario (sesión /spec 005))
- [RESUELTA] Nombre repetido: «conservar ambos» («nombre (1).ext», incrementando) o «cancelar»; «reemplazar» fuera de alcance → 014 (2026-09-28, usuario (sesión /spec 005))
- [RESUELTA] Reanudación: 24 h; luego la sesión se aborta y se limpian las partes (2026-09-28, usuario (sesión /spec 005))
- [RESUELTA] Descarga: solo el propietario vía `accessibleNodes(actor)`; URL de 5 min a un objeto, origen aislado, `Content-Disposition: attachment`; sin carpetas ni `.zip` (2026-09-28, usuario (sesión /spec 005))

## 13. Registro de cambios

| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-09-28 | Creación en `Borrador` (formato compacto) con las decisiones 1–8 y 10 preguntas abiertas | `/spec 005` | — |
| 2026-09-28 | Resueltas las 10 preguntas: firma estricta y ejecutables (CA-11, CA-12, CA-24), pausa/cancelar (CA-22), reserva de cuota (CA-23), 0 bytes (CA-7), nombre (CA-6), reanudación en misma pestaña (CA-8), 004 blanda; CA-18 y RN-12 retirados (solo lectura → 010) | Respuestas del usuario | — |
| 2026-09-28 | Decisiones tras revisar mockups: pausa en todas las cargas (simple reinicia), confirmación de cancelar solo con más de 0 %, diálogo de nombre por archivo con «Aplicar a los demás», «Liberar espacio»/«Ver planes», mensajes aprobados, comportamiento del panel, §9 definitiva | Revisión de mockups | — |
| 2026-09-28 | Dueño: Abel → Adrián | Reasignación decidida por el equipo | — |
| 2026-09-28 | La carga se pausa con el diálogo de cancelar abierto; «Aplicar a los demás» aplica cualquier respuesta; textos del diálogo de cancelar, de la casilla, de caducada y de límite de tasa (sin cuenta regresiva) | Segunda revisión de mockups | — |
| 2026-09-28 | `Borrador` → `Aclarada` | Sin preguntas abiertas; mockups en Borrador | Adrián |
| 2026-09-28 | Adaptada al flujo SDD lite: estado `Aclarada` → `Borrador` (spec aprobada por Adrián; pasa a `Lista` cuando `architect` apruebe `plan.md`); se agrega §10 «Enfoque técnico» y se renumeran las secciones | Plantilla nueva (`workflow.md` lite) | Adrián (spec) |
| 2026-09-28 | Correcciones técnicas y de trazabilidad, sin cambio de comportamiento de producto: CA-5 nombra el código (`STORAGE_UPLOAD_SIZE_MISMATCH`/`STORAGE_FILE_TOO_LARGE`); CA-7 `400` → `422` (convención de 001; **Adrián confirma al aprobar**) [aclaración 2026-09-28: esta propuesta no prosperó; CA-7 se quedó en `400`, ver la fila siguiente]; CA-16 sin «pausar» (es local); CA-9 y Actores: la expiración aplica a toda carga, como RN-7; CA-6/RN-5: el «(n)» lo calcula el servidor; «Depende de»: 004 llega después y 005 declara `IAuditLogger`; preguntas nuevas [ABIERTA] no bloqueantes y DF-51 bloqueante | Plan 005 alineado con planes de 001–003 y decisiones del usuario | Pendiente: Adrián |
| 2026-09-28 | CA-7 vuelve a `400`; texto de CA-5 «El archivo cambió durante la carga. Vuelve a subirlo.»; «Ver planes» oculto hasta 008; se dibujan los estados vacío, cargando y arrastre del explorador | Respuestas de Adrián a las preguntas del plan | Adrián |
| 2026-09-28 | Tras la revisión del `architect` (Aprobado con cambios): se elimina de §12 la pregunta abierta de mockups (resuelta); aclaración en la fila anterior de «`400` → `422`» (CA-7 se quedó en `400`); CA-21 agrega el menú ⋮ por fila con «Descargar» como única acción, el estado de error del listado con «Reintentar» y la barra lateral sin «Carpetas» ni contador de Papelera hasta 006. §9 no se modifica (lo integra Adrián con el `ui-designer`) | Cambios 1, 4 de `plan.md` §11.4 y decisiones de Adrián del 2026-09-28 | Adrián (decisiones) |
| 2026-09-28 | DF-51 resuelto (opción A, Fátima): `storage` declara `IPlanLimitsProvider`/`PlanLimits`, `billing` lo implementa, se elimina `storage → billing`; «Depende de», DF, Enfoque técnico y §12 actualizados y se quita el bloqueo (queda solo la implementación de 006a). CA-21: fallo de emisión de descarga → `Alert` sobre la lista (no toast), «Descargar» deshabilitado con «Preparando…» si tarda > 2 s, error del listado sin `correlationId` y con «Subir archivos» habilitado. «Ver planes» oculto hasta 008: verificado coherente (CA-4, §9, §12). §9 no se modifica | Decisiones de Fátima y Adrián del 2026-09-28 | Fátima (DF-51), Adrián (UI) |
| 2026-09-28 | §9 final: estados del explorador (vacio, cargando, arrastre, error, acciones, descarga-preparando, descarga-fallida) y mensajes aprobados; plan aprobado por `architect` en segunda pasada | Integración de mockups y aprobación del plan | Adrián |
| 2026-09-28 | `Borrador` → `Lista` | Plan aprobado por `architect` y confirmado por Adrián | Adrián |
| 2026-09-29 | **Propuesta (PR-F; resuelta por 007, ver la fila del 2026-10-07)**: §9 pide `{máximo}` en el vacío y el arrastre del explorador, pero ningún contrato expone `PlanLimits.maxFileBytes` a `web` (solo la API lo usa, RN-1). Mientras no exista (p. ej. un `GET` de límites del plan en 006a/007), la página omite la cifra: «Sube tus documentos con el botón o arrástralos a esta página.» y «Se guardarán en Mis archivos». Alternativa: agregar el contrato en 005 | Hueco detectado al montar `/archivos` (T-54) | — |
| 2026-10-07 | Revisión (`review.md`): la propuesta del 2026-09-29 queda resuelta sin contrato nuevo en 005, porque `GET /storage/summary` (007) expone `maxFileBytes` y la página muestra la cifra (`my-files.tsx`, `maxFileLabelOf`). CA-20: `file.upload_rejected` y `file.download_url_issued` llevan `sizeBytes` (B-1). Se quita `UPLOAD_COMPLETE_TIMEOUT_SECONDS`, que nada aplicaba (I-1; verificación en staging: PD-71). Sin cambio de comportamiento para el cliente | Revisión de 005 | Adrián |
