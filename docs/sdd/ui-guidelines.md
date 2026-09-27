# Guía de UI — cómo aplicar Cielo Sereno en Nimbo

> Fuente original: `docs/design/design-system/design-cielo-sereno.md`.
> Este archivo dice **cómo** se implementa ese sistema en `apps/web` (Next.js + Tailwind v4 + shadcn/ui) y qué ajustes
> exigen los requisitos. Guardián: subagente `ui-designer`.
> Prioridad ante conflictos: **RNF-13 (AA, 360 px, español) > esta guía > design-cielo-sereno.md > mockup**.

## 1. Principios

1. **Claridad sin agresividad**: azules desaturados, neutros fríos y poco ruido. Nada de colores saturados al 100 %.
2. **El color nunca es el único diferenciador**: siempre va acompañado de ícono, etiqueta o texto (estados, cuota, tipos de archivo, participantes).
3. **Una sola fuente de tokens**: `apps/web/src/app/globals.css`. Los componentes usan utilidades de Tailwind (`bg-primary`, `text-muted-foreground`), **nunca hex** ni valores arbitrarios (`bg-[#6B8DD6]`).
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
  --font-mono: var(--font-jetbrains-mono), ui-monospace, monospace;

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

- Las fuentes se cargan con `next/font/google` (`Inter`, `JetBrains_Mono`) en `app/layout.tsx`, exponiendo `--font-inter` y `--font-jetbrains-mono`.
- Cifras de almacenamiento, precios y fechas en tablas: clase `tabular-nums`.
- Después de `npx shadcn add`, revisar el radio de cada componente: en Cielo Sereno las cards son `rounded-lg` (14 px) y los modales `rounded-xl` (18 px).
- No hay modo oscuro en el alcance (YAGNI). El panel del agente es una superficie oscura puntual, no un tema.

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
| `FileTypeChip` | Tipo de archivo en listas y fichas | Mapa único tipo → tokens `--file-*`; muestra la extensión en texto |
| `QuotaBar` | Medidor de cuota (RF-12) | 0–69 % `success`, 70–89 % `warning` con «Tu cuota está al X %», 90–100 % `destructive-soft` con «Espacio casi agotado»; siempre muestra el porcentaje y los GB en texto; `role="progressbar"` |
| `UploadProgress` | Carga por partes (RF-08) | Porcentaje, bytes, reanudar/cancelar; `aria-live="polite"` |
| `StatusBadge` | Estados de indexación, sesión, suscripción, trabajo | Ícono + etiqueta; nunca solo color |
| `EmptyState` / `ErrorState` | Estados de pantalla | El error muestra la acción correctiva que envía la API (RNF-14) |
| `ReadOnlyBanner` | Suscripción vencida (RF-23) | Visible en todas las vistas de escritura, con enlace a renovar |
| `ConfirmDestructiveDialog` | Eliminar definitivamente, revocar accesos | Botón `destructive`, texto explícito de la consecuencia |
| `ParticipantAvatar` / `PresenceStack` | Presencia en edición (RF-26) e historial (RF-29) | Color de la secuencia de 8 como **anillo**; iniciales en `text-foreground` sobre `bg-card`; nombre en tooltip y para lectores de pantalla |
| `VersionTimeline` | Historial con autoría (RF-29) | Fecha, participantes, variación de tamaño, origen (carga/edición/restauración/optimización), botón restaurar |
| `AccessList` | Accesos vigentes (RF-18) | Nivel en texto; revocar con confirmación |
| `AgentPanel` | Agente (RF-32) | Superficie `bg-agent-bg`; streaming con `aria-live`; indicador en vivo `agent-accent` (sin animación si reduced-motion) |
| `CitationChip` | Cita del agente | «archivo · página 3», etiqueta de `SourceLocation.label()`; navegable; aviso visible si la ubicación no es certera |
| `PlanCard` / `PlanComparison` | Catálogo y comparador (RF-19) | Precio en quetzales con `tabular-nums`; límites desde la API, nunca escritos en el frontend |

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
> Los mockups `Borrador` provienen de Claude Design (`.dc.html`) y solo cubren los estados entre paréntesis;
> el resto de estados mínimos se agregan con `/mockup` antes de aclarar la spec. Cada carpeta tiene un `README.md`.

| Pantalla | Módulo | Spec | Mockup | Capturas | Estados mínimos | Mockup |
|---|---|---|---|---|---|---|
| Registro | identity | 001 | `mockups/identity/registro/` | `capturas/identity/registro/` | default, error, exito | Pendiente |
| Verificar correo | identity | 001 | `mockups/identity/verificar-correo/` | `capturas/identity/verificar-correo/` | exito, enlace-expirado | Pendiente |
| Inicio de sesión | identity | 002 | `mockups/identity/inicio-sesion/` | `capturas/identity/inicio-sesion/` | default, error, enviando, bloqueado, no-verificado, suspendida | Borrador (default; los demás estados por decisión explícita, spec 002 §11) |
| Recuperar / restablecer contraseña | identity | 002 | — (reutiliza pedir-enlace, exito, enlace-expirado, enlace-invalido y ya-verificado de 001) | — | pedir, correo-enviado, contrasena-nueva, enlace-expirado, enlace-invalido, exito | Decisión explícita (spec 002 §11) |
| Seguridad (sesiones y contraseña) | identity | 002 | `mockups/identity/seguridad/` | `capturas/identity/seguridad/` | default, sin-otras-sesiones, confirmar-cierre, cerrar-demas, cambiar-contrasena | Pendiente |
| Layout de la app (navegación, cuota lateral) | shared | 000b | `mockups/shared/layout/` | … | default, solo-lectura | Pendiente |
| Explorador de archivos | storage | 005–007 | `mockups/storage/explorador/` | `capturas/storage/explorador/` | default, vacio, cargando, arrastre, seleccion | Borrador (cuadricula, lista) |
| Resumen de espacio (cuota, consultas, renovación) | storage | 007 | `mockups/storage/resumen-espacio/` | `capturas/storage/resumen-espacio/` | default | Borrador (default) |
| Vista general (lienzo con todas las pantallas) | shared | 000b | `mockups/shared/vista-general/` | `capturas/shared/vista-general/` | default | Borrador (referencia) |
| Carga en progreso | storage | 005 | `mockups/storage/carga/` | … | progreso, reanudar, rechazo-cuota, tipo-invalido | Pendiente |
| Papelera | storage | 006 | `mockups/storage/papelera/` | `capturas/storage/papelera/` | default, vacio | Borrador (default) |
| Ficha de archivo (detalles, versiones, estado de indexación) | storage | 014, 019 | `mockups/storage/ficha-archivo/` | … | default, no-indexable | Pendiente |
| Vista previa | storage | 017 | `mockups/storage/vista-previa/` | … | pdf, imagen, no-disponible | Pendiente |
| Búsqueda | storage | 018 | `mockups/storage/busqueda/` | `capturas/storage/busqueda/` | resultados, sin-resultados | Borrador (resultados) |
| Compartir y accesos | sharing | 012 | `mockups/sharing/compartir/` | `capturas/sharing/compartir/` | default, lista-accesos | Borrador (default) |
| Enlace público (creación y página pública) | sharing | 013 | `mockups/sharing/enlace-publico/` | … | con-contrasena, expirado, revocado | Pendiente |
| Planes y comparador | billing | 008 | `mockups/billing/planes/` | `capturas/billing/planes/` | default, plan-actual | Borrador (default) |
| Pago simulado | billing | 009 | `mockups/billing/pago/` | … | default, rechazado, exito | Pendiente |
| Historial de pagos y facturas | billing | 009 | `mockups/billing/suscripcion/` (misma pantalla) | `capturas/billing/suscripcion/` | default, vacio | Borrador (cubierto por suscripcion) |
| Mi suscripción (renovación, cambio de plan) | billing | 010 | `mockups/billing/suscripcion/` | `capturas/billing/suscripcion/` | vigente, por-vencer, vencida, cambio-programado | Borrador (vigente) |
| Editor .docx con presencia | editing | 016 | `mockups/editing/editor/` | `capturas/editing/editor/` | editando, limite-editores, guardado-fallido, solo-lectura | Borrador (editando) |
| Historial de versiones con autoría | editing | 014, 016 | `mockups/editing/historial/` | … | default, restaurando | Pendiente |
| Panel del agente | intelligence | 020 | `mockups/intelligence/panel-agente/` | `capturas/intelligence/panel-agente/` | vacio, respondiendo, con-citas, cita-incierta, limite-alcanzado | Borrador (con-citas) |
| Optimizador | optimizer | 021 | `mockups/optimizer/optimizador/` | `capturas/optimizer/optimizador/` | estimacion, no-conviene, procesando, completado | Borrador (estimacion) |
| Mi bitácora de auditoría | backoffice | 004 | `mockups/backoffice/mi-auditoria/` | … | default, vacio | Pendiente |
| Admin: cuentas y catálogo | backoffice | 011 | `mockups/backoffice/admin/` | … | default | Pendiente |
| Soporte: metadatos y operaciones | backoffice | 011 | `mockups/backoffice/soporte/` | … | default (sin contenido de archivos) | Pendiente |
| Operador: estado y colas | backoffice | 022 | `mockups/backoffice/operacion/` | … | sano, con-fallos | Pendiente |

## 8. Verificación de UI

1. **Automática (Playwright)**:
   - recorridos E2E a 360 y 1440 px;
   - `@axe-core/playwright` sin violaciones `serious`/`critical` (dependencia de desarrollo; registrar en ADR-0014);
   - capturas generadas en `e2e/__screenshots__/` (artefacto de pruebas, **no** en `docs/design/capturas/`).
2. **Contra el mockup** (`ui-designer`): comparar las capturas de la implementación con `docs/design/capturas/…` por estado y ancho. Las diferencias intencionales se documentan; las no intencionales son hallazgos.
3. **Manual rápida**: navegación completa con teclado, lector de pantalla en el flujo principal y zoom al 200 %.
