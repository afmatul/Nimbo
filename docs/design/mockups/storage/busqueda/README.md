# Mockup: Búsqueda

- **Spec**: 018
- **Propuesta presentada**: p. 13.
- **Cambios respecto de la propuesta**: ninguno en el mockup; al implementar, el botón principal usa el token corregido (DF-41) en lugar de `#6B8DD6`.
- **Origen**: HTML empaquetado y autocontenido (`.html`, Cielo Sereno, lienzo de ≈ 1490 px con el rótulo de la hoja). Es referencia visual; `apps/web` no lo importa.
- **Estados incluidos**:
  - resultados (`busqueda--resultados.html`)
- **Capturas**: `docs/design/capturas/storage/busqueda/` (`busqueda--<estado>--<360|1440>.png`)

## Decisiones de UX
- Resultados con el fragmento que coincide y su ubicación, no solo el nombre; filtros por tipo y ámbito.

## Pendiente
- Estado del inventario: sin-resultados.
- Botón principal `#6B8DD6` con texto blanco (3.28:1) no cumple AA (DF-41); la implementación usa el token corregido.
- Versión móvil real a 360 px: el mockup está diseñado para escritorio y la captura a 360 px muestra el mismo lienzo.
