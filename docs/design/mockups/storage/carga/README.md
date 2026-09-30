# Mockup: Carga de archivos (panel de carga)

- **Spec**: 005 (§9; CA-3, CA-4, CA-6, CA-7, CA-8, CA-9, CA-11, CA-19, CA-21, CA-22, CA-24; RN-4, RN-5, RN-7)
- **Propuesta presentada**: p. 10 (`progreso`). Los demás estados no se presentaron.
- **Origen**: dos tecnologías en la misma carpeta.
  - `carga--progreso.html`: HTML empaquetado de la propuesta (Cielo Sereno original, lienzo de escritorio de ≈ 1490 px
    con el rótulo de la hoja). No se cambia (decisión del usuario, 2026-09-28).
  - Los demás estados: HTML autocontenido escrito a mano, uno por estado, generado con
    `../../_generadores/carga/generar.js` (ver [`_generadores/README.md`](../../_generadores/README.md)); no se edita a
    mano. El marco (barra lateral, barra superior y CSS base) sale de `_generadores/marco/marco.js`, el mismo de
    `identity/seguridad/` (aprobado) y `shared/layout/`. El panel reproduce el de la propuesta p. 10 (tarjeta flotante
    abajo a la derecha, encabezado con título y resumen, filas con ícono, nombre, datos, acciones y barra) con los tonos
    AA de `ui-guidelines.md` §2–§3. Solo Inter 400/500/600/700; las cifras usan `tabular-nums`. Tienen versión móvil
    real a 360 px.
  - Son referencia visual; `apps/web` no los importa.
- **Estados incluidos**:
  - progreso: 3 archivos (subiendo, en cola, subido) (`carga--progreso.html`, propuesta p. 10)
  - pausa: una carga en curso con «Pausar» y «Cancelar»; una carga por partes y una simple en pausa con «Reanudar» y
    «Cancelar» (la simple avisa «Se reiniciará al reanudar.»); una cancelada y una subida (`carga--pausa.html`, CA-8,
    CA-22)
  - sin-conexion: se cortó la red; aviso en el panel y la carga espera para reanudarse donde quedó
    (`carga--sin-conexion.html`, CA-8)
  - rechazo-tamano: el archivo supera el máximo por archivo del plan; se rechaza antes de subir
    (`carga--rechazo-tamano.html`, CA-3)
  - rechazo-cuota: no queda espacio en la cuota; se rechaza antes de subir y la cuota lateral está en su tramo final
    (`carga--rechazo-cuota.html`, CA-4)
  - tipo-invalido: tres rechazos con su motivo: el contenido no es el de la extensión, un ejecutable y un archivo de 0
    bytes (`carga--tipo-invalido.html`, CA-11, CA-24, CA-7)
  - nombre-repetido: un solo archivo repetido; diálogo «¿Conservar ambos archivos?» con «Conservar ambos» y «Cancelar»,
    sin «Reemplazar» ni casilla (`carga--nombre-repetido.html`, CA-6)
  - nombre-repetido-varios: varios repetidos en la misma selección; un diálogo por archivo con la casilla «Aplicar a los
    demás». El primero ya se resolvió y el panel lo muestra con su nombre final
    (`carga--nombre-repetido-varios.html`, CA-6)
  - confirmar-cancelar: «Cancelar» sobre una carga que ya pasó del 0 % pide confirmación
    (`carga--confirmar-cancelar.html`, CA-22)
- **Capturas**: `docs/design/capturas/storage/carga/` (`carga--<estado>--<360|1440>.png`). axe-core sin violaciones en
  los 8 estados escritos a mano, a 360 y 1440 px; sin desbordamiento horizontal a 360 px, sin errores de consola y con
  objetivos de al menos 24 px (36 px en escritorio y 44 px en móvil; la casilla, 24 px más su etiqueta). La captura de
  360 px de `progreso` muestra el lienzo de escritorio (el paquete no tiene versión móvil).

## Datos de ejemplo
Plan Equipo del catálogo de `product-context.md` §3: 350 GB de almacenamiento y 1 GB como máximo por archivo. Cuota
lateral al 87 % (304 GB de 350 GB) salvo en `rechazo-cuota` (349.4 GB, 99.8 %). En la app los límites vienen de
`PlanLimits` por la API; los del mockup son de ejemplo.
- El dato pendiente de la propuesta (`Grabacion_sesion_14.mp4` de 1.2 GB subiendo con el plan Equipo) se usa a
  propósito en `rechazo-tamano`: ese archivo se rechaza antes de subir. Las cargas en curso usan
  `Grabacion_sesion_13.mp4` (862 MB), que sí cabe. `carga--progreso.html` conserva el dato original.
- `rechazo-cuota`: `Respaldo_fotos_campo.zip` pesa 920 MB y quedan 600 MB libres: «Te faltan 320 MB…».
- Carga simple de ejemplo: `Informe_avance_sep.docx` (2.6 MB). El umbral entre simple y por partes es configuración
  (RN-2); la interfaz no lo muestra.

## Decisiones de UX
- **Destino**: la pantalla es «Mis archivos» (raíz, RN-4). No hay carpetas ni migas de carpeta: el mockup de la
  propuesta muestra «Proyecto Alpha / Fase 3 · RAG», que llega con 006.
- **Barra lateral y lista de 005** (decisión de Adrián, 2026-09-28): sin la sección «Carpetas» ni el contador de la
  Papelera hasta la 006, y cada fila de la lista con el menú ⋮ «Acciones de {nombre}» («Descargar»), igual que en
  `storage/explorador`. La página «Mis archivos» (barra lateral, encabezado y tabla) sale de
  `_generadores/mis-archivos/mis-archivos.js`, común a los dos mockups.
- **Panel** (`UploadProgress`): tarjeta flotante de 440 px, abajo a la derecha, sobre el explorador. En móvil es una hoja
  al pie a todo el ancho. Encabezado con un `h2` («Subiendo 2 archivos», «1 archivo rechazado», «Carga en espera») y un
  resumen («2 en pausa · 54 %», «1 de 2 subido»); botón para contraer (`aria-expanded`) y, cuando no queda ninguna
  carga activa, «Cerrar el panel de cargas».
- **Cada fila**: ícono del tipo (tokens `--file-*`), nombre con extensión, datos con `tabular-nums` y el estado en texto
  («en pausa», «sin conexión», «rechazado», «cancelada», «subido», «nombre repetido»). El color nunca es el único
  indicador: la barra en pausa cambia a `warning`, pero el texto lo dice; el archivo subido lleva un ícono con nombre
  accesible «Subido».
- **Progreso** medido en el navegador (RN-3): «354 MB de 862 MB · 8.4 MB/s · quedan 60 s» y barra
  `role="progressbar"` con `aria-valuetext` («41 %, 354 MB de 862 MB»). La barra usa `primary` (4.58 sobre `muted`).
- **Anuncios**: una región `aria-live="polite"` por panel anuncia los cambios (pausa, corte, rechazo), no cada
  porcentaje. Los mensajes de rechazo no usan `role="alert"` para no anunciarse dos veces.
- **Pausar, reanudar y cancelar** (RN-7, CA-22): por archivo, en **todas** las cargas, también las simples. «Pausar» y
  «Cancelar» son botones de ícono con nombre accesible completo («Pausar la carga de Grabacion_sesion_13.mp4»);
  «Reanudar» es el único botón `primary` de la fila. Una carga por partes sigue donde quedó; una simple empieza de cero
  y su fila en pausa lo dice con «Se reiniciará al reanudar.» (también en el `aria-valuetext` de la barra y en el
  anuncio). La fila cancelada se queda en el panel con «Cancelaste esta carga. Liberamos el espacio que tenía
  reservado.».
- **Confirmar la cancelación**: con la carga en 0 % (en cola o sin bytes subidos), «Cancelar» cancela directo. Si ya
  pasó del 0 %, abre un diálogo con la misma estructura que el de nombre repetido (título, mensaje, nota sobre `muted` y
  dos botones). Como se pierde lo subido, el botón de confirmar es `destructive` y el foco inicial va a «Seguir
  subiendo», como en Seguridad. Mientras el diálogo está abierto la carga **se pausa** (la fila se ve «en pausa», sin
  velocidad ni tiempo restante); con «Seguir subiendo» se reanuda y con «Cancelar carga» se cancela. A 360 px los
  botones se apilan con el destructivo arriba.
- **Sin conexión** (CA-8): aviso `warning` arriba de la lista: «Se cortó la conexión. Tu carga se reanudará donde quedó.
  No cierres ni recargues esta pestaña.» La carga se reanuda sola al volver la red; «Reanudar» permite intentarlo ya.
  La última frase explica RN-7: tras cerrar o recargar, la carga no se recupera.
- **Rechazos antes de subir** (CA-3, CA-4, CA-7): la fila queda «rechazado», sin barra, con el mensaje de la spec en un
  aviso `destructive` (qué pasó en negrita + qué hacer). En cuota, el botón «Liberar espacio»; en tamaño, sin botón.
  «Ver planes» **se oculta hasta 008** en los dos (CA-4; decisión de Adrián, 2026-09-28). Los demás archivos de la
  misma selección siguen su curso.
- **Destinos de los botones**: «Liberar espacio» lleva al Resumen de espacio (spec 007); mientras 007 no exista, lleva
  a Mis archivos. Cuando exista 008, «Ver planes» volverá a los dos rechazos y llevará a Plan y facturación.
- **Rechazos por contenido** (CA-11, CA-24): se detectan al completar, después de subir los bytes. La fila queda
  «rechazado» con su motivo; no aparece en el explorador ni suma espacio.
- **Nombre repetido** (CA-6, RN-5): `alertdialog` con título «¿Conservar ambos archivos?», el mensaje de la spec y la
  nota «Si conservas ambos, el nuevo se guardará como «…».». Botones «Cancelar» (`outline`) y «Conservar ambos»
  (`primary`, foco inicial). Escape equivale a «Cancelar». A 360 px los botones se apilan con «Conservar ambos» arriba.
  Mientras tanto, la fila dice «nombre repetido».
  - Con varios repetidos en la misma selección se abre un diálogo por archivo. La casilla «Aplicar a los demás» solo
    aparece si quedan más repetidos; aplica la respuesta elegida a los que faltan y no vuelve a preguntar.
  - El formato del sufijo «(n)» lo decide el `/plan`: el diálogo muestra el nombre que devuelva la API («se guardará
    como…») y, al completar, el panel y el explorador muestran el nombre final (`Propuesta_Nimbo_v3 (1).docx` en
    `nombre-repetido-varios`).
- **Cuota lateral** (`QuotaBar` §4): tramo `warning` al 87 % con «Tu cuota está al 87 %» y tramo `destructive-soft` al
  99.8 % con «Espacio casi agotado».
- Solo lectura: fuera de alcance de 005 (CA-18 retirado, pasa a 010); no se dibuja.

## Contraste de los pares nuevos (WCAG 2.1)
| Par | Contraste |
|---|---|
| `destructive` sobre `destructive-soft` al 12 % (título del rechazo, ícono) | 4.81 |
| `foreground` sobre `destructive-soft` al 12 % (texto del rechazo) | 12.10 |
| `warning-foreground` sobre `warning` al 12 % (aviso sin conexión) | 4.79 |
| `warning-foreground` / `destructive` / `success-foreground` sobre `card` (estado en la fila, nota de cuota) | 5.20 / 5.39 / 5.25 |
| `success-foreground` sobre `success` al 12 % (distintivo NUEVO, ícono «Subido») | 4.80 |
| `muted-foreground` sobre `card` (datos de la fila) | 4.76 |
| `secondary-foreground` sobre `muted` (nota de los diálogos) | 7.45 |
| Blanco sobre `destructive` («Cancelar carga») | 5.54 |
| Barra `primary` sobre `muted` (no texto) | 4.58 |
| Borde `input` de los botones de ícono sobre `card` (no texto) | 3.07 |
| `--file-*` sobre su fondo al 12 % (íconos de tipo) | 4.77 – 5.12 |

La barra en pausa (`warning` sobre `muted`, 1.94) y la de la cuota llena (`destructive-soft`, 2.85) son decorativas: el
estado y el porcentaje van en texto. El botón «Liberar espacio» del aviso de rechazo es `primary` (5.11 con
blanco); «Ver planes», con borde `input` (2.74 sobre el aviso), se oculta hasta 008.

## Decisiones aprobadas (2026-09-28, usuario)
1. Mientras haya cargas activas el panel solo se contrae; «Cerrar el panel de cargas» aparece cuando no queda ninguna.
2. Las filas terminadas (subido, rechazado, cancelada) se quedan en el panel hasta cerrarlo.
3. Textos: «Carga en espera», «No cierres ni recargues esta pestaña.», «Cancelaste esta carga. Liberamos el espacio que
   tenía reservado.», «¿Conservar ambos archivos?», «Si conservas ambos, el nuevo se guardará como «…».» y los estados de
   cada fila («en pausa», «sin conexión», «rechazado», «cancelada», «subido», «nombre repetido»).
4. Foco inicial del diálogo de nombre repetido en «Conservar ambos».
5. Pausa en todas las cargas; la simple se reinicia al reanudar («Se reiniciará al reanudar.»).
6. Cancelar pide confirmación solo por encima del 0 %; en 0 % cancela directo.
7. Varios nombres repetidos: un diálogo por archivo con «Aplicar a los demás», visible solo si quedan más.
8. «Liberar espacio» lleva al Resumen de espacio (007); mientras 007 no exista, a Mis archivos.
9. Mensajes: «No se permiten archivos ejecutables. Sube otro archivo.» y «El archivo está vacío. Revisa que tenga
   contenido y súbelo de nuevo.».
10. `carga--progreso.html` no se reemplaza.
11. «Aplicar a los demás» aplica cualquier respuesta, también «Cancelar».
12. Mientras el diálogo de cancelar está abierto, la carga se pausa; «Seguir subiendo» la reanuda.
13. Diálogo de cancelar (`confirmar-cancelar`): título «¿Cancelar esta carga?»; mensaje «Ya subiste {subido} de {total}
    de «{nombre}». La pausamos mientras decides.»; nota «Si la cancelas, se perderá lo que ya subiste y liberaremos el
    espacio reservado. Para subir el archivo tendrás que empezar de cero.»; botones «Seguir subiendo» y «Cancelar
    carga». (La frase «La pausamos mientras decides.» se agregó por la decisión 12.)
14. Ayuda de la casilla: «Usaremos la misma respuesta para el otro archivo con nombre repetido.» (con más de uno:
    «…para los otros {n} archivos con nombre repetido.»).
15. Estados de fila que no se dibujan (reutilizan el aviso de rechazo de la fila):
    - carga caducada (CA-9, `STORAGE_UPLOAD_EXPIRED`): estado «caducada»; aviso «**Esta carga caducó.** Vuelve a subir
      el archivo.» con el botón «Subir de nuevo», que abre el selector de archivos;
    - límite de tasa (CA-19, `STORAGE_TOO_MANY_REQUESTS`): estado «en espera»; aviso «**Hiciste demasiadas
      solicitudes.** Espera un momento e inténtalo de nuevo.», sin cuenta regresiva, con el botón «Reintentar» siempre
      habilitado (si se reintenta antes de tiempo, vuelve el mismo aviso).

## Diferencias anotadas con `carga--progreso.html` (propuesta p. 10)
El paquete no se reemplaza. Los estados nuevos y la implementación siguen este README, no el paquete, en:
1. **Dato de ejemplo**: `Grabacion_sesion_14.mp4` de 1.2 GB subiendo con el plan Equipo (máximo 1 GB).
2. **Botón principal** `#6B8DD6` con texto blanco (3.28, DF-41); la implementación usa `primary` `#4A6FA5`.
3. **Destino**: carpeta «Proyecto Alpha / Fase 3 · RAG»; en 005 solo se sube a la raíz.
4. **Marco**: buscador, «Agente Nimbo» y árbol de carpetas; los estados nuevos usan el marco de `shared/layout`.
5. **Tabla**: columna «Autor»; en 005 hay un solo propietario.
6. **Colores** fuera de tokens (`#546983`, `#9E4F4F`, `#FBF1F1`, `#E8EEFA`, `#3D5F8F`) y barra `#6B8DD6`.
7. **Controles**: pausa de 28 px y sin «Cancelar».
8. **Estado oculto «Cuota llena»** del paquete: deja un archivo «en cola, esperando espacio»; en 005 la carga se
   rechaza antes de subir.
9. **Sin versión móvil**: la captura de 360 px muestra el lienzo de escritorio.

## Pendiente
- Arrastrar y soltar y el botón «Subir archivos» del explorador vacío: estados `arrastre` y `vacio` de
  `mockups/storage/explorador/`.
- La implementación usa `components/nimbo` (`UploadProgress`, `QuotaBar`, `FileTypeChip`) y `components/ui` (`Button`,
  `Dialog`, `Checkbox`); no se crea otro panel.
