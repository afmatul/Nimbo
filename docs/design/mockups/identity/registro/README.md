# Mockup: Registro

- **Spec**: 001
- **Hoja de la entrega**: 01 y 02
- **Origen**: HTML empaquetado y autocontenido (`.html`, Cielo Sereno, lienzo de ≈ 1490 px con el rótulo de la hoja). Es referencia visual; `apps/web` no lo importa.
- **Estados incluidos**:
  - default «Crea tu cuenta» (`registro.html`, hoja 01)
  - exito «Revisa tu correo», sin sesión (`registro--exito.html`, hoja 02)
- **Capturas**: `docs/design/capturas/identity/registro/` (`registro--<estado>--<360|1440>.png`)

## Decisiones de UX
- Dos columnas: propuesta de valor y plan elegido a la izquierda; formulario a la derecha, con pasos Cuenta → Verificación → Listo.
- Selector de plan dentro del formulario (D-4); precios y límites vienen de la API, los del mockup son de referencia.
- Requisitos de contraseña en vivo: 12 caracteres o más, una mayúscula, un número y un símbolo (D-6).
- Casilla «Acepto los Términos y la Política de privacidad» con dos enlaces separados (D-14).
- «Revisa tu correo» sin sesión (D-9): enlace de 24 h, «Reenviar enlace» con cuenta regresiva y «Cambiar correo».

## Pendiente
- Estados de la spec 001 §11: enviando, error (por campo y del servidor), catalogo-no-disponible, limite-reenvio y pedir-enlace.
- Páginas estáticas de Términos y Política de privacidad (D-14, textos según D-22).
- Botón principal `#6B8DD6` con texto blanco (3.28:1) no cumple AA (DF-41); la implementación usa el token corregido.
- Versión móvil real a 360 px: el mockup está diseñado para escritorio y la captura a 360 px muestra el mismo lienzo.
