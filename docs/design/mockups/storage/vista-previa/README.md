# Mockup: Vista previa

- **Spec**: 017 — previsualización (CA-1, CA-2, CA-5, CA-6, CA-9, CA-12; §6 Experiencia de usuario). Plan §2.5
  (slot `firstAction`, retorno y foco). Tarea T-05.
- **Estado**: Aprobado por Adrián (2026-10-07); el texto plano (TXT/MD) se queda en Inter.
- **Propuesta presentada**: no hay (diseño interno; P-3 de la spec: pantalla propia dentro del layout de la app).
- **Origen**: HTML autocontenido, un archivo por estado, generado con `generar.js` de esta carpeta; no se edita a mano.
  El generador vive aquí (y no en `_generadores/`) porque T-05 solo toca esta carpeta. Reutiliza sin cambios
  `_generadores/marco/marco.js`, `mis-archivos/`, `carpetas/carpetas.js`, `espacio/espacio.js` (barra lateral de 007,
  plan Personal) y `explorador/desglose.js` (tabla y menú ⋮ aprobados de 006). Tonos AA de `ui-guidelines.md` §2–§3,
  solo Inter, cifras con `tabular-nums`, versión móvil real a 360 px. Es referencia visual; `apps/web` no lo importa.

```bash
node docs/design/mockups/storage/vista-previa/generar.js "$(pwd)"
```

## Estados incluidos
| Estado | Archivo | Qué muestra |
|---|---|---|
| menu-fila | `vista-previa--menu-fila.html` | Menú ⋮ de un PDF: «Previsualizar» es el **primer** ítem; sigue el menú de 006 |
| menu-fila-sin-vista | `vista-previa--menu-fila-sin-vista.html` | Menú ⋮ de un `.docx`: sin «Previsualizar» (DOCX, «otros», SVG/BMP/HEIC no lo muestran) |
| volver-foco | `vista-previa--volver-foco.html` | Tras «Volver»: carpeta de origen con el foco en el ⋮ de la fila y anuncio «Volviste a Documentación.» |
| cargando | `vista-previa--cargando.html` | Antes de 2 s: esqueleto, título sin nombre (`h1` oculto «Vista previa») y «Abriendo la vista previa…» |
| espera-larga | `vista-previa--espera-larga.html` | Más de 2 s (CA-9): barra indeterminada, «Preparando la vista previa…», `aria-live="polite"` |
| pdf | `vista-previa--pdf.html` | PDF de 24 páginas apiladas; paginador «Página [1] de 24»; la página 3 se carga bajo demanda |
| imagen | `vista-previa--imagen.html` | PNG tal cual, ajustada al ancho; barra con formato y dimensiones |
| texto | `vista-previa--texto.html` | `.md` literal: `#`, `**`, enlaces y `<b>` se ven como texto, sin convertir |
| xlsx | `vista-previa--xlsx.html` | 3 hojas en pestañas; valores guardados; celdas «Sin valor guardado» y nota informativa |
| pptx | `vista-previa--pptx.html` | 5 diapositivas en orden, solo su texto |
| vacio | `vista-previa--vacio.html` | «Este archivo no tiene contenido para mostrar.» + Descargar |
| no-disponible | `vista-previa--no-disponible.html` | El navegador no pudo abrirlo (p. ej. memoria): causa + Descargar y Reintentar |
| protegido | `vista-previa--protegido.html` | Protegido con contraseña; Nimbo no la pide + Descargar y Reintentar |
| corrupto | `vista-previa--corrupto.html` | Dañado o contenido distinto de su tipo; «El original no cambió» + Descargar y Reintentar |
| expirado | `vista-previa--expirado.html` | La URL temporal venció: Reintentar (primario) la reemite + Descargar |
| error | `vista-previa--error.html` | Falla de red: Reintentar (primario) + Descargar y código de referencia (`correlationId`) |
| demasiadas-solicitudes | `vista-previa--demasiadas-solicitudes.html` | 429 de CA-12: «Hiciste demasiadas solicitudes. Espera un momento e inténtalo de nuevo.» |
| no-encontrado | `vista-previa--no-encontrado.html` | 404: ajeno = inexistente (CA-5); sin nombre, sin Descargar; «Ir a Mis archivos» |

Capturas: `docs/design/capturas/storage/vista-previa/vista-previa--<estado>--<360|1440>.png` (36), con
`_generadores/pw/capturar-rutas.js` (Playwright instalado aparte, como indica `_generadores/README.md`).
Verificación con `_generadores/pw/axe-seguridad.js`: sin desbordamiento horizontal a 360 px, objetivos ≥ 24 px (44 px en
móvil), sin errores de consola y sin violaciones de axe. La violación `label-content-name-mismatch` del marco compartido
(botón de la cuenta y logo) se corrigió en `marco.js` el 2026-10-07: el nombre accesible sale del texto visible.

## Decisiones de UX
- **Estructura**: «Volver» (botón visible a 360 y 1440 px, nombre accesible «Volver a {carpeta}») → nombre del archivo
  (`h1`), `FileTypeChip`, tamaño y fecha, distintivo «Solo lectura» (ícono + texto) y «Descargar» (outline) → tarjeta
  del visor con barra de herramientas propia del formato y lienzo `bg-muted`. La barra superior muestra la ruta de la
  carpeta y el nombre del archivo. Sin controles de edición en ningún formato (CA-6).
- **Volver** abre `file.folderId` (o la raíz) y enfoca el ⋮ de la fila de origen (fila marcada con `accent`); si la fila
  ya no está, el foco va al `h1` del explorador. En «no encontrado» vuelve a Mis archivos.
- **Nombre**: solo se muestra el que devuelve la API (`PreviewUrlResponse.file`), nunca el que recordaba el menú. Por eso
  `cargando` y `no-encontrado` muestran «Vista previa» sin nombre. Si la falla ocurre antes de que responda la API
  (p. ej. sin red), el encabezado es el de `cargando` sin esqueleto y el cuerpo el de `error`.
- **Fallas (CA-2)**: `StateView` dentro del visor con ícono, causa, qué hacer y dos acciones. La que más probablemente
  resuelve va primero y en primario: **Descargar** en no disponible, protegido y corrupto; **Reintentar** en expirado,
  error de red y 429. En los estados de falla y vacío, «Descargar» sale del encabezado para no repetirse. Corrupto y
  error de red usan el tono destructivo (`role="alert"`); protegido, no disponible, expirado y vacío son neutros
  (`role="status"`); el 429 usa `warning` (un límite no es una falla). Reintentar es siempre manual (plan §4/§5).
- **Formato no admitido** (422 al entrar por URL a un `.docx` u «otro»): usa el estado `no-disponible`.
- **Roles internos**: la ruta vive bajo `(cliente)` con `RequireRole`; Administrador, Soporte y Operador nunca ven
  esta pantalla ni la opción del menú (CA-4). No se diseña un estado «sin permiso» que revele el recurso.
- **PDF**: páginas apiladas en orden con el número debajo; paginador con anterior/siguiente (deshabilitado en el extremo)
  y campo de página; las páginas lejanas son un esqueleto hasta que se acercan. Nota «Texto seleccionable · sin
  ejecutar scripts del PDF».
- **XLSX**: pestañas de hojas (patrón `tablist`, flechas, Inicio, Fin) que se desplazan a 360 px; cuadrícula con letras
  de columna y número de fila fijos, en una región desplazable con foco (`tabindex="0"`), así la página no se desborda.
  «Sin valor guardado» lleva ícono y cursiva además del color.
- **Texto**: `pre` con `white-space: pre-wrap`, en Inter (no se usa `font-mono`); se escapa todo, nunca se interpreta.
- **PPTX**: tarjetas 16:9 que crecen si el texto no cabe; aviso «Solo el texto de cada diapositiva: sin imágenes,
  animaciones ni notas».
- **Espera larga**: barra indeterminada con borde `input`; con `prefers-reduced-motion` queda quieta. No muestra
  porcentaje porque la lectura por rangos no conoce el total.
- **Fuera de alcance**: DOCX (016), zoom, rotación, búsqueda dentro del archivo, impresión y límite de tamaño propio.

## Contraste de los pares nuevos (WCAG 2.1)
| Par | Contraste |
|---|---|
| `secondary-foreground` sobre `muted` (números de página y diapositiva sobre el lienzo) | 7.45 |
| `secondary-foreground` sobre la fila de origen (`accent` al 45 % sobre `card`) | 7.38 |
| `foreground` sobre `accent` (pestaña de hoja activa) | 11.07 |
| `primary` sobre `muted` (íconos de la barra) | 4.58 |
| `warning-foreground` sobre `card` (título del 429) | 5.20 |
| `destructive` / `foreground` sobre `destructive-soft` al 12 % (corrupto, error) | 4.81 / 12.10 |
| Borde `input` sobre `card` (paginador, cuadrícula, barra indeterminada) | 3.07 |

`muted-foreground` no se usa sobre `muted` ni sobre la fila marcada (no llega a 4.5).
