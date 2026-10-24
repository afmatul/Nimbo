# Mockup: Soporte · metadatos y papelera

- **Spec**: 011 (HU-5; CA-13, CA-14, CA-15, CA-17; RN-1, RN-2; §5, §6; P-5) y 011b (CA-10 a CA-12, CA-16, CA-17;
  RN-1, RN-2, RN-5; §6).
- **Propuesta presentada**: ninguna. Las dos pantallas son nuevas: la de metadatos sale de CA-13 (nombre, tipo, tamaño,
  fechas y estado de cada archivo; nunca contenido, texto, vista previa, descarga, URL ni clave de objeto) y la de
  papelera de CA-10 a CA-12 (restaurar raíces, con motivo obligatorio y auditoría).
- **Rutas sugeridas**: `/soporte/metadatos` y `/soporte/papelera` (inicio del área de Soporte) y, para el Administrador,
  `/admin/cuentas/:id/metadatos` (desde «Ver metadatos de archivos» de la ficha de `backoffice/admin`).
- **Origen**: HTML autocontenido generado con `../../_generadores/soporte/generar.js`; no se edita a mano. El marco sale
  de `_generadores/admin/area.js` con `AREA_SOPORTE` (persona, distintivo «SOPORTE» y navegación propia); la búsqueda
  por correo, la paginación y el diálogo son las mismas piezas de `backoffice/admin` (extraídas a `area.js` sin cambiar
  un byte de sus mockups). Íconos de tipo de `_generadores/mis-archivos/mis-archivos.js`; el campo del motivo usa
  `A.campo`/`CSS_FORM` y el diálogo, `A.formDialog` (compartido con Administración). Tonos AA de `ui-guidelines.md` §2-§3, solo Inter, cifras y fechas con `tabular-nums`, versión
  móvil real a 360 px. Es referencia visual; `apps/web` no lo importa.
- **Enlaces entre mockups** (rutas relativas): en el área de Soporte, la entrada «Metadatos de archivos», el logo y la
  miga «Soporte» llevan a `soporte--inicial.html` (inicio del área); «Papelera» lleva a `soporte--papelera.html`. En
  `desde-admin`, la navegación es la del
  Administrador (Cuentas, Catálogo de planes, Métricas) y las migas «Administración» y «Cuentas» van a
  `../admin/admin.html`; «Volver a la ficha de Laura Barrios» y la miga con su nombre van a
  `../admin/admin--ficha.html` (su ficha activa, sin diálogo ni aviso). En la papelera, cada «Restaurar» abre
  `soporte--papelera-confirmar.html`; «Cancelar» vuelve a `soporte--papelera.html`.
- **Estados incluidos**:
  - default: metadatos de los archivos de Laura Barrios, con el aviso de auditoría (`soporte.html`)
  - inicial: antes de buscar; dice qué se verá y que la consulta se audita (`soporte--inicial.html`)
  - cargando: esqueleto del encabezado del cliente y de la tabla, y «Buscando la cuenta y sus archivos…» con
    `role="status"` (`soporte--cargando.html`)
  - vacio: cliente sin archivos, ni en la papelera (`soporte--vacio.html`)
  - no-encontrado: el mismo mensaje para un correo que no existe o que no es de un cliente (`soporte--no-encontrado.html`)
  - error (CA-17): «No pudimos completar la búsqueda.» con «Reintentar» (`soporte--error.html`)
  - desde-admin: la misma vista para el Administrador, en su área, sin buscador y con «Volver a la ficha»
    (`soporte--desde-admin.html`)
  - papelera (011b): raíces de archivos y carpetas de Laura, con fecha de eliminación, purga y ubicación original;
    «Restaurar» en cada fila (`soporte--papelera.html`)
  - papelera-vacia (011b): no hay raíces restaurables (`soporte--papelera-vacia.html`)
  - papelera-cargando (011b): esqueleto del cliente y de la tabla, con `role="status"` (`soporte--papelera-cargando.html`)
  - papelera-error (011b): falló la búsqueda o la papelera, con «Reintentar» (`soporte--papelera-error.html`)
  - papelera-confirmar (011b): diálogo con el elemento, su destino y el motivo obligatorio (`soporte--papelera-confirmar.html`)
  - papelera-motivo-invalido (011b): motivo vacío, con resumen de errores y error de campo; nada cambia
    (`soporte--papelera-motivo-invalido.html`)
  - papelera-restaurando (011b): botón ocupado, motivo conservado y resto del diálogo inerte
    (`soporte--papelera-restaurando.html`)
  - papelera-restaurado (011b): el elemento sale de la lista y el aviso dice dónde quedó (`soporte--papelera-restaurado.html`)
  - papelera-renombrado (011b): ya existía el nombre; se restaura como «(1)» y se explica por qué
    (`soporte--papelera-renombrado.html`)
  - papelera-movido-raiz (011b): la carpeta original ya no está; se restaura en Mis archivos
    (`soporte--papelera-movido-raiz.html`)
  - papelera-retencion-vencida (011b): la retención terminó; no se restaura y nada cambia
    (`soporte--papelera-retencion-vencida.html`)
- **Capturas**: `docs/design/capturas/backoffice/soporte/` (`soporte--<estado>--<360|1440>.png`, con movimiento
  reducido). En los dieciocho estados: axe-core sin violaciones a 360 y 1440 px, sin desbordamiento horizontal a 360 px
  (ni a 601, 768, 901, 1024 y 1180 px), sin errores de consola y sin objetivos menores de 24 px
  (`_generadores/pw/axe-seguridad.js` sobre la carpeta).

## Datos de ejemplo
Cuadran con los mockups del área: Andrea Ruiz es la cuenta de Soporte de la lista de `backoffice/admin`; Laura Barrios
(`laura.barrios@alpha.gt`, plan Equipo) es la clienta cuya ficha tiene «Ver metadatos de archivos»; Diego Coj
(`diego.coj@gmail.com`, 0 B) es el cliente recién registrado de esa lista. Los nombres de archivo de las primeras filas
son los de `storage/explorador`. Tipos con los valores de `archivo.tipo` de 005 (`docx`, `xlsx`, `pptx`, `pdf`, `texto`,
`imagen`, `otro`). La papelera usa tres raíces con la retención de 60 días del plan Equipo: una carpeta
(`Contratos 2026`), un `.xlsx` y un `.pdf`; la fecha de purga es la de eliminación más 60 días. En la app todo viene de
la API: tamaños en bytes (`bigint`) que la web formatea, fechas en la zona horaria de la persona que consulta y el total
para la paginación.

## Decisiones de UX
1. **Dos flujos, una misma búsqueda**: buscar por correo → ver metadatos o buscar por correo → ver la papelera. La
   búsqueda es **exacta** (correo completo, botón «Buscar»; no busca al teclear ni sugiere cuentas) y devuelve **una**
   cuenta de cliente: Soporte no lista ni recorre cuentas (CA-1 es solo del Administrador).
2. **Navegación de Soporte con dos entradas**, «Metadatos de archivos» y «Papelera» (CA-14): nada de cuentas, catálogo
   ni métricas. Persona abajo («Andrea Ruiz · Soporte», ícono de auriculares) y distintivo «SOPORTE» junto al logo, con
   el mismo marco del área de administración. La entrada activa se marca con `aria-current="page"`.
3. **Aviso de privacidad** fijo bajo el título, con candado: «Soporte ve metadatos de los archivos (nombre, tipo, tamaño,
   fechas y estado), nunca su contenido ni vistas previas.» (adaptación del mensaje de §6 de la spec para Soporte).
4. **Aviso de auditoría** en dos momentos (RN-2, CA-16): antes de buscar («Cada consulta queda en la auditoría del
   cliente, que ve tu rol») y junto al resultado («Esta consulta queda en la auditoría de Laura. Verá la fecha y tu rol
   (Soporte).»); nunca tu nombre (CA-16, 004 D-2). Recuadro informativo con ícono de historial, no alerta: es un hecho, no un error.
5. **Metadatos y nada más** (CA-13, RN-1): columnas Nombre, Tipo, Tamaño, Creado, Modificado y Estado. Ninguna fila ni
   nombre es enlace o botón, no hay menú ⋮, selección, casillas, miniaturas ni «abrir/descargar/previsualizar»; el
   ícono es solo por tipo (`FileTypeChip`, tokens `--file-*`). Sin hover de fila, para no sugerir que algo se abre.
6. **Estado** = «Disponible» (círculo de verificación) o «En papelera» (papelera, contorno neutro, nunca rojo) con
   «desde {fecha}», ambos de `archivo.eliminado_en` (columna de 005; la papelera la llena 006). Siempre ícono + texto.
   **No** se muestran cargas en curso: en 005 una carga no es un archivo hasta completarse (`carga`, con RLS solo del
   propietario); el vacío lo aclara («Las cargas que no terminaron no aparecen aquí»).
7. **Fechas absolutas con hora** (`03/10/2026 10:11`), no relativas («hace 4 min»): Soporte las cruza con lo que le
   cuenta el cliente. Orden fijo por última modificación (dicho en el `caption`), sin controles de orden ni filtros.
8. **Encabezado del cliente**: nombre, correo y distintivo «Cliente»; sin plan, espacio ni estado de la cuenta (no
   están en CA-13).
9. **no-encontrado**: «No encontramos una cuenta de cliente con «{correo}».» es el mismo texto si el correo no existe o
   si es de una cuenta interna (003 D-6), con «Limpiar búsqueda». No muestra aviso de auditoría (no se consultó a nadie).
10. **inicial** se agrega porque es la página de inicio de Soporte: sin él, la primera pantalla sería un formulario
    suelto. Explica qué verá y el aviso de auditoría, sin botón (la búsqueda está justo arriba).
11. **Buscar es el botón primario** aquí (en `backoffice/admin` es `outline` porque la acción primaria es «Nueva cuenta
    interna»). Ayuda bajo el campo enlazada con `aria-describedby`.
12. **Anchos**: a 1440 px, seis columnas; entre 601 y 1180 px, tipo y tamaño bajo el nombre y la fecha de creación bajo
    la de modificación (tres columnas); a 360 px, filas apiladas con los cinco metadatos en texto y el estado como
    distintivo, campos y botones de 44 px, menú en el cajón del marco.
13. **desde-admin**: el Administrador ve exactamente lo mismo en su área (`Administración / Cuentas / Laura Barrios /
    Metadatos de archivos`, «Cuentas» marcada), sin buscador (llegó desde la ficha), con «Volver a la ficha de Laura
    Barrios» y el aviso de auditoría con «tu rol (Administrador)».
14. **Papelera solo con raíces** (CA-10, RN-3): columnas Nombre, Tipo, Tamaño, Eliminado, Se purga, Ubicación original y
    Acción. Se ven archivos y carpetas, con su retención vigente; no se abren, descargan, previsualizan ni muestran
    versiones. La carpeta no se expande: no hay contenido dentro. El nombre no es enlace; la única acción es
    «Restaurar».
15. **Confirmar restauración con motivo** (CA-11): el diálogo dice el nombre, el destino y qué pasa si el nombre está
    ocupado. El motivo es obligatorio, de 1 a 500 caracteres, con contador y ayuda que pide no escribir nombres de
    archivo ni datos personales. No es un diálogo destructivo: restaurar no borra nada, así que el botón es primario.
    «Cancelar» vuelve a la papelera sin cambiar nada.
16. **Resultado explícito** (CA-11, CA-17): el aviso nombra el elemento y el destino y confirma que el motivo quedó en la
    auditoría del cliente. Si ya existía el nombre, se dice que se restauró como «(1)»; si la carpeta original ya no
    está, se dice que quedó en Mis archivos; si la retención venció, el error lo explica y nada cambia. No se muestra
    contenido ni una vista previa del resultado.
17. **Permisos en la UI**: Soporte solo restaura; no hay «Vaciar papelera», «Purgar», «Descargar» ni «Abrir». La
    restauración se permite con la cuenta activa o suspendida y también en solo lectura; no cambia el estado de la
    cuenta ni la cuota. El Administrador no ve esta pantalla (CA-13, RN-5).
18. **Auditoría sin nombres**: el aviso dice que el cliente verá la fecha, el motivo y el rol (Soporte), nunca el nombre
    de la persona. El motivo no se repite en logs técnicos ni en la bitácora técnica (RN-4, CA-14).
19. **Anchos de la papelera**: a 1440 px, siete columnas; entre 601 y 1180 px, tipo, tamaño y eliminado pasan bajo el
    nombre, y la ubicación original también por debajo de 1000 px; a 360 px, filas apiladas con el destino y las fechas
    en texto y «Restaurar» a todo el ancho (44 px). El diálogo ocupa el ancho disponible y apila las acciones.
20. **Datos de la retención**: las fechas de purga son las de eliminación más 60 días (plan Equipo de la 006). La lista
    puede quedar obsoleta mientras está abierta; el servidor vuelve a comprobar la retención y la raíz al restaurar, y el
    error de retención vencida es el estado que muestra ese rechazo.

## Pendiente
- **Cargas en curso** como metadato de Soporte («¿por qué no veo mi archivo?»): necesitaría leer `carga` fuera del
  propietario; se decide en el plan o en 011b.
- **Estados de specs futuras**: indexación (019), optimización (021) y versiones (014) no se muestran; las versiones
  nunca (CA-15: sin filas de versiones). La ruta de la papelera sí llega con 006; la del explorador sigue fuera de P-5.
- **Bitácoras y trabajos** (022b): no aparecen aquí; la papelera no muestra el historial de restauraciones, solo el
  resultado de la acción actual.
- **Restaurar un elemento hijo**: no se ofrece; Soporte solo restaura raíces (RN-3). Si el cliente restauró la carpeta
  completa, sus hijos vuelven con ella.
- **Papelera sin paginación dibujada**: el mockup muestra tres raíces; el plan decide el tamaño de página y si la
  búsqueda y la papelera son una o dos llamadas. La lista puede crecer sin cambiar el diseño de la fila.
- **Error de red al restaurar**: el diálogo se queda abierto con aviso y el botón vuelve a estar disponible; no tiene
  estado propio. El `code` y el texto final los fija el plan en `contracts`.
- «Sin permiso» (Cliente u Operador abren el área, CA-14): pantalla común del marco, fuera de esta carpeta.
- El plan fija el tamaño de página (el mockup muestra 10) y si la búsqueda y el listado son una o dos llamadas.
