# Mockup: Compartir y accesos

- **Spec**: 012 (RF-16, RF-18; CA-1 a CA-9, CA-20, CA-27; RN-1 a RN-3, RN-6, RN-11). El enlace público es de 013
  (`../enlace-publico/`).
- **Propuesta presentada**: p. 14 (`compartir--propuesta.html`, ver «Origen»).
- **Origen**: dos tecnologías en la misma carpeta.
  - Estados de 012: HTML autocontenido generado con `../../_generadores/compartir/generar.js` (ver
    [`_generadores/README.md`](../../_generadores/README.md)); no se edita a mano. Corpus y página de 012 en
    `_generadores/comparticion/`; explorador de fondo de `explorador/desglose.js` y `carpetas/carpetas.js` (006);
    confirmación destructiva de `carpetas/carpetas.js`; aviso `warning` en diálogo de `mis-archivos/estados.js`. Tokens AA
    de `ui-guidelines.md` §2–§3, solo Inter, cifras con `tabular-nums`. Versión móvil real a 360 px.
  - `compartir--propuesta.html`: el HTML empaquetado de la propuesta (antes `compartir.html`, con sus capturas
    renombradas). **Se pasó al patrón vigente** (un HTML generado por estado) porque contradice la spec: tiene
    «externos», enlace público con clave y expiración, y el botón `#6B8DD6` con texto blanco (3.28:1, DF-41). Queda
    solo como historia; no se implementa.
  - Son referencia visual; `apps/web` no los importa.
- **Estados incluidos** (`compartir--<estado>.html`; todos los de la spec más entrada, carga, éxito y la carpeta de origen):
  - menu-fila: menú ⋮ de una carpeta propia en Mis archivos con «Compartir» (entrada; RN-1)
  - sin-accesos: solo la propietaria; «Aún no compartes «Proyecto Alpha» con nadie.»
  - cargando: esqueleto de la lista con «Cargando quién tiene acceso…»
  - con-accesos: archivo con accesos directos (nivel y «Quitar») y heredados de «Proyecto Alpha» sin controles, con
    «Gestionar en «Proyecto Alpha»» y «Rige su acceso directo: Editor» cuando la persona tiene ambos (CA-6, CA-20)
  - con-accesos-carpeta: la carpeta de origen con tres accesos directos (destino de «Gestionar en…»)
  - agregando: «Compartiendo…» con campos y botón deshabilitados y anuncio (CA-1)
  - compartido: éxito; la persona aparece arriba con «NUEVO» y un mensaje `role="status"` (CA-1, RN-11)
  - error-correo-generico: el mensaje de CA-2, igual para correo sin cuenta, sin verificar, suspendida o interna
  - error-propio: «Este elemento ya es tuyo.» (CA-3)
  - ya-tiene-acceso: «Sofía Méndez ya tiene acceso. Cambia su nivel en la lista.» y su fila resaltada (CA-4)
  - cambiando-nivel: Lector → Editor con «Guardando…» en la fila y anuncio (CA-7)
  - confirmar-revocar: «¿Quitar el acceso de Javier Ajú?» con el texto de la spec; « y lo que contiene» solo porque
    es una carpeta (CA-8, §6)
  - demasiados-intentos: `Alert` `warning` con la espera y «Compartir» deshabilitado (CA-5)
  - error: la lista no cargó; causa y «Reintentar»
  - propuesta: paquete de la propuesta (histórico)
- **Capturas**: `docs/design/capturas/sharing/compartir/compartir--<estado>--<360|1440>.png` (14 estados × 2 anchos,
  más `propuesta`).
- **Verificación** (axe-core 4.14 con `pw/axe-seguridad.js`): sin violaciones en los 13 estados con diálogo; sin
  desbordamiento a 360 px y sin objetivos de menos de 24 px (44 px en móvil). `menu-fila` tiene una sola violación
  `serious` (`label-content-name-mismatch` en el botón de la cuenta), que viene del marco y aparece en todos los mockups
  generados; la corrige `marco/marco.js` en la rama de 017. Con esa corrección, los 14 estados quedan sin violaciones.

## Decisiones de UX
- **Entrada**: «Compartir» en el menú ⋮ de la fila de Mis archivos, después de «Descargar» en archivos y primero en
  carpetas. Solo lo ve el propietario: en «Compartido conmigo» no existe (RN-1, CA-9).
- **Diálogo** (`Dialog` de shadcn, no `AlertDialog`): ícono de tipo, «Compartir «{nombre}»», dónde está y por qué no
  llega un correo («no enviamos aviso por correo: lo verán en «Compartido conmigo»», RN-11). Se cierra con la X o Escape;
  no tiene «Guardar»: cada acción se aplica sola.
- **Formulario**: «Correo de la persona» (`type="email"`), «Nivel» (Lector por defecto; solo Lector y Editor, RN-1) y
  «Compartir». Debajo, qué permite cada nivel en texto. Los errores van bajo el campo con ícono, `role="alert"` y
  `aria-invalid`; el campo conserva lo escrito para corregirlo. El de CA-2 es idéntico en los cuatro casos.
- **Éxito**: la persona entra arriba con «NUEVO», el campo se vacía y recibe el foco para agregar a otra, y un mensaje
  en `success-foreground` lo confirma. No es un toast: el diálogo sigue abierto.
- **Ya tiene acceso** (CA-4): además del error, su fila se resalta (`accent` + barra de 3 px `brand`, el patrón de fila
  seleccionada) para que encuentre dónde cambiar el nivel.
- **Lista (`AccessList`)**: la propietaria primero («(tú)» y «Propietario» sin controles); luego los directos, de lo
  más reciente a lo más antiguo, con nombre, correo, «desde el {fecha}», el nivel como `select` (cambia al elegirlo) y
  «Quitar» con nombre accesible completo («Quitar el acceso de …»).
- **Heredados** (CA-6): grupo «Heredado de «{carpeta}»» con el nivel en texto y sin controles, la nota «Estos accesos
  se cambian o se quitan en esa carpeta.» y «Gestionar en «{carpeta}»», que abre este mismo diálogo para la carpeta de
  origen. Si la persona tiene también acceso directo de otro nivel, la fila heredada dice cuál rige (CA-20, RN-6).
- **Cambiar nivel** (CA-7): sin confirmación (es reversible); mientras se guarda, el `select` y «Quitar» de esa fila
  quedan deshabilitados con «Guardando…» y un anuncio `role="status"`.
- **Quitar** (CA-8): `ConfirmDestructiveDialog` sobre el diálogo, con el texto de la spec, foco inicial en «Cancelar» y
  botón destructivo «Quitar acceso». Una persona suspendida se ve y se quita igual (CA-23): no hay distintivo de suspensión.
- **Demasiados intentos** (CA-5): no es una falla, es un límite: `Alert` `warning` dentro del diálogo con la espera
  de `Retry-After` y «Compartir» deshabilitado; la lista sigue usable.
- **Móvil**: el formulario se apila (botón a todo el ancho, 44 px) y cada persona muestra sus controles en una
  segunda línea. En la app el diálogo se desplaza dentro de la ventana; en el mockup la hoja crece para mostrarlo entero.
- **Sin permiso**: Editor, Lector y roles internos no ven la entrada (CA-9, CA-25); no hay pantalla «sin permiso».

## Contraste de los pares nuevos (WCAG 2.1)
| Par | Contraste |
|---|---|
| `secondary-foreground` sobre `muted` (distintivo de nivel) | 7.45 |
| `muted-foreground` sobre `card` (correo y fecha) | 4.76 |
| `foreground` / `secondary-foreground` sobre `accent` (fila resaltada; el correo pasa a `secondary`) | 11.07 / 6.59 |
| `success-foreground` sobre `card` (mensaje de éxito) | 5.25 |
| `primary` sobre `card` («Gestionar en…») | 4.97 |
| `input` sobre `card` (borde del `select`, no texto) | 3.07 |
| `warning-foreground` sobre `warning` al 10 % (aviso de intentos) | 4.86 |

## Pendiente
- Solo lectura por plan vencido (RF-23): ¿la propietaria puede compartir o cambiar niveles? Lo fija 010 (no se dibuja).
- La rejilla del mockup que hace crecer la hoja (`.canvas:has(.dialog-share)`) es del mockup, no del componente.
