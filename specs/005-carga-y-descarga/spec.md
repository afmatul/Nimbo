# Spec 005 — Carga y descarga de archivos

| Campo | Valor |
|---|---|
| Estado | Aclarada (2026-09-28) |
| Dueño | Adrián (1) |
| Fase | 1 |
| Requisitos | RF-08, RF-09, RF-14, RNF-06, RNF-07 (principales); aplican RF-07, RF-12 (parcial), RNF-05, RNF-13, RNF-14, RNF-17 |
| Depende de | **004 (blanda)**: `IAuditLogger`; si 004 no está lista, un adaptador provisional (bitácora técnica sin datos sensibles) que 004 sustituye · **003** (`Actor`, guards, `accessibleNodes`, RLS de `archivo` y `version_archivo` que se escriben en el PR de 005, D-1 y D-7 de 003); **006a** (`IPlanLimitsProvider`, `PlanLimits`) |
| Módulo | M2 `storage` |
| DF | DF-06, DF-16, DF-38 (se cierran en el plan); DF-17 y DF-33 (resto) no bloquean. La contradicción «progreso en tiempo real» (RF-08 / `architecture.md` §7.1 con `realtime`) quedó **resuelta**: el progreso se mide en el cliente y el architect alinea `architecture.md` |
| Última actualización | 2026-09-28 |

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
- **Sistema (trabajo programado)**: aborta las cargas por partes que pasan 24 h sin completarse, limpia sus partes y libera su reserva de cuota.
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
  - **Y** el aviso ofrece la acción «Liberar espacio», que lleva al Resumen de espacio (spec 007) y, mientras 007 no exista, a Mis archivos; y la acción secundaria «Ver planes».
- **CA-5** (HU-3, HU-1) — tamaño real verificado al completar
  - **Dado** una carga cuyos bytes reales exceden el tamaño declarado o el máximo del plan,
  - **Cuando** se intenta completar,
  - **Entonces** el objeto se elimina, la carga queda `rechazada` con motivo `tamaño` y no se registra archivo ni se suma espacio.
- **CA-6** (HU-5, decisión 6) — nombre repetido
  - **Dado** que el cliente ya tiene en su raíz un archivo con el mismo nombre (sin distinguir mayúsculas; los archivos en la papelera no cuentan),
  - **Cuando** inicia la carga,
  - **Entonces** se responde `409` `STORAGE_NAME_CONFLICT` con las opciones «Conservar ambos» y «Cancelar»; con «Conservar ambos» el archivo nuevo se guarda como «nombre (1).ext» (o «(2)», «(3)»… el primer número libre); con «Cancelar» no se crea nada. No existe «Reemplazar».
  - **Y** el diálogo («¿Conservar ambos archivos?») muestra el nombre con el que se guardará, con el foco inicial en «Conservar ambos», y el panel de cargas indica el nombre final de la fila.
  - **Y** si una misma selección trae varios nombres repetidos, se muestra un diálogo por archivo, con la casilla «Aplicar a los demás», que aplica la respuesta elegida («Conservar ambos» o «Cancelar») al resto de los repetidos.
  - **Y** si dos cargas simultáneas comparten nombre, la que completa en segundo lugar se guarda con «(1)». Dónde y cuándo se calcula el «(n)» (servidor o cliente) lo decide el plan.
- **CA-7** (HU-1, RF-08) — entrada inválida
  - **Dado** un inicio con nombre vacío o con separadores de ruta, tamaño no entero o negativo, o campos faltantes,
  - **Cuando** se envía,
  - **Entonces** se responde `400` `STORAGE_INVALID_UPLOAD_REQUEST` con el campo en falla y no se crea nada.
  - **Y** con tamaño 0 se responde `422` `STORAGE_EMPTY_FILE` con «El archivo está vacío. Revisa que tenga contenido y súbelo de nuevo.»; tampoco se acepta que al completar el objeto tenga 0 bytes.

### Reanudación, pausa, cancelación y limpieza (HU-2)

- **CA-8** (HU-2, RF-08) — reanudar en la misma pestaña
  - **Dado** una carga interrumpida (corte de red) o pausada, con menos de 24 h desde su inicio y la misma pestaña abierta,
  - **Cuando** el cliente reanuda (automáticamente tras el corte o con «Reanudar»),
  - **Entonces** en una carga por partes se consulta qué partes están completas y solo se suben las faltantes; una carga **simple** pausada empieza de cero. En ambos casos, al completar, el archivo es idéntico al original.
  - **Y** durante el corte el panel se titula «Carga en espera» con «Se cortó la conexión. Tu carga se reanudará donde quedó. No cierres ni recargues esta pestaña.»
  - **Y** si la pestaña se cierra o se recarga, la carga no se recupera desde la interfaz (no hay lista de «cargas pendientes») y expira a las 24 h (CA-9).
- **CA-9** (HU-2, decisión 7) — expiración a las 24 h
  - **Dado** una carga por partes sin completar 24 h después de iniciada,
  - **Cuando** corre la limpieza o se intenta reanudar,
  - **Entonces** la sesión pasa a `expirada`, las partes se eliminan del almacenamiento, se libera su reserva de cuota (CA-23), y reanudar responde `410` `STORAGE_UPLOAD_EXPIRED` con «Esta carga caducó. Vuelve a subir el archivo.»; la interfaz reutiliza el aviso de rechazo de la fila, con el botón «Subir de nuevo», que abre el selector de archivos.
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
  - **Cuando** B intenta completar, reanudar, pausar, cancelar o pedir URLs de partes de una carga de A, o descargar un archivo de A (o un identificador inexistente),
  - **Entonces** todas responden `404` idénticas salvo `correlationId` (`STORAGE_UPLOAD_NOT_FOUND` / `STORAGE_NODE_NOT_FOUND`); la descarga se resuelve con `accessibleNodes(actor)` en la consulta, no filtrando después. Cierra CA-10, CA-11 y CA-14 de 003 con archivos reales; se añade a `pnpm test:isolation`.
- **CA-17** (HU-7, RF-05) — roles internos
  - **Dado** un Administrador, un Soporte y un Operador,
  - **Cuando** llaman cualquier ruta de carga o descarga,
  - **Entonces** reciben `403` `SHARED_FORBIDDEN`; sin token, `401` `SHARED_UNAUTHENTICATED`.
- **CA-18** — *retirado* (2026-09-28): el bloqueo de carga en solo lectura pasa a la spec 010 (§10). El ID no se reutiliza.
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
  - **Entonces** cada una deja un evento por `IAuditLogger` (con el adaptador provisional si 004 no está lista) con actor, tipo de evento, identificador de recurso (UUID), tamaño y `correlationId`, y **nunca** el nombre del archivo, su contenido, la URL firmada ni sus firmas.
- **CA-21** (RNF-14, RNF-13) — progreso y errores en la interfaz
  - **Dado** una carga en curso o un rechazo,
  - **Cuando** el cliente mira la pantalla,
  - **Entonces** ve el progreso medido por su navegador (porcentaje, bytes, velocidad y tiempo restante), y todo error trae su causa y una acción correctiva, en español, a 360 y 1440 px, sin violaciones serias de axe.
  - **Y** mientras haya cargas activas el panel solo se puede minimizar; «Cerrar» aparece cuando no queda ninguna, y las filas terminadas persisten hasta cerrar el panel.

## 6. Reglas de negocio

- **RN-1** El tamaño máximo por archivo y la cuota total salen de `PlanLimits` (`IPlanLimitsProvider`); ningún valor vive en el código ni en la spec.
- **RN-2** El umbral entre carga simple y por partes es configuración técnica, no regla de negocio; lo fija el plan.
- **RN-3** El progreso lo mide el navegador; esta spec no lo difunde a otras pestañas o dispositivos (015).
- **RN-4** Los archivos se suben solo a la raíz del usuario; elegir carpeta llega con 006.
- **RN-5** Nombre repetido: «conservar ambos» (renombrar a «nombre (n).ext», con el primer n libre) o «cancelar». Comparación sin distinguir mayúsculas; la papelera no cuenta; con cargas simultáneas del mismo nombre, la segunda en completar recibe «(1)». Varios repetidos en una selección: un diálogo por archivo, con «Aplicar a los demás»; el diálogo y el panel muestran el nombre final. Dónde y cuándo se calcula el «(n)» lo decide el plan. Reemplazar (nueva versión) es de 014.
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
- **Auditoría (RF-07)**: carga completada, carga rechazada (con motivo) y descarga, con actor, UUID de recurso, tamaño y `correlationId`, **sin nombre de archivo ni contenido** (CA-20). Usa el puerto `IAuditLogger`; dependencia blanda de 004 con adaptador provisional (bitácora técnica sin datos sensibles).
- **Límite de tasa**: inicio de carga y emisión de URL de descarga (CA-19); cifras en configuración vía `IRateLimiter`, decididas en el plan.
- **Nunca en bitácoras**: nombres de archivo, contenido, URLs firmadas o sus firmas, claves de objeto, tokens.
- **Aislamiento**: cargas y archivos ajenos responden como inexistentes (CA-16); la clave de objeto no se expone y sale del `version_archivo` que los roles internos no ven (ADR-0005).
- **Integridad**: el objeto se valida al completar (tamaño real y tipo, CA-5, CA-11) y se elimina si falla. No hay antivirus (fuera de alcance).
- **Solo lectura**: fuera de esta spec (010).

## 9. Experiencia de usuario

> Rutas relativas a `docs/design/`.

| Pantalla | Mockup | Capturas | Estados requeridos | Estado del mockup |
|---|---|---|---|---|
| Carga en progreso (panel) | `mockups/storage/carga/` | `capturas/storage/carga/` | progreso, pausa, sin-conexion, rechazo-tamano, rechazo-cuota, tipo-invalido (incluye ejecutable y vacío), nombre-repetido, nombre-repetido-varios, confirmar-cancelar; caducada y límite de tasa reutilizan el aviso de fila | Borrador |
| Explorador (botón «Subir archivos», arrastrar y soltar, «Descargar») | `mockups/storage/explorador/` | `capturas/storage/explorador/` | default, vacio, cargando, arrastre | Borrador (cuadrícula, lista); vacio, cargando y arrastre sin dibujar |

- **Mensajes clave** (español, tuteo, con acción correctiva):
  - Tamaño: «Este archivo pesa X y tu plan permite hasta Y por archivo. Reduce su tamaño o cambia de plan.»
  - Cuota: «Te faltan X de espacio para subir este archivo. Libera espacio o cambia de plan.» Acciones: «Liberar espacio» (Resumen de espacio de 007; hasta entonces, Mis archivos) y «Ver planes».
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

## 10. Fuera de alcance

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

## 11. Preguntas

**Abiertas**

Ninguna.

**Resueltas**

- [RESUELTA] Magic bytes estricta + bloquear ejecutables: `.docx`/`.xlsx`/`.pptx` (ZIP/OOXML), `.pdf` e imágenes exigen firma; `.txt`/`.md` texto UTF-8 válido; «otros» sin validar firma, salvo ejecutables PE/ELF/Mach-O, siempre rechazados → CA-11, CA-12, CA-24, RN-6, RN-15 (2026-09-28, usuario (sesión /spec 005))
- [RESUELTA] Mockups: el ui-designer crea los estados faltantes (reanudar, rechazo-cuota, tipo-inválido, nombre-repetido, cancelar/pausa); solo-lectura ya no aplica → §9 (2026-09-28, usuario (sesión /spec 005))
- [RESUELTA] Cancelar, pausar y reanudar los tres; cancelar aborta la sesión, borra las partes y libera la reserva → CA-8, CA-22, RN-7 (2026-09-28, usuario (sesión /spec 005))
- [RESUELTA] Límite de tasa: la spec exige el límite y el `429`; las cifras las decide el /plan como configuración → CA-19, RN-16 (2026-09-28, usuario (sesión /spec 005))
- [RESUELTA] Solo lectura fuera de 005; lo añade 010 → CA-18 y RN-12 retirados, §10 (2026-09-28, usuario (sesión /spec 005))
- [RESUELTA] Cuota concurrente: se reserva el tamaño declarado al iniciar; se libera al completar, cancelar, expirar o rechazar; validación con `espacio_usado` + reservas → CA-4, CA-23, RN-13 (2026-09-28, usuario (sesión /spec 005))
- [RESUELTA] Auditoría: dependencia blanda de 004 con adaptador provisional de `IAuditLogger` → «Depende de», CA-20, §8 (2026-09-28, usuario (sesión /spec 005))
- [RESUELTA] Nombre repetido: sin distinguir mayúsculas, la papelera no cuenta, con cargas simultáneas la segunda en completar recibe «(1)» → CA-6, RN-5 (2026-09-28, usuario (sesión /spec 005))
- [RESUELTA] Archivos de 0 bytes: no, «El archivo está vacío» → CA-7, RN-14 (2026-09-28, usuario (sesión /spec 005))
- [RESUELTA] Reanudar solo en la misma pestaña; al cerrar o recargar no se recupera y expira a las 24 h; sin lista de «cargas pendientes» → CA-8, RN-7, §10 (2026-09-28, usuario (sesión /spec 005))
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

## 12. Registro de cambios

| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-09-28 | Creación en `Borrador` (formato compacto) con las decisiones 1–8 y 10 preguntas abiertas | `/spec 005` | — |
| 2026-09-28 | Resueltas las 10 preguntas: firma estricta y ejecutables (CA-11, CA-12, CA-24), pausa/cancelar (CA-22), reserva de cuota (CA-23), 0 bytes (CA-7), nombre (CA-6), reanudación en misma pestaña (CA-8), 004 blanda; CA-18 y RN-12 retirados (solo lectura → 010) | Respuestas del usuario | — |
| 2026-09-28 | Decisiones tras revisar mockups: pausa en todas las cargas (simple reinicia), confirmación de cancelar solo con más de 0 %, diálogo de nombre por archivo con «Aplicar a los demás», «Liberar espacio»/«Ver planes», mensajes aprobados, comportamiento del panel, §9 definitiva | Revisión de mockups | — |
| 2026-09-28 | Dueño: Abel → Adrián | Reasignación decidida por el equipo | — |
| 2026-09-28 | La carga se pausa con el diálogo de cancelar abierto; «Aplicar a los demás» aplica cualquier respuesta; textos del diálogo de cancelar, de la casilla, de caducada y de límite de tasa (sin cuenta regresiva) | Segunda revisión de mockups | — |
| 2026-09-28 | `Borrador` → `Aclarada` | Sin preguntas abiertas; mockups en Borrador | Adrián |
