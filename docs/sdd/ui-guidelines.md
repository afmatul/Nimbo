# Guía de UI — cómo aplicar Cielo Sereno en Nimbo

> Fuente original: `docs/design/design-system/design-cielo-sereno.md`.
> Este archivo dice **cómo** se implementa ese sistema en `apps/web` (Next.js + Tailwind v4 + shadcn/ui) y qué ajustes
> exigen los requisitos. Guardián: subagente `ui-designer`.
> Prioridad ante conflictos: **RNF-13 (AA, 360 px, español) > esta guía > design-cielo-sereno.md > mockup**.

## 1. Principios

1. **Claridad sin agresividad**: azules desaturados, neutros fríos y poco ruido. Nada de colores saturados al 100 %.
2. **El color nunca es el único diferenciador**: siempre va acompañado de ícono, etiqueta o texto (estados, cuota, tipos de archivo, participantes).
3. **Una sola fuente de tokens**: `apps/web/src/app/globals.css`. Los componentes usan utilidades de Tailwind (`bg-primary`, `text-muted-foreground`), **nunca hex** ni valores arbitrarios (`bg-[#6B8DD6]`).
   **Única excepción: el favicon** (`apps/web/src/app/icon.svg`). El navegador lo carga como archivo suelto, sin la hoja de estilos, así que no puede usar `var()`: fija en hex los valores de `--primary` y `--primary-foreground`, y `icon.spec.ts` comprueba que coincidan con `globals.css`. Si cambia un token, la prueba falla hasta actualizar el SVG.
4. **Mockup = intención, no código**: se reconstruye con shadcn/ui y los componentes de `components/nimbo/`.
5. **Todo estado se diseña**: vacío, cargando, error (con acción correctiva), éxito, solo lectura, sin permiso.
6. **Móvil desde 360 px** y `prefers-reduced-motion` respetado.

## 2. Contraste verificado (WCAG 2.1)

El design system afirma cumplir AA en todos los pares, pero el cálculo con la fórmula de luminancia relativa de WCAG
muestra que varios pares de uso frecuente no lo cumplen:

| Par | Contraste | Requerido | Resultado |
|---|---|---|---|
| Texto blanco sobre `#6B8DD6` (botón CTA) | 3.28 | 4.5 | ❌ |
| Texto blanco sobre `#4A6FA5` | 5.11 | 4.5 | ✅ |
| `#6B8DD6` como link sobre fondo `#F4F7FB` | 3.05 | 4.5 | ❌ |
| `text-muted #7A90A8` sobre fondo / card | 3.06 / 3.20 | 4.5 | ❌ |
| `text-muted` sobre fila seleccionada `#DDE6F0` | 2.61 | 4.5 | ❌ |
| Semánticos como texto (success / warning / danger) sobre card | 2.26 / 2.11 / 3.09 | 4.5 | ❌ |
| Texto blanco sobre `danger #C97B7B` (botón destructivo) | 3.18 | 4.5 | ❌ |
| Chips de tipo de archivo (texto sobre su fondo al 12 %) | 1.70 – 2.83 | 4.5 | ❌ |
| Borde `#DDE6F0` de inputs sobre card | 1.23 | 3.0 (no-texto) | ❌ |
| `text-primary` / `text-secondary` sobre fondo | 12.99 / 7.73 | 4.5 | ✅ |
| Panel del agente: texto / acento sobre `#2C3A52` | 8.87 / 6.07 | 4.5 | ✅ |
| `agent-accent` sobre `agent-tag` | 4.50 | 4.5 | ⚠️ al límite |

### Ajustes propuestos (DF-41 a DF-45, pendientes de aprobación del equipo)

La paleta se conserva; lo que cambia es **qué tono se usa como texto o relleno de controles**. Los tonos originales
quedan para usos decorativos y no textuales, donde basta con 3:1 o no aplica mínimo.

| Uso | Original | Propuesto | Contraste |
|---|---|---|---|
| Relleno de botón primario | `#6B8DD6` | `#4A6FA5` (primary-dark) | 5.11 con blanco |
| Hover de botón primario | `#4A6FA5` | `#3B5A8A` | 6.96 |
| Links | `#6B8DD6` | `#4A6FA5` | 4.76 / 4.97 |
| Texto atenuado | `#7A90A8` | `#5E7389` | 4.56 / 4.76 (en fila seleccionada usar `text-secondary`) |
| Texto de éxito | `#6DB99A` | `#3A7560` | 5.25 |
| Texto de advertencia | `#D4A96A` | `#8A6424` | 5.20 |
| Texto de error y botón destructivo | `#C97B7B` | `#A34F4F` | 5.39 / 5.54 con blanco |
| Borde de input | `#DDE6F0` | `#7F93AA` (el borde de card se queda) | 3.07 |
| Anillo de foco | `#6B8DD6` | `#4A6FA5` (`#7EC8D8` dentro del panel del agente) | 4.76 / 6.07 |
| Chip `.docx` / `.xlsx` / `.pptx` / `.pdf` / imagen / otro (texto) | tono base | `#3F62A8` / `#3A7560` / `#8A6424` / `#A34F4F` / `#276B7A` / `#53677D` | 4.77 – 5.46 |
| Chips de cita en el agente | `agent-accent` | texto `agent-text` sobre `agent-tag` | 6.57 |

`#6B8DD6`, `#6DB99A`, `#D4A96A` y `#C97B7B` se siguen usando en íconos grandes, barras de progreso,
ilustraciones, fondos de chip (al 12 %) y anillos de avatar.

## 3. Implementación de tokens (Tailwind v4 + shadcn/ui)

La guía original propone `src/index.css` con `--color-text-primary`, pero en Next.js App Router el archivo global es
`apps/web/src/app/globals.css`, y shadcn/ui espera variables con su propia convención (`--primary`,
`--muted-foreground`, `--ring`…). Además, `--color-text-primary` generaría la utilidad `text-text-primary`. Se usa
**un solo archivo**: los valores de Cielo Sereno se asignan a las variables de shadcn, y los tokens exclusivos de
Nimbo se agregan aparte (DF-47).

```css
/* apps/web/src/app/globals.css */
@import "tailwindcss";

:root {
  /* Superficies */
  --background: #F4F7FB;          /* color-bg */
  --card: #FAFCFF;                /* color-card */
  --popover: #FAFCFF;
  --border: #DDE6F0;              /* bordes decorativos de card y separadores */
  --input: #7F93AA;               /* borde de controles (AA no-texto) */

  /* Texto */
  --foreground: #1E2D40;          /* text-primary */
  --card-foreground: #1E2D40;
  --popover-foreground: #1E2D40;
  --secondary-foreground: #3A5068;/* text-secondary */
  --muted-foreground: #5E7389;    /* text-muted ajustado */

  /* Marca */
  --primary: #4A6FA5;             /* relleno CTA ajustado */
  --primary-hover: #3B5A8A;
  --primary-foreground: #FFFFFF;
  --brand: #6B8DD6;               /* azul pizarra decorativo */
  --secondary: #DDE6F0;
  --muted: #EEF3F9;
  --accent: #DDE6F0;              /* shadcn: fondo hover/seleccionado */
  --accent-foreground: #1E2D40;
  --ring: #4A6FA5;
  --live: #7EC8D8;                /* cian brumoso: tiempo real */

  /* Semánticos: relleno decorativo / texto */
  --success: #6DB99A;  --success-foreground: #3A7560;
  --warning: #D4A96A;  --warning-foreground: #8A6424;
  --destructive: #A34F4F; --destructive-soft: #C97B7B;

  /* Agente */
  --agent-bg: #2C3A52; --agent-text: #D8E4F0; --agent-accent: #7EC8D8; --agent-tag: #3A4E6A;

  /* Tipos de archivo (texto AA; fondo = color base al 12 %) */
  --file-docx: #3F62A8; --file-docx-bg: #6B8DD620;
  --file-xlsx: #3A7560; --file-xlsx-bg: #6DB99A20;
  --file-pptx: #8A6424; --file-pptx-bg: #D4A96A20;
  --file-pdf:  #A34F4F; --file-pdf-bg:  #C97B7B20;
  --file-img:  #276B7A; --file-img-bg:  #7EC8D820;
  --file-other:#53677D; --file-other-bg:#7A90A820;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-hover: var(--primary-hover);
  --color-primary-foreground: var(--primary-foreground);
  --color-brand: var(--brand);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-live: var(--live);
  --color-success: var(--success);
  --color-success-foreground: var(--success-foreground);
  --color-warning: var(--warning);
  --color-warning-foreground: var(--warning-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-soft: var(--destructive-soft);
  --color-agent-bg: var(--agent-bg);
  --color-agent-text: var(--agent-text);
  --color-agent-accent: var(--agent-accent);
  --color-agent-tag: var(--agent-tag);

  --font-sans: var(--font-inter), system-ui, sans-serif;

  --radius-sm: 6px;    /* badges, chips */
  --radius-md: 10px;   /* inputs, botones */
  --radius-lg: 14px;   /* cards, filas de archivo */
  --radius-xl: 18px;   /* paneles, modales */

  --shadow-card: 0 1px 3px rgba(74,111,165,.08), 0 1px 2px rgba(74,111,165,.04);
  --shadow-modal: 0 8px 24px rgba(44,58,82,.18);
  --shadow-button: 0 1px 2px rgba(107,141,214,.20);
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
}
```

- **Inter es la única familia** (400, 500, 600 y 700), como en las hojas recientes. Se carga con `next/font/google` (`Inter`) en `app/layout.tsx`, que expone `--font-inter`. JetBrains Mono ya no se usa (Adrián, 2026-09-26): reemplaza la fila «Código / rutas» de `design-cielo-sereno.md` §tipografía, y las hojas `.dc.html` anteriores que la muestran son históricas. No se usa la clase `font-mono`.
- Cifras, tamaños, precios, fechas, ubicaciones de citas y metadatos que antes iban en mono: Inter con la clase `tabular-nums`.
- Después de `npx shadcn add`, revisar el radio de cada componente: en Cielo Sereno las cards son `rounded-lg` (14 px) y los modales `rounded-xl` (18 px).
- No hay modo oscuro en el alcance (YAGNI). El panel del agente es una superficie oscura puntual, no un tema.

### Guías y sangría del desglose de carpetas (spec 006, CA-26)

Las filas de una carpeta desglosada llevan sangría por nivel y guías verticales. Las guías necesitan medidas que no
son de la paleta, así que se definen **una sola vez** en `globals.css` (ya están) y los componentes solo usan las
utilidades; nada de `pl-[28px]` ni `bg-[linear-gradient(…)]`.

| Token (`:root`) | Móvil (< 640 px) | Desde `sm` (≥ 640 px) | Qué es |
|---|---|---|---|
| `--tree-indent` | 16 px | 28 px | Sangría por nivel |
| `--tree-guide-x` | 25 px | 31 px | Posición de la primera guía dentro de la celda: el centro del control de desglose (44 px con margen de −8 px en móvil; 32 px en escritorio) |
| `--tree-max-level` | 3 | 6 | Nivel desde el que la sangría y las guías dejan de crecer, para que el nombre conserve ancho |
| `--tree-guide` | `var(--border)` | igual | Color de la guía (decorativa: la sangría ya dice el nivel) |

| Utilidad | Uso |
|---|---|
| `tree-indent` | En el contenedor del nombre (`.fname`) de la fila: `padding-inline-start` = nivel × `--tree-indent`. En las filas de estado (cargando, vacía, error y «Ver más») va en un contenedor y el contenido, dentro, con `pl-9 sm:pl-11` (el ancho del control de desglose más su separación: 36 px en móvil, 44 px desde `sm`) |
| `tree-guides` | En la celda (`td`) de la fila: una línea de 1 px por ancestro, hasta `--tree-max-level` |
| `border-tree-guide` / `bg-tree-guide` | El color como utilidad de Tailwind (`--color-tree-guide`) si hace falta fuera de las dos anteriores |

El nivel de cada fila viene de la variable `--tree-level`: `<tr style={{ '--tree-level': nivel }}>` (0 = raíz; con 0 no se
dibuja nada). Las dos utilidades leen esa variable, así que no hay una clase por nivel. El mockup
`storage/explorador/explorador--carpeta-desglosada` usa las mismas variables y clases en CSS plano (el mockup cambia a
móvil a 600 px; la implementación usa `sm`, 640 px, y no es una diferencia que haya que marcar).

### Tabla de equivalencias para leer el design system

| design-cielo-sereno.md | Utilidad en código |
|---|---|
| `--color-primary` (CTA) | `bg-primary text-primary-foreground hover:bg-primary-hover` |
| `--color-primary` (decorativo) | `text-brand`, `bg-brand/10` |
| `--color-primary-dark` (encabezados de sección) | `text-primary` |
| `--color-accent` | `bg-live`, `text-live` |
| `--color-bg` / `--color-card` / `--color-border` | `bg-background` / `bg-card` / `border-border` |
| `--color-text-primary` / `-secondary` / `-muted` | `text-foreground` / `text-secondary-foreground` / `text-muted-foreground` |
| `--color-success` / `warning` / `danger` | relleno `bg-success`…; texto `text-success-foreground`, `text-warning-foreground`, `text-destructive` |
| `--color-agent-*` | `bg-agent-bg`, `text-agent-text`, `text-agent-accent`, `bg-agent-tag` |
| `shadow-card` / `shadow-modal` / `shadow-button` | iguales |

## 4. Componentes compartidos (`apps/web/src/components/nimbo/`)

| Componente | Uso | Reglas |
|---|---|---|
| `FileTypeChip` | Tipo de archivo en listas y fichas | Mapa único tipo → tokens `--file-*`; muestra la extensión en texto. `.txt` y `.md` (`texto` en la API) dicen «TEXTO» con los tokens neutros `--file-other` (007): sin color propio, el rótulo los distingue de «OTRO» |
| `QuotaBar` | Medidor de cuota (RF-12) | 0–69 % `success`, 70–89 % `warning` con «Tu cuota está al X %», 90–99 % `destructive-soft` con «Espacio casi agotado» y 100 % con «Espacio agotado.» (007 RN-4); siempre muestra el porcentaje y los GB en texto; `role="progressbar"`; pista con borde `input` (≥ 3:1, 007 D-19 a). `quotaStateOf(uso)` da porcentaje, tramo y texto (una sola fuente). `QuotaLink` es su acción de texto con `ChevronRight` («Liberar espacio», «Ver detalle»). `QuotaTrack` es la barra sola, para el medidor grande de `/espacio`, que no repite el texto del tramo porque ya lo dice el `Alert` de la pantalla (`warning` en 70–89 %, `critical` con fondo `destructive-soft` en 90–100 %) |
| `UploadProgress` | Carga por partes (RF-08) | Porcentaje, bytes, reanudar/cancelar; `aria-live="polite"` |
| `StatusBadge` | Estados de indexación, sesión, suscripción, trabajo | Ícono + etiqueta; nunca solo color |
| `EmptyState` / `ErrorState` | Estados de pantalla | El error muestra la acción correctiva que envía la API (RNF-14) |
| `ReadOnlyBanner` | Suscripción vencida (RF-23) | Visible en todas las vistas de escritura, con enlace a renovar |
| `Alert` (`components/ui/alert.tsx`) | Avisos dentro de la página, arriba del contenido al que se refieren | Tres variantes con tokens: `info` (`border-border bg-card text-foreground`, `role="status"`), `error` (`border-destructive bg-card text-destructive`, `role="alert"`) y **`warning`** (ver abajo). Con ícono; un botón «Cerrar aviso» si no es persistente. Un límite alcanzado no es un error: usa `warning` y no `error` |
| `ConfirmDestructiveDialog` | Eliminar definitivamente, revocar accesos, cerrar sesiones (002 CA-14) | Compuesto sobre `AlertDialog` (`components/ui/alert-dialog.tsx`): `role="alertdialog"` con título y descripción, foco inicial en «Cancelar», Escape cancela. Botón `destructive`, texto explícito de la consecuencia; a 360 px los botones se apilan con el destructivo arriba. Con `pending`, ambos botones deshabilitados, el de confirmar con indicador y `pendingLabel`, y Escape no cierra. **Velo**: el del `AlertDialog` (`bg-foreground/40`), sin token nuevo, por decisión de Adrián (PD-27, 2026-10-04) |
| `ParticipantAvatar` / `PresenceStack` | Presencia en edición (RF-26) e historial (RF-29) | Color de la secuencia de 8 como **anillo**; iniciales en `text-foreground` sobre `bg-card`; nombre en tooltip y para lectores de pantalla |
| `VersionTimeline` | Historial con autoría (RF-29) | Lista ordenada de la más reciente a la más antigua: «Versión N», distintivo «ACTUAL» (ícono + texto), fecha, autor (participantes con 016), tamaño y cambio en texto (para lectores, «200 KB más que la versión 4»), origen con ícono (carga/edición/restauración «de la versión k»/optimización), «Descargar» y «Restaurar» por versión con nombre accesible completo. La versión actual no tiene «Restaurar». Restaurar confirma con el espacio que usará y, si el plan está en su límite, un `Alert` `warning` que dice qué versión se eliminará (014 CA-15) |
| `AccessList` | Accesos vigentes (RF-18) | Nivel en texto; revocar con confirmación |
| `AgentPanel` | Agente (RF-32) | Superficie `bg-agent-bg`; streaming con `aria-live`; indicador en vivo `agent-accent` (sin animación si reduced-motion) |
| `CitationChip` | Cita del agente | «archivo · página 3», etiqueta de `SourceLocation.label()`; navegable; aviso visible si la ubicación no es certera |
| `PlanCard` | Plan del catálogo (RF-19, 008) y de administración (011) | Un solo componente con las props del contrato `Plan` (PD-83); hoy solo la variante del comparador, la 011 agrega la de administración. Precio en quetzales con `tabular-nums`; límites desde la API, nunca escritos en el frontend; sin color por `slug` (los planes no son fijos). La tabla comparativa vive en `features/billing` (`PlanComparisonTable`) |
| `Toaster` (sonner, `components/ui/sonner.tsx`) | Confirmaciones no bloqueantes con acción (papelera, restaurar) | `aria-live="polite"`, ≥ 8 s, pausa con hover y foco, solo tokens; arriba y al centro, debajo del encabezado y nunca sobre el panel de cargas, a todo el ancho disponible en móvil (007 CA-18); los errores van en `Alert`, no en toast (ADR-0024) |

#### Variante `warning` de `Alert`
Para avisos de un límite o una condición que no es una falla del sistema (p. ej. «Ya fijaste 5 elementos. Quita uno para
fijar otro.», CA-28 de 006). Usa tokens que ya existen; no hay valores nuevos:

```ts
warning: 'border-warning bg-warning/10 text-warning-foreground'
```

- **Rol**: `role="status"` (anuncio educado), no `alert`: no interrumpe al lector de pantalla; el `Alert` ya lo asigna así.
- **Contraste (WCAG 2.1)**: `warning-foreground` `#8A6424` sobre `warning` al 10 % queda en **4.66:1 como mínimo** (sobre
  `background`; 4.86 sobre `card`), por encima de 4.5. El texto de cuerpo en `foreground` da 12.2. El borde `warning` es
  decorativo: el aviso se distingue por su ícono (`alert`), su título en 600 y su fondo.
- **Estructura**: ícono + título (`warning-foreground`, 600) + texto opcional (`foreground`) + acción opcional + «Cerrar aviso»
  (botón de ícono de 44 px en móvil). Ya existe en `components/ui/alert.tsx`; el developer solo lo compone, no lo cambia.
- **Tono**: avisa y dice qué hacer. Nunca `destructive` para un límite alcanzado.

### Colores de participantes (DF-46)
La secuencia de 8 colores del design system dice «visor de atribución de párrafo», pero la atribución párrafo a
párrafo **está fuera de alcance**. La secuencia se usa para identificar participantes en `PresenceStack` y
`VersionTimeline`. El color se asigna de forma determinista (hash del id de usuario módulo 8) y nunca es el único
identificador.

## 5. Reglas de interacción

| Estado | Implementación |
|---|---|
| Hover primario | `hover:bg-primary-hover` |
| Foco | `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring` (nunca quitar el foco) |
| Deshabilitado | `disabled:opacity-45 disabled:pointer-events-none` + `aria-disabled` |
| Fila seleccionada | `bg-accent border-l-[3px] border-l-brand`; metadatos en `text-secondary-foreground` |
| Arrastrar para subir | `bg-brand/5 border-[1.5px] border-dashed border-brand` + texto «Suelta para subir» |
| Operación > 2 s | Progreso visible (RNF-14) |
| Destructivo | Confirmación con consecuencia explícita |

`border-l-[3px]` y `border-[1.5px]` son las únicas medidas arbitrarias permitidas (vienen del design system).

## 6. Texto y tono
- Español neutro, tuteo (como el design system: «Tu cuota está al X %»).
- Botones con verbo: «Subir archivo», «Compartir», «Restaurar versión».
- Errores: qué pasó + qué hacer («El archivo supera los 50 MB de tu plan. Mejora a Pro o sube un archivo más pequeño.»).
- Los textos visibles viven en el componente o en el catálogo de errores del frontend. Los límites y precios vienen de la API.

## 7. Inventario de pantallas

> Estado del mockup: `Pendiente` · `Borrador` · `Aprobado`. Rutas relativas a `docs/design/`.
> Actualicen la columna «Mockup» con lo que ya existe; el `ui-designer` la mantiene al día.
> Los mockups `Borrador` provienen de Claude Design (`.dc.html`) o están escritos a mano en HTML autocontenido
> (`.html`), como `mockups/identity/seguridad/`, `mockups/identity/terminos/`, `mockups/identity/privacidad/`, los mockups de `mockups/backoffice/` (`admin/`, `alta-interna/`, `catalogo/`, `metricas/`, `soporte/`) y los estados nuevos de `mockups/storage/carga/`, `mockups/storage/explorador/` y `mockups/storage/papelera/`. Solo
> cubren los estados entre paréntesis; el resto de estados mínimos se agregan con `/mockup` antes de aclarar la spec.
> Cada carpeta tiene un `README.md`.

| Pantalla | Módulo | Spec | Mockup | Capturas | Estados mínimos | Mockup |
|---|---|---|---|---|---|---|
| Registro | identity | 001 | `mockups/identity/registro/` | `capturas/identity/registro/` | default, error, exito | Borrador (default, enviando, error-campos, error-servidor, catalogo-no-disponible, exito, limite-reenvio, pedir-enlace) |
| Correos de registro (verificación y aviso de intento) | identity | 001 | `mockups/identity/correos/` | `capturas/identity/correos/` | registro | Borrador (registro) |
| Términos (página estática) | identity | 001 | `mockups/identity/terminos/` | `capturas/identity/terminos/` | default | Borrador (default) |
| Política de privacidad (página estática) | identity | 001 | `mockups/identity/privacidad/` | `capturas/identity/privacidad/` | default | Borrador (default) |
| Verificar correo | identity | 001 | `mockups/identity/verificar-correo/` | `capturas/identity/verificar-correo/` | exito, enlace-expirado | Borrador (verificando, enlace-expirado, enlace-invalido, ya-verificado, exito, plan-de-pago-elegido) |
| Inicio de sesión | identity | 002 | `mockups/identity/inicio-sesion/` | `capturas/identity/inicio-sesion/` | default, error, enviando, bloqueado, no-verificado, suspendida | Borrador (default; los demás estados por decisión explícita, spec 002 §11) |
| Recuperar / restablecer contraseña | identity | 002 | — (reutiliza pedir-enlace, exito, enlace-expirado, enlace-invalido y ya-verificado de 001) | — | pedir, correo-enviado, contrasena-nueva, enlace-expirado, enlace-invalido, exito | Decisión explícita (spec 002 §11) |
| Crear tu contraseña (persona interna invitada) | identity | 011 | — (patrón de `restablecer-contrasena` de 002, P-15) | — | default, enviando, error-campos, enlace-vencido, enlace-invalido, exito | Decisión explícita (sin mockup) |
| Seguridad (sesiones y contraseña) | identity | 002, 011 | `mockups/identity/seguridad/` | `capturas/identity/seguridad/` | default, cargando, error-sesiones, sin-otras-sesiones, confirmar-cierre, confirmar-cierre-actual, sesion-cerrada, cerrar-demas, cerrar-demas-exito, contrasena-enviando, contrasena-no-coincide, contrasena-incorrecta, contrasena-debil, contrasena-bloqueada, contrasena-cambiada | Aprobado (2026-09-26) |
| Layout de la app (navegación, cuota lateral, menú de la cuenta). Web: tarjeta de cuota `SidebarQuota` en `AppLayout.quotaCard` (007 T-10) | shared | 000b, 006, 007 | `mockups/shared/layout/` | `capturas/shared/layout/` | default, menu-cuenta-abierto, confirmar-cerrar-sesion, solo-lectura, movil-cajon-abierto (solo 360); 006 (CA-27, CA-28): fijados-y-recientes, solo-recientes, solo-fijados, con-ver-mas, sin-accesos, tope-de-fijados, fijado-menu-abierto (solo 1440), movil-cajon-con-accesos (solo 360), movil-cajon-fijado-menu-abierto (solo 360); 007: cuota-70, cuota-90 (en web también: «Ver detalle» bajo el 70 %, cargando y error sin barra, sin enlaces en `/espacio`); 007 CA-18/19 (2026-10-03): aviso-arriba-centro (sin tapar el panel de cargas), barra-fija-lista-larga (la región central de la barra se desplaza y la cuota queda al pie) | Borrador (marco de 000b; 007: cuota-70, cuota-90, aviso-arriba-centro, barra-fija-lista-larga); **Aprobado (2026-10-03)**: 006 CA-27 y CA-28 (fijados-y-recientes, solo-recientes, solo-fijados, con-ver-mas, sin-accesos, tope-de-fijados, fijado-menu-abierto, movil-cajon-con-accesos, movil-cajon-fijado-menu-abierto) |
| Explorador de archivos | storage | 005–007 | `mockups/storage/explorador/` | `capturas/storage/explorador/` | default, vacio, cargando, arrastre, error, acciones, descarga-preparando, descarga-fallida; 006: carpeta, migas, carpeta-vacia, carpeta-cargando, carpeta-error, carpeta-no-encontrada, nueva-carpeta, renombrar, mover, mover-nueva-carpeta, error-nombre, error-mover, eliminado; 007: orden, ordenado, mas-paginas, cargando-mas, cargar-mas-error (sin cuadrícula ni selección múltiple, diferidas) | Borrador (cuadricula, lista, vacio, cargando, arrastre, error, acciones, descarga-preparando, descarga-fallida; 006: raiz-carpetas, carpeta, carpeta-vacia, carpeta-cargando, carpeta-error, carpeta-no-encontrada, carpeta-arrastre, acciones-archivo, acciones-carpeta, nueva-carpeta, nombre-invalido, nombre-repetido-carpeta, limite-niveles, renombrar, renombrar-repetido, mover, mover-carpeta, mover-conflicto, mover-nueva-carpeta, mover-nueva-carpeta-error, eliminado, eliminar-fallido; 007: orden-menu, ordenando, ordenado, mas-paginas, cargando-mas, cargar-mas-error; **006 CA-26 a CA-28, Aprobado (2026-10-03)**: carpeta-desglosada, desglosada-ver-mas, desglosando-cargando, desglosada-vacia, desglosada-error, menu-fila-carpeta, menu-fila-archivo, menu-fila-quitar, tope-de-fijados) |
| Resumen de espacio (medidor, plan, desglose por tipo y papelera). Web: `/espacio` con datos reales de `GET /storage/summary` vía `useSpace()` (007 T-10) | storage | 007 | `mockups/storage/resumen-espacio/` | `capturas/storage/resumen-espacio/` | default, cargando, error, tramo-70, tramo-90, cuota-llena, con-papelera | Borrador (default, cargando, error, tramo-70, tramo-90, cuota-llena, con-papelera) |
| Vista general (lienzo con todas las pantallas) | shared | 000b | `mockups/shared/vista-general/` | `capturas/shared/vista-general/` | default | Borrador (referencia) |
| Carga en progreso | storage | 005 | `mockups/storage/carga/` | `capturas/storage/carga/` | progreso, pausa, sin-conexion, rechazo-tamano, rechazo-cuota, tipo-invalido, nombre-repetido, nombre-repetido-varios, confirmar-cancelar; 014: nombre-repetido con «Reemplazar (nueva versión)», nombre-repetido-poda | Borrador (progreso, pausa, sin-conexion, rechazo-tamano, rechazo-cuota, tipo-invalido, nombre-repetido, nombre-repetido-varios, confirmar-cancelar; 014: nombre-repetido y nombre-repetido-varios con tres acciones, nombre-repetido-poda) |
| Papelera | storage | 006 | `mockups/storage/papelera/` | `capturas/storage/papelera/` | default, vacio, cargando, error, seleccion, restaurar-con-aviso, confirmar-eliminar-definitivo, vaciar | Borrador (default de la propuesta; 006: con-elementos, vacia, cargando, error, seleccion, acciones, restaurado, restaurado-con-avisos, confirmar-eliminar, confirmar-vaciar, vaciando, vaciada) |
| Ficha de archivo (detalles, versiones, estado de indexación) | storage | 014, 019 | `mockups/storage/ficha-archivo/` | `capturas/storage/ficha-archivo/` | 014: default, una-version, cargando, error, confirmar-restauracion, aviso-de-poda, restaurando, restaurada, error-cuota, error-version-no-encontrada, no-encontrado, descarga-preparando; 019: no-indexable | Borrador (014: los 12 estados; vision, paquete de diseño interno) |
| Vista previa | storage | 017 | `mockups/storage/vista-previa/` | … | pdf, imagen, no-disponible | Pendiente |
| Búsqueda | storage | 018 | `mockups/storage/busqueda/` | `capturas/storage/busqueda/` | resultados, sin-resultados | Borrador (resultados) |
| Compartir y accesos | sharing | 012 | `mockups/sharing/compartir/` | `capturas/sharing/compartir/` | default, lista-accesos | Borrador (default) |
| Enlace público (creación y página pública) | sharing | 013 | `mockups/sharing/enlace-publico/` | `capturas/sharing/enlace-publico/` | con-contrasena, expirado, revocado | Borrador (con-contrasena) |
| Planes y comparador | billing | 008 | `mockups/billing/planes/` | `capturas/billing/planes/` | default, plan-actual | Borrador (plan-actual) |
| Pago simulado | billing | 009 | `mockups/billing/pago/` | `capturas/billing/pago/` | default, rechazado, exito | Borrador (default) |
| Historial de pagos y facturas | billing | 009 | `mockups/billing/suscripcion/` (misma pantalla) | `capturas/billing/suscripcion/` | default, vacio | Borrador (cubierto por suscripcion) |
| Mi suscripción (renovación, cambio de plan) | billing | 010 | `mockups/billing/suscripcion/` | `capturas/billing/suscripcion/` | vigente, por-vencer, vencida, cambio-programado | Borrador (vigente) |
| Editor .docx con presencia | editing | 016 | `mockups/editing/editor/` | `capturas/editing/editor/` | editando, limite-editores, guardado-fallido, solo-lectura | Borrador (editando) |
| Historial de versiones con autoría | editing | 014, 016 | `mockups/storage/ficha-archivo/` (misma pantalla) | `capturas/storage/ficha-archivo/` | default, restaurando; 016: participantes | Borrador (cubierto por ficha-archivo; participantes con 016) |
| Panel del agente | intelligence | 020 | `mockups/intelligence/panel-agente/` | `capturas/intelligence/panel-agente/` | vacio, respondiendo, con-citas, cita-incierta, limite-alcanzado | Borrador (con-citas) |
| Optimizador | optimizer | 021 | `mockups/optimizer/optimizador/` | `capturas/optimizer/optimizador/` | estimacion, no-conviene, procesando, completado | Borrador (estimacion) |
| Mi actividad (bitácora de auditoría del cliente; entrada en el menú de la cuenta) | audit | 004, 011 | `mockups/audit/mi-actividad/` | `capturas/audit/mi-actividad/` | default, cargando, vacio, vacio-filtros, error, fin-de-lista | Borrador (default, cargando, vacio, vacio-filtros, error, filtrado, rango-invalido, cargando-mas, cargar-mas-error, fin-de-lista, menu-cuenta-abierto) |
| Admin: cuentas y ficha | backoffice | 011 | `mockups/backoffice/admin/` | `capturas/backoffice/admin/` | default, ficha, vacio, cargando, error, confirmar-suspender, suspendida, confirmar-reactivar, propia-cuenta | Aprobado (default, vacio, cargando, error, ficha, confirmar-suspender, suspendida, confirmar-reactivar, propia-cuenta) |
| Admin: alta de cuenta interna | backoffice | 011 | `mockups/backoffice/alta-interna/` | `capturas/backoffice/alta-interna/` | default, error-campos, error-conflicto, enviando, exito | Aprobado (default, error-campos, error-conflicto, enviando, exito) |
| Admin: catálogo de planes | backoffice | 011 | `mockups/backoffice/catalogo/` | `capturas/backoffice/catalogo/` | default, cargando, error, creando, error-campos, exito, confirmar-desactivar, desactivado | Aprobado (default, cargando, error, creando, error-campos, exito, confirmar-desactivar, desactivado) |
| Admin y Operador: métricas agregadas | backoffice | 011 | `mockups/backoffice/metricas/` | `capturas/backoffice/metricas/` | default, cargando, error, con-plan-inactivo, operador | Aprobado (default, cargando, error, con-plan-inactivo, operador) |
| Soporte: metadatos de los archivos de un cliente | backoffice | 011 | `mockups/backoffice/soporte/` | `capturas/backoffice/soporte/` | inicial, default, vacio, cargando, no-encontrado, error, desde-admin | Aprobado (default, inicial, cargando, vacio, no-encontrado, error, desde-admin) |
| Bitácoras técnicas y trabajos (Administrador, Soporte y Operador; PD-74) | backoffice | 022b | `mockups/backoffice/operacion/` | … | sano, con-fallos | Pendiente |

## 8. Verificación de UI

1. **Automática (Playwright)**:
   - recorridos E2E a 360 y 1440 px;
   - `@axe-core/playwright` sin violaciones `serious`/`critical` (dependencia de desarrollo; registrar en ADR-0014);
   - capturas generadas en `e2e/__screenshots__/` (artefacto de pruebas, **no** en `docs/design/capturas/`).
2. **Contra el mockup** (`ui-designer`): comparar las capturas de la implementación con `docs/design/capturas/…` por estado y ancho. Las diferencias intencionales se documentan; las no intencionales son hallazgos.
3. **Manual rápida**: navegación completa con teclado, lector de pantalla en el flujo principal y zoom al 200 %.
