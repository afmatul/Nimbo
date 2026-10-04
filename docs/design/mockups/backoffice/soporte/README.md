# Mockup: Soporte · metadatos de los archivos de un cliente

- **Spec**: 011 (HU-5; CA-13, CA-14, CA-15, CA-17; RN-1, RN-2; §5, §6; P-5)
- **Propuesta presentada**: ninguna. La pantalla es nueva y sale de CA-13: nombre, tipo, tamaño, fechas y estado de cada
  archivo; nunca contenido, texto, vista previa, descarga, URL ni clave de objeto.
- **Rutas sugeridas**: `/soporte/metadatos` (inicio del área de Soporte) y, para el Administrador,
  `/admin/cuentas/:id/metadatos` (desde «Ver metadatos de archivos» de la ficha de `backoffice/admin`).
- **Origen**: HTML autocontenido generado con `../../_generadores/soporte/generar.js`; no se edita a mano. El marco sale
  de `_generadores/admin/area.js` con `AREA_SOPORTE` (persona, distintivo «SOPORTE» y navegación propios); la búsqueda
  por correo y la paginación son las mismas piezas de `backoffice/admin` (extraídas a `area.js` sin cambiar un byte de
  sus mockups). Íconos de tipo de `_generadores/mis-archivos/mis-archivos.js`. Tonos AA de `ui-guidelines.md` §2–§3,
  solo Inter, cifras y fechas con `tabular-nums`, versión móvil real a 360 px. Es referencia visual; `apps/web` no lo
  importa. Los mockups aún no se enlazan entre sí (los `href` son `#`).
- **Estados incluidos**:
  - default: metadatos de los archivos de Laura Barrios, con el aviso de auditoría (`soporte.html`)
  - inicial (extra): antes de buscar; dice qué se verá y que la consulta se audita (`soporte--inicial.html`)
  - cargando: esqueleto del encabezado del cliente y de la tabla, y «Buscando la cuenta y sus archivos…» con
    `role="status"` (`soporte--cargando.html`)
  - vacio: cliente sin archivos, ni en la papelera (`soporte--vacio.html`)
  - no-encontrado: el mismo mensaje para un correo que no existe o que no es de un cliente (`soporte--no-encontrado.html`)
  - error (extra, CA-17): «No pudimos completar la búsqueda.» con «Reintentar» (`soporte--error.html`)
  - desde-admin (extra): la misma vista para el Administrador, en su área, sin buscador y con «Volver a la ficha»
    (`soporte--desde-admin.html`)
- **Capturas**: `docs/design/capturas/backoffice/soporte/` (`soporte--<estado>--<360|1440>.png`, con movimiento
  reducido). En los siete estados: axe-core sin violaciones a 360 y 1440 px, sin desbordamiento horizontal a 360 px
  (ni a 601, 768, 901, 1024 y 1180 px), sin errores de consola y sin objetivos menores de 24 px
  (`_generadores/pw/axe-seguridad.js` sobre la carpeta).

## Datos de ejemplo
Cuadran con los mockups del área: Andrea Ruiz es la cuenta de Soporte de la lista de `backoffice/admin`; Laura Barrios
(`laura.barrios@alpha.gt`, plan Equipo) es la clienta cuya ficha tiene «Ver metadatos de archivos»; Diego Coj
(`diego.coj@gmail.com`, 0 B) es el cliente recién registrado de esa lista. Los nombres de archivo de las primeras filas
son los de `storage/explorador`. Tipos con los valores de `archivo.tipo` de 005 (`docx`, `xlsx`, `pptx`, `pdf`, `texto`,
`imagen`, `otro`). En la app todo viene de la API: tamaños en bytes (`bigint`) que la web formatea, fechas en la zona
horaria de la persona que consulta y el total para la paginación.

## Decisiones de UX
1. **Un solo flujo**: buscar por correo → ver metadatos. La búsqueda es **exacta** (correo completo, botón «Buscar»; no
   busca al teclear ni sugiere cuentas) y devuelve **una** cuenta de cliente: Soporte no lista ni recorre cuentas (CA-1
   es solo del Administrador).
2. **Navegación de Soporte con una sola entrada**, «Metadatos de archivos» (CA-14): nada de cuentas, catálogo ni
   métricas. Persona abajo («Andrea Ruiz · Soporte», ícono de auriculares) y distintivo «SOPORTE» junto al logo, con el
   mismo marco del área de administración.
3. **Aviso de privacidad** fijo bajo el título, con candado: «Soporte ve metadatos de los archivos (nombre, tipo, tamaño,
   fechas y estado), nunca su contenido ni vistas previas.» (adaptación del mensaje de §6 de la spec para Soporte).
4. **Aviso de auditoría** en dos momentos (RN-2, CA-16): antes de buscar («Cada consulta queda en la auditoría del
   cliente con tu nombre y rol») y junto al resultado («Esta consulta queda en la auditoría de Laura. Verá la fecha, tu
   nombre y tu rol (Soporte).»). Recuadro informativo con ícono de historial, no alerta: es un hecho, no un error.
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

## Pendiente
- **Aviso del área de administración**: el texto común de `area.js` dice «(nombre, tipo, tamaño, fechas)» sin «estado»
  (P-5 lo incluye). Se deja igual en `desde-admin` para no mover las capturas aprobadas; si el equipo lo corrige,
  cambian las capturas de `backoffice/admin` (lista y ficha) y la de `desde-admin`.
- **Cargas en curso** como metadato de Soporte («¿por qué no veo mi archivo?»): necesitaría leer `carga` fuera del
  propietario; se decide en el plan o en 011b.
- **Estados de specs futuras**: indexación (019), optimización (021) y versiones (014) no se muestran; las versiones
  nunca (CA-15: sin filas de versiones). Carpeta o ruta del archivo: llega con 006 y no está en P-5.
- **Restaurar desde la papelera** (Soporte, con motivo, 011b) y **bitácoras y trabajos** (022b) no aparecen aquí.
- «Sin permiso» (Cliente u Operador abren el área, CA-14): pantalla común del marco, fuera de esta carpeta.
- El plan fija el tamaño de página (el mockup muestra 10) y si la búsqueda y el listado son una o dos llamadas.
