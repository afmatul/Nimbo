# Mockup: Ficha de archivo con historial de versiones

- **Spec**: 014, 019
- **Propuesta presentada**: No presentada (diseño interno).
- **Origen**: HTML empaquetado y autocontenido (`.html`, Cielo Sereno, lienzo de ≈ 1490 px con el rótulo de la hoja). Es referencia visual; `apps/web` no lo importa.
- **Estados incluidos**:
  - default (`ficha-archivo.html`): detalles, autoría e historial de versiones
- **Capturas**: `docs/design/capturas/storage/ficha-archivo/` (`ficha-archivo--<estado>--<360|1440>.png`)

## Decisiones de UX
- Detalles del archivo (tipo, tamaño, ubicación, indexación, accesos, enlace público) y reparto de autoría.
- Historial con versión, autor, fecha, tamaño y cambio; «Restaurar crea una versión nueva; ninguna se borra».
- Cubre también la fila «Historial de versiones con autoría» del inventario.

## Pendiente
- Estados del inventario: no-indexable y restaurando.
- Botón principal `#6B8DD6` con texto blanco (3.28:1) no cumple AA (DF-41); la implementación usa el token corregido.
- Versión móvil real a 360 px: el mockup está diseñado para escritorio y la captura a 360 px muestra el mismo lienzo.
