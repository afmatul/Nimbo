# Mockup: Inicio de sesión

- **Spec**: 002
- **Propuesta presentada**: p. 07.
- **Cambios respecto de la propuesta**: ninguno en el mockup; al implementar, el botón principal usa el token corregido (DF-41) en lugar de `#6B8DD6`.
- **Origen**: HTML empaquetado y autocontenido (`.html`, Cielo Sereno, lienzo de ≈ 1490 px con el rótulo de la hoja). Es referencia visual; `apps/web` no lo importa.
- **Estados incluidos**:
  - default (`inicio-sesion.html`)
- **Capturas**: `docs/design/capturas/identity/inicio-sesion/` (`inicio-sesion--<estado>--<360|1440>.png`)

## Decisiones de UX
- Mismo esquema de dos columnas que el registro; «¿Olvidaste tu contraseña?» junto al campo de contraseña y acceso a «Crear cuenta».

## Pendiente
- Estados del inventario: error y bloqueado. Desde aquí se llega también a pedir un enlace de verificación nuevo (001, pedir-enlace).
- Botón principal `#6B8DD6` con texto blanco (3.28:1) no cumple AA (DF-41); la implementación usa el token corregido.
- Versión móvil real a 360 px: el mockup está diseñado para escritorio y la captura a 360 px muestra el mismo lienzo.
