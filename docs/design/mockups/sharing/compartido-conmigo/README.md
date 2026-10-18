# Mockup: Compartido conmigo

- **Spec**: 012 (RF-12, RF-13, RF-16, RF-38; CA-8, CA-10 a CA-17, CA-21, CA-23, CA-27; RN-4, RN-7, RN-8, RN-13).
- **Propuesta presentada**: No presentada (diseño interno). Usa el marco y la lista de Mis archivos (005–007), el menú
  ⋮ por fila, el panel de cargas de 005 y el aviso de poda de 014.
- **Origen**: HTML autocontenido generado con `../../_generadores/compartido-conmigo/generar.js` (ver
  [`_generadores/README.md`](../../_generadores/README.md)); no se edita a mano. Corpus y página de 012 en
  `_generadores/comparticion/` (los mismos que `../compartir/`); barra lateral con Accesos rápidos de 006
  (`carpetas/carpetas.js`, `accesos/accesos.js`); tabla, menú ⋮, esqueleto y error de `mis-archivos/`; panel de cargas de
  `carga/panel.js`; «Cargar más» de `mis-archivos/cargar-mas.js` (el de 007); confirmación de `carpetas/carpetas.js`;
  aviso `warning` en diálogo de `mis-archivos/avisos.js`. La entrada «Compartido conmigo» la rotula el marco
  (`marco/marco.js`, una sola fuente para todas las pantallas).
  Tokens AA de `ui-guidelines.md` §2–§3, solo Inter, `tabular-nums`. Versión móvil real a 360 px. Es referencia;
  `apps/web` no lo importa.
- **Estados incluidos** (`compartido-conmigo--<estado>.html`; la cuenta es Lucía Barrios como destinataria):
  - lista: nombre con tipo, propietario, nivel y fecha en que se compartió, de lo más reciente a lo más antiguo, con
    «Cargar más» (CA-10)
  - cargando-mas: «Cargando más…» (`aria-disabled`, sigue enfocable) con anuncio; la lista visible se conserva (CA-10)
  - carpeta-abierta: «Entregables» dentro de «Proyecto Beta · Diseño»; migas «Compartido conmigo / Proyecto Beta ·
    Diseño / Entregables», sin carpetas superiores de la propietaria; nivel efectivo por fila (CA-11)
  - vacio: «Aún no te han compartido nada.» / «Cuando alguien comparta un archivo o una carpeta contigo, aparecerá aquí.»
  - cargando: esqueleto con «Cargando lo que compartieron contigo…»
  - error: «No pudimos cargar lo que compartieron contigo.» con «Reintentar»
  - ya-no-disponible: «Este elemento ya no está disponible. Puede que hayan dejado de compartirlo contigo.» con
    «Volver a Compartido conmigo»; el mismo para revocado, en la papelera, suspendido o inexistente (CA-8, CA-21, CA-23)
  - menu-fila-lector: «Descargar», «Fijar en la barra lateral» y «Salir de la compartición» (RN-4, CA-16, CA-17)
  - menu-fila-editor: además, «Subir nueva versión» (CA-13)
  - aviso-de-poda: confirmar la versión nueva con el archivo elegido, el espacio de la propietaria que usará y el aviso
    exacto «Se eliminará la versión más antigua para guardar esta.» (CA-13; 014 CA-15)
  - subiendo-version: panel de cargas con progreso y anuncio (CA-13)
  - version-subida: éxito en el panel; el archivo conserva su nombre (CA-13)
  - error-espacio-propietario: el mensaje de CA-14 en el panel, sin el espacio libre de la propietaria, y «La versión
    actual no cambió.»
  - error-tamano-propietario: «El archivo supera el máximo por archivo del plan de quien lo compartió.», sin la cifra
    (CA-14); el tamaño que se ve es el del archivo que eligió la Editora
  - error-tipo: «Este archivo no es un .docx válido. Comprueba que sea el archivo correcto.», el de 005 CA-11 tal cual,
    como 014 CA-3 (CA-14)
  - confirmar-salir: «¿Salir de la compartición?» con el texto de la spec (CA-16)
  - cajon-abierto: la entrada «Compartido conmigo» activa en el cajón (solo por debajo de 900 px)
- **Capturas**: `docs/design/capturas/sharing/compartido-conmigo/compartido-conmigo--<estado>--<360|1440>.png`
  (17 estados × 2 anchos).
- **Verificación** (axe-core 4.14 con `pw/axe-seguridad.js`): sin desbordamiento a 360 px y sin objetivos de menos de
  24 px (44 px en móvil). La única violación es la del marco (`label-content-name-mismatch` en el botón de la cuenta),
  común a todos los mockups generados y corregida en `marco/marco.js` por la rama de 017; con esa corrección los 17
  estados quedan sin violaciones a 360 y 1440 px (comprobado aplicando el parche de 017 en una copia, 2026-10-17).

## Decisiones de UX
- **Entrada**: «Compartido conmigo» en la navegación principal, debajo de «Mis archivos», con `aria-current="page"`;
  en móvil, en el cajón. Lo compartido vigente aparece además en Accesos rápidos con su ícono (CA-17): en el ejemplo,
  «Proyecto Beta · Diseño» fijada e «Informe_trimestral_Q3.docx» en recientes, mezclados con lo propio.
- **Página**: «Compartido conmigo» y «Lo que otras personas compartieron contigo. No ocupa tu espacio.» (CA-10, RN-7).
  Sin «Subir archivos» ni «Nueva carpeta» (CA-15). Paginación por cursor con «Cargar más» debajo de la lista, la
  pieza común de 007 (botón; al pulsarlo, «Cargando más…»; si falla, `Alert` con «Reintentar»; sin más páginas, el
  botón desaparece). Los estados de error y fin de la pieza no se dibujan aquí: son los de 007.
- **Lista**: columnas Nombre (ícono de tipo y extensión en el nombre), Propietario (avatar con iniciales y nombre),
  Nivel (texto con ícono, nunca solo color) y Compartido. A 360 px las columnas se ocultan y van en texto bajo el nombre
  («Rebeca Sicán · Editor · hoy · 09:40»). Las carpetas se abren con su nombre; no hay desglose en esta página.
- **Carpeta abierta**: título de la carpeta, «Compartida por {propietario} · Tu nivel: Editor» y la nota «Solo
  {propietario} puede subir archivos nuevos, crear carpetas, renombrar, mover o eliminar aquí.», que explica por qué no
  hay esos botones. Columnas Nivel (efectivo), Tamaño y Modificado. En móvil, «‹ {carpeta anterior}» vuelve atrás.
- **Menú ⋮ por nivel** (RN-4): solo lo que el nivel permite; nunca Compartir, Renombrar, Mover, Mover a la papelera ni
  historial. «Salir de la compartición» solo en lo compartido directamente (no en lo heredado dentro de una carpeta,
  CA-16), separado y en `destructive` con ícono: para quien sale es definitivo.
- **Subir nueva versión** (CA-13): «Subir nueva versión» abre el selector de archivos (solo la misma extensión) y luego
  un `AlertDialog`: «¿Subir una nueva versión de «{archivo}»?», «Pasará a ser la versión actual y el archivo conservará
  su nombre. Usará {tamaño} del espacio de {propietario}, a quien pertenece el archivo.», el archivo elegido y, si el plan
  de la propietaria está en su límite, el `Alert` `warning` de 014 con el texto exacto de CA-13: «Se eliminará la
  versión más antigua para guardar esta.». Como el Editor no ve el historial (CA-15) ni datos del plan de la propietaria
  (§5), el aviso no da número de versión, ni su nombre, ni cuántas versiones conserva su plan. Foco inicial en
  «Cancelar». Sin poda, el mismo diálogo sin el aviso. Después, el panel de cargas de 005 (progreso, éxito o error).
- **Rechazos de la versión** (CA-14): un mensaje por causa en el panel de cargas, con el texto de la spec y «La versión
  actual no cambió.». Ninguno revela el plan de la propietaria, su retención, su máximo por archivo ni su espacio libre
  (§5): sin espacio, nunca cuánto le falta; demasiado grande, sin la cifra del máximo; tipo inválido, el mensaje de 005
  CA-11 (un ejecutable usaría el de 005 CA-24, «No se permiten archivos ejecutables. Sube otro archivo.»). Sin acción
  hacia la propietaria: Nimbo no le avisa (RN-11).
- **Salir** (CA-16): `ConfirmDestructiveDialog` con el texto de la spec, foco en «Cancelar» y «Salir de la compartición».
- **Ya no disponible**: un solo mensaje para todos los `404` (revocado, papelera del propietario, suspensión,
  inexistente): no revela la causa (CA-8, CA-21, CA-23).
- La suspensión de la otra parte no se muestra (CA-23, RN-10). Roles internos: `403` en la ruta (CA-25), sin pantalla.

## Contraste de los pares nuevos (WCAG 2.1)
| Par | Contraste |
|---|---|
| `secondary-foreground` sobre `muted` (distintivo de nivel) | 7.45 |
| `foreground` sobre `card` (iniciales y nombre del propietario) | 13.58 |
| `destructive` sobre `card` / `muted` («Salir de la compartición», en reposo / con foco) | 5.39 / 4.97 |
| `secondary-foreground` sobre `background` (subtítulo y nota de la carpeta) | 7.73 |
| `secondary-foreground` sobre `muted` (archivo elegido en el diálogo) | 7.45 |
| `warning-foreground` sobre `warning` al 10 % (aviso de poda) | 4.86 |
| `brand` sobre `card` (anillo del avatar, no texto) | 3.19 |

## Pendiente
- Vista previa (017), edición `.docx` (016) y agente (020) suman sus acciones al menú cuando lleguen; aquí no se dibujan.

## Notas
- Solo lectura por plan vencido (RF-23, P-5): resuelto. La spec 010 (Borrador) dice que en solo lectura el Editor no
  sube versiones; decisión de Fátima: «Salir de la compartición» sí se permite, «Subir nueva versión» no. El estado de
  solo lectura se dibuja con la 010/plan de 012 (PD-108); aquí no se dibuja.
- La dueña de «Proyecto Beta · Diseño» es Rebeca Sicán (RS) y no Laura Barrios: sus iniciales (LB) eran las mismas que
  las de Lucía Barrios, la cuenta del marco.
