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

## Diferencias de la implementación (001, revisión visual T-67)
- **Panel lateral** (propuesta de valor y «Plan elegido» sobre fondo oscuro): no se implementa en 001. El formulario
  va en una sola columna con el indicador «Cuenta · Verificación · Listo» y el subtítulo del mockup. Queda para el
  pulido de la Fase 4 si se decide; el plan elegido se ve en el selector.
- **error-servidor**: recuadro de error con ícono, título en negrita («No pudimos crear tu cuenta.») y el mensaje
  genérico de 000 §10 con el código para soporte, arriba del formulario. El texto del cuerpo es el de spec §11, no el
  del mockup.
- «Revisa tu correo», limite-reenvio y pedir-enlace van en tarjeta con ícono e indicador de pasos. La cuenta regresiva
  va en un texto aparte anunciado con `aria-live`, no dentro del botón. pedir-enlace no muestra el aviso «El enlace
  que abriste expiró»: la página no sabe desde dónde se llegó (el correo no viaja en la URL). El título y el botón
  siguen spec §11 («Pedir un enlace nuevo», «Pedir enlace»).
- Requisitos de contraseña: una fila por regla con «Cumple»/«Falta» (ícono, color y texto), en lugar de la barra de
  fuerza y las dos columnas; los rótulos positivos de contraseña común y correo están en spec §11.
- Los enlaces de la casilla y los de texto van subrayados (no solo por color).

## Pendiente
- Páginas estáticas de Términos y Política de privacidad (D-14, textos según D-22).
- Botón principal `#6B8DD6` con texto blanco (3.28:1) no cumple AA (DF-41); la implementación usa el token corregido.
- Versión móvil real a 360 px: el mockup está diseñado para escritorio y la captura a 360 px muestra el mismo lienzo.
