# Mockup: Administración · cuentas y ficha

- **Spec**: 011 (CA-1 a CA-4, CA-13, CA-14, CA-17; RN-1, RN-6, RN-7; §6) y 011b (CA-1 a CA-9, CA-17; RN-1,
  RN-2, RN-6 a RN-8; §6).
- **Propuesta presentada**: p. 18 (vista de cuentas con ficha lateral).
- **Cambios respecto de la propuesta** (decisiones de la dueña, 2026-10-03, y de esta revisión):
  - Aviso de privacidad: «metadatos de los archivos (nombre, tipo, tamaño, fechas y estado), nunca su contenido» (P-5), en
    lugar de «no da acceso a nombres ni contenido».
  - Fuera de la ficha «Cambiar plan» y «Cerrar sesiones abiertas» (P-10, no están en la matriz); quedan suspender o
    reactivar con confirmación y el acceso a «Ver metadatos de archivos» (CA-13).
  - La persona de la barra lateral es un Administrador (antes «operadora · soporte»).
  - La lista muestra las columnas de CA-1 (correo, nombre, rol, estado, verificada, plan, espacio usado y alta) e incluye
    cuentas internas (P-11). Se quitaron «Archivos» y «Último acceso» (no están en CA-1; las sesiones ajenas están fuera).
  - Se quitaron los filtros por estado (Todas/Activas/Sin verificar/Suspendidas): CA-1 solo pide lista y búsqueda por correo.
  - La ficha pasa de panel lateral a página propia (`/admin/cuentas/:id`, ver decisión 1).
  - El paquete de la propuesta (`admin.html` empaquetado) se reemplazó por el HTML generado; la p. 18 del PDF sigue
    siendo la referencia histórica.
  - **011b:** la ficha gana el bloque «Límites y vigencia» (cuota del plan, extra, total, usado y vencimiento) con
    «Ajustar cuota» y «Extender vigencia»; no hay pantalla nueva. El extra se muestra como «+ 50 GB» con su fecha y el
    total incluye el extra; el diálogo enseña el total resultante antes de guardar. Personal conserva «Ajustar cuota» y
    pierde «Extender vigencia» («Personal no vence»). Una cuenta sin suscripción no muestra acciones.
- **Origen**: HTML autocontenido generado con `../../_generadores/admin/generar.js`; no se edita a mano. El CSS del
  marco (tokens, barra lateral, barra superior, botones, diálogo, cajón y cortes a 900/600 px) sale de
  `_generadores/marco/marco.js`, el mismo de `identity/seguridad`, `shared/layout` y `storage`; la navegación, la persona y
  la barra superior del área se arman en `_generadores/admin/area.js` (compartido por `backoffice/admin`, `alta-interna`, `catalogo`, `metricas` y `soporte`) con las
  mismas clases. Los formularios de 011b salen de `A.formDialog`/`A.campo`/`CSS_FORM` (la misma pieza que usa
  Soporte) y de `limites`, `dialogoCuota` y `dialogoVigencia` en `admin/generar.js`. Tonos AA de `ui-guidelines.md` §2-§3,
  solo Inter, cifras con `tabular-nums`, versión móvil real a 360 px. Es referencia visual; `apps/web` no lo importa.
- **Enlaces entre mockups** (rutas relativas): la barra lateral, el cajón, el logo y las migas llevan a Cuentas
  (`../admin/admin.html`), Catálogo de planes (`../catalogo/catalogo.html`) y Métricas (`../metricas/metricas.html`); «Nueva cuenta interna» →
  `../alta-interna/alta-interna.html`; «Volver a cuentas» → `admin.html`; «Ver metadatos de archivos» →
  `../soporte/soporte--desde-admin.html`; en la ficha de Laura Barrios activa, «Suspender cuenta» →
  `admin--confirmar-suspender.html`, y en ese diálogo «Cancelar» → `admin--ficha.html`. En la lista, «Laura Barrios» →
  `admin--ficha.html` y «Mónica Herrera TÚ» → `admin--propia-cuenta.html`. Los otros ocho nombres quedan en `#` a
  propósito: no tienen ficha dibujada y llevarlos a la de Laura mostraría a otra persona con otros datos (correo, plan,
  espacio, alta), lo que confunde al recorrer el mockup; en la app cada nombre abre `/admin/cuentas/:id`.
  «Reactivar cuenta» (suspendida) y «Cancelar» de confirmar-reactivar siguen siendo botones: la ficha suspendida sin
  aviso no está dibujada. En la ficha, «Ajustar cuota» y «Extender vigencia» abren sus formularios; «Quitar extra» (solo
  si hay extra) abre la confirmación, y «Cancelar» vuelve a `admin--ficha.html`.
- **Estados incluidos**:
  - default: lista paginada (10 de 1 284), clientes e internas, búsqueda vacía (`admin.html`)
  - vacio: búsqueda por correo sin resultados, con «Limpiar búsqueda» (`admin--vacio.html`)
  - cargando: esqueleto de la tabla y «Cargando cuentas…» con `role="status"` (`admin--cargando.html`)
  - error: falló la lista; error con «Reintentar» (`admin--error.html`)
  - ficha: ficha de una clienta activa (Laura Barrios, Equipo) sin diálogo ni aviso, con «Ver metadatos de archivos» y
    «Suspender cuenta» (`admin--ficha.html`)
  - confirmar-suspender: la misma ficha con el diálogo de confirmación (`admin--confirmar-suspender.html`)
  - suspendida: ficha tras suspender, con «Esta cuenta quedó suspendida y se cerraron sus sesiones.» y «Reactivar
    cuenta» (`admin--suspendida.html`)
  - confirmar-reactivar: ficha suspendida con el diálogo de reactivar (`admin--confirmar-reactivar.html`)
  - propia-cuenta (CA-4): ficha de la propia Administradora, sin «Suspender» y con el motivo (`admin--propia-cuenta.html`)
  - ajustar-cuota (011b): formulario con GB, fecha de fin y total resultante antes de guardar (`admin--ajustar-cuota.html`)
  - cuota-bajo-lo-usado (011b): total 105 GB sobre una cuenta que usa 108 GB (103 %); error de dominio y nada cambia
    (`admin--cuota-bajo-lo-usado.html`)
  - cuota-invalida (011b): extra 0 y fecha pasada, con resumen de errores y error en cada campo
    (`admin--cuota-invalida.html`)
  - cuota-guardada (011b): 50 GB extra hasta el 15 nov 2026; el total y el usado se actualizan en la misma ficha
    (`admin--cuota-guardada.html`)
  - quitar-extra (011b): el extra vuelve a la cuota del plan; dice que no se borra nada y que la cuenta sigue dentro
    (`admin--quitar-extra.html`)
  - extra-quitado (011b): la cuota vuelve a 350 GB y la cuenta sigue dentro de su plan (`admin--extra-quitado.html`)
  - extender-vigencia (011b): fecha nueva, aviso de solo lectura y confirmación (`admin--extender-vigencia.html`)
  - fecha-no-posterior (011b): fecha que no extiende, con error de campo y resumen (`admin--fecha-no-posterior.html`)
  - vigencia-guardada (011b): vence el 30 nov 2026 y la cuenta, que estaba en solo lectura, «volvió a vigente»
    (`admin--vigencia-guardada.html`)
  - personal (011b): Personal no vence; solo se puede ajustar la cuota (`admin--personal.html`)
  - sin-suscripcion (011b): sin plan, cuota ni vencimiento que ajustar (`admin--sin-suscripcion.html`)
  - limites-cargando (011b): indicador de carga (`StateView`) dentro del bloque, sin perder el resto de la ficha
    (`admin--limites-cargando.html`)
  - limites-error (011b): error del bloque con «Reintentar» (`admin--limites-error.html`)
- **Capturas**: `docs/design/capturas/backoffice/admin/` (`admin--<estado>--<360|1440>.png`, con movimiento
  reducido). En los veintidós estados: axe-core sin violaciones a 360 y 1440 px, sin desbordamiento horizontal a 360 px,
  sin errores de consola y sin objetivos menores de 24 px (`_generadores/pw/axe-seguridad.js` sobre la carpeta).

## Datos de ejemplo
Planes y cuotas del catálogo (`product-context.md` §3). En la app la lista, el total, los planes y el espacio vienen de la
API; los del mockup son de ejemplo. Las cuentas internas usan `@nimbo.gt` y no tienen plan ni espacio. Planes, total de
cuentas y las personas que aparecen en otras pantallas (Mónica, Andrea, Pablo, Laura y Diego) salen de
`_generadores/admin/corpus.js`, la misma fuente del catálogo, las métricas, el alta interna y Soporte.

## Decisiones de UX
1. **Ficha como página** (`Administración / Cuentas / {nombre}` con «Volver a cuentas»), no como panel lateral: las siete
   columnas de CA-1 no caben junto a un panel a 1440 px, la página funciona igual a 360 px y el diálogo de confirmar no
   queda encima de otro panel. El nombre de cada fila es el enlace a la ficha.
2. **Aviso de privacidad** fijo bajo el título en la lista y en la ficha: «La administración muestra metadatos de los
   archivos (nombre, tipo, tamaño, fechas y estado), nunca su contenido.» Ícono de candado + texto. Incluye «estado»
   desde el 2026-10-03, como P-5 y la vista de Soporte.
3. **Búsqueda por correo** con etiqueta visible y botón «Buscar» (se envía, no busca al teclear). La paginación usa
   «Anterior / Página N de M / Siguiente» y el total en texto.
4. **Estado y verificación nunca solo por color** (Art. XIII.4): `StatusBadge` con ícono y texto («Activa» con círculo
   de verificación, «Suspendida» con prohibido); «Verificada» con «Sí»/«No» y su ícono. El espacio usado repite el tramo
   de `QuotaBar` en una barra decorativa (`aria-hidden`), con GB y % siempre en texto.
5. **Cuentas internas en la misma lista** (P-11), con el rol en texto; plan y espacio muestran «—» con «No aplica:
   cuenta interna» para lectores de pantalla. La propia cuenta lleva la etiqueta «TÚ».
6. **A 360 px** la tabla pasa a filas apiladas: nombre, correo, estado, rol, verificación, plan con espacio y alta en
   la primera celda; los botones y campos tienen 44 px; el menú lateral pasa al cajón del marco.
7. **Confirmar suspender** (`ConfirmDestructiveDialog`, foco inicial en «Cancelar», fondo `inert`): quién pierde el
   acceso y cuatro consecuencias con ícono: se cierran sus sesiones en todos sus dispositivos; sus comparticiones y
   enlaces públicos dejan de funcionar mientras esté suspendida; no se borra nada y al reactivar vuelven como estaban
   (RN-6); queda en su auditoría, donde el cliente ve tu rol y no tu nombre (RN-2, 004 D-2). Botón destructivo «Suspender cuenta».
8. **Éxito** con `role="status"`: «Esta cuenta quedó suspendida y se cerraron sus sesiones.» + «Sus comparticiones y
   enlaces públicos están en pausa hasta que la reactives. No se borró nada.» El estado cambia a «Suspendida» y la
   acción pasa a «Reactivar cuenta» (botón primario).
9. **Reactivar también se confirma**, sin estilo destructivo: avisa que las sesiones cerradas no vuelven (CA-3).
10. **CA-4 en la UI**: en la propia ficha no aparece «Suspender» (la UI no sugiere lo que el servidor niega); en su lugar,
    «No puedes suspender tu propia cuenta. Si necesitas hacerlo, pídeselo a otro Administrador.»
11. **Ver metadatos de archivos** (CA-13) solo en fichas de clientes, con el aviso de que la consulta queda en la
    auditoría que ve la persona; las cuentas internas no guardan archivos. Lleva a la vista de metadatos (mockup aparte).
12. **«Límites y vigencia» es un bloque aparte**, a todo el ancho y debajo de la rejilla de datos y acciones: no compite
    con «Datos de la cuenta» ni convierte la ficha en un formulario permanente. Usa las mismas filas que «Datos de la
    cuenta» (`Fact`: término, valor y aclaración) y no lleva barra de uso: cuota, extra, total, usado con su porcentaje y
    fecha van en texto, con el mismo `tabular-nums`. Las fechas van en formato corto («31 oct 2026», `lastDayLabel`) en
    el bloque, los diálogos y los avisos. El distintivo va bajo el título; el estado de la suscripción se refuerza con texto e ícono, nunca
    solo con color. La cuenta puede seguir «Activa» y la suscripción estar en «Solo lectura»: son estados distintos.
13. **Ajustar cuota** enseña el cálculo antes de guardar (`cuota del plan + extra = total`) y actualiza el total al
    escribir; el porcentaje de lo usado es sobre ese total resultante (304 de 400 GB = 76 %). El extra debe ser mayor
    que cero; **«Quitar extra»** es una acción aparte, solo se ofrece si la cuota del plan ya cubre lo usado y se confirma
    con `ConfirmDestructiveDialog` (botón destructivo «Quitar extra», foco inicial en «Cancelar»). Si el total queda por debajo de lo usado, el error nombra las dos cifras (total y usado) y el
    foco vuelve al campo; no es un diálogo destructivo porque no borra nada. La fecha de fin es obligatoria y futura
    (P-2 de la 011).
14. **Extender vigencia** solo alarga: no hay atajo para acortar ni para dejar la cuenta vencida. Si la suscripción está
    en solo lectura, el diálogo lo dice y la acción sigue disponible. Al guardar, el aviso dice «volvió a vigente» si la
    cuenta salía de solo lectura y «sigue vigente» si no (el mockup dibuja el primer caso). No se cobra ni se factura y no se envía correo (P-3 de la 011). El texto no promete un cobro ni un cambio de plan.
15. **Personal no vence**: muestra «Sin vencimiento» y conserva «Ajustar cuota»; no muestra «Extender vigencia» ni una
    fecha inventada. **Sin suscripción** no muestra el bloque de acciones: no hay cuota ni vigencia que ajustar.
16. **El éxito se cuenta en el bloque** con `role="status"` y, si hay extra, «Datos de la cuenta» pasa a mostrar el total
    con extra y el porcentaje recalculado. Así no se ven dos totales distintos en la misma ficha. El aviso de la acción
    queda en la auditoría del cliente con la fecha y el rol del Administrador, no con su nombre (RN-2).

## Pendiente
- **Rechazo de «último Administrador activo»** (CA-4, RN-7): quien suspende es un Administrador activo que no puede
  suspenderse a sí mismo, así que este caso solo aparece por concurrencia (dos Administradores se suspenden a la vez).
  No tiene estado propio: si el servidor lo rechaza, el diálogo se cierra y la ficha muestra un aviso de error
  (variante destructiva, como `storage/explorador--descarga-fallida`) con «No se puede suspender: debe quedar al menos
  un Administrador activo. Nada cambió.» y el estado sigue «Activa». El texto final lo fija el plan con el `code`.
- Suspender una **cuenta interna**: el diálogo no menciona comparticiones ni enlaces (RN-6 aplica a clientes); se
  dibuja si el equipo lo pide.
- Ficha cargando, ficha no encontrada y error de la acción de suspender: siguen el patrón `StateView`/aviso de esta
  carpeta; sin estado propio.
- «Sin permiso» (Soporte u Operador abren `/admin`, CA-14/CA-17): pantalla común del marco, fuera de esta carpeta.
- Búsqueda por inicio del correo y 10 por página (resuelto en el plan, P-16/Q-5).
- Token ya emitido: al suspender, el acceso que la cuenta ya tenía caduca en 15 min como máximo (002 D-10; CA-2). El
  diálogo dice «Se cerrarán sus sesiones…»; el plan decide si se le explica ese margen al Administrador.
- **011b, extra vencido**: no hay estado propio. Cuando el extra vence, el bloque vuelve a «Cuota del plan», «Espacio
  extra: 0 GB» y el total del plan; si el usado supera ese total, se aplica el mismo aviso de solo lectura de la 011.
  «Quitar extra» solo se ofrece si `cuota del plan >= espacio_usado`; si no, el servidor lo rechaza y la UI no dibuja esa
  acción. El texto final lo fija el plan con el `code`.
- **011b, error de red o del servidor al guardar**: el diálogo se queda abierto con un aviso y el botón vuelve a estar
  disponible; no se dibuja un estado aparte. Los `code` (`BACKOFFICE_QUOTA_BELOW_USAGE`, `BACKOFFICE_QUOTA_INVALID`,
  `BACKOFFICE_VALIDITY_NOT_EXTENDED`, `BACKOFFICE_INVALID_INPUT`) los fija el plan en `contracts`.
- **011b, concurrencia**: si entre abrir el diálogo y guardar el usado cambió, el servidor vuelve a validar y el error de
  dominio se pinta en el mismo diálogo; el mockup de `cuota-bajo-lo-usado` es la referencia visual.
