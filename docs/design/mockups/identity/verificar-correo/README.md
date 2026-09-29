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
  - plan-de-pago-elegido: la cuenta queda en Personal y el aviso remite a «Plan y facturación» para activar Equipo (`verificar-correo--plan-de-pago-elegido.html`, D-24)
- **Capturas**: `docs/design/capturas/identity/verificar-correo/` (`verificar-correo--<estado>--<360|1440>.png`)

## Decisiones de UX
- La página del enlace muestra un indicador de progreso mientras se valida el token.
- Al verificar, el dispositivo queda con sesión y la pantalla ofrece «Ir a Mis archivos» (D-20).
- **Mientras 002 no exista** (decisión de Adrián, 2026-09-28; spec 001 §11 y registro de cambios): la pantalla
  «Correo verificado» no tiene sesión y su botón dice «Iniciar sesión», con destino `/iniciar-sesion`. Con 002 vuelve
  a «Ir a Mis archivos».

## Diferencias de la implementación (001, revisión visual T-67)
- Tarjeta, ícono contextual e indicador «Cuenta · Verificación · Listo» como en el mockup; «ya verificado» sin
  indicador, igual que el mockup.
- Los textos son los de spec §11, no los del mockup (p. ej., «Enlace vencido» en lugar de «Este enlace expiró»).
- «Correo verificado»: la tarjeta del plan muestra «Plan Personal» y, si se eligió uno de pago, el aviso de CA-28. No
  muestra precio, «0 de 15 GB» ni «50 MB», que dependen del catálogo de 006a y de la cuota de 007; tampoco el saludo
  con el nombre ni «Comparar planes» (sin sesión no hay nombre ni página de planes). La cabecera no muestra cuenta.
- El círculo de pasos completados usa `success-foreground` (no el verde claro del mockup) para que la marca tenga
  contraste suficiente.

## Pendiente
- Botón principal `#6B8DD6` con texto blanco (3.28:1) no cumple AA (DF-41); la implementación usa el token corregido.
- Versión móvil real a 360 px: el mockup está diseñado para escritorio y la captura a 360 px muestra el mismo lienzo.
