# Mockup: Editor .docx

- **Spec**: 016 (edición colaborativa de `.docx`): CA-1, CA-3, CA-5, CA-6, CA-7, CA-14, CA-15; RF-25, RF-26, RF-28, RF-23.
- **Propuesta presentada**: No presentada (diseño interno).
- **Origen**:
  - `editor--editando.html`: paquete de Claude Design (lienzo de ≈ 1490 px). Es la propuesta original y **no se genera**.
    Trae atribución por párrafo, firma y sugerencias del agente, que están fuera de alcance; no pasa axe (contraste, `lang`,
    título) y se queda solo como referencia histórica.
  - El resto: HTML autocontenido, un archivo por estado, generado con `../../_generadores/editor/generar.js` (tokens,
    botones, `Alert` y `StateView` del marco común; ver [`_generadores/README.md`](../../_generadores/README.md)).
    Solo Inter y los tonos AA de `ui-guidelines.md` §2–§3. Referencia visual; `apps/web` no lo importa.
- **Estados incluidos** (`editor--<estado>.html`):
  - coeditando: «editando» corregido. Lucía edita con 2 personas más: 3 de 5 editores (plan Equipo), lista en vivo y cursor nativo de ONLYOFFICE (CA-1, CA-6).
  - cargando: «Abriendo el editor…» con esqueleto de página (`aria-busy`, `role="status"`).
  - limite-editores: hay 5 editores. Diego entra en solo lectura y aparece aparte, en «Solo ven (no cuentan para el límite)». `Alert` `warning` con «Intentar editar» (CA-7, P-6).
  - guardado-fallido: al volver a abrir el documento después de una sesión que no se guardó. `Alert` de error «No pudimos
    guardar tus cambios» con la versión vigente intacta (v12) y «Abrir el editor de nuevo», que abre una sesión nueva sobre
    esa versión (CA-14). El documento se ve sin sesión de edición, por eso la barra no muestra el modo ni la presencia.
  - solo-lectura-lector: tienes acceso de lector. `Alert` `info` con a quién pedirle acceso de editor (CA-3).
  - solo-lectura-plan: plan Personal (`EDITING_PLAN_READ_ONLY`). `Alert` `warning` «Tu plan no incluye edición» con «Ver planes» (CA-5).
  - solo-lectura-plan-propietario: un coeditor (Diego) abre un documento de Lucía y el plan de la cuenta propietaria es
    Personal o venció (`EDITING_PLAN_READ_ONLY`). `Alert` `warning` «El plan de la cuenta propietaria no incluye edición»,
    sin «Ver planes» ni «Renovar plan» ni «Compartir». **Solo será alcanzable con la 012** (comparticiones): hasta entonces
    solo edita el propietario (P-2).
  - solo-lectura-vencida: suscripción vencida (`EDITING_PLAN_READ_ONLY`). El mismo `ReadOnlyBanner` del layout, con «Renovar plan» (RF-23); sin «Compartir».
  - solo-lectura-tamano: el archivo supera el tope editable (`EDITING_FILE_TOO_LARGE`, P-5). Muestra el peso y el tope, que vienen de la API, y ofrece «Descargar».
  - no-disponible: el servicio de edición no responde (`EDITING_UNAVAILABLE`, CA-15). `StateView` de error con «Reintentar» y «Volver a Mis archivos»; la barra conserva «Compartir» y «Descargar», porque el resto de Nimbo sigue funcionando.
- **Capturas**: `docs/design/capturas/editing/editor/editor--<estado>--<360|1440>.png`. axe-core sin violaciones en los
  10 estados generados, a 360 y 1440 px. Sin desbordamiento horizontal a 360 px, sin errores de consola y objetivos de al
  menos 24 px (44 px en la barra móvil).

## Decisiones de UX
- **Pantalla de trabajo sin barra lateral**: la barra del editor tiene «Volver a Mis archivos», el chip `.docx`, el nombre
  del archivo, la versión vigente, el modo (`StatusBadge` con ícono: «Editando» o «Solo lectura»), la presencia y las
  acciones. «Compartir» solo aparece para el propietario. Así la UI no ofrece lo que el servidor negaría.
- **Presencia (P-9)**: ONLYOFFICE conserva su presencia nativa (cursores con nombre, que pinta el servicio). Nimbo solo
  muestra la lista de participantes y el conteo frente al límite. Ese conteo es «N de L editores» con un medidor de L
  marcas y el texto «Quedan X lugares para editar a la vez» o «Límite del plan alcanzado»; L viene de la API (plan de la
  cuenta propietaria, RN-3). Si el plan no edita, el conteo dice la causa («Tu plan no incluye edición», «Edición en
  pausa», «No se puede editar en línea»).
- **Lista en vivo**: está a la derecha en escritorio. En móvil el botón «N de L editores» la despliega (`aria-expanded`,
  `aria-controls`); en escritorio el botón no lleva `aria-expanded` porque la lista siempre está visible. El conteo tiene
  `aria-live="polite"`, y quien solo ve aparece aparte y no cuenta para el límite.
- **Colores de participante (DF-46)**: el anillo usa los 5 tonos de la secuencia que ya son tokens (`brand`, `live`,
  `success`, `warning`, `destructive-soft`). Quien solo ve lleva un anillo neutro (`input`) y el ícono de ojo. El color
  nunca identifica solo: siempre va con el nombre y el rol en texto. Los otros 3 tonos de la secuencia (`#9B8ABF`,
  `#7BAFC4`, `#B8A06E`) no son tokens: con más de 5 editores (no ocurre con los límites actuales) el color se repite.
- **Pie del panel**: «Cuando todos cierren el documento, guardaremos una versión nueva con quienes participaron» explica
  RN-4 y P-3 sin jerga, y evita que alguien espere un «Guardar».
- **Avisos persistentes**: los de solo lectura y guardado fallido no se pueden cerrar mientras dure la causa. Un límite no
  es un error, así que el de editores, plan y tamaño usa `warning` (`role="status"`); el guardado fallido usa error
  (`role="alert"`).
- **Contraste de pares nuevos** (WCAG 2.1): «Editando» `primary-hover` sobre `brand` al 12 % da 6.02. «Solo lectura»
  `secondary-foreground` sobre `muted` da 7.45. «Límite del plan alcanzado» `warning-foreground` sobre `card` da 5.20. La
  etiqueta del cursor, `foreground` sobre `live`, da 7.40. Las marcas del medidor dan 4.97 (`primary`) y 3.07 (borde
  `input`) sobre `card`.

## Fuera de esta pantalla
- `EDITING_UNSUPPORTED_FORMAT` (CA-4): «Editar» solo se ofrece para `.docx`, así que no hay pantalla.
- Archivo inexistente o ajeno (CA-2): la misma página de no encontrado de 005.
- Roles internos (CA-17): no ven ninguna acción de edición.

## Decisiones registradas (Adrián, 2026-10-16)
- **«Abrir el editor de nuevo» en CA-14**: no se vuelve a procesar la entrega; el botón abre una sesión nueva sobre la
  versión vigente. Al volver a abrir el documento no se inicia la sesión sola: primero se ve el aviso, para que nadie crea
  que sus cambios están ahí.
- **Dónde llega el aviso de CA-14**: en vivo, por el canal de 015, en la pantalla en la que esté cada participante, y además
  como banner al volver a abrir el documento. Fuera del editor se usa el patrón que ya existe: `Alert` de error arriba del
  contenido de la página (como el de descarga fallida de Mis archivos), con el nombre del archivo resuelto por la API (el
  aviso del canal no lo lleva, RN-9), «Abrir el editor de nuevo» y «Cerrar aviso». No es un toast (ADR-0024) y no hay
  componente nuevo, por eso no tiene mockup propio.
- **Coeditor de otra cuenta con plan Personal o vencido**: estado `solo-lectura-plan-propietario`. El texto no dice si el
  plan es Personal o venció, porque es información de otra cuenta.

## Pendiente
- Botón principal `#6B8DD6` en el paquete original (3.28:1, DF-41): los estados generados ya usan `primary` (`#4A6FA5`).
