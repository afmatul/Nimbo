# Mockup: Compartir y accesos

- **Spec**: 012–013
- **Hoja de la entrega**: 09
- **Origen**: HTML empaquetado y autocontenido (`.html`, Cielo Sereno, lienzo de ≈ 1490 px con el rótulo de la hoja). Es referencia visual; `apps/web` no lo importa.
- **Estados incluidos**:
  - default (`compartir.html`): modal sobre el explorador con personas, niveles y enlace público activo
- **Capturas**: `docs/design/capturas/sharing/compartir/` (`compartir--<estado>--<360|1440>.png`)

## Decisiones de UX
- Invitación por correo con nivel, lista de accesos (incluye externos y herencia de carpeta) y enlace público con clave y expiración.

## Pendiente
- Estado del inventario: lista-accesos como vista propia.
- Botón principal `#6B8DD6` con texto blanco (3.28:1) no cumple AA (DF-41); la implementación usa el token corregido.
- Versión móvil real a 360 px: el mockup está diseñado para escritorio y la captura a 360 px muestra el mismo lienzo.
