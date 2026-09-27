# Mockup: Registro

- **Spec**: 001
- **Propuesta presentada**: p. 03 (default) y p. 04 (exito) del PDF «Mockups nimbo final». Los demás estados no se presentaron.
- **Cambios respecto de la propuesta**: ninguno en el mockup; al implementar, el botón principal usa el token corregido (DF-41) en lugar de `#6B8DD6`.
- **Origen**: HTML empaquetado y autocontenido (`.html`, Cielo Sereno, lienzo de ≈ 1490 px con el rótulo de la hoja). Es referencia visual; `apps/web` no lo importa.
- **Estados incluidos**:
  - default «Crea tu cuenta» (`registro.html`, propuesta p. 03)
  - exito «Revisa tu correo», sin sesión (`registro--exito.html`, propuesta p. 04)
  - enviando «Creando cuenta…» (`registro--enviando.html`)
  - error-campos: correo inválido y contraseña que no cumple (`registro--error-campos.html`)
  - error-servidor: aviso sobre el formulario, con los datos conservados (`registro--error-servidor.html`)
  - catalogo-no-disponible: solo Personal, con aviso en lugar del selector (`registro--catalogo-no-disponible.html`, CA-22)
  - limite-reenvio: «Revisa tu correo» con el reenvío bloqueado (`registro--limite-reenvio.html`, D-8)
  - pedir-enlace: formulario de correo para pedir un enlace nuevo, desde un enlace expirado (`registro--pedir-enlace.html`)
- **Capturas**: `docs/design/capturas/identity/registro/` (`registro--<estado>--<360|1440>.png`)

## Decisiones de UX
- Dos columnas: propuesta de valor y plan elegido a la izquierda; formulario a la derecha, con pasos Cuenta → Verificación → Listo.
- Selector de plan dentro del formulario (D-4); precios y límites vienen de la API, los del mockup son de referencia.
- Requisitos de contraseña en vivo: 12 caracteres o más, una mayúscula, un número y un símbolo (D-6).
- Casilla «Acepto los Términos y la Política de privacidad» con dos enlaces separados (D-14).
- «Revisa tu correo» sin sesión (D-9): enlace de 24 h, «Reenviar enlace» con cuenta regresiva y «Cambiar correo».

## Pendiente
- Páginas estáticas de Términos y Política de privacidad (D-14, textos según D-22).
- Botón principal `#6B8DD6` con texto blanco (3.28:1) no cumple AA (DF-41); la implementación usa el token corregido.
- Versión móvil real a 360 px: el mockup está diseñado para escritorio y la captura a 360 px muestra el mismo lienzo.
