# Mockup: Enlace público

- **Spec**: 013
- **Hoja de la entrega**: 10
- **Origen**: HTML empaquetado y autocontenido (`.html`, Cielo Sereno, lienzo de ≈ 1490 px con el rótulo de la hoja). Es referencia visual; `apps/web` no lo importa.
- **Estados incluidos**:
  - con-contrasena (`enlace-publico--con-contrasena.html`): visitante sin cuenta
- **Capturas**: `docs/design/capturas/sharing/enlace-publico/` (`enlace-publico--<estado>--<360|1440>.png`)

## Decisiones de UX
- Página pública con quién compartió, nombre, tamaño y expiración del archivo; pide la clave antes de mostrarlo.

## Pendiente
- Estados del inventario: expirado y revocado. La creación del enlace está en `sharing/compartir`.
- Botón principal `#6B8DD6` con texto blanco (3.28:1) no cumple AA (DF-41); la implementación usa el token corregido.
- Versión móvil real a 360 px: el mockup está diseñado para escritorio y la captura a 360 px muestra el mismo lienzo.
