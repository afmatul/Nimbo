# Mockup: Verificar correo

- **Spec**: 001
- **Hoja de la entrega**: 02b y 02c
- **Origen**: HTML empaquetado y autocontenido (`.html`, Cielo Sereno, lienzo de ≈ 1490 px con el rótulo de la hoja). Es referencia visual; `apps/web` no lo importa.
- **Estados incluidos**:
  - verificando (`verificar-correo--verificando.html`, hoja 02b)
  - exito «Correo verificado», con sesión (`verificar-correo--exito.html`, hoja 02c)
- **Capturas**: `docs/design/capturas/identity/verificar-correo/` (`verificar-correo--<estado>--<360|1440>.png`)

## Decisiones de UX
- La página del enlace muestra un indicador de progreso mientras se valida el token.
- Al verificar, el dispositivo queda con sesión y la pantalla ofrece «Ir a Mis archivos» (D-20).

## Pendiente
- Estados de la spec 001 §11: ya-verificado, enlace-expirado, enlace-invalido y plan-de-pago-elegido (D-24).
- Botón principal `#6B8DD6` con texto blanco (3.28:1) no cumple AA (DF-41); la implementación usa el token corregido.
- Versión móvil real a 360 px: el mockup está diseñado para escritorio y la captura a 360 px muestra el mismo lienzo.
