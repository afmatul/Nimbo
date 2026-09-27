# Mockup: Planes y comparador

- **Spec**: 008
- **Propuesta presentada**: p. 16.
- **Cambios respecto de la propuesta**: ninguno.
- **Origen**: HTML empaquetado y autocontenido (`.html`, Cielo Sereno, lienzo de ≈ 1490 px con el rótulo de la hoja). Es referencia visual; `apps/web` no lo importa.
- **Estados incluidos**:
  - plan-actual (`planes--plan-actual.html`): el plan Equipo queda marcado
- **Capturas**: `docs/design/capturas/billing/planes/` (`planes--<estado>--<360|1440>.png`)

## Decisiones de UX
- Cuatro tarjetas y una tabla que compara los límites; precios en quetzales. Los valores coinciden con el catálogo (product-context §3).

## Pendiente
- Estado del inventario: default (sin plan actual).
- «Hablar con ventas» en Institucional no tiene un flujo en los requisitos; el cambio de plan es con el pago simulado.
- Botón principal `#6B8DD6` con texto blanco (3.28:1) no cumple AA (DF-41); la implementación usa el token corregido.
- Versión móvil real a 360 px: el mockup está diseñado para escritorio y la captura a 360 px muestra el mismo lienzo.
