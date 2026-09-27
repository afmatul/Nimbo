# Nimbo — Design System
## Paleta A · Cielo Sereno

> Identidad visual para la plataforma de almacenamiento colaborativo Nimbo.  
> Principio rector: claridad sin agresividad — cada color comunica sin fatigar.

---

## Filosofía

**Cielo Sereno** parte de azules desaturados y neutros fríos. Ningún tono es puro al 100 % de saturación; todos llevan gris mezclado para reducir el cansancio visual en sesiones largas. El resultado es una interfaz que se percibe limpia y confiable sin sentirse clínica.

---

## Tokens de Color

### Colores de Marca

| Token | Nombre | Hex | Uso principal |
|---|---|---|---|
| `--color-primary` | Azul pizarra | `#6B8DD6` | Botones CTA, links, estados activos |
| `--color-primary-dark` | Azul profundo | `#4A6FA5` | Hover de botones, encabezados de sección |
| `--color-accent` | Cian brumoso | `#7EC8D8` | Agente IA, indicadores en tiempo real, badges |

### Colores Semánticos

| Token | Nombre | Hex | Uso principal |
|---|---|---|---|
| `--color-success` | Verde salvia | `#6DB99A` | Subidas exitosas, optimización completada, estado OK |
| `--color-warning` | Ámbar tostado | `#D4A96A` | Cuota al límite, sesión próxima a expirar, alertas suaves |
| `--color-danger` | Rojo arcilla | `#C97B7B` | Errores, eliminación permanente, acciones destructivas |

### Superficies y Fondos

| Token | Nombre | Hex | Uso principal |
|---|---|---|---|
| `--color-bg` | Blanco frío | `#F4F7FB` | Fondo global de la aplicación |
| `--color-card` | Blanco nieve | `#FAFCFF` | Cards, paneles, modales |
| `--color-border` | Gris azulado | `#DDE6F0` | Bordes de cards, separadores, inputs |

### Tipografía y Texto

| Token | Hex | Uso |
|---|---|---|
| `--color-text-primary` | `#1E2D40` | Títulos, labels, texto de peso |
| `--color-text-secondary` | `#3A5068` | Subtítulos, descripciones |
| `--color-text-muted` | `#7A90A8` | Metadatos, fechas, texto desactivado |
| `--color-text-on-primary` | `#FFFFFF` | Texto sobre botones primarios |

### Panel del Agente IA

| Token | Hex | Uso |
|---|---|---|
| `--color-agent-bg` | `#2C3A52` | Fondo del panel del Agente Nimbo |
| `--color-agent-text` | `#D8E4F0` | Texto de respuesta del agente |
| `--color-agent-accent` | `#7EC8D8` | Nombre del agente, citas, pulso en vivo |
| `--color-agent-tag` | `#3A4E6A` | Chips de cita (archivo · página) |

---

## Implementación CSS (Tailwind v4)

Agregar en `src/index.css` dentro de `@theme`:

```css
@import 'tailwindcss';

@theme {
  /* Marca */
  --color-primary:       #6B8DD6;
  --color-primary-dark:  #4A6FA5;
  --color-accent:        #7EC8D8;

  /* Semánticos */
  --color-success:       #6DB99A;
  --color-warning:       #D4A96A;
  --color-danger:        #C97B7B;

  /* Superficies */
  --color-bg:            #F4F7FB;
  --color-card:          #FAFCFF;
  --color-border:        #DDE6F0;

  /* Texto */
  --color-text-primary:   #1E2D40;
  --color-text-secondary: #3A5068;
  --color-text-muted:     #7A90A8;
  --color-text-on-primary: #FFFFFF;

  /* Agente IA */
  --color-agent-bg:      #2C3A52;
  --color-agent-text:    #D8E4F0;
  --color-agent-accent:  #7EC8D8;
  --color-agent-tag:     #3A4E6A;
}
```

---

## Tipografía

| Rol | Fuente | Peso | Tamaño ref. |
|---|---|---|---|
| Encabezados | Inter | 700 – 800 | 20 – 28 px |
| Cuerpo | Inter | 400 – 500 | 13 – 15 px |
| Labels / UI | Inter | 600 | 11 – 13 px |
| Código / rutas | JetBrains Mono | 400 | 12 px |
| Agente IA | Inter | 400 | 12 – 13 px |

> **Nota:** Usar `font-feature-settings: "tnum" 1` en cifras de almacenamiento (MB, GB) para alineación tabular.

> **Nota (26/09/2026):** la fila «Código / rutas · JetBrains Mono» queda reemplazada. Por decisión del diseñador
> principal (Adrián), Inter es la única familia; las cifras y los metadatos usan `tabular-nums`. La regla vigente está
> en `docs/sdd/ui-guidelines.md` §3.

---

## Sombras

| Token | Valor | Uso |
|---|---|---|
| `shadow-card` | `0 1px 3px rgba(74,111,165,0.08), 0 1px 2px rgba(74,111,165,0.04)` | Cards, paneles |
| `shadow-modal` | `0 8px 24px rgba(44,58,82,0.18)` | Modales, dropdowns |
| `shadow-button` | `0 1px 2px rgba(107,141,214,0.20)` | Botones primarios |

---

## Radio de Bordes

| Token | Valor | Uso |
|---|---|---|
| `rounded-sm` | `6px` | Badges, chips, tags |
| `rounded-md` | `10px` | Inputs, botones, íconos de archivo |
| `rounded-lg` | `14px` | Cards, filas de archivo |
| `rounded-xl` | `18px` | Paneles principales, modales |
| `rounded-full` | `999px` | Avatares, barras de progreso, dots |

---

## Iconos de Tipo de Archivo

Usar el color primary con opacidad 12% como fondo del chip, y el color sólido para el texto de la etiqueta:

| Tipo | Color texto | Fondo chip |
|---|---|---|
| `.docx` | `#6B8DD6` | `#6B8DD620` |
| `.xlsx` | `#6DB99A` | `#6DB99A20` |
| `.pptx` | `#D4A96A` | `#D4A96A20` |
| `.pdf` | `#C97B7B` | `#C97B7B20` |
| `.png / .jpg` | `#7EC8D8` | `#7EC8D820` |
| Otro | `#7A90A8` | `#7A90A820` |

---

## Colores de Autoría de Párrafo

Secuencia de 8 colores para identificar colaboradores en el visor de atribución. Todos desaturados para convivir en el mismo bloque de texto:

```
#6B8DD6  #7EC8D8  #6DB99A  #D4A96A
#C97B7B  #9B8ABF  #7BAFC4  #B8A06E
```

---

## Estados de Interacción

| Estado | Transformación |
|---|---|
| Hover (botón primario) | `background: #4A6FA5` — bajar un tono |
| Focus ring | `outline: 2px solid #6B8DD6; outline-offset: 2px` |
| Disabled | `opacity: 0.45; pointer-events: none` |
| Fila activa / seleccionada | `background: #DDE6F0; border-left: 3px solid #6B8DD6` |
| Arrastre (drag over) | `background: #6B8DD610; border: 1.5px dashed #6B8DD6` |

---

## Barra de Cuota de Almacenamiento

| % usado | Color de barra | Mensaje |
|---|---|---|
| 0 – 69 % | `#6DB99A` (success) | Normal |
| 70 – 89 % | `#D4A96A` (warning) | "Tu cuota está al X%" |
| 90 – 100 % | `#C97B7B` (danger) | "Espacio casi agotado" |

---

## Accesibilidad

- Todos los pares texto/fondo cumplen **WCAG AA** (relación de contraste ≥ 4.5:1 en texto normal, ≥ 3:1 en texto grande).
- El color nunca es el único diferenciador de estado — acompañar siempre con ícono o etiqueta textual.
- Respetar `prefers-reduced-motion`: omitir transiciones de entrada en componentes con animación si el usuario lo solicita.
- Interfaz responsive desde **360 px** de ancho mínimo.
