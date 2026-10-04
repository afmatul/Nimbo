# Generadores de los mockups escritos a mano

Los mockups HTML autocontenidos de `identity/seguridad`, `backoffice/admin`, `backoffice/alta-interna`, `backoffice/catalogo`, `backoffice/metricas`, `backoffice/soporte`, `shared/layout`, `storage/carga` (salvo `carga--progreso.html`) y los estados de 005 de `storage/explorador` no se editan a mano: se generan con estos
scripts para que el marco de la aplicación (barra lateral, barra superior, menú de la cuenta, cajón móvil y diálogo)
salga de **un solo lugar**. Así no se copia el marco en cada archivo (DRY). Son referencia visual; `apps/web` no
los importa.

| Archivo | Qué hace |
|---|---|
| `marco/marco.js` | Piezas comunes del marco y el diálogo de «Cerrar sesión» (`DIALOGO_CERRAR_SESION`) |
| `mis-archivos/mis-archivos.js` | Página «Mis archivos» de 005: íconos de tipo, datos de ejemplo, cuota por tramos, barra lateral de 005 (sin «Carpetas» ni contador de la Papelera), encabezado y tabla de la raíz con el menú ⋮ (comunes a `carga` y `explorador`) |
| `marco/marco.js` (opciones) | `sidebar`/`navegacion` aceptan `carpetas` y `contadorPapelera`; con los valores por defecto el HTML de Seguridad y del layout no cambia |
| `marco/css-marco.js` | CSS del marco con los tokens de Cielo Sereno (`ui-guidelines.md` §2–§3), solo Inter |
| `seguridad/generar.js` | Los 15 estados de `identity/seguridad` (spec 002) |
| `layout/generar.js` | Los 5 estados de `shared/layout` |
| `carga/generar.js` | Los 8 estados escritos a mano de `storage/carga` (spec 005); `carga--progreso.html` es el paquete de la propuesta y no se genera |
| `explorador/generar.js` | Los 7 estados de 005 de `storage/explorador` (`vacio`, `cargando`, `arrastre`, `error`, `acciones`, `descarga-preparando`, `descarga-fallida`); `cuadricula` y `lista` son el paquete de la propuesta y no se generan |
| `admin/area.js` | Marco del área de administración (spec 011): íconos, persona, barra lateral (con la entrada actual), barra superior, cajón, CSS común (encabezado, aviso de privacidad, «Volver», tarjeta, recuadro informativo, avisos, distintivos de estado, estados de pantalla, botón destructivo con borde, diálogo con consecuencias y distintivo «Inactivo» de un plan), `CSS_FORM` (campos, resumen de errores, aviso de auditoría y acciones), `campo`, `resumenErrores`, `dialogo` (con `cancelar`, «Cancelar» enlaza el mockup al que vuelve; sin él es un botón), `estadoError`, `badgeInactivo`, búsqueda por correo y paginación (`busqueda`, `paginacion`, `CSS_BUSQUEDA`, `CSS_PAGINACION` y sus reglas de 600 px, extraídas de `admin/generar.js` sin cambiar su salida) y la página; usa el CSS del marco. El área es configurable: `AREA_ADMIN` (por defecto), `AREA_SOPORTE` o `AREA_OPERADOR` (persona, distintivo, navegación e inicio de cada área). La navegación, el logo y las migas enlazan los mockups entre sí con rutas relativas (`href` de cada entrada de `nav`, `inicio` del área; una miga puede ser `[etiqueta, href]`); lo que no tiene pantalla dibujada queda en `#`. Lo usan `admin/generar.js`, `alta-interna/generar.js`, `catalogo/generar.js`, `metricas/generar.js` y `soporte/generar.js` |
| `admin/generar.js` | Los 9 estados de `backoffice/admin` (spec 011: cuentas y ficha) sobre `admin/area.js` |
| `alta-interna/generar.js` | Los 5 estados de `backoffice/alta-interna` (spec 011: alta de cuenta interna) sobre `admin/area.js` |
| `catalogo/generar.js` | Los 8 estados de `backoffice/catalogo` (spec 011: catálogo de planes y nuevo plan) sobre `admin/area.js` |
| `metricas/generar.js` | Los 5 estados de `backoffice/metricas` (spec 011: métricas agregadas, CA-12) sobre `admin/area.js`; tablas con barras en HTML y CSS, sin librerías de gráficos; el estado `operador` usa `AREA_OPERADOR` |
| `soporte/generar.js` | Los 7 estados de `backoffice/soporte` (spec 011: metadatos de los archivos de un cliente, CA-13) sobre `admin/area.js` con `AREA_SOPORTE`; íconos de tipo de `mis-archivos/mis-archivos.js`; el estado `desde-admin` usa `AREA_ADMIN` |
| `pw/capturar-rutas.js` | Capturas a 360 y 1440 px de los HTML indicados, con movimiento reducido (`reducedMotion: 'reduce'`: esqueletos e indicadores de carga quietos) |
| `pw/axe-seguridad.js`, `pw/axe-layout.js` | axe-core, desbordamiento a 360 px, objetivos táctiles y consola sobre todos los `.html` de una carpeta (sirve para cualquier pantalla); el de layout recorre además el teclado |

## Uso

```bash
node docs/design/mockups/_generadores/seguridad/generar.js "$(pwd)"
node docs/design/mockups/_generadores/layout/generar.js "$(pwd)"
node docs/design/mockups/_generadores/carga/generar.js "$(pwd)"
node docs/design/mockups/_generadores/explorador/generar.js "$(pwd)"
node docs/design/mockups/_generadores/admin/generar.js "$(pwd)"
node docs/design/mockups/_generadores/alta-interna/generar.js "$(pwd)"
node docs/design/mockups/_generadores/catalogo/generar.js "$(pwd)"
node docs/design/mockups/_generadores/metricas/generar.js "$(pwd)"
node docs/design/mockups/_generadores/soporte/generar.js "$(pwd)"
node docs/design/mockups/_generadores/pw/capturar-rutas.js "$(pwd)" \
  identity/seguridad/seguridad.html=identity/seguridad/seguridad--default
node docs/design/mockups/_generadores/pw/axe-layout.js "$(pwd)"
```

Los generadores solo usan Node. Los scripts de `pw/` necesitan `playwright` y `axe-core`, que **no** son dependencias
del monorepo: se instalan aparte (por ejemplo, en una carpeta temporal con `npm i playwright axe-core`) hasta que la
spec de E2E (000b/023) defina las del proyecto con su ADR.

Después de cambiar un generador, vuelve a generar, compara con `git diff` y regenera las capturas del mockup afectado.
