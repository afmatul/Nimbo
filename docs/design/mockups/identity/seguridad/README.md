# Mockup: Seguridad (sesiones y contraseña)

- **Spec**: 002 (§11; D-7, D-8, D-9; CA-11 a CA-14, CA-22, CA-23, CA-27)
- **Propuesta presentada**: No presentada (diseño interno). La propuesta firmada no tiene pantalla de cuenta ni de
  seguridad; el marco de la aplicación (barra lateral, barra superior con «Cuenta / …» y avatar) sigue el de las p. 08
  (explorador) y p. 17 (Plan y facturación).
- **Origen**: HTML autocontenido escrito a mano, como `privacidad/` y `terminos/` (`.html`, un archivo por estado,
  Cielo Sereno con los tonos AA de `ui-guidelines.md` §2–§3; solo carga Inter 400/500/600/700 de Google Fonts, sin
  JetBrains Mono: las cifras, los metadatos, el distintivo de plan, la cuota y el `correlationId` usan Inter con
  `font-variant-numeric: tabular-nums`). Tiene versión móvil real a 360 px. Es referencia visual; `apps/web` no lo importa.
- **Estados incluidos**:
  - default: este dispositivo y otras tres sesiones (`seguridad.html`)
  - cargando: esqueleto de la lista con «Cargando tus sesiones…» (`seguridad--cargando.html`)
  - error-sesiones: la lista no cargó; mensaje genérico de 000 con el `correlationId` y «Reintentar» (`seguridad--error-sesiones.html`)
  - sin-otras-sesiones: solo la sesión actual, sin «Cerrar las demás sesiones» (`seguridad--sin-otras-sesiones.html`)
  - confirmar-cierre: diálogo para cerrar una sesión (`seguridad--confirmar-cierre.html`, CA-12)
  - confirmar-cierre-actual: diálogo para cerrar la sesión de este dispositivo (`seguridad--confirmar-cierre-actual.html`, D-8, CA-14)
  - sesion-cerrada: resultado de cerrar una sesión (`seguridad--sesion-cerrada.html`)
  - cerrar-demas: diálogo de confirmación de «Cerrar las demás sesiones» (`seguridad--cerrar-demas.html`, CA-13)
  - cerrar-demas-exito: resultado con el número de sesiones cerradas (`seguridad--cerrar-demas-exito.html`, CA-13)
  - contrasena-enviando: botón «Cambiando contraseña…» y campos de solo lectura (`seguridad--contrasena-enviando.html`)
  - contrasena-no-coincide: la confirmación no coincide con la nueva; se valida en el cliente antes de enviar (`seguridad--contrasena-no-coincide.html`)
  - contrasena-incorrecta: `IDENTITY_WRONG_PASSWORD` junto al campo (`seguridad--contrasena-incorrecta.html`, CA-23)
  - contrasena-debil: `IDENTITY_WEAK_PASSWORD` con los requisitos que faltan (`seguridad--contrasena-debil.html`, D-6 de 001)
  - contrasena-bloqueada: `IDENTITY_TOO_MANY_REQUESTS` tras 5 intentos, con los minutos de espera (`seguridad--contrasena-bloqueada.html`, D-7, CA-23)
  - contrasena-cambiada: éxito; la lista ya muestra solo este dispositivo (`seguridad--contrasena-cambiada.html`, CA-22)
- **Capturas**: `docs/design/capturas/identity/seguridad/` (`seguridad--<estado>--<360|1440>.png`). axe-core sin
  violaciones en los 15 estados a 360 y 1440 px, sin desplazamiento horizontal a 360 px y objetivos de al menos 24 px.

## Decisiones de UX
- Se llega desde el menú de la cuenta (avatar de la barra superior); la ruta dice «Cuenta / Seguridad». No se agrega
  entrada a la barra lateral.
- Dos tarjetas: «Sesiones activas» y «Cambiar contraseña». A 1440 px van lado a lado; por debajo de 1180 px se apilan
  y por debajo de 900 px la barra lateral pasa al menú en cajón de `AppLayout`.
- Cada sesión muestra navegador · sistema, la última actividad y la fecha de inicio (D-9). La actual va primero, con
  fondo `background` y el distintivo «Este dispositivo» con ícono y texto. Las demás van por última actividad. No hay
  IP ni ubicación. El ícono del dispositivo (monitor, portátil, teléfono) es decorativo; el texto dice el sistema.
- «Cerrar sesión» aparece en todas las filas y siempre pide confirmación. En las demás sesiones abre el diálogo con el
  texto de §11. En la actual abre «¿Cerrar la sesión en este dispositivo?» (D-8, CA-14); al confirmar, cierra la
  sesión y lleva al inicio de sesión. Cada botón tiene nombre accesible completo («Cerrar sesión en Safari · iOS»,
  «Cerrar sesión en este dispositivo»).
- Los botones que abren una confirmación son `outline`. Solo el botón de confirmar del diálogo es `destructive`, porque
  es la acción que no se deshace. El diálogo es `alertdialog`, el fondo queda `inert` y el foco inicial va a «Cancelar».
  A 360 px los botones se apilan con el destructivo arriba.
- Sin otras sesiones, «Cerrar las demás sesiones» no se muestra (no queda deshabilitado) y una nota explica que ahí
  aparecerán las sesiones de otros dispositivos.
- Los resultados son alertas `role="status"` dentro de la tarjeta que cambió, y la lista se actualiza. Los errores son
  `role="alert"` junto al campo o encima del formulario.
- Contraseña: tres campos (actual, nueva y confirmación), cada uno con «Mostrar contraseña» (`aria-pressed`). La
  confirmación se valida en el cliente antes de enviar: si no coincide, no se envía y el error va junto a ese campo
  con `role="alert"` y `aria-invalid`. La nueva
  reutiliza los requisitos en vivo del registro (001): «12 caracteres o más» · «Una mayúscula» · «Un número» · «Un
  símbolo», con ícono y texto (pendiente, cumplido o falta). No se usa el medidor de fuerza del registro: sus niveles
  no están definidos en ninguna spec y repite la lista.
- La descripción de la tarjeta avisa antes de enviar: «Al cambiarla cerraremos tus otras sesiones. Esta seguirá
  abierta.» (D-7).
- Bajo la contraseña actual hay un enlace «¿No la recuerdas? Restablece tu contraseña», que lleva a la recuperación
  (D-6). También sirve de salida cuando el cambio queda bloqueado.
- Tras una contraseña actual incorrecta, ese campo se vacía y recibe el foco; la nueva y su confirmación se conservan.
- Mientras se envía, el botón muestra «Cambiando contraseña…» con indicador, los campos quedan de solo lectura y no
  se permite un segundo envío (RNF-14).
- Si falla la carga de la lista, la tarjeta muestra el mensaje genérico de 000 con el `correlationId` y «Reintentar».
  El formulario de contraseña sigue disponible porque no depende de la lista.
- «Seguridad» no se degrada en modo de solo lectura (RF-23), porque no escribe archivos. No tiene límite de plan. Los
  roles internos usan la misma pantalla para sus propias sesiones, dentro de su propio marco (011).

## Contraste de los pares nuevos (WCAG 2.1)
| Par | Contraste |
|---|---|
| `primary-hover` `#3B5A8A` sobre `brand` al 12 % (distintivo «Este dispositivo», ícono del dispositivo) | 6.03 |
| `success-foreground` `#3A7560` sobre `success` al 12 % (alerta de éxito) | 4.80 |
| `destructive` `#A34F4F` sobre `destructive-soft` al 12 % (alerta de error, estado de error) | 4.81 |
| `foreground` sobre las dos alertas | 12.1 – 12.4 |
| Blanco sobre `destructive` (botón de confirmar) | 5.54 |
| `muted-foreground` sobre `card` / `background` (metadatos de sesión) | 4.76 / 4.56 |

`muted-foreground` sobre `muted` da 4.39. Por eso la nota de «sin otras sesiones» y los textos sobre `muted` usan
`secondary-foreground` (7.45).

## Decisiones aprobadas (2026-09-26, Adrián)
1. **Campo de confirmación de la contraseña nueva: se queda.** Si no coincide con la nueva, el cliente no envía y
   muestra junto al campo de confirmación: «Las contraseñas no coinciden. Escribe la misma en los dos campos.»
   (estado `contrasena-no-coincide`).
2. **Cerrar la sesión actual desde la lista pide confirmación** (cambio respecto de la propuesta). Diálogo
   `alertdialog` con el mismo patrón que el de las demás sesiones (foco inicial en «Cancelar», fondo `inert`, botón
   de confirmar `destructive`): título «¿Cerrar la sesión en este dispositivo?», cuerpo «Tendrás que iniciar sesión de
   nuevo para volver a entrar.», botones «Cancelar» y «Cerrar sesión». Al confirmar, lleva al inicio de sesión
   (estado `confirmar-cierre-actual`).
3. **Textos que §11 no fijaba:**
   - diálogo de «Cerrar las demás»: título «¿Cerrar las demás sesiones?», cuerpo «Cerraremos {n} sesiones. Esos
     dispositivos tendrán que iniciar sesión de nuevo; la de este dispositivo seguirá abierta.», botón «Cerrar {n} sesiones» (con n = 1: «Cerraremos 1 sesión. Ese dispositivo tendrá que iniciar
     sesión de nuevo; la de este dispositivo seguirá abierta.» y «Cerrar 1 sesión»);
   - resultado de cerrar una sesión: «Cerramos la sesión en {navegador} · {sistema}.»;
   - error al cargar la lista: título «No pudimos cargar tus sesiones.» más el genérico de 000 con el `correlationId`;
   - sin otras sesiones: «No tienes otras sesiones abiertas. Si inicias sesión en otro navegador o dispositivo, aparecerá aquí.»;
   - encabezado de la página: «Revisa dónde está abierta tu cuenta y cambia tu contraseña.»;
   - descripción de la tarjeta de sesiones: «Estos son los navegadores y dispositivos con tu cuenta abierta. Si no
     reconoces alguno, cierra esa sesión y cambia tu contraseña.».
4. **Bloqueo del cambio de contraseña con minutos**: «Hiciste demasiados intentos con una contraseña incorrecta. Espera
   {N} minutos o restablece tu contraseña.» (el mockup usa N = 15, el valor de D-7). La API devuelve los minutos que
   faltan. El botón sigue habilitado; el servidor rechaza hasta que venza el bloqueo.
5. **Singular en el resultado de «Cerrar las demás»**: con una sola sesión cerrada, «Cerramos 1 sesión. Solo queda
   abierta la de este dispositivo.»; con más, «Cerramos {n} sesiones. Solo queda abierta la de este dispositivo.».
6. **Formato de fechas**: «Activa ahora», «Última actividad: hace 2 horas» (relativa) e «Iniciada el 24 sep 2026»
   (absoluta), en hora de Guatemala.
7. **Tipografía**: solo Inter (400/500/600/700). Las cifras y los identificadores usan `tabular-nums`; no se usa
   JetBrains Mono.

## Pendiente
- Velo del diálogo: el mockup usa `agent-bg` al 45 %. `apps/web` todavía no tiene un token de velo (TODO #6 en
  `app-layout.tsx`); el plan de 002 o del layout debe definirlo.
- El menú de la cuenta (avatar → Seguridad, Plan y facturación, Cerrar sesión) pertenece al layout compartido
  (`mockups/shared/layout/`, pendiente).
- La implementación reconstruye la pantalla con `components/ui` (`Button`, `Card`, `Input`, `Badge`) y
  `components/nimbo` (`StatusBadge`, `ErrorState`, `ConfirmDestructiveDialog`); no se crea un componente nuevo.
- Las fechas y el navegador · sistema vienen de la API (CA-11); los del mockup son de ejemplo.
