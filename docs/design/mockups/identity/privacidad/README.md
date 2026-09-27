# Mockup: Política de privacidad

- **Spec**: 001 (D-14, D-22, CA-23, RN-12)
- **Propuesta presentada**: No presentada (diseño interno).
- **Origen**: HTML autocontenido escrito a mano (`.html`, Cielo Sereno con los tonos corregidos AA de `ui-guidelines.md` §2; solo carga Inter 400/500/600/700 de Google Fonts, sin JetBrains Mono: las cifras, las tablas y el nombre del archivo en el rótulo usan Inter con `font-variant-numeric: tabular-nums`). A diferencia de los otros mockups de identity, tiene versión móvil real a 360 px. Es referencia visual; `apps/web` no lo importa.
- **Estados incluidos**:
  - default: página pública sin sesión, versión 1.0 (`privacidad.html`)
- **Capturas**: `docs/design/capturas/identity/privacidad/` (`privacidad--default--<360|1440>.png`)

## Decisiones de UX
- Misma estructura que Términos: cabecera sin sesión, título, línea «Versión 1.0 · vigente desde el {fecha de publicación}», aviso de proyecto académico, índice de anclas (barra lateral a 1440 px, plegable a 360 px) y once secciones numeradas.
- Recuadro «Lo esencial» al inicio con cuatro puntos: no se venden datos ni se usan para publicidad, el equipo interno no ve el contenido, los pagos son simulados y todo se borra a finales de noviembre de 2026. Cada punto lleva ícono y texto; el color no es el único indicador.
- Datos agrupados por momento («Al registrarte», «Mientras usas Nimbo», «Para proteger el servicio»).
- Proveedores (DigitalOcean, Resend, Google Gemini) en tarjetas apiladas en lugar de una tabla, para que quepan a 360 px sin desplazamiento horizontal: nombre, función y qué datos recibe.
- Retención por plan en una tabla de tres columnas con `caption`, encabezados `th` y cifras tabulares; cabe a 360 px.
- Columna de lectura de ≈ 70 caracteres, enlaces `#4A6FA5` subrayados, texto atenuado `#5E7389` solo en metadatos (4.56:1 o más).

## Pendiente
- Los textos son un borrador; el texto final lo propone el plan y lo revisa el dueño (D-22).
- La tabla de retención repite valores del catálogo de planes; el plan debe decidir si la página los lee de la API o si se publican fijos en cada versión del texto.
- Eliminar la cuenta se pide por correo; un botón en la aplicación queda para después, si hay tiempo (sin spec).
- La vista donde la persona ve las consultas de Soporte depende de la spec 004.
