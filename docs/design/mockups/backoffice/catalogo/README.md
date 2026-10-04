# Mockup: Administración · catálogo de planes

- **Spec**: 011 (CA-8, CA-9, CA-10, CA-11, CA-14, CA-17; RN-2, RN-4; §5, §6; P-4 opción D)
- **Propuesta presentada**: ninguna. La pantalla es nueva y sale de las decisiones de la dueña (2026-10-03): planes
  inmutables en precio y límites; solo ver, crear y desactivar; Personal no se desactiva.
- **Rutas sugeridas**: `/admin/planes` (catálogo) y `/admin/planes/nuevo` (nuevo plan). Ruta de navegación
  `Administración / Catálogo de planes [/ Nuevo plan]`; «Catálogo de planes» marcado en la barra lateral.
- **Origen**: HTML autocontenido generado con `../../_generadores/catalogo/generar.js`; no se edita a mano. El marco del
  área (barra lateral, barra superior, cajón, avisos, distintivos, estados de pantalla, diálogo y formulario) sale de
  `_generadores/admin/area.js`, el mismo de `backoffice/admin` y `backoffice/alta-interna`. Tonos AA de
  `ui-guidelines.md` §2–§3, solo Inter, versión móvil real a 360 px. Es referencia visual; `apps/web` no lo importa.
  Los mockups aún no se enlazan entre sí (los `href` son `#`).
- **Estados incluidos**:
  - default: los cuatro planes oficiales activos y «Planes inactivos (0)» con su mensaje vacío (`catalogo.html`)
  - cargando (extra, CA-17): esqueleto de cuatro tarjetas y «Cargando el catálogo…» (`catalogo--cargando.html`)
  - error (extra, CA-17): «No pudimos cargar el catálogo.» con «Reintentar» (`catalogo--error.html`)
  - creando: formulario «Nuevo plan» lleno a partir de Equipo, listo para crear (`catalogo--creando.html`)
  - error-campos: precio negativo, máximo por archivo de 3 GB y 0 versiones; resumen y error en cada campo; no se
    creó nada (`catalogo--error-campos.html`)
  - exito: «Creamos el plan Equipo 2027. Ya se ofrece a contrataciones nuevas.» con «Desactivar Equipo», y el plan
    nuevo entre los activos (`catalogo--exito.html`)
  - confirmar-desactivar: diálogo «¿Desactivar el plan Equipo?» con sus consecuencias (`catalogo--confirmar-desactivar.html`)
  - desactivado (extra): aviso de éxito y Equipo entre los inactivos con «52 cuentas lo conservan»
    (`catalogo--desactivado.html`)
- **Capturas**: `docs/design/capturas/backoffice/catalogo/` (`catalogo--<estado>--<360|1440>.png`). En los ocho estados:
  axe-core sin violaciones a 360 y 1440 px, sin desbordamiento horizontal a 360 px, sin errores de consola y sin
  objetivos menores de 24 px (`_generadores/pw/axe-seguridad.js` sobre la carpeta).

## Datos de ejemplo
Los cuatro planes y todos sus valores son los oficiales (`product-context.md` §3; semilla de 006a, con las mismas
descripciones). En la app vienen de la API en centavos y bytes y la web los formatea (ADR-0016): Q con dos decimales,
GB y TB en potencias de 1024 y cifras con `tabular-nums`. «Equipo 2027» (Q125.00, 500 GB, 1 GB, 5 editores,
3 000 consultas, 60 versiones, 60 días) es un plan nuevo de ejemplo. Los conteos de cuentas por plan
(1 012 + 186 + 52 + 22 clientes, más 12 internas) suman las 1 284 cuentas de `backoffice/admin`.

## Decisiones de UX
1. **Tarjetas (PlanCard) en lugar de tabla**, también en escritorio: 11 columnas (nombre, precio, seis límites,
   cuentas, estado y acción) no caben legibles en los 1 052 px útiles a 1440, y a 360 px la tabla tendría que
   convertirse en tarjetas igualmente. Las tarjetas listan los límites siempre en el mismo orden y con las mismas
   etiquetas, de modo que se comparan en fila; es el mismo componente `PlanCard` de `ui-guidelines.md` §4, en su
   variante de administración. La descripción reserva tres líneas en escritorio para que los precios queden alineados.
2. **Dos secciones**: «Planes activos (n)» («Se ofrecen a quien se registra o cambia de plan.») y «Planes inactivos
   (n)» («Ya no se ofrecen; quien los tiene los conserva.»), en lugar de un filtro: CA-8 pide ver todos y separar por
   estado responde de un vistazo qué se ofrece hoy. Activos ordenados por precio.
3. **Estado con ícono y texto**: «Activo» (círculo con check, tonos de éxito) e «Inactivo» (círculo de pausa, contorno
   neutro). Inactivo no usa rojo porque no es un error. La tarjeta inactiva pierde la sombra y va sobre el fondo de la
   página, y dice «Desactivado el 03/10/2026»; el estado nunca depende solo del color.
4. **Mensaje clave fijo arriba**: «Los planes no se editan: crea uno nuevo y desactiva el anterior.» + «Así, quien ya
   tiene un plan conserva su precio y sus límites.», y debajo «Crear o desactivar un plan queda en la auditoría con tu
   nombre y rol.» (RN-2, §5).
5. **Sin edición de nombre ni descripción**: la spec solo prohíbe editar precio y límites (CA-11), pero un botón
   «Editar» contradiría el mensaje clave y el nombre es lo que el cliente ve en su suscripción y sus facturas; cambiarlo
   cambiaría lo que contrató a ojos de quien ya lo tiene. Una errata se corrige creando el plan bien y desactivando el
   anterior mientras no tenga cuentas. Si el equipo la quiere, va como «Editar nombre y descripción» en la tarjeta y
   requiere ajustar CA-11.
6. **Personal sin botón**: en su lugar, un recuadro con candado «Plan por defecto · Es el plan gratuito: no se puede
   desactivar.» (texto visible, no un botón deshabilitado que no explica nada). El servidor lo rechaza igual (CA-11).
7. **Conteo agregado de cuentas por plan** («186 cuentas con este plan»; en inactivos «52 cuentas lo conservan»): sin
   nombres ni enlaces a cuentas. Sirve para medir el impacto antes de desactivar y es el mismo dato que las métricas
   agregadas de CA-12 (cuentas por plan). Requiere que la API del catálogo lo devuelva.
8. **Desactivar con confirmación** (`ConfirmDestructiveDialog`, botón destructivo y foco inicial en «Cancelar»):
   «¿Desactivar el plan Equipo?», línea «Q110.00 al mes · 350 GB · 52 cuentas lo tienen.» y consecuencias: deja de
   ofrecerse (no aparece al registrarse ni al cambiar de plan); las 52 cuentas lo conservan con el mismo precio y
   límites; **no se puede volver a activar** (si se necesita otra vez, se crea un plan nuevo con sus valores); queda en
   la auditoría. En la tarjeta, «Desactivar» lleva el nombre del plan para lectores («Desactivar el plan Pro»).
9. **Nuevo plan en página propia**, como el alta interna: nueve campos con ayudas no caben bien en un diálogo a 360 px.
   Secciones «Plan» (nombre, descripción), «Precio» (prefijo Q) y «Límites» (seis campos en dos columnas en escritorio,
   una en móvil). Almacenamiento con unidad GB/TB y máximo por archivo con MB/GB (selectores con nombre accesible);
   consultas con sufijo «al mes» y papelera con «días». Los valores se escriben sin separador de miles.
10. **«Partir de un plan activo (opcional)»**: llena el formulario con los valores de un plan y se cambia solo lo
    necesario; «El plan de origen no cambia.». Apoya el flujo «crea uno nuevo y desactiva el anterior» y evita
    reescribir siete cifras. Es solo de la web (los datos ya están cargados).
11. **Aviso de inmutabilidad antes de crear**: «Después de crearlo, el precio y los límites no cambian. Revísalos bien:
    para cambiarlos más adelante tendrás que crear otro plan.» + «La creación queda en la auditoría con tu nombre y rol.».
12. **Errores** (CA-11, mismo patrón que alta-interna): resumen «Revisa 3 campos para crear el plan.» + «Todavía no
    creamos nada.» con enlaces; en cada campo, borde destructivo, ícono y texto con `aria-invalid` y
    `aria-describedby`. El servidor repite la validación y responde `422` con los campos; se muestran igual.
    Mensajes: «El precio no puede ser negativo. Escribe 0.00 si el plan es gratuito.» · «El máximo por archivo no puede
    superar 2 GB. Escribe 2 GB o menos.» · «El máximo por archivo no puede ser mayor que el almacenamiento del plan.» ·
    «El almacenamiento debe ser mayor que 0.» · «Escribe al menos 1 versión retenida.» (mismo patrón para editores,
    consultas y días) · «Escribe el nombre del plan.» · «Escribe una descripción.».
13. **Éxito en el catálogo**: tras crear se vuelve al catálogo con «Creamos el plan Equipo 2027. Ya se ofrece a
    contrataciones nuevas.» y, como se creó a partir de Equipo, «Si lo reemplaza, desactiva Equipo…» con el botón
    «Desactivar Equipo» (abre la misma confirmación). Sin «Partir de», el aviso no sugiere desactivar nada.
14. **Sin estado vacío del catálogo**: Personal siempre existe y no se desactiva (RN-4), así que la lista de activos
    nunca está vacía; el vacío posible es el de inactivos, que tiene su mensaje.
15. **A 360 px**: una columna de tarjetas, «Nuevo plan» y «Desactivar» a todo el ancho con 44 px, campos y selectores
    de 44 px, acciones apiladas (la principal arriba) y el menú en el cajón del marco.

## Pendiente
- **Editores simultáneos = 0**: Personal tiene 0 (edición solo lectura) y la tarjeta lo muestra como «Ninguno · Edición
  solo lectura», pero CA-11 rechaza «límites no positivos», así que un plan nuevo no podría ser de solo lectura. Hay
  que decidir en la spec si `max_editores` admite 0 (y entonces el error de editores no aplica a 0).
- **Nombre repetido y `slug`**: la tabla `plan` exige `slug` único (006a RN-2). Propuesta: el servidor lo genera del
  nombre y rechaza un nombre igual a otro plan con «Ya existe un plan con este nombre. Usa otro, por ejemplo
  Equipo 2027.». Lo fija el plan.
- **Fecha de desactivación**: la tarjeta inactiva muestra «Desactivado el …»; si la columna `activo` es solo booleana,
  hace falta la fecha (columna o lectura de la auditoría). Lo fija el plan.
- **Reactivar un plan**: no está en la spec; el diálogo dice que no se puede. Si el equipo la quiere, cambia CA-10.
- **«Sin permiso»** (Soporte u Operador abren `/admin/planes`, CA-14): pantalla común del marco, como en
  `backoffice/admin`; el servidor responde `403` `SHARED_FORBIDDEN`.
- **«Creando…» y error del servidor sin campos** (red o `500`): mismo patrón que `alta-interna--enviando` y
  `identity/registro--error-servidor`; sin estado propio.
