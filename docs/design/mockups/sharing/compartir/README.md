# Mockup: Compartir (diálogo) y sección «Enlace público»

- **Spec**: 012b (diálogo «Compartir»: correo, nivel y «Personas con acceso») y 013c (sección «Enlace público»,
  CA-1 a CA-15, §6). La API del enlace es la 013; la página del visitante, la 013b (`sharing/enlace-publico`).
- **Propuesta presentada**: p. 14 (`compartir.html`, paquete empaquetado y autocontenido; no se genera y es solo
  referencia histórica). Lo que dice de la propuesta ya no vale: ver «Correcciones a la propuesta».
- **Origen**: los `compartir--<estado>.html` son HTML autocontenidos generados con `_generadores/compartir/generar.js`
  sobre `marco/marco.js` (tokens de Cielo Sereno, solo Inter). No se editan a mano. Son referencia visual; `apps/web`
  no los importa.
- **Estados incluidos** (spec 013c §6; 24 HTML):
  - enlace-cargando: «Cargando el enlace público…» con `role="status"` mientras responde `GET /public-links` (CA-1)
  - enlace-error-carga: red o 5xx al cargar, `ShareErrorAlert` con «Reintentar» en lugar del estado (CA-13)
  - enlace-sin-enlace: una línea de ayuda y «Crear enlace público» (CA-1, D-2)
  - enlace-formulario: «Vence en» 1, 7 o 30 días con 7 marcado (`RadioGroup`, D-4), «Contraseña (opcional)» vacía con su ayuda, «Generar enlace» y «Cancelar» (CA-3, CA-4)
  - enlace-formulario-con-contrasena: la misma con 30 días y una contraseña válida (CA-3)
  - enlace-contrasena-invalida: «Escribe una contraseña de 8 a 128 caracteres.» junto al campo, `aria-invalid`, `role="alert"` y foco; conserva 30 días (CA-5)
  - enlace-generando: pasados 2 s, «Generando…» con `aria-disabled`, «Cancelar» deshabilitado y anuncio (CA-3)
  - enlace-generado: aviso de éxito «Generamos el enlace. Cópialo ahora: por seguridad, no podrás volver a verlo.», la URL en un campo de una línea y solo lectura, «Copiar enlace» con el foco, el vencimiento y si pide contraseña (CA-3, RN-1). También es el estado «reemplazado» de §6 (CA-8: la URL nueva se ve igual) Al reemplazar, el aviso dice «Generamos otro enlace y el anterior dejó de funcionar. Cópialo ahora: por seguridad, no podrás volver a verlo.» (013c CA-8, I-3).
  - enlace-copiado: el botón dice «Enlace copiado» con ícono de visto y se anuncia una vez (CA-6, D-9)
  - enlace-copia-fallida: «No pudimos copiar el enlace. Selecciónalo y cópialo a mano.» y el texto del campo seleccionado (CA-6)
  - enlace-activo: `StatusBadge` «Activo», «Vence el … · Con contraseña», «Creado el …», la nota de seguridad, «Generar otro enlace» y «Revocar enlace», sin URL (CA-7)
  - enlace-vencido: `StatusBadge` neutro «Vencido», «Venció el …» y las mismas acciones, sin la nota (CA-7)
  - enlace-confirmar-reemplazo: advertencia en línea «El enlace actual dejará de funcionar para quien lo tenga.», el formulario y «Cancelar»; foco en la opción marcada de «Vence en» (CA-8)
  - enlace-reemplazando: «Generando…» dentro de la confirmación (CA-8)
  - enlace-confirmar-revocar: «¿Revocar el enlace? Quien lo tenga ya no podrá descargar el archivo.» en línea, foco en «Cancelar» (CA-9, D-1)
  - enlace-revocando: «Revocando…» con `aria-disabled` y anuncio (CA-9)
  - enlace-revocado: «Revocamos el enlace. Ya no sirve para descargar el archivo.» y vuelta a «sin enlace», foco en «Crear enlace público» (CA-9)
  - enlace-error-red: red o 5xx al generar, error con «Reintentar» entre el formulario y sus botones; conserva lo elegido (CA-13)
  - enlace-limite: `429` al generar, «Hiciste demasiados intentos. Espera 15 minutos e inténtalo de nuevo.» en `Alert` warning, sin botón; conserva lo elegido (CA-12)
  - enlace-no-existe: `404` `SHARING_LINK_NOT_FOUND` al revocar, «Este enlace ya no existe. Actualiza para ver el estado actual.» con «Actualizar» (CA-14)
  - enlace-archivo-no-encontrado: `404` `STORAGE_NODE_NOT_FOUND`, «Este archivo ya no está disponible. Puede que esté en la papelera.», sin botón (CA-14, D-8)
  - enlace-solo-lectura-sin-enlace: `ReadOnlyBanner` (`components/nimbo/`, como «Compartidos conmigo» de la 012b) con candado, «Tu cuenta está en solo lectura.», «No puedes generar enlaces. Para hacerlo, renueva tu plan.» y «Renovar plan»; sin «Crear enlace público» (CA-10, D-6)
  - enlace-solo-lectura-con-enlace: el mismo `ReadOnlyBanner` arriba, el resumen y solo «Revocar enlace» (CA-10). El `403` tardío al generar muestra el mismo aviso sobre el formulario conservado; no tiene captura propia
  - carpeta: el diálogo de una carpeta, sin la sección (CA-2)
- **Capturas**: `docs/design/capturas/sharing/compartir/` (`compartir--<estado>--<360|1440>.png`, 48 PNG), con
  `pw/capturar-rutas.js` (es-GT, hora de Guatemala, movimiento reducido). `compartir--default--*.png` son las capturas
  del paquete de la propuesta.

## Decisiones de UX
- **El diálogo es el real de la 012b** (`share-dialog.tsx`): título «Compartir «…»», descripción, correo, «Qué puede
  hacer» (Lector/Editor), «Compartir», «Personas con acceso» (dos accesos directos de ejemplo) y la X de cierre; no
  tiene pie. Va sobre «Mis archivos» inerte, con el velo del diálogo.
- **Ubicación** (D-3): la sección va después de «Personas con acceso», con borde superior y `h3` «Enlace público». Solo
  para archivos (CA-2): en una carpeta no aparece.
- **Botón antes que formulario** (D-2): sin enlace se ve una línea de ayuda («Cualquiera con el enlace puede descargar
  este archivo, sin cuenta en Nimbo.») y «Crear enlace público» en `outline`, para no competir con «Compartir», el
  único botón primario del diálogo mientras el formulario del enlace está cerrado. Dentro del formulario, la acción
  principal («Generar enlace») sí es primaria.
- **Contraseña opcional** (RF-17, CA-4): el campo se llama «Contraseña (opcional)», es `PasswordField` con
  `autocomplete="new-password"` y nombre propio (`enlace-contrasena`), y su ayuda es la de la spec §5, asociada con
  `aria-describedby` (con error, `pl-pw-error pl-pw-hint`).
- **La URL solo una vez** (RN-1): se ve únicamente tras generar, en un `Input` de una línea y solo lectura (texto
  `foreground` sobre `muted`), que a 360 px cabe sin desplazamiento horizontal de la página (la URL se recorta dentro
  del campo) y con «Copiar enlace» debajo a todo el ancho. Después, el resumen nunca la muestra.
- **Estado del enlace sin depender del color**: `StatusBadge` con ícono y texto («Activo» en `success`, «Vencido» en
  `neutral`, no en rojo: vencer no es una falla). Fechas absolutas en hora de Guatemala; «Creado el …» en su propia línea.
- **Confirmaciones en línea** (D-1, CA-8, CA-9): reemplazar y revocar se confirman dentro de la sección, sin abrir un
  diálogo dentro de otro (excepción escrita en `ui-guidelines.md` §4). Revocar usa un recuadro con tono `destructive` al
  5 %, foco inicial en «Cancelar» y el botón `destructive` lleno; a 360 px los botones se apilan con el destructivo
  arriba, como `ConfirmDestructiveDialog`. «Revocar enlace» (el que abre la confirmación) es `outline` con texto
  `destructive` (5,4:1 sobre `card`). Reemplazar usa un `Alert` warning sobre el formulario y su botón dice «Generar
  otro enlace». Con un enlace vencido el formulario aparece sin la advertencia (D-5); no tiene captura propia.
- **Foco cuando el botón desaparece** (CA-15): tras «Generar otro enlace», a la opción marcada de «Vence en»; tras
  «Revocar enlace», a «Cancelar»; tras generar, a «Copiar enlace»; tras revocar, a «Crear enlace público». «Cancelar»
  devuelve el foco al botón que abrió la confirmación.
- **Errores**: red y 5xx, `404` y el fallo al copiar van en `ShareErrorAlert` (`Alert` error, `role="alert"`). El `429`
  va en `Alert` warning (`role="status"`): es un límite, no una falla (`ui-guidelines.md` §4, como el `429` de la
  013b). La solo lectura usa `ReadOnlyBanner`, el aviso de siempre (M-3 de la auditoría del #107). El botón `outline` sobre advertencia o sobre el tono destructive lleva el borde
  `secondary-foreground` (con `input` daría menos de 3:1, PD-189).
- **Anuncios**: «Generando…», «Revocando…» y «Enlace copiado» van en una región `role="status"` oculta; los avisos de
  éxito, en su propio `Alert`. Cada aviso se anuncia una vez.
- **Solo lectura** (D-6): se anticipa con `ReadOnlyBanner` arriba de la sección, y el `403` tardío muestra el mismo
  aviso sobre el formulario conservado; no se ofrece crear ni «Generar otro enlace» y «Revocar enlace» sigue. En
  solo lectura no se muestra la nota «Si lo perdiste, genera otro», que no se podría seguir.
- **Datos de ejemplo**: `Informe_trimestral_Q3.docx` (2,4 MB), vence el 14 nov 2026, 14:30; la URL
  `https://nimbo.gt/enlace#q7Vf…` lleva un token falso. En la app nada de eso se guarda ni se registra (spec §5).
- **Accesibilidad** (CA-15): axe sin violaciones en los 24 HTML a 360 y 1440 px, sin desplazamiento horizontal a
  360 px; botones y campos de 44 px (las opciones de radio, 20 px, tienen la fila entera de 44 px como objetivo).
  Indicadores quietos con «reducir movimiento».

## Correcciones a la propuesta (`compartir.html`)
- «Clave» → «contraseña», y es **opcional** (RF-17), no obligatoria.
- No hay interruptor para activar el enlace: sin enlace se ofrece «Crear enlace público» (D-2).
- La URL **no** está siempre visible: solo al generarla (RN-1, 013 RN-3); después, solo el resumen.
- No se invita a personas sin cuenta («externos»): compartir por correo es solo con cuentas de Nimbo (012); el
  enlace público es la vía para quien no tiene cuenta.
- La expiración se elige entre 1, 7 y 30 días (`PUBLIC_LINK_EXPIRY_OPTIONS`), no con una fecha libre.
- Botón primario con el token corregido (`primary`, DF-41).

## Estado
- Aprobado (Adrián, 2026-11-11: los 24 estados a 360 y 1440 px, con la solo lectura en `ReadOnlyBanner`).
- Pendiente del inventario: «lista-accesos» como vista propia (012).
