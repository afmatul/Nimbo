# Mockup: Layout de la app (marco compartido)

- **Spec**: 000b (layout base, CA-5), pendiente PD-28. Toma requisitos de RF-12 (cuota en la barra lateral), RF-23
  (solo lectura) y 002 (menú de la cuenta, CA-14, D-8, D-16).
- **Propuesta presentada**: no tiene pantalla propia. El marco (barra lateral con distintivo de plan, navegación,
  carpetas y cuota; barra superior con ruta y avatar) es el de las p. 08 (explorador) y p. 17 (Plan y facturación) del
  PDF «Mockups nimbo final». Los cambios respecto de ese marco están en «Cambios respecto de la propuesta».
- **Origen**: HTML autocontenido, un archivo por estado, generado con el mismo marco que `identity/seguridad/` (`../../_generadores/layout/generar.js`; ver [`_generadores/README.md`](../../_generadores/README.md)). La
  barra lateral, la barra superior, el diálogo de confirmación y su CSS salen de un solo módulo, así que las dos carpetas
  no pueden divergir. El HTML de Seguridad no cambió ni un byte. Usa Cielo Sereno con los tonos AA de
  `ui-guidelines.md` §2–§3 y solo Inter 400/500/600/700; las cifras (cuota, contadores) llevan
  `font-variant-numeric: tabular-nums`. Incluye un script en línea que demuestra el teclado del menú, el diálogo y el
  cajón. Es referencia visual; `apps/web` no lo importa.
- **Estados incluidos**:
  - default: «Mis archivos» activo, plan Personal al 21 % (`layout.html`)
  - menu-cuenta-abierto: menú de la cuenta abierto con el foco en «Seguridad» (`layout--menu-cuenta-abierto.html`)
  - confirmar-cerrar-sesion: «Cerrar sesión» desde el menú pide confirmación (`layout--confirmar-cerrar-sesion.html`)
  - solo-lectura: plan Pro vencido; aviso persistente con «Renovar plan» (`layout--solo-lectura.html`, RF-23)
  - movil-cajon-abierto: por debajo de 900 px, la barra lateral se abre como cajón (`layout--movil-cajon-abierto.html`).
    Solo existe en móvil y tableta; a 1440 px el archivo muestra el marco de escritorio y no tiene captura.
- **Capturas**: `docs/design/capturas/shared/layout/` (`layout--<estado>--<360|1440>.png`; el cajón, solo a 360).
  axe-core sin violaciones en los 5 estados a 360 y 1440 px y en los recorridos de teclado (menú abierto, diálogo
  abierto, cajón abierto). Sin desbordamiento horizontal a 360 px, sin errores de consola, objetivos de al menos 24 px
  y de 44 px en la barra superior y el cajón móviles (CA-5 de 000b).

## Decisiones de UX
- **Barra lateral** (escritorio, 236 px): logo «N · NIMBO» con el distintivo del plan, navegación principal (Mis
  archivos, Compartidos conmigo, Recientes, Favoritos, Papelera con su contador), separador, Optimizador y Plan y
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
- **Contenido central**: un marcador neutro con el `h1` de la página. Cada pantalla dibuja su contenido en su mockup.
- Los roles internos (Administrador, Soporte, Operador) no usan este marco: tienen el suyo en 011 y 022, sin
  navegación de archivos.

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
   «Favoritos», «Papelera», «Optimizador», «Plan y facturación» y las carpetas. El agente se abre desde el explorador
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
5. **«Recientes» y «Favoritos»**: están en la propuesta firmada, pero ningún RF los respalda, y el Artículo II
   (Trazabilidad) de la constitución dice que no se construye lo que no se pueda rastrear hasta un requisito. Hay que agregar un RF (o
   asignarlos a 007) o quitarlos de la navegación.
6. **Correo en el menú de la cuenta**: se muestra debajo del nombre para confirmar con qué cuenta se entró.

## Pendiente
- Velo de los diálogos y del cajón: `agent-bg` al 45 %; falta el token en `globals.css` (TODO #6 de `app-layout.tsx`).
- Tramos de 70 % y 90 % de la cuota en la barra lateral y su enlace al optimizador: los dibuja 007.
- Árbol de carpetas y «Nueva carpeta» en la barra lateral: los dibuja 006. En solo lectura, «Nueva carpeta» se
  deshabilita.
- Herramientas de página en la barra superior (buscador, presencia, «Agente Nimbo»): las definen el explorador y
  018/020. `AppLayout` necesitará un espacio para ellas entre la ruta y la cuenta.
- «Mi actividad» (bitácora de auditoría, RF-07, spec 004) será probablemente otra entrada del menú de la cuenta; se
  agrega cuando exista esa spec.
- La implementación usa `components/ui` (`Button`, `DropdownMenu`, `Sheet` o `Dialog`) y `components/nimbo`
  (`AppLayout`, `QuotaBar`, `ReadOnlyBanner`, `ConfirmDestructiveDialog`); no se crea otro componente de layout.
