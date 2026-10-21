# Mockup: Resumen de espacio

- **Spec**: 007 (CA-1 a CA-8; P-1 y P-3 resueltas por Adrián, 2026-10-01).
- **Propuesta presentada**: no presentada (diseño interno). La versión anterior era un paquete HTML de la propuesta
  (lienzo de escritorio con consultas del ciclo, renovación, «Ampliar a 1 TB · Q210/mes», plan Equipo con «2 GB por
  archivo», un archivo de 42 GB, «Archivos más grandes» con entrada al optimizador y «Actividad reciente»). Queda en el
  historial de git; este mockup la reemplaza.
- **Origen**: HTML autocontenido, un archivo por estado, generado con
  `../../_generadores/resumen-espacio/generar.js`; no se edita a mano. Marco de `_generadores/marco/marco.js`, barra
  lateral de 006 (`carpetas/carpetas.js`) con la tarjeta de cuota de 007 (`espacio/espacio.js`), error y esqueleto de
  `mis-archivos/estados.js`. Tonos AA de `ui-guidelines.md` §2–§3, solo Inter, cifras con `tabular-nums`, versión móvil
  real a 360 px. Es referencia visual; `apps/web` no lo importa.
- **Estados incluidos**:
  - default: uso al 32 %, papelera vacía (`resumen-espacio.html`)
  - cargando: esqueleto de las tarjetas y «Calculando tu espacio…» (`resumen-espacio--cargando.html`)
  - error: «No pudimos calcular tu espacio.» con la causa y «Reintentar» (`resumen-espacio--error.html`, CA-8)
  - tramo-70: 82 %, aviso «Tu cuota está al 82 %.» con «Liberar espacio» (`resumen-espacio--tramo-70.html`, CA-5)
  - tramo-90: 94 %, aviso «Espacio casi agotado.» con «Liberar espacio» (`resumen-espacio--tramo-90.html`, CA-5)
  - cuota-llena: 100 %, aviso «Espacio agotado.»; no se puede subir más (`resumen-espacio--cuota-llena.html`)
  - con-papelera: la papelera ocupa 2.6 GB y cuenta en la cuota (`resumen-espacio--con-papelera.html`, CA-3)
- **Capturas**: `docs/design/capturas/storage/resumen-espacio/` (`resumen-espacio--<estado>--<360|1440>.png`).
  axe-core sin violaciones en los 7 estados a 360 y 1440 px; sin desbordamiento horizontal a 360 px; objetivos de al
  menos 24 px (44 px en los botones móviles).

## Datos de ejemplo
- Plan Personal, el que reciben todas las cuentas mientras no exista la suscripción (006a CA-5): 15 GB, 50 MB por
  archivo y 7 días en la papelera (`product-context.md` §3). En la app salen de la API (`PlanLimits`); el frontend no
  escribe ninguna cifra de plan. No se muestran precios, otros planes ni ofertas de ampliación.
- En cada estado, Documentos + Imágenes + Otros + Papelera = espacio usado (CA-2, CA-3). Los porcentajes se calculan
  sobre bytes exactos; al redondear pueden sumar 99 % o 101 % (pasa en `con-papelera`).

## Decisiones de UX
- **Estructura**: aviso de tramo (si aplica) → «Espacio usado» (`QuotaBar` grande) y «Tu plan» lado a lado → «En qué se
  va tu espacio» a todo el ancho. Por debajo de 1100 px las dos tarjetas se apilan; a 360 px todo va en una columna.
- **Medidor**: cifra grande «12.3 GB de 15 GB», porcentaje en texto, barra con `role="progressbar"` y `aria-valuetext`
  («12.3 GB de 15 GB (82 %)»), relleno del tramo y la fila Usado · Disponible · Cuota del plan. En 0–69 % dice «Tienes
  espacio de sobra.». En 70–100 % no repite el texto del tramo: lo dice una sola vez el aviso de arriba (revisión de UI
  de 007, 2026-10-02). Mismos tramos y textos que `QuotaBar` (RN-4).
- **Aviso de tramo** (`Alert`): 70–89 % en `warning` (`role="status"`), 90–100 % en `critical` (fondo `destructive-soft`
  al 10 %, título `destructive`, `role="alert"`). Título
  con el texto de `QuotaBar`, cuerpo con lo que queda y la aclaración de que la papelera ocupa espacio, y acciones:
  «Liberar espacio» (primaria) y «Ver papelera (X GB)» si la papelera no está vacía. El color nunca va solo: ícono,
  título y cifras en texto.
- **«Liberar espacio» en el resumen** lleva a Mis archivos ordenado por tamaño, mayor primero
  (`?orden=tamano&dir=desc`, CA-10). En la barra lateral y en el rechazo por cuota de 005 lleva a este resumen (CA-7).
- **Cuota llena**: el título es «Espacio agotado.» (decisión b de Adrián, spec 007 RN-4 y fila de `QuotaBar` en
  `ui-guidelines.md` §4), también en la tarjeta de la barra lateral; el cuerpo dice «Usas 15 GB de 15 GB. No podrás
  subir archivos hasta que liberes espacio.».
- **Tu plan**: nombre del plan, cuota, máximo por archivo (CA-6) y días de la papelera. Sin precio, sin «Ampliar» y sin
  «Ver planes»: queda oculto hasta 009 (spec 007 §6, PD-92).
- **Desglose** (CA-2, CA-3): barra apilada sobre la cuota total (lo que sobra es «Disponible») y una lista con nombre,
  formatos incluidos, tamaño y porcentaje del usado. La barra es `aria-hidden`: todas las cifras están en la lista.
  Segmentos con los tonos de texto de tipo de archivo (`--file-docx` Documentos, `--file-img` Imágenes, `--file-other`
  Otros; ≥ 5.5:1 sobre `card`) separados por 2 px de `card`; la papelera va **rayada** y separada por una línea
  discontinua, así que no depende del color. A 360 px el porcentaje pasa debajo del tamaño («55 % del usado»).
- **Papelera**: fila aparte que explica que cuenta en la cuota hasta vaciarla o hasta que pasen los días de retención,
  con «Ver papelera». Vacía: «Está vacía.».
- **Cargando**: esqueleto con la forma de las tres tarjetas y `role="status"` «Calculando tu espacio…». La tarjeta de la
  barra lateral también muestra «Calculando tu espacio…».
- **Error** (CA-8): `StateView type="error"` con «No pudimos calcular tu espacio.» / «Tus archivos siguen guardados.
  Inténtalo de nuevo en unos segundos.» y «Reintentar». La barra lateral y la navegación siguen usables; su tarjeta
  dice «No pudimos calcular tu espacio.» sin barra.
- **Entrada a la pantalla**: tarjeta de cuota de la barra lateral («Ver detalle» en 0–69 %, «Liberar espacio» en 70 %
  o más), «Liberar espacio» del rechazo por cuota de 005. En el propio resumen la tarjeta no lleva enlace. La ruta de la
  barra superior es «Cuenta / Espacio de almacenamiento». El ítem «Espacio» de la navegación (reemplaza a «Plan y
  facturación» hasta 009, decisión e) queda activo con `aria-current="page"`; en las pantallas de 007 del explorador
  aparece sin marcar.

## Contraste de los pares nuevos (WCAG 2.1)
| Par | Contraste |
|---|---|
| `warning-foreground` sobre `warning` al 12 % (título del aviso 70–89 %) | 4.79 |
| `destructive` sobre `destructive-soft` al 12 % (título del aviso 90–100 %) | 4.81 |
| `foreground` sobre los dos avisos (cuerpo) | 12.50 / 12.10 |
| Segmentos `--file-docx` / `--file-img` / `--file-other` sobre `card` (no texto) | 5.5 / 5.89 / 5.67 |
| Rayado `secondary-foreground` sobre `card` (papelera, no texto) | 8.09 |
| Relleno `warning` / `destructive-soft` sobre la pista `muted` (barra del tramo) | 1.94 / 2.85 |

El relleno de la barra en los tramos queda por debajo de 3:1 contra la pista, igual que en `QuotaBar` de 005 y del
layout: no es el único portador de la información (porcentaje, cifras y texto del tramo están en texto), pero conviene
que Adrián lo confirme o que `QuotaBar` sume un borde `input` a la pista.

## Decisiones (Adrián, 2026-10-01)
Aprobadas (recogidas en el plan 007, D-19):
- **(a)** `QuotaBar` suma un borde del token `input` al fondo de la barra (contraste ≥ 3:1).
- **(b)** Al 100 % el título es «Espacio agotado.» (reemplaza la propuesta 2).
- **(c)** Fila «Cargas en curso» solo si las reservas son > 0 (propuesta 4).
- **(d)** «Ver detalle» hacia `/espacio` en la tarjeta lateral por debajo del 70 % (propuesta 3).
- **(e)** Ítem de navegación «Espacio» hasta que 008 entregue los planes.
- **(f)** Paginación con «Cargar más».
- **(g)** Lista de cuentas de la conciliación por `SELECT` simple (DF-62).

Sigue abierta (no bloquea): destino de «Liberar espacio» dentro del resumen (propuesta 1: Mis archivos ordenado por
tamaño). Solo ordena dentro de una carpeta; una lista global de «archivos más grandes» necesitaría un endpoint nuevo o la
búsqueda de 018 (fuera de 007). Mientras no se apruebe, lleva a `/archivos` sin orden.
