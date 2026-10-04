# Mockup: Administración · cuentas y ficha

- **Spec**: 011 (CA-1 a CA-4, CA-13, CA-14, CA-17; RN-1, RN-6, RN-7; §6)
- **Propuesta presentada**: p. 18 (vista de cuentas con ficha lateral).
- **Cambios respecto de la propuesta** (decisiones de la dueña, 2026-10-03, y de esta revisión):
  - Aviso de privacidad: «metadatos de los archivos (nombre, tipo, tamaño, fechas), nunca su contenido» (P-5), en
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
- **Origen**: HTML autocontenido generado con `../../_generadores/admin/generar.js`; no se edita a mano. El CSS del
  marco (tokens, barra lateral, barra superior, botones, diálogo, cajón y cortes a 900/600 px) sale de
  `_generadores/marco/marco.js`, el mismo de `identity/seguridad`, `shared/layout` y `storage`; la navegación, la persona y
  la barra superior del área se arman en `_generadores/admin/area.js` (compartido con `backoffice/alta-interna`) con las
  mismas clases. Tonos AA de `ui-guidelines.md` §2–§3,
  solo Inter, cifras con `tabular-nums`, versión móvil real a 360 px. Es referencia visual; `apps/web` no lo importa.
- **Estados incluidos**:
  - default: lista paginada (10 de 1 284), clientes e internas, búsqueda vacía (`admin.html`)
  - vacio: búsqueda por correo sin resultados, con «Limpiar búsqueda» (`admin--vacio.html`)
  - cargando: esqueleto de la tabla y «Cargando cuentas…» con `role="status"` (`admin--cargando.html`)
  - error: falló la lista; error con «Reintentar» (`admin--error.html`)
  - confirmar-suspender: ficha de una clienta activa con el diálogo de confirmación (`admin--confirmar-suspender.html`)
  - suspendida: ficha tras suspender, con «Esta cuenta quedó suspendida y se cerraron sus sesiones.» y «Reactivar
    cuenta» (`admin--suspendida.html`)
  - confirmar-reactivar (extra): ficha suspendida con el diálogo de reactivar (`admin--confirmar-reactivar.html`)
  - propia-cuenta (extra, CA-4): ficha de la propia Administradora, sin «Suspender» y con el motivo (`admin--propia-cuenta.html`)
- **Capturas**: `docs/design/capturas/backoffice/admin/` (`admin--<estado>--<360|1440>.png`). En los ocho estados:
  axe-core sin violaciones a 360 y 1440 px, sin desbordamiento horizontal a 360 px, sin errores de consola y sin
  objetivos menores de 24 px (`_generadores/pw/axe-seguridad.js` sobre la carpeta).

## Datos de ejemplo
Planes y cuotas del catálogo (`product-context.md` §3). En la app la lista, el total, los planes y el espacio vienen de la
API; los del mockup son de ejemplo. Las cuentas internas usan `@nimbo.gt` y no tienen plan ni espacio.

## Decisiones de UX
1. **Ficha como página** (`Administración / Cuentas / {nombre}` con «Volver a cuentas»), no como panel lateral: las siete
   columnas de CA-1 no caben junto a un panel a 1440 px, la página funciona igual a 360 px y el diálogo de confirmar no
   queda encima de otro panel. El nombre de cada fila es el enlace a la ficha.
2. **Aviso de privacidad** fijo bajo el título en la lista y en la ficha: «La administración muestra metadatos de los
   archivos (nombre, tipo, tamaño, fechas), nunca su contenido.» Ícono de candado + texto.
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
   (RN-6); queda en su auditoría con tu nombre y rol (RN-2). Botón destructivo «Suspender cuenta».
8. **Éxito** con `role="status"`: «Esta cuenta quedó suspendida y se cerraron sus sesiones.» + «Sus comparticiones y
   enlaces públicos están en pausa hasta que la reactives. No se borró nada.» El estado cambia a «Suspendida» y la
   acción pasa a «Reactivar cuenta» (botón primario).
9. **Reactivar también se confirma**, sin estilo destructivo: avisa que las sesiones cerradas no vuelven (CA-3).
10. **CA-4 en la UI**: en la propia ficha no aparece «Suspender» (la UI no sugiere lo que el servidor niega); en su lugar,
    «No puedes suspender tu propia cuenta. Si necesitas hacerlo, pídeselo a otro Administrador.»
11. **Ver metadatos de archivos** (CA-13) solo en fichas de clientes, con el aviso de que la consulta queda en la
    auditoría que ve la persona; las cuentas internas no guardan archivos. Lleva a la vista de metadatos (mockup aparte).

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
- El plan decide si la búsqueda por correo es exacta o por prefijo, y el tamaño de página (el mockup muestra 10).
- Vistas aparte de 011: alta interna, catálogo de planes, métricas agregadas y metadatos de Soporte.
