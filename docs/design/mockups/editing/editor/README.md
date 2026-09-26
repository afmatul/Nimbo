# Mockup: Editor .docx

- **Spec**: 016
- **Hoja de la entrega**: 06b (anexo, no se firma)
- **Origen**: HTML empaquetado y autocontenido (`.html`, Cielo Sereno, lienzo de ≈ 1490 px con el rótulo de la hoja). Es referencia visual; `apps/web` no lo importa.
- **Estados incluidos**:
  - editando (`editor--editando.html`)
- **Capturas**: `docs/design/capturas/editing/editor/` (`editor--<estado>--<360|1440>.png`)

## Decisiones de UX
- Barra de herramientas superior, versión actual y panel lateral de revisión.

## Pendiente
- Incluye atribución por párrafo, firma y sugerencias del agente: **fuera de alcance** (product-context §9); se ignoran al implementar.
- Estados del inventario: limite-editores, guardado-fallido y solo-lectura.
- Botón principal `#6B8DD6` con texto blanco (3.28:1) no cumple AA (DF-41); la implementación usa el token corregido.
- Versión móvil real a 360 px: el mockup está diseñado para escritorio y la captura a 360 px muestra el mismo lienzo.
