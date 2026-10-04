# Generadores de los mockups escritos a mano

Los mockups HTML autocontenidos de `identity/seguridad`, `backoffice/admin`, `backoffice/alta-interna`, `shared/layout`, `storage/carga` (salvo `carga--progreso.html`) y los estados de 005 de `storage/explorador` no se editan a mano: se generan con estos
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
| `admin/area.js` | Marco del área de administración (spec 011): íconos, persona, barra lateral, barra superior, cajón, CSS común (encabezado, aviso de privacidad, «Volver», tarjeta, recuadro informativo y avisos) y la página; usa el CSS del marco. Lo usan `admin/generar.js` y `alta-interna/generar.js` |
| `admin/generar.js` | Los 8 estados de `backoffice/admin` (spec 011: cuentas y ficha) sobre `admin/area.js` |
| `alta-interna/generar.js` | Los 5 estados de `backoffice/alta-interna` (spec 011: alta de cuenta interna) sobre `admin/area.js` |
| `pw/capturar-rutas.js` | Capturas a 360 y 1440 px de los HTML indicados |
| `pw/axe-seguridad.js`, `pw/axe-layout.js` | axe-core, desbordamiento a 360 px, objetivos táctiles y consola sobre todos los `.html` de una carpeta (sirve para cualquier pantalla); el de layout recorre además el teclado |

## Uso

```bash
node docs/design/mockups/_generadores/seguridad/generar.js "$(pwd)"
node docs/design/mockups/_generadores/layout/generar.js "$(pwd)"
node docs/design/mockups/_generadores/carga/generar.js "$(pwd)"
node docs/design/mockups/_generadores/explorador/generar.js "$(pwd)"
node docs/design/mockups/_generadores/admin/generar.js "$(pwd)"
node docs/design/mockups/_generadores/alta-interna/generar.js "$(pwd)"
node docs/design/mockups/_generadores/pw/capturar-rutas.js "$(pwd)" \
  identity/seguridad/seguridad.html=identity/seguridad/seguridad--default
node docs/design/mockups/_generadores/pw/axe-layout.js "$(pwd)"
```

Los generadores solo usan Node. Los scripts de `pw/` necesitan `playwright` y `axe-core`, que **no** son dependencias
del monorepo: se instalan aparte (por ejemplo, en una carpeta temporal con `npm i playwright axe-core`) hasta que la
spec de E2E (000b/023) defina las del proyecto con su ADR.

Después de cambiar un generador, vuelve a generar, compara con `git diff` y regenera las capturas del mockup afectado.
