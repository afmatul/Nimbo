# Mockup: Pago simulado

- **Spec**: 009
- **Propuesta presentada**: No presentada (diseño interno).
- **Origen**: HTML empaquetado y autocontenido (`.html`, Cielo Sereno, lienzo de ≈ 1490 px con el rótulo de la hoja). Es referencia visual; `apps/web` no lo importa.
- **Estados incluidos**:
  - default (`pago.html`)
- **Capturas**: `docs/design/capturas/billing/pago/` (`pago--<estado>--<360|1440>.png`)

## Decisiones de UX
- Formulario de tarjeta marcado como SIMULADO, con tarjetas de prueba que aprueban o rechazan, y resumen con IVA y fecha de renovación.

## Pendiente
- Estados del inventario: rechazado y exito.
- Botón principal `#6B8DD6` con texto blanco (3.28:1) no cumple AA (DF-41); la implementación usa el token corregido.
- Versión móvil real a 360 px: el mockup está diseñado para escritorio y la captura a 360 px muestra el mismo lienzo.
