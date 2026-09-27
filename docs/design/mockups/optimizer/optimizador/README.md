# Mockup: Optimizador

- **Spec**: 021
- **Propuesta presentada**: p. 12.
- **Cambios respecto de la propuesta**: ninguno en el mockup; al implementar, el botón principal usa el token corregido (DF-41) en lugar de `#6B8DD6`.
- **Origen**: HTML empaquetado y autocontenido (`.html`, Cielo Sereno, lienzo de ≈ 1490 px con el rótulo de la hoja). Es referencia visual; `apps/web` no lo importa.
- **Estados incluidos**:
  - estimacion (`optimizador--estimacion.html`)
- **Capturas**: `docs/design/capturas/optimizer/optimizador/` (`optimizador--<estado>--<360|1440>.png`)

## Decisiones de UX
- Estimación de ahorro por archivo y en total, con método de compresión y garantías antes de reemplazar.

## Pendiente
- Datos de ejemplo: archivos de 8.5 GB y 6.2 GB superan el máximo por archivo de cualquier plan (2 GB).
- Estados del inventario: no-conviene, procesando y completado.
- Botón principal `#6B8DD6` con texto blanco (3.28:1) no cumple AA (DF-41); la implementación usa el token corregido.
- Versión móvil real a 360 px: el mockup está diseñado para escritorio y la captura a 360 px muestra el mismo lienzo.
