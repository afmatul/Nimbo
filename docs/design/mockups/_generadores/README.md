# Generadores de los mockups escritos a mano

Los mockups HTML autocontenidos de `identity/seguridad`, `backoffice/admin`, `backoffice/alta-interna`, `backoffice/catalogo`, `backoffice/metricas`, `backoffice/soporte`, `editing/editor` (salvo `editor--editando.html`), `shared/layout`, `storage/carga` (salvo `carga--progreso.html`), los estados de 005, 006 y 007 de `storage/explorador`, `storage/resumen-espacio`, los de 006 de `storage/papelera` y los de 014 de `storage/ficha-archivo` no se editan a mano: se generan con estos
scripts para que el marco de la aplicación (barra lateral, barra superior, menú de la cuenta, cajón móvil y diálogo)
salga de **un solo lugar**. Así no se copia el marco en cada archivo (DRY). Son referencia visual; `apps/web` no
los importa.

| Archivo | Qué hace |
|---|---|
| `marco/marco.js` | Piezas comunes del marco (navegación con «Mis archivos», «Compartidos conmigo», «Recientes», «Fijados» y «Papelera») y el diálogo de «Cerrar sesión» (`DIALOGO_CERRAR_SESION`); exporta `logo`, que usa `layout/barra.js` |
| `mis-archivos/mis-archivos.js` | Página «Mis archivos» de 005: íconos de tipo, datos de ejemplo, cuota por tramos, barra lateral de 005 (sin «Carpetas» ni contador de la Papelera), encabezado y tabla de la raíz con el menú ⋮ (comunes a `carga` y `explorador`) |
| `mis-archivos/estados.js` | CSS y HTML de los estados comunes de una lista (vacío, esqueleto, error, `Alert`, zona de soltar) y el script del menú ⋮; los usan los estados de 005 y 006 |
| `carpetas/carpetas.js` | Piezas de 006: logo del proyecto (nube de `docs/design/logos/` con tokens), barra lateral con «Carpetas» y contador de la Papelera, toast, diálogo con un campo, `ConfirmDestructiveDialog` con progreso y su CSS; fila, tabla (con `aria-sort` opcional de 007) y encabezado de una carpeta |
| `espacio/espacio.js` | Piezas de 007: datos del plan Personal de ejemplo, tarjeta de cuota de la barra lateral con sus tramos, ícono, «Ver detalle»/«Liberar espacio» y estados de carga y error, la barra lateral de 007 y `conItemEspacio` (ítem «Espacio», D-18) |
| `layout/barra.js` | Barra lateral y cajón en **tres bloques** (007 CA-19): navegación arriba, región central con desplazamiento propio (`central`; hoy `regionCarpetas`) y tarjeta de cuota fija al pie. 006 (CA-27, CA-28) cambia solo el `central` por «Accesos rápidos» |
| `carga/panel.js` | Panel de cargas (`UploadProgress`) de 005, extraído de `carga/generar.js` sin cambios en su HTML; lo reutiliza el layout (007 CA-18) |
| `marco/marco.js` (opciones) | `sidebar`/`navegacion` aceptan `carpetas` y `contadorPapelera`; con los valores por defecto el HTML de Seguridad y del layout no cambia |
| `marco/css-marco.js` | CSS del marco con los tokens de Cielo Sereno (`ui-guidelines.md` §2–§3), solo Inter; `TRAMOS`: CSS de los tramos de `QuotaBar` en la tarjeta de cuota |
| `seguridad/generar.js` | Los 15 estados de `identity/seguridad` (spec 002) |
| `actividad/generar.js` | Los 11 estados de `audit/mi-actividad` (spec 004); usa `marco.topbar({ actividad: 'actual', crumbs: [] })` |
| `layout/generar.js` | Los 18 estados de `shared/layout`: 5 del marco, 9 de «Accesos rápidos» (CA-27 y CA-28, con el menú ⋮ de los fijados en barra y cajón) y 4 de 007 (`cuota-70`, `cuota-90`, `aviso-arriba-centro` y `barra-fija-lista-larga`) |
| `carga/generar.js` | Los 9 estados escritos a mano de `storage/carga` (spec 005; el diálogo de nombre repetido con «Reemplazar (nueva versión)» y `nombre-repetido-poda` son de 014); `carga--progreso.html` es el paquete de la propuesta y no se genera |
| `explorador/generar.js` | Los 7 estados de 005 de `storage/explorador` (`vacio`, `cargando`, `arrastre`, `error`, `acciones`, `descarga-preparando`, `descarga-fallida`); `cuadricula` y `lista` son el paquete de la propuesta y no se generan |
| `explorador/generar-carpetas.js` | Los 31 estados de 006 de `storage/explorador`: 22 de carpetas, migas, crear, renombrar, «Mover a…» con «Nueva carpeta» en línea y mover a la papelera, y 9 de desglose, «Ver más» y accesos rápidos (CA-26 a CA-28) |
| `explorador/desglose.js` | Filas desglosables de la lista (control con `aria-expanded`, sangría y guías con el token `tree-indent`/`tree-guides` de `globals.css`, cargando, vacía, error y «Ver más» en la fila), menú ⋮ con «Fijar»/«Quitar de la barra lateral», CSS y script de los estados de CA-26 |
| `accesos/accesos.js` | Sección «Accesos rápidos» de la barra lateral y del cajón (Fijados con menú ⋮ «Quitar de la barra lateral», 3 Recientes visibles y «Ver más»), su script de «Quitar» y el aviso del tope de fijados (`Alert` `warning`); entra al marco por `marco.sidebar({ accesos })` |
| `explorador/generar-orden.js` | Los 6 estados de 007 de `storage/explorador` (control de orden y «Cargar más»); orden por defecto: fecha de creación, más recientes primero |
| `resumen-espacio/generar.js` | Los 7 estados de `storage/resumen-espacio` (spec 007) |
| `ficha-archivo/generar.js` | Los 12 estados de 014 y los 10 de 019 (chip y aviso de indexación) de `storage/ficha-archivo` (historial `VersionTimeline`, confirmar restaurar con aviso de poda, restaurando, éxito, errores y descarga de versión); `ficha-archivo--vision.html` es un paquete de diseño interno y no se genera |
| `papelera/generar.js` | Los 12 estados de 006 de `storage/papelera`; `papelera.html` es el paquete de la propuesta y no se genera |
| `admin/area.js` | Marco del área de administración (spec 011): íconos, persona, barra lateral (con la entrada actual), barra superior, cajón, CSS común (encabezado, aviso de privacidad, «Volver», tarjeta, recuadro informativo, avisos, distintivos de estado, estados de pantalla, botón destructivo con borde, diálogo con consecuencias y distintivo «Inactivo» de un plan), `CSS_FORM` (campos, resumen de errores, aviso de auditoría y acciones), `campo`, `resumenErrores`, `dialogo` (con `cancelar`, «Cancelar» enlaza el mockup al que vuelve; sin él es un botón), `estadoError`, `badgeInactivo`, búsqueda por correo y paginación (`busqueda`, `paginacion`, que calcula las páginas del total, `CSS_BUSQUEDA`, `CSS_PAGINACION` y sus reglas de 600 px, extraídas de `admin/generar.js` sin cambiar su salida) y la página; usa el CSS del marco. El área es configurable: `AREA_ADMIN` (por defecto), `AREA_SOPORTE` o `AREA_OPERADOR` (persona del corpus, distintivo, navegación e inicio de cada área); `ICONO_ROL` da el ícono de cada rol. La navegación, el logo y las migas enlazan los mockups entre sí con rutas relativas (`href` de cada entrada de `nav`, `inicio` del área; una miga puede ser `{ etiqueta, href }`); lo que no tiene pantalla dibujada queda en `#`. También da lo que repetían los generadores: `carpetaDeSalida`, `archivoDe`, `comentariosDe` y `escribir`. Lo usan `admin/generar.js`, `alta-interna/generar.js`, `catalogo/generar.js`, `metricas/generar.js` y `soporte/generar.js` |
| `admin/corpus.js` | Corpus de ejemplo del área (spec 011): los cuatro planes y el nuevo, los conteos de cuentas (por plan, internas y suspendidas), las personas que aparecen en más de una pantalla (Mónica, Andrea, Pablo, Laura y Diego) y `miles`. Una sola fuente para la navegación, el catálogo y las métricas |
| `admin/generar.js` | Los 9 estados de `backoffice/admin` (spec 011: cuentas y ficha) sobre `admin/area.js` |
| `alta-interna/generar.js` | Los 5 estados de `backoffice/alta-interna` (spec 011: alta de cuenta interna) sobre `admin/area.js` |
| `catalogo/generar.js` | Los 8 estados de `backoffice/catalogo` (spec 011: catálogo de planes y nuevo plan) sobre `admin/area.js` |
| `metricas/generar.js` | Los 5 estados de `backoffice/metricas` (spec 011: métricas agregadas, CA-12) sobre `admin/area.js`; tablas con barras en HTML y CSS, sin librerías de gráficos; el estado `operador` usa `AREA_OPERADOR` |
| `soporte/generar.js` | Los 7 estados de `backoffice/soporte` (spec 011: metadatos de los archivos de un cliente, CA-13) sobre `admin/area.js` con `AREA_SOPORTE`; íconos de tipo de `mis-archivos/mis-archivos.js`; el estado `desde-admin` usa `AREA_ADMIN` |
| `editor/generar.js` | Los 10 estados de 016 de `editing/editor` (barra del editor, presencia con conteo frente al límite, avisos de solo lectura, guardado fallido y servicio no disponible); `editor--editando.html` es el paquete de la propuesta y no se genera |
| `pw/capturar-rutas.js` | Capturas a 360 y 1440 px de los HTML indicados, en `es-GT` y hora de Guatemala, con movimiento reducido (`reducedMotion: 'reduce'`: esqueletos e indicadores de carga quietos) |
| `pw/axe-seguridad.js`, `pw/axe-layout.js` | axe-core, desbordamiento a 360 px, objetivos táctiles y consola sobre todos los `.html` de una carpeta (sirve para cualquier pantalla); el de layout recorre además el teclado |

## Uso

```bash
node docs/design/mockups/_generadores/seguridad/generar.js "$(pwd)"
node docs/design/mockups/_generadores/layout/generar.js "$(pwd)"
node docs/design/mockups/_generadores/actividad/generar.js "$(pwd)"
node docs/design/mockups/_generadores/carga/generar.js "$(pwd)"
node docs/design/mockups/_generadores/explorador/generar.js "$(pwd)"
node docs/design/mockups/_generadores/explorador/generar-carpetas.js "$(pwd)"
node docs/design/mockups/_generadores/papelera/generar.js "$(pwd)"
node docs/design/mockups/_generadores/explorador/generar-orden.js "$(pwd)"
node docs/design/mockups/_generadores/resumen-espacio/generar.js "$(pwd)"
node docs/design/mockups/_generadores/admin/generar.js "$(pwd)"
node docs/design/mockups/_generadores/alta-interna/generar.js "$(pwd)"
node docs/design/mockups/_generadores/catalogo/generar.js "$(pwd)"
node docs/design/mockups/_generadores/metricas/generar.js "$(pwd)"
node docs/design/mockups/_generadores/soporte/generar.js "$(pwd)"
node docs/design/mockups/_generadores/ficha-archivo/generar.js "$(pwd)"
node docs/design/mockups/_generadores/editor/generar.js "$(pwd)"
node docs/design/mockups/_generadores/pw/capturar-rutas.js "$(pwd)" \
  identity/seguridad/seguridad.html=identity/seguridad/seguridad--default
node docs/design/mockups/_generadores/pw/axe-layout.js "$(pwd)"
```

Los generadores solo usan Node. Los scripts de `pw/` necesitan `playwright` y `axe-core`, que **no** son dependencias
del monorepo: se instalan aparte (por ejemplo, en una carpeta temporal con `npm i playwright axe-core`) hasta que la
spec de E2E (000b/023) defina las del proyecto con su ADR.

Después de cambiar un generador, vuelve a generar, compara con `git diff` y regenera las capturas del mockup afectado.
