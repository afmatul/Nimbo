# Mockup: Términos

- **Spec**: 001 (D-14, D-22, CA-23, RN-12)
- **Propuesta presentada**: No presentada (diseño interno).
- **Origen**: HTML autocontenido escrito a mano (`.html`, Cielo Sereno con los tonos corregidos AA de `ui-guidelines.md` §2; solo carga Inter 400/500/600/700 de Google Fonts, sin JetBrains Mono: las cifras, el nombre del archivo en el rótulo y `.docx` usan Inter con `font-variant-numeric: tabular-nums`). A diferencia de los otros mockups de identity, tiene versión móvil real a 360 px. Es referencia visual; `apps/web` no lo importa.
- **Estados incluidos**:
  - default: página pública sin sesión, versión 1.0 (`terminos.html`)
- **Capturas**: `docs/design/capturas/identity/terminos/` (`terminos--default--<360|1440>.png`)

## Decisiones de UX
- Página de lectura sin sesión: cabecera con el logo e «Iniciar sesión» y «Crear cuenta», como el enlace público.
- Título, línea «Versión 1.0 · vigente desde el {fecha de publicación}» (la fecha la pone el servidor al publicar) y un aviso visible «Nimbo es un proyecto académico» antes de las secciones.
- Diez secciones numeradas y cortas, con índice de anclas: barra lateral fija a 1440 px y bloque plegable «En esta página · 10 secciones» a 360 px, para que el título quede en la primera pantalla.
- Columna de lectura de ≈ 70 caracteres (37rem a 15 px), texto `#3A5068`, títulos `#1E2D40`, enlaces `#4A6FA5` subrayados y botón «Volver al registro» `#4A6FA5` con texto blanco (5.11:1).
- Lo más importante va en negrita, no solo en color: los pagos simulados, la copia de tus archivos y el borrado de finales de noviembre de 2026.
- Pie con enlace a la Política de privacidad, correo de contacto y «Volver al registro».

## Pendiente
- Los textos son un borrador; el texto final lo propone el plan y lo revisa el dueño (D-22).
- Eliminar la cuenta se pide por correo; un botón en la aplicación queda para después, si hay tiempo (sin spec).
