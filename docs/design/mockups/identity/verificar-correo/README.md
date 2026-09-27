# Mockup: Verificar correo

- **Spec**: 001
- **Propuesta presentada**: p. 05 (verificando) y p. 06 (exito). Los demás estados no se presentaron.
- **Cambios respecto de la propuesta**: ninguno en el mockup; al implementar, el botón principal usa el token corregido (DF-41) en lugar de `#6B8DD6`.
- **Origen**: HTML empaquetado y autocontenido (`.html`, Cielo Sereno, lienzo de ≈ 1490 px con el rótulo de la hoja). Es referencia visual; `apps/web` no lo importa.
- **Estados incluidos**:
  - verificando (`verificar-correo--verificando.html`, propuesta p. 05)
  - exito «Correo verificado», con sesión (`verificar-correo--exito.html`, propuesta p. 06)
  - enlace-expirado (`verificar-correo--enlace-expirado.html`)
  - enlace-invalido (`verificar-correo--enlace-invalido.html`)
  - ya-verificado, sin sesión, con «Iniciar sesión» (`verificar-correo--ya-verificado.html`)
  - plan-de-pago-elegido: plan Equipo con pago pendiente (`verificar-correo--plan-de-pago-elegido.html`, D-24)
- **Capturas**: `docs/design/capturas/identity/verificar-correo/` (`verificar-correo--<estado>--<360|1440>.png`)

## Decisiones de UX
- La página del enlace muestra un indicador de progreso mientras se valida el token.
- Al verificar, el dispositivo queda con sesión y la pantalla ofrece «Ir a Mis archivos» (D-20).

## Pendiente
- plan-de-pago-elegido muestra el comportamiento final con 009 («Pago pendiente», «Completar pago»). En Fase 1, mientras 009 no existe, D-24 pide decir que el plan se activa desde «Plan y facturación» cuando esté disponible.
- Botón principal `#6B8DD6` con texto blanco (3.28:1) no cumple AA (DF-41); la implementación usa el token corregido.
- Versión móvil real a 360 px: el mockup está diseñado para escritorio y la captura a 360 px muestra el mismo lienzo.
