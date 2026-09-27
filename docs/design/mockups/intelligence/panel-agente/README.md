# Mockup: Panel del agente

- **Spec**: 020
- **Propuesta presentada**: No presentada (diseño interno).
- **Origen**: HTML empaquetado y autocontenido (`.html`, Cielo Sereno, lienzo de ≈ 1490 px con el rótulo de la hoja). Es referencia visual; `apps/web` no lo importa.
- **Estados incluidos**:
  - con-citas (`panel-agente--con-citas.html`)
- **Capturas**: `docs/design/capturas/intelligence/panel-agente/` (`panel-agente--<estado>--<360|1440>.png`)

## Decisiones de UX
- Panel lateral persistente de 420 px; la cita abre el fragmento exacto a la izquierda.

## Pendiente
- El documento de ejemplo dice que el plan Equipo permite 2 GB por archivo; el catálogo dice 1 GB.
- Estados del inventario: vacio, respondiendo, cita-incierta y limite-alcanzado.
- Botón principal `#6B8DD6` con texto blanco (3.28:1) no cumple AA (DF-41); la implementación usa el token corregido.
- Versión móvil real a 360 px: el mockup está diseñado para escritorio y la captura a 360 px muestra el mismo lienzo.
