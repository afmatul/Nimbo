# Mockup: Enlace público (página)

- **Spec**: 013b (página pública `/enlace`, CA-1 a CA-8 y CA-11; §6). La API es la 013. La sección «Enlace público»
  del diálogo «Compartir» es de la 013c y no está aquí.
- **Propuesta presentada**: p. 15 (`enlace-publico--propuesta.html`, paquete empaquetado; no se genera y es solo
  referencia histórica).
- **Origen**: HTML autocontenido generado con `_generadores/enlace-publico/generar.js` sobre `marco/marco.js`
  (tokens de Cielo Sereno, solo Inter). No se edita a mano. Es referencia visual; `apps/web` no lo importa.
- **Estados incluidos** (spec 013b §6):
  - cargando (`enlace-publico--cargando.html`): esqueleto con la forma de la ficha y «Cargando el archivo compartido…» con `role="status"` (CA-1)
  - sin-contrasena (`enlace-publico--sin-contrasena.html`): ficha y «Descargar», nada más (CA-1)
  - con-contrasena (`enlace-publico--con-contrasena.html`): la misma ficha, sin escribir nada, y el campo «Contraseña del enlace» con su ayuda antes de «Descargar» (CA-2, RN-2)
  - contrasena-incorrecta (`enlace-publico--contrasena-incorrecta.html`): `403`, campo vacío, `aria-invalid`, mensaje con `role="alert"` y foco en el campo (CA-4)
  - bloqueado (`enlace-publico--bloqueado.html`): `429` al descargar, aviso neutro `Alert` warning con `role="status"` sobre la ficha; el campo queda vacío, igual que con una incorrecta (CA-5, CA-12)
  - descargando (`enlace-publico--descargando.html`): pasados 2 s, «Preparando descarga…», `aria-disabled` y anuncio (CA-3)
  - descarga-iniciada (`enlace-publico--descarga-iniciada.html`): `Alert` success con `role="status"` y «Descargar» disponible otra vez (CA-3)
  - descarga-error-red (`enlace-publico--descarga-error-red.html`): la red falla al descargar; `Alert` warning con `role="status"` sobre la ficha, «No pudimos iniciar la descarga. Revisa tu conexión e inténtalo de nuevo.» y «Reintentar» (CA-7)
  - no-disponible (`enlace-publico--no-disponible.html`): un solo mensaje para todo motivo, sin ficha (CA-6, RN-1)
  - error-carga (`enlace-publico--error-carga.html`): red o 5xx al abrir, con «Reintentar» (CA-7)
  - error-carga-limite (`enlace-publico--error-carga-limite.html`): variante de error-carga para el `429` al abrir, en tono de advertencia, con «Reintentar» (CA-5; spec §6)
- **Capturas**: `docs/design/capturas/sharing/enlace-publico/` (`enlace-publico--<estado>--<360|1440>.png`), con
  `pw/capturar-rutas.js` (es-GT, hora de Guatemala, movimiento reducido). `enlace-publico--propuesta--*.png` son las
  capturas del paquete de la propuesta.

## Decisiones de UX
- **Marco público real** (S-6): la cabecera es la de `PublicHeader` (logo con la nube, «Planes» e «Iniciar sesión»),
  sin barra lateral ni cuenta. La ficha usa la tarjeta centrada de `IdentityCard` (columna de 448 px, ícono de tono
  `info`, título `h1`). Con sesión la página se ve igual (CA-10).
- **La ficha no pide contraseña** (RN-2, 013 S-7): con o sin contraseña se ven quién compartió, el ícono del tipo
  (`FileTypeIcon`), el nombre, el tamaño («2,4 MB») y el vencimiento absoluto («Vence el 14 nov 2026, 14:30», S-4).
  La contraseña protege solo la descarga. El ícono de la tarjeta es un candado cuando el enlace la pide y el de
  compartir cuando no; es un apoyo, no el único indicador (el campo lo dice con texto).
- **Avisos sobre la ficha**: el `429` al descargar y la descarga iniciada van entre la ficha y la acción, en un
  `Alert` con `role="status"` (warning y success). La ficha se queda visible (CA-5). El `429` no dice el motivo ni
  cuenta regresiva; {n} sale de `retryAfterSeconds` hacia arriba (en el mockup, 15 minutos). Tras el `429` el campo
  de contraseña queda vacío, igual que con una incorrecta (decisión de Fátima, 2026-11-07). Si la red falla al
  descargar (CA-7), el aviso usa el mismo diseño de advertencia con «No pudimos iniciar la descarga. Revisa tu
  conexión e inténtalo de nuevo.» y un botón «Reintentar» dentro del aviso (estado descarga-error-red; decisión de
  Fátima, 2026-11-07). El botón `outline` sobre un fondo de advertencia o de error lleva el borde
  `secondary-foreground`: con el borde `input` daría 2.87 (2.73 sobre el de error), por debajo de 3:1.
- **Ayuda del campo** (decisión de Fátima, 2026-11-07): bajo el campo va «No es la de tu cuenta: te la da quien
  compartió el enlace.», asociada con `aria-describedby` en todos los estados que muestran el campo (con el error,
  `aria-describedby="pw-error pw-hint"`). Evita que el visitante la confunda con la de su cuenta de Nimbo.
- **Campo vacío** (CA-4): «Escribe la contraseña del enlace.» con el mismo diseño de contrasena-incorrecta y sin
  llamar a la API; no tiene captura propia.
- **Sin ficha** (no-disponible y error-carga): `StateView` en la misma columna. La página lleva un `h1` oculto
  («Archivo compartido») y el título del estado va en `h2` (`headingLevel="h2"`). «No disponible» es neutro (no es
  una falla que el visitante pueda corregir) y no tiene acción; el error al abrir usa el tono de error y el `429` al
  abrir el de advertencia, los dos con «Reintentar» (`outline`, como los errores aprobados de 005 a 012b).
- **«Preparando descarga…»**: el botón conserva su color (no se atenúa al 45 %, para no perder el contraste AA) y
  usa `aria-disabled`; el anuncio va en una región `role="status"`.
- **Privacidad** (CA-8): el título de la pestaña es siempre «Archivo compartido · Nimbo», el rótulo nunca muestra el
  token y la página declara `noindex` (S-5). Los datos (Andrea Morales, `Informe_trimestral_Q3.docx`) son de ejemplo.
- **Correcciones a la propuesta** (spec 013b §6): «Ver archivo» → «Descargar»; «clave» → «contraseña»; ya no pide la
  contraseña antes de mostrar el archivo; botón primario con el token corregido (`primary`, DF-41); se quitó «Crear
  cuenta» de la cabecera (la real tiene «Planes» e «Iniciar sesión»); «Expirado» y «Revocado» pasan a no-disponible.
- **Accesibilidad** (CA-11): axe sin violaciones en los 11 HTML a 360 y 1440 px, sin desplazamiento horizontal a
  360 px y objetivos táctiles de 44 px (cabecera, mostrar contraseña, «Descargar», «Reintentar»). Animaciones quietas
  con «reducir movimiento».

## Pendiente
- Aprobación de Adrián (T-05). La implementación es T-08.
