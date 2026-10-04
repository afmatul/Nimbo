# Mockup: Layout de la app (marco compartido)

- **Spec**: 000b (layout base, CA-5), pendiente PD-28. Accesos rápidos: spec 006 (CA-27, CA-28), **aprobados el 2026-10-03**. Toma requisitos de RF-12 (cuota en la barra lateral), RF-23
  (solo lectura) y 002 (menú de la cuenta, CA-14, D-8, D-16).
- **Propuesta presentada**: no tiene pantalla propia. El marco (barra lateral con distintivo de plan, navegación,
  carpetas y cuota; barra superior con ruta y avatar) es el de las p. 08 (explorador) y p. 17 (Plan y facturación) del
  PDF «Mockups nimbo final». Los cambios respecto de ese marco están en «Cambios respecto de la propuesta».
- **Origen**: HTML autocontenido, un archivo por estado, generado con el mismo marco que `identity/seguridad/` (`../../_generadores/layout/generar.js`; ver [`_generadores/README.md`](../../_generadores/README.md)). La
  barra lateral, la barra superior, el diálogo de confirmación y su CSS salen de un solo módulo, así que las dos carpetas
  no pueden divergir. El HTML de Seguridad solo cambió en la etiqueta «Fijados» de la navegación (2026-10-03). Usa Cielo Sereno con los tonos AA de
  `ui-guidelines.md` §2–§3 y solo Inter 400/500/600/700; las cifras (cuota, contadores) llevan
  `font-variant-numeric: tabular-nums`. Incluye un script en línea que demuestra el teclado del menú, el diálogo y el
  cajón. Es referencia visual; `apps/web` no lo importa.
- **Estados incluidos**:
  - default: «Mis archivos» activo, plan Personal al 21 % (`layout.html`)
  - menu-cuenta-abierto: menú de la cuenta abierto con el foco en «Seguridad» (`layout--menu-cuenta-abierto.html`)
  - confirmar-cerrar-sesion: «Cerrar sesión» desde el menú pide confirmación (`layout--confirmar-cerrar-sesion.html`)
  - solo-lectura: plan Pro vencido; aviso persistente con «Renovar plan» (`layout--solo-lectura.html`, RF-23)
  - cuota-70 (spec 007): tarjeta de cuota al 82 % con «Tu cuota está al 82 %.» (ícono de triángulo) y «Liberar espacio»
    (`layout--cuota-70.html`). A 360 px se ve en el cajón abierto, porque la barra lateral solo existe ahí.
  - cuota-90 (spec 007): tarjeta al 94 % con «Espacio casi agotado.» (ícono de círculo) y «Liberar espacio»
    (`layout--cuota-90.html`). A 360 px, en el cajón. Al 100 % la tarjeta dice «Espacio agotado.» (se ve en
    `storage/resumen-espacio/resumen-espacio--cuota-llena.html`).
  - movil-cajon-abierto: por debajo de 900 px, la barra lateral se abre como cajón (`layout--movil-cajon-abierto.html`).
    Solo existe en móvil y tableta; a 1440 px el archivo muestra el marco de escritorio y no tiene captura.
  - **Accesos rápidos (spec 006, CA-27 y CA-28, Aprobado 2026-10-03)**: nueve estados nuevos, descritos en «Accesos
    rápidos de la barra lateral (006)»: fijados-y-recientes, solo-recientes, solo-fijados, con-ver-mas, sin-accesos,
    tope-de-fijados, fijado-menu-abierto (solo captura a 1440), movil-cajon-con-accesos y
    movil-cajon-fijado-menu-abierto (`layout--<estado>.html`; los dos del cajón solo tienen captura a 360 px).
  - aviso-arriba-centro (spec 007, CA-18): aviso de éxito «Movimos «Informe.docx» a la papelera.» con «Ver papelera» y
    la X, arriba y al centro, debajo de la barra superior, con el panel de cargas abierto abajo a la derecha (a 360 px,
    hoja al pie) y tres cargas terminadas (`layout--aviso-arriba-centro.html`).
  - barra-fija-lista-larga (spec 007, CA-19): Mis archivos con 20 elementos desplazada hasta «Cargar más»; la barra
    lateral queda fija, con la tarjeta de cuota al pie y las 12 carpetas desplazándose en su región central
    (`layout--barra-fija-lista-larga.html`). A 360 px se ve el cajón abierto con los mismos tres bloques.
  - Los dos estados de 007 usan la barra en tres bloques de `_generadores/layout/barra.js` (ver «Barra lateral en tres
    bloques»), el ítem «Espacio» de 007 D-18 y una «ventana» de alto fijo (820 px; 720 px por debajo de 900 px) en la
    que se desplaza solo la columna principal: la hoja no puede desplazar el navegador. Los 7 estados anteriores no
    cambiaron ni un byte.
- **Capturas**: `docs/design/capturas/shared/layout/` (`layout--<estado>--<360|1440>.png`; el cajón, solo a 360).
  axe-core sin violaciones en los 9 estados a 360 y 1440 px y en los recorridos de teclado (menú abierto, diálogo
  abierto, cajón abierto). Sin desbordamiento horizontal a 360 px, sin errores de consola, objetivos de al menos 24 px
  y de 44 px en la barra superior y el cajón móviles (CA-5 de 000b).

## Decisiones de UX
- **Barra lateral** (escritorio, 236 px): logo «N · NIMBO» con el distintivo del plan, navegación principal (Mis
  archivos, Compartidos conmigo, Recientes, Fijados, Papelera con su contador), separador, Optimizador y Plan y
  facturación, «Carpetas» con las carpetas de primer nivel y su número de elementos, y la tarjeta de cuota abajo.
- **Ítem activo**: fondo `accent`, texto `foreground` en 600, barra izquierda de 3 px `primary` y
  `aria-current="page"`. La página actual no depende solo del color. Su contador pasa a `secondary-foreground`, y
  también al pasar el puntero, porque `muted-foreground` sobre `muted` da 4.39.
- **Cuota**: es `QuotaBar` (§4): porcentaje y «X GB de Y GB» en texto, `role="progressbar"` con `aria-valuetext`.
  Aquí se dibuja el tramo verde (21 %). Los tramos de 70 % y 90 % y sus textos son los de §4; se dibujan en 007.
- **Barra superior**: la ruta a la izquierda (`nav` «Ruta», la última miga con `aria-current="page"`) y la cuenta a la
  derecha (nombre + avatar con iniciales y anillo `brand`). En móvil: botón de menú, logo y avatar; la ruta se oculta y
  el título de la página la sustituye.
- **Menú de la cuenta** (patrón «menu button» de WAI-ARIA, `DropdownMenu` de shadcn):
  - botón con `aria-haspopup="menu"`, `aria-expanded` y `aria-controls`; nombre accesible «Menú de la cuenta de
    {nombre}»;
  - arriba, fuera del `role="menu"`, el nombre y el correo de la cuenta; después `role="menu"` con tres `menuitem`:
    «Seguridad», «Plan y facturación», separador y «Cerrar sesión»;
  - teclado: Enter, Espacio o ↓ abren con el foco en el primer ítem y ↑ en el último; ↑/↓ recorren en ciclo;
    Inicio/Fin van al primero y al último; Escape cierra y devuelve el foco al avatar; Tab cierra y sigue el orden
    normal; un clic fuera cierra;
  - «Cerrar sesión» no es rojo: no destruye datos. Lo destructivo es el botón de confirmar del diálogo.
- **Cerrar sesión desde el menú**: abre el mismo `alertdialog` que `seguridad--confirmar-cierre-actual`, con los
  mismos textos: «¿Cerrar la sesión en este dispositivo?», «Tendrás que iniciar sesión de nuevo para volver a
  entrar.», «Cancelar» y «Cerrar sesión». El foco inicial va a «Cancelar», el fondo queda `inert`, Tab no sale del
  diálogo y Escape cancela y devuelve el foco al avatar. Al confirmar se revoca la sesión y se va al inicio de sesión
  (CA-14). A 360 px los botones se apilan con el destructivo arriba, como en Seguridad.
- **Solo lectura (RF-23)**: aviso persistente (`ReadOnlyBanner`) arriba del contenido, dentro de `main`, como región
  con nombre. Tiene ícono de candado, título en `warning-foreground`, la consecuencia y el botón «Renovar plan»
  (`primary`), que lleva a Plan y facturación. No se puede cerrar mientras dure el estado. Lo pinta el layout, así que
  aparece en todas las vistas. Deshabilitar o esconder las acciones de escritura (subir, editar, restaurar, optimizar)
  le toca a cada pantalla; el servidor las rechaza de todos modos (guard global, `architecture.md` §7.5). El plan y la
  fecha vienen de la API.
- **Cajón móvil** (por debajo de 900 px): `role="dialog"` modal titulado «Menú de navegación». Tiene el mismo
  contenido que la barra lateral (logo, plan, navegación, carpetas y cuota), mide `min(320px, 100% − 40px)` y sus
  ítems tienen 44 px de alto. Al abrir, el foco va al primer enlace; Escape, la X, el velo o un enlace lo cierran y el
  foco vuelve al botón de menú. El resto queda `inert`.
- **Barra lateral en tres bloques** (007 CA-19; `_generadores/layout/barra.js`): (1) arriba, logo, plan y navegación
  con su alto natural; (2) región central, que toma el alto restante y tiene **desplazamiento propio**
  (`overflow-y: auto`, `overscroll-behavior: contain`) para lo que no cabe; (3) pie con la tarjeta de cuota, siempre
  visible. Cuando la región central tiene más contenido debajo, su borde inferior se difumina hacia `card` (decorativo;
  el desplazamiento también se ve en la barra de desplazamiento del sistema). Los enlaces de la región son enfocables,
  así que el teclado la recorre con Tab sin `tabindex` extra. Hoy la región central es «Carpetas» (`nav` «Carpetas»);
  la spec 006 (CA-27, CA-28) la reemplaza por «Accesos rápidos» sin tocar los bloques 1 y 3.
- **Barra fija con lista larga** (007 CA-19): al desplazar la página solo se mueve el contenido principal. En
  escritorio la barra lateral es `sticky` arriba con el alto de la ventana (con el `AppLayout` actual, que tiene una
  cabecera a todo lo ancho de 64 px, la barra queda `sticky` bajo ella con el alto de la ventana menos la cabecera); la
  barra superior también queda fija. En el mockup, el lienzo hace de ventana: la columna principal se desplaza dentro
  y la barra no. **A 360 px** no hay barra lateral: el contenido usa el desplazamiento normal de la página con la barra
  superior fija, y el cajón usa los mismos tres bloques: la cuota queda al pie del cajón y la región central se
  desplaza (el cajón ya no se desplaza entero, como en `movil-cajon-abierto`).
- **Aviso arriba y al centro** (007 CA-18, cambia ADR-0024 de abajo a la derecha a arriba al centro): `Toaster`
  con `position="top-center"`, centrado en la ventana, 16 px por debajo de la barra superior de 64 px (80 px desde
  arriba; a 360 px, 8 px: 72 px) para no taparla. Mide hasta 440 px y a 360 px ocupa el ancho disponible (8 px por
  lado), con «Ver papelera» debajo del texto y la X de 44 px arriba a la derecha. Tokens del `Toaster` real: fondo
  `card`, texto `foreground`, borde `border`, `radius-md`, `shadow-modal` e ícono de éxito `success-foreground`.
  El panel de cargas sigue abajo a la derecha (a 360 px, hoja al pie), así que el aviso nunca tapa sus cargas
  terminadas; puede tapar por unos segundos el encabezado de la página, que no tiene nada que no se pueda leer
  después. `role="status"`, se retira solo a los 8 s o con la X y se pausa con el puntero o el foco (ADR-0024).
  Para la implementación: el desplazamiento por defecto de Sonner (24 px; 16 px en móvil) cae **sobre** la barra
  superior, así que hay que pasarle `offset`/`mobileOffset` arriba; y su X por defecto mide 20 × 20 px en la esquina
  (pasa por la excepción de espaciado de WCAG 2.5.8, pero el mockup usa 36 px en escritorio y 44 px en móvil).
- **Contenido central**: un marcador neutro con el `h1` de la página. Cada pantalla dibuja su contenido en su mockup.
- Los roles internos (Administrador, Soporte, Operador) no usan este marco: tienen el suyo en 011 y 022, sin
  navegación de archivos.

## Accesos rápidos de la barra lateral (006)
**Spec 006** (CA-27, CA-28, RF-38). **Estado: Aprobado (2026-10-03, Adrián)**, con los ajustes que se describen abajo ya
aplicados. La sección «Accesos rápidos» reemplaza a «Carpetas» en la barra lateral y en el cajón móvil. Los cinco estados
anteriores conservan «Carpetas» (con 3 carpetas de ejemplo); solo cambia en ellos la etiqueta «Fijados» (antes
«Favoritos») de la navegación; los nueve nuevos llevan la sección. Se generan con `_generadores/accesos/accesos.js`, que
entra al marco por la opción `accesos` de `marco/marco.js`.
Capturas: `docs/design/capturas/shared/layout/layout--<estado>--<360|1440>.png`.

| Estado | Qué muestra |
|---|---|
| fijados-y-recientes | Caso lleno: 5 fijados y 3 recientes, carpetas y archivos mezclados, sin «Ver más» |
| solo-recientes | Sin fijados: solo el grupo «Recientes» (3) |
| solo-fijados | Sin recientes: solo el grupo «Fijados» (3) |
| con-ver-mas | 5 + 3 y «Ver más» al final; hay más recientes que los visibles. El tercer reciente tiene un nombre largo para ver el corte con «…» |
| sin-accesos | Sin fijados ni recientes: la sección y sus títulos no se dibujan (la barra queda como la de 005) |
| tope-de-fijados | Cinco fijados; el cliente intenta fijar un sexto: aviso arriba del contenido «Ya fijaste 5 elementos. Quita uno para fijar otro.» y la barra no cambia |
| **fijado-menu-abierto** | Escritorio: menú ⋮ del fijado «Finanzas» abierto, con «Quitar de la barra lateral» y el foco en ese ítem (solo captura a 1440 px: a 360 px la barra pasa al cajón) |
| movil-cajon-con-accesos | Cajón a 360 px con la sección completa (5 + 3, «Ver más») y la cuota al final |
| **movil-cajon-fijado-menu-abierto** | Cajón a 360 px con el menú ⋮ de «Matriz_Requisitos_RF.xlsx» abierto (solo captura a 360 px) |

### Ajustes aprobados por Adrián (2026-10-03)
1. **P-15: 5 fijados y 3 recientes visibles.** La barra dibuja los 3 recientes más nuevos y, si hay más, «Ver más». «Ver
   más» lleva a Mis archivos (raíz); nada se desglosa en la barra.
2. **«Favoritos» pasa a «Fijados»** en la navegación principal, con el ícono de la chincheta (el mismo del grupo «Fijados»
   y de «Fijar en la barra lateral»). «Recientes» se queda. Cambia en todos los mockups generados con el marco
   (Seguridad, layout, carga, explorador y papelera); lo demás del marco no cambió. Los HTML que no se generan (las
   hojas de la propuesta y de Claude Design: `cuadricula`, `lista`, `planes`, `suscripcion`, `compartir`, etc.) siguen
   diciendo «Favoritos»: son la propuesta firmada y no se editan.
3. **Menú ⋮ en cada fijado** (barra y cajón) con «Quitar de la barra lateral».
4. **Aviso del tope**: `Alert` variante `warning` (definida en `ui-guidelines.md` §4).

### Decisiones de UX (propias de este mockup)
- **Estructura**: título «ACCESOS RÁPIDOS» (el mismo estilo que tenía «Carpetas») y, dentro, dos grupos con su título en
  12 px y 600, sin mayúsculas: «Fijados» (ícono de chincheta) y «Recientes» (ícono de reloj). Cada grupo es una lista
  (`ul`) nombrada con la sección y el grupo («Accesos rápidos Fijados») mediante `aria-labelledby`. Los títulos son
  `p`, como el de «Carpetas», no encabezados: dentro de la barra no compiten con el `h1`.
- **Ítems**: enlaces de 32 px de alto en escritorio y 44 px en el cajón (CA-5 de 000b), 13 px, con el ícono de la
  carpeta en `primary` y el del archivo por tipo (texto, hoja de cálculo, presentación) en `secondary-foreground`.
  Carpetas y archivos se distinguen por la forma del ícono y por el nombre, no solo por el color. **No hay flecha de
  desglose**: no se despliegan (CA-27).
- **Nombre**: una línea; si no cabe se corta en medio con «…» y **la extensión queda siempre visible**
  (`Propuesta_Nimbo….docx`), con el nombre completo en `title`. Cada enlace lleva texto para lectores de pantalla:
  «, carpeta» o «, archivo, se descarga» (el archivo se descarga al activarlo, como en 005).
- **«Ver más»**: enlace al final de «Recientes», en `primary` (4.97:1 sobre `card`), con el ícono ›; su nombre accesible
  es «Ver más en Mis archivos» porque la spec lo manda a Mis archivos (raíz). Solo aparece si hay más recientes que los
  3 visibles.
- **Menú ⋮ de un fijado** (patrón «menu button» de WAI-ARIA, el mismo `DropdownMenu` de las filas del explorador, con un
  solo ítem):
  - botón de 28 px en escritorio (44 px en el cajón), con `aria-haspopup="menu"`, `aria-expanded`, `aria-controls` y
    nombre «Acciones de {nombre}»; el menú tiene un `menuitem`, «Quitar de la barra lateral», con la chincheta tachada;
  - **visibilidad**: en escritorio aparece al pasar el puntero, al enfocar la fila (el enlace o el propio botón) o con el
    menú abierto, para no quitar ancho a los nombres; en pantallas sin puntero (`hover: none`) y en el cajón se ve
    siempre. El botón siempre está en el orden de Tab justo después de su enlace, así que con teclado nunca queda oculto
    al enfocarlo;
  - teclado: Enter, Espacio o ↓ abren con el foco en «Quitar…» (↑ abre en el último); Escape cierra y devuelve el foco al
    botón (dentro del cajón cierra solo el menú, no el cajón); Tab cierra y sigue; un clic fuera cierra;
  - al activar «Quitar de la barra lateral» el elemento sale de la lista, el foco pasa al ítem siguiente (o al anterior;
    si era el único, al primer enlace de la barra) y un mensaje `role="status"` lo anuncia («{nombre} ya no está en la
    barra lateral»). El elemento sigue en Mis archivos: solo se borra el acceso;
  - Tab: cada fijado suma una parada (el botón): 5 fijados + 3 recientes = 21 paradas antes del contenido (16 enlaces y 5
    botones). Sigue haciendo falta el enlace «Saltar al contenido» (`#contenido` ya existe en el marco).
- **Aviso del tope (CA-28)**: `Alert` arriba del contenido (de la lista, en el explorador) con la variante **`warning`**
  (`border-warning bg-warning/10 text-warning-foreground`, `ui-guidelines.md` §4): ícono, título en `warning-foreground` 600 y
  «Cerrar aviso». `role="status"` (no interrumpe; no es una falla). No es un toast: lo que no es una confirmación va en
  `Alert` (ADR-0024). El ítem «Fijar» del menú **no** se deshabilita: la spec pide que intentar fijar el sexto muestre el
  aviso. El foco se queda en el botón ⋮ que lo originó.
- **Sin accesos**: la sección desaparece completa (CA-27); no hay estado vacío con instrucciones.
- **Cajón móvil**: mismo contenido que la barra, con ids distintos (`cajon-…` y `barra-…`) para no repetirlos. En
  la captura el lienzo crece para dibujar el cajón completo (1032 px); en un teléfono el cajón se desplaza dentro de la
  pantalla.

### Validación de 5 + 3 (P-15)
Medido con Playwright sobre estos mockups (barra de 236 px; la cuota queda abajo):

| | Sin la sección («Carpetas» de 000b) | 5 + 5 (versión anterior) | **5 + 3 con «Ver más» (aprobada)** |
|---|---|---|---|
| Alto de la sección (escritorio) | ≈ 130 px | 449 px | **381 px** (347 px sin «Ver más») |
| Alto total de la barra (escritorio) | 860 px (mínimo del marco) | 910 px | **860 px**: cabe en el mínimo del marco |
| Paradas de Tab en la barra (enlaces + ⋮) | 10 | 18 | **22** (17 enlaces y 5 botones) |
| Alto total del cajón a 360 px | 676 px | 1120 px | **1032 px** |

Con 3 recientes la barra deja de crecer por encima del mínimo del marco y la cuota queda visible. En el cajón la
sección sigue empezando a unos 530 px del borde superior: en un teléfono hay que desplazar para llegar a «Recientes» y
a la cuota. Mejoras no pedidas, por si la auditoría de la implementación las pide: región desplazable con la cuota fija
y enlace «Saltar al contenido».

### Decisiones abiertas (no bloquean)
1. **Nombres repetidos en la navegación.** Ahora hay «Fijados» (destino de la navegación principal) y «Fijados» (grupo de
   «Accesos rápidos»), y dos «Recientes». Hacen cosas parecidas pero no iguales: la navegación abriría una página
   completa, el grupo es un atajo. Ningún RF respalda las dos páginas (ver «Pendiente de aprobación», punto 5).
2. **«Ver más» no muestra más recientes.** Por spec lleva a Mis archivos (raíz): el texto promete algo que el destino
   no cumple del todo. Se mantiene por decisión de Adrián.
3. **Un archivo reciente se descarga al activarlo.** Es lo que dice la spec; se avisa con `title` y con texto para
   lectores de pantalla. Un ícono de descarga solo al pasar el puntero lo haría visible.

### Contraste de los pares nuevos (WCAG 2.1)
| Par | Contraste |
|---|---|
| `muted-foreground` sobre `card` (títulos «Fijados» y «Recientes», 12 px) | 4.76 |
| `secondary-foreground` sobre `card` (nombre del ítem; botón ⋮) | 8.09 |
| `foreground` sobre `muted` (ítem con puntero) | 12.51 |
| `primary` sobre `card` («Ver más»; ícono de carpeta) | 4.97 |
| `primary-hover` sobre `muted` («Ver más» con puntero) | 6.24 |
| `warning-foreground` sobre `warning` al 10 % (aviso del tope) sobre `background` / `card` | 4.66 / 4.86 |
| Anillo de foco `ring` sobre `card` (botón ⋮, ítem del menú) | 4.97 |

Verificación: axe-core sin violaciones a 360 y 1440 px en los trece estados del layout y en los recorridos de teclado,
sin desbordamiento horizontal a 360 px, sin objetivos menores de 24 px y sin ítems del cajón menores de 44 px
(`_generadores/pw/axe-layout.js`), sin errores de consola. Se probó además a mano con Playwright el teclado del menú ⋮ de
un fijado (Tab llega al botón, Enter abre en «Quitar…», Escape devuelve el foco, Enter en «Quitar…» mueve el foco al
siguiente) y que Escape dentro del cajón cierra solo el menú.

## Cambios respecto de la propuesta (marco de p. 08 y p. 17)
| En la propuesta | En este mockup | Motivo |
|---|---|---|
| Botón para colapsar la barra lateral junto al distintivo del plan | No está | Ningún RF lo pide; por debajo de 900 px la barra ya pasa al cajón. Seguridad (aprobado) tampoco lo tiene |
| Árbol de carpetas con subcarpetas, flechas y «Nueva carpeta» | Carpetas de primer nivel con su contador | Crear y desplegar carpetas es de 006 (RF-10); el layout solo reserva el lugar. Como en Seguridad |
| «42 GB» junto a Optimizador | Sin cifra | La estimación viene de 021 (RF-35); el layout no la calcula |
| Aviso «Cerca del límite. Libera 42 GB con el optimizador.» en la tarjeta de cuota | No aparece (cuota al 21 %) | Los tramos y sus textos son los de `QuotaBar` (§4); el enlace al optimizador lo decide 007 / 021 |
| Buscador, avatares de presencia y «Agente Nimbo» en la barra superior (p. 08) | Solo la ruta y la cuenta | Son herramientas del explorador (018, 016, 020), no del marco |
| «Facturación gestionada por Laura B.» (p. 17) | No está | Supone organizaciones con administración delegada, fuera de alcance (`product-context.md` §9) |
| Sin menú de la cuenta | Menú con Seguridad, Plan y facturación y Cerrar sesión | 002: a Seguridad se llega desde el menú de la cuenta (D-16) y cerrar sesión es HU-7 |
| CTA y relleno en `#6B8DD6` | `primary` `#4A6FA5` | DF-41: el blanco sobre `#6B8DD6` da 3.28 |

## Diferencias con el `AppLayout` actual (`apps/web/src/components/nimbo/app-layout.tsx`)
Este mockup es la referencia para rehacer `AppLayout`. Hoy difiere en lo siguiente:
1. **Estructura**: `AppLayout` pone una cabecera a todo lo ancho con el logo (nube + «Nimbo») y el correo encima de la
   barra lateral. La propuesta y este mockup llevan la barra lateral a toda la altura, con el logo «N · NIMBO» y el
   plan arriba, y la barra superior dentro de la columna de contenido, con la ruta y la cuenta.
2. **Navegación**: `AppLayout` tiene «Mis Archivos», «Compartidos», «Papelera», «Planes y Cuota» y «Agente Nimbo»,
   con mayúsculas de título. El mockup sigue la propuesta: «Mis archivos», «Compartidos conmigo», «Recientes»,
   «Fijados», «Papelera», «Optimizador», «Plan y facturación» y las carpetas. El agente se abre desde el explorador
   (p. 08), no desde la navegación.
3. **Contraste del ítem activo**: `text-primary` sobre `bg-accent` da **4.05**, por debajo de AA (1.4.3; texto de
   14 px). El mockup usa `text-foreground` en 600 (11.07) y conserva la barra `border-l-primary` (S-2 de 000b).
4. **Página actual**: `AppLayout` marca el ítem activo solo con clases. Falta `aria-current="page"`.
5. **Faltan** la ruta, el menú de la cuenta, la cuota (`QuotaBar`), las carpetas, el distintivo del plan y el aviso de
   solo lectura. El cajón móvil tampoco tiene carpetas ni cuota.
6. **Correo en `font-mono`**: ya no se usa JetBrains Mono. En el mockup, el correo va dentro del menú, en Inter.
7. **Velo del cajón**: `bg-black/40` con desenfoque no es un token. El mockup usa `agent-bg` al 45 %, igual que
   Seguridad (token pendiente, TODO #6).
8. **Punto de quiebre**: el mockup cambia a 900 px, como Seguridad; `AppLayout` usa `md` (768 px). **No es un
   requisito**: la implementación conserva `md` y la auditoría no debe marcarlo como diferencia.
9. **Altura de los ítems**: `AppLayout` usa 44 px también en escritorio. El mockup usa 36 px en escritorio (densidad
   de la propuesta y de Seguridad; supera los 24 px de WCAG 2.5.8) y 44 px en el cajón y en la barra superior móvil
   (CA-5). Las dos opciones cumplen.

## Contraste de los pares nuevos (WCAG 2.1)
| Par | Contraste |
|---|---|
| `foreground` sobre `accent` (ítem activo) | 11.07 |
| `secondary-foreground` sobre `accent` (contador del ítem activo) | 6.59 |
| Barra `primary` sobre `accent` / `card` (indicador del activo, no texto) | 4.05 / 4.97 |
| `primary` sobre `accent` (el activo del `AppLayout` actual, **no cumple**) | 4.05 |
| `warning-foreground` `#8A6424` sobre `warning` al 12 % (título del aviso y candado) | 4.79 |
| `foreground` sobre `warning` al 12 % (texto del aviso) | 12.50 |
| Blanco sobre `primary` («Renovar plan») | 5.11 |
| `foreground` sobre `muted` (ítem del menú con foco o puntero) | 12.51 |
| `secondary-foreground` sobre `muted` (avatar con el menú abierto; contador con puntero) | 7.45 |
| `muted-foreground` sobre `card` (correo en el menú) | 4.76 |
| Anillo de foco `ring` sobre `card` / `muted` | 4.97 / 4.58 |
| `secondary-foreground` sobre `background` (marcador del contenido) | 7.73 |
| `foreground` sobre `card` (texto del aviso, 007 CA-18) | 13.58 |
| Ícono de éxito `success-foreground` sobre `card` (no texto) | 5.25 |
| Borde `input` del botón «Ver papelera» sobre `card` (no texto) | 3.07 |

El borde del aviso (`warning` al 45 %) y el borde discontinuo del marcador son decorativos: el aviso se distingue por
su ícono, su título y su fondo.

## Pendiente de aprobación (Adrián)
1. **Confirmar «Cerrar sesión» desde el menú de la cuenta.** CA-14 y D-8 solo exigen confirmación desde la lista de
   Seguridad. Este mockup la pide también desde el menú, con el mismo diálogo. Si se aprueba, conviene ajustar el
   texto de CA-14 («Y si la cierra desde la lista…»).
2. **Texto del aviso de solo lectura** (propuesto; ninguna spec lo fija, lo define 010):
   - título: «Tu cuenta está en solo lectura.»;
   - cuerpo: «Tu plan {plan} venció el {fecha}. Tus archivos siguen aquí: puedes verlos y descargarlos, pero no subir
     ni editar hasta que renueves.»;
   - botón: «Renovar plan».
3. **El aviso aparece en todas las vistas**, incluidas Seguridad y Plan y facturación, y no se puede cerrar.
   `ui-guidelines.md` §4 dice «visible en todas las vistas de escritura»; pintarlo desde el layout es más simple y no
   deja ninguna vista sin aviso.
4. **Solo lectura por cuota excedida**: `product-context.md` (§3 y glosario) solo degrada a solo lectura cuando vence
   la suscripción. Superar la cuota bloquea las cargas (RF-12), pero no pone la cuenta en solo lectura. Si 010 decide
   que bajar a un plan con menos espacio que el usado también degrada, se reutiliza el mismo aviso con otro cuerpo
   (por definir). Este mockup no lo dibuja.
5. **«Recientes» y «Fijados»** («Favoritos» en la propuesta firmada; renombrado el 2026-10-03): ningún RF respalda esas páginas, y el Artículo II
   (Trazabilidad) de la constitución dice que no se construye lo que no se pueda rastrear hasta un requisito. Hay que agregar un RF (o
   asignarlos a 007) o quitarlos de la navegación.
6. **Correo en el menú de la cuenta**: se muestra debajo del nombre para confirmar con qué cuenta se entró.

## Pendiente
- Velo de los diálogos y del cajón: `agent-bg` al 45 %; falta el token en `globals.css` (TODO #6 de `app-layout.tsx`).
- Tramos de 70 % y 90 % de la cuota: dibujados por 007 (`cuota-70`, `cuota-90`; tarjeta de
  `_generadores/espacio/espacio.js`). La acción es «Liberar espacio» y lleva al resumen de espacio (007 CA-5, CA-7); no
  hay enlace al optimizador (021). En 0–69 % 007 propone «Ver detalle» como entrada al resumen; el `default` de este
  mockup todavía no lo muestra (pendiente de aprobación en `storage/resumen-espacio/README.md`).
- Región central de la barra en los estados de 007 CA-18/CA-19 (`aviso-arriba-centro`, `barra-fija-lista-larga`):
  todavía muestran «Carpetas», que 006 CA-27 reemplazó por «Accesos rápidos»; falta pasar la sección de
  `accesos/accesos.js` a `barra.js` (`central`) y regenerarlos. Los bloques de navegación y de cuota no cambian.
- Árbol de carpetas y «Nueva carpeta» en la barra lateral: no se dibujan; 006 los reemplazó por «Accesos rápidos»
  (sin desglose) y el botón «Nueva carpeta» vive en el encabezado del explorador. En solo lectura, «Nueva carpeta» se
  deshabilita.
- Herramientas de página en la barra superior (buscador, presencia, «Agente Nimbo»): las definen el explorador y
  018/020. `AppLayout` necesitará un espacio para ellas entre la ruta y la cuenta.
- «Mi actividad» (bitácora de auditoría, RF-07, spec 004) será probablemente otra entrada del menú de la cuenta; se
  agrega cuando exista esa spec.
- La implementación usa `components/ui` (`Button`, `DropdownMenu`, `Sheet` o `Dialog`) y `components/nimbo`
  (`AppLayout`, `QuotaBar`, `ReadOnlyBanner`, `ConfirmDestructiveDialog`); no se crea otro componente de layout.
