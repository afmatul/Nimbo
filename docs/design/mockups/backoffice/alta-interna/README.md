# Mockup: Administración · nueva cuenta interna

- **Spec**: 011 (CA-5, CA-6, CA-14; RN-2, RN-5; §5, §6; P-6, P-14)
- **Propuesta presentada**: ninguna. La pantalla es nueva y sale de las decisiones de la dueña (2026-10-03).
- **Ruta sugerida**: `/admin/cuentas/nueva`. Se llega desde «Nueva cuenta interna» en Cuentas (`../admin/admin.html`);
  ruta de navegación `Administración / Cuentas / Nueva cuenta interna` y enlace «Volver a cuentas».
- **Origen**: HTML autocontenido generado con `../../_generadores/alta-interna/generar.js`; no se edita a mano. El marco
  del área (barra lateral con la persona, barra superior, cajón, CSS común, avisos y página) sale de
  `_generadores/admin/area.js`, el mismo de `backoffice/admin`, que a su vez usa `_generadores/marco/marco.js`. Tonos AA
  de `ui-guidelines.md` §2–§3, solo Inter, versión móvil real a 360 px. Es referencia visual; `apps/web` no lo importa.
- **Estados incluidos**:
  - default: formulario vacío, sin rol elegido (`alta-interna.html`)
  - error-campos: validación en el navegador; nombre vacío, correo inválido y rol sin elegir, con resumen y error en
    cada campo; no se envió nada (`alta-interna--error-campos.html`)
  - error-conflicto (extra): el servidor rechaza el alta (CA-6) porque el correo ya tiene cuenta y el código de empleado
    ya existe; nada cambió (`alta-interna--error-conflicto.html`)
  - enviando (extra): «Creando cuenta…» con el botón ocupado y los campos de solo lectura (`alta-interna--enviando.html`)
  - exito: «Creamos la cuenta de Rodrigo Pérez. Le enviamos un enlace a rodrigo.perez@nimbo.gt para que fije su
    contraseña.», con «Volver a cuentas» y «Crear otra cuenta» (`alta-interna--exito.html`)
- **Capturas**: `docs/design/capturas/backoffice/alta-interna/` (`alta-interna--<estado>--<360|1440>.png`). En los cinco
  estados: axe-core sin violaciones a 360 y 1440 px, sin desbordamiento horizontal a 360 px, sin errores de consola y
  sin objetivos menores de 24 px (`_generadores/pw/axe-seguridad.js` sobre la carpeta).

## Datos de ejemplo
Andrea Ruiz (`andrea.ruiz@nimbo.gt`, Soporte) ya está en la lista de `backoffice/admin`; por eso el conflicto la usa.
Los códigos `EMP-0142` y `EMP-0118` son de ejemplo: el formato lo fija el plan. En la app los roles disponibles y los
mensajes de conflicto vienen de la API (`code` de CA-6).

## Decisiones de UX
1. **Página propia, no diálogo**: cuatro campos con ayudas y tres roles explicados no caben bien en un diálogo a 360 px;
   la página sigue el patrón de la ficha (ruta de navegación + «Volver a cuentas») y conserva la URL para volver.
2. **Orden de los campos**: nombre, correo, código de empleado y rol. Los tres datos de la persona van juntos y el rol,
   que es la decisión con más consecuencias, va al final, justo antes de crear (el pedido los listaba nombre, correo,
   rol y código).
3. **Rol sin preselección**: ninguna opción viene marcada para que nadie cree un Administrador por descuido; si no se
   elige, el error es «Elige el rol de la cuenta.». Solo aparecen Administrador, Soporte y Operador; Cliente nunca se
   ofrece (CA-6) y la ayuda lo dice: «Cada persona tiene un solo rol y nunca el de Cliente.» (RN-5).
4. **Cada rol con una línea** (opción entera clicable, radio de 24 px, ícono + nombre + descripción):
   Administrador → «Gestiona cuentas, el catálogo de planes y las métricas.»; Soporte → «Consulta los metadatos de los
   archivos de los clientes para ayudarles.»; Operador → «Atiende la infraestructura y la operación del servicio.».
   Debajo, con candado: «Ningún rol ve el contenido de los archivos de los clientes.» (RN-1). La opción elegida se
   distingue por el punto del radio, el borde doble y el fondo, no solo por color.
5. **Sin campo de contraseña** (P-6): recuadro con llave «No hay contraseña que definir. Le enviaremos un enlace de un
   solo uso para que la fije. Tú nunca la conoces.» junto al botón de crear.
6. **Aviso de auditoría** breve, con ícono, antes del botón: «El alta queda en la auditoría con tu nombre y rol.»
   (RN-2, §5). La ayuda del nombre recuerda que es el que verán los clientes en su auditoría (CA-16).
7. **Ayuda bajo cada etiqueta** y «Todos los campos son obligatorios.» al inicio (todos lo son, P-14), en lugar de
   marcar cada uno con asterisco. Sin texto de ejemplo dentro de los campos (el ejemplo va en la ayuda).
8. **Errores** (Art. XIII.4, RNF-14): resumen arriba (`role="alert"`, «Revisa 3 campos para crear la cuenta.» +
   «Todavía no creamos nada.») con enlaces a cada campo; en cada campo, borde destructivo doble, ícono y texto
   asociados con `aria-describedby` y `aria-invalid`. En la app, al enviar con errores el foco va al resumen.
   Mensajes: «Escribe el nombre completo de la persona.» · «Escribe un correo válido, por ejemplo
   rodrigo.perez@nimbo.gt.» · «Elige el rol de la cuenta.» · «Escribe el código de empleado.» (código vacío, mismo
   patrón) · «Ya existe una cuenta con este correo y una persona solo puede tener una. Usa otro correo o busca la
   cuenta en Cuentas.» · «El código EMP-0118 ya pertenece a otra cuenta interna. Revisa el código: cada persona tiene
   uno distinto.».
9. **Dos estados de error**: `error-campos` (validación del navegador; no llega al servidor) y `error-conflicto`
   (respuesta del servidor, CA-6, con los datos conservados y «Nada cambió.»). Se separan porque no ocurren a la vez:
   el navegador no envía un formulario con campos vacíos o un correo inválido.
10. **Estado «enviando»**: el alta escribe la cuenta y encola el correo con el enlace; si tarda, el botón ocupado
    («Creando cuenta…», `aria-busy` y un `role="status"` para lectores) evita el doble envío, que de otro modo
    devolvería un «correo ya registrado» confuso por la propia cuenta recién creada. Mientras se envía no se muestra
    «Cancelar», porque salir de la página no deshace el alta.
11. **Éxito en la misma página**: la tarjeta reemplaza el formulario con el mensaje pedido, un resumen (nombre, correo,
    rol, código), «El enlace es de un solo uso. Podrá iniciar sesión cuando fije su contraseña.» y «El alta quedó en
    la auditoría con tu nombre y rol.». Acción principal «Volver a cuentas»; secundaria «Crear otra cuenta» (formulario
    vacío). En la app el foco va al título del mensaje.
12. **A 360 px**: campos y botones de 44 px, acciones a todo el ancho (la principal arriba), resumen de éxito en una
    columna y el menú lateral en el cajón del marco.

## Pendiente
- **«Sin permiso»** (Soporte u Operador abren `/admin/cuentas/nueva`, CA-14): pantalla común del marco, como en
  `backoffice/admin`; el servidor responde `403` `SHARED_FORBIDDEN`.
- **Formato del código de empleado** (¿`EMP-` + 4 cifras?, ¿mayúsculas?), **vigencia del enlace** y si el correo debe
  ser `@nimbo.gt`: los fija el plan; si hay formato, se agrega su mensaje de error al patrón de la decisión 8.
- **Reenviar el enlace** si vence o se pierde: la spec no lo pide; si el plan lo agrega, va en la ficha de la cuenta
  interna, no aquí.
- **Error del servidor no relacionado con los campos** (red o `500`): aviso destructivo sobre el formulario con los
  datos conservados y «Reintentar», como `identity/registro--error-servidor`; sin estado propio.
- Las reglas de campo (`.field-help`, `.field-error`, `aria-invalid`), el resumen de errores y `campo()` se movieron a
  `CSS_FORM` de `_generadores/admin/area.js` al usarlas `backoffice/catalogo` (regla de tres); las capturas no cambiaron.
  Las de `identity/seguridad` siguen aparte (otro marco y otras medidas; aprobada).
