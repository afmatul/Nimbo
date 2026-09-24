# Plan 000b — Sistema de Diseño Cielo Sereno y Fundaciones de UI

> Spec: `./spec.md` · Estado del plan: Aprobado

## 1. Resumen técnico
Esta spec establece la infraestructura de interfaz de usuario en `apps/web` para todo el proyecto Nimbo. Se integra Tailwind CSS v4 y shadcn/ui utilizando como única fuente de verdad `apps/web/src/app/globals.css`, configurando los tokens de la paleta **Cielo Sereno** con los ajustes de contraste AA aprobados en la spec (DF-41 a DF-45). Se configuran las fuentes tipográficas `Inter` y `JetBrains Mono` mediante `next/font/google` en `apps/web/src/app/layout.tsx`. Se implementa una suite de componentes atómicos base (`Button`, `Input`, `Card`, `Badge`) y componentes de dominio de Nimbo (`FileTypeChip`, `CitationChip`, `StateView`), un layout base responsivo desde 360 px con menú accesible, y pruebas automatizadas de renderizado y accesibilidad con `jest-axe`.

## 2. Verificación contra la constitución
| Artículo | Cumple | Nota |
|---|---|---|
| I Spec manda | ☑ | El plan satisface exactamente los CA-1 a CA-7 de `spec.md`. |
| IV SOLID | ☑ | Componentes atómicos segregados con variantes declarativas (CVA); SRP respetado. |
| V YAGNI | ☑ | Sin modo oscuro global ni dependencias innecesarias; solo los tokens y componentes requeridos por Fase 1. |
| VI DRY | ☑ | Una única fuente de tokens: `apps/web/src/app/globals.css`. Prohibidos valores hexadecimales en componentes. |
| VIII Fronteras | ☑ | Restringido exclusivamente al paquete frontend `apps/web`. No altera backend, contratos ni base de datos. |
| IX Seguridad | ☑ | No maneja secretos ni datos sensibles de usuario; componentes puramente visuales de cliente. |
| X Operabilidad | ☑ | Accesibilidad WCAG 2.1 AA automatizada y auditada en suite de pruebas. |
| XI Integridad | ☑ | No aplica a componentes UI. |
| XII Degradación | ☑ | Soporte estricto para `prefers-reduced-motion: reduce` y pantallas móviles desde 360 px. |

## 3. Coherencia con los diagramas
| Diagrama | Clases / tablas usadas | ¿Se aparta del diagrama? | Acción |
|---|---|---|---|
| Clases (M1 a M8) | Ninguna (spec frontend) | No | Ninguna |
| E-R | Ninguna | No | Ninguna |
| Arquitectura | `web (Next.js)` | No | Implementa la capa de presentación web mostrada en `architecture.md` |

Hallazgos `DF-xx` resueltos:
- **DF-41**: Botones primarios y links ajustados a `#4A6FA5` (hover `#3B5A8A`) para lograr contraste ≥ 4.5:1.
- **DF-42**: `text-muted` ajustado a `#5E7389` para legibilidad de metadatos en fondos claros.
- **DF-43**: Textos semánticos (éxito, advertencia, peligro) y botón destructivo con tonos oscurecidos accesibles.
- **DF-44**: Chips de tipo de archivo con texto oscuro contrastado y fondo al 12%.
- **DF-45**: Borde de inputs en `#7F93AA` cumpliendo WCAG 1.4.11 (≥ 3.0:1 no-texto).
- **DF-47**: Integración de tokens en `apps/web/src/app/globals.css` mapeando variables de shadcn/ui y tokens propios de Nimbo.
- **DF-48**: Verificación formal de contraste en las pruebas de UI.

## 3b. Módulos afectados
| Módulo | Cambio | Capa(s) |
|---|---|---|
| `apps/web` | Configuración de estilos, tipografías, componentes base y pruebas de accesibilidad | Presentación (Frontend) |

Dependencias nuevas entre módulos: Ninguna.

## 4. Modelo de datos
No aplica. No se crean tablas ni migraciones de base de datos.

## 5. Contratos
### HTTP / Eventos / Socket.IO
No aplica. Los contratos de API ya existen en `@nimbo/contracts` y no se modifican en esta spec.

## 6. Diseño de componentes
### 6.1 Dependencias a incorporar en `apps/web/package.json`
- `tailwindcss` y `@tailwindcss/postcss`: Motor de estilos v4.
- `clsx` y `tailwind-merge`: Utilidad `cn(...)` para concatenación condicional de clases.
- `class-variance-authority`: Definición declarativa de variantes en componentes (`Button`, `Badge`).
- `lucide-react`: Catálogo de íconos SVG accesibles.
- `jest-axe`: Extensión de Jest para aserciones de accesibilidad WCAG.

### 6.2 Archivos de estilos y configuración
- **`apps/web/postcss.config.mjs`**: Configuración de PostCSS con `@tailwindcss/postcss`.
- **`apps/web/src/app/globals.css`**: Única fuente de verdad de tokens (`:root`, `@theme inline`, `@media (prefers-reduced-motion: reduce)`).
- **`apps/web/src/lib/utils.ts`**: Helper `cn(...inputs: ClassValue[])`.

### 6.3 Tipografías en `apps/web/src/app/layout.tsx`
- Carga optimizada de Google Fonts mediante `next/font/google`:
  - `Inter` asignada a variable `--font-inter`.
  - `JetBrains_Mono` asignada a variable `--font-jetbrains-mono`.
- Atributos `lang="es"` y clases en `body`: `font-sans antialiased bg-background text-foreground`.

### 6.4 Componentes base (`apps/web/src/components/ui/`)
1. **`button.tsx`**:
   - Variantes: `default` (`bg-primary text-primary-foreground hover:bg-primary-hover`), `destructive` (`bg-destructive text-white hover:bg-destructive/90`), `outline`, `secondary`, `ghost`, `link`.
   - Tamaños: `default` (h-10 px-4), `sm` (h-9 px-3), `lg` (h-11 px-8), `icon` (h-10 w-10).
   - Accesibilidad: Anillo de foco visible `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`, `disabled:opacity-45`, soporte de estado `loading` con spinner e indicador para lectores de pantalla.
2. **`input.tsx`**:
   - Estilo: Borde `#7F93AA` (`border-input`), fondo `#FAFCFF` (`bg-card`), radio `rounded-md`.
   - Accesibilidad: Foco con anillo `ring-ring`, indicador `aria-invalid` cuando hay error.
3. **`card.tsx`**:
   - `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`.
   - Radio `rounded-lg` (14 px), sombra suave `shadow-card`, borde decorativo `border-border`.
4. **`badge.tsx`**:
   - Variantes: `default`, `secondary`, `destructive`, `outline`.
   - Radio `rounded-sm` (6 px).

### 6.5 Componentes de dominio Nimbo (`apps/web/src/components/nimbo/`)
1. **`file-type-chip.tsx`** (`FileTypeChip`):
   - Mapeo de tipos: `.docx`, `.xlsx`, `.pptx`, `.pdf`, `image`, `other`.
   - Estilo: Texto oscuro contrastado (≥ 4.5:1) con fondo al 12% (`DF-44`). Ícono representativo + etiqueta.
2. **`citation-chip.tsx`** (`CitationChip`):
   - Chip de cita documental para el panel del agente (`bg-agent-tag`, texto `agent-text`, borde `agent-accent/40`).
   - Muestra `archivo · pág. X` con soporte para foco y clic.
3. **`state-view.tsx`** (`StateView`):
   - Vista reutilizable de tres estados: `empty` (vacío con ilustración/ícono), `loading` (con spinner y texto accesible), y `error` (con mensaje claro y botón de acción correctiva tipo «Reintentar», cumpliendo RNF-14).
4. **`app-layout.tsx`** (`AppLayout`):
   - Layout responsivo con barra superior (header), barra lateral de navegación (sidebar) colapsable en móvil (< 768 px) mediante menú hamburguesa, y área principal de contenido sin desbordamiento horizontal a 360 px.

## 7. Observabilidad
- Accesibilidad: 0 violaciones reportadas por axe en la suite de pruebas.
- No hay métricas Prometheus ni eventos Pino en el frontend en esta fase (se integran con la spec 022).

## 8. Estrategia de pruebas
| Criterio | Nivel | Archivo propuesto | Qué valida |
|---|---|---|---|
| CA-1, CA-2 | unit | `apps/web/src/app/globals.spec.ts` | Existencia de todas las variables CSS de tokens y verificación matemática de contraste WCAG AA |
| CA-3 | unit | `apps/web/src/app/layout.spec.tsx` | Layout renderiza las variables de fuente `Inter` y `JetBrains Mono` y el idioma `es` |
| CA-4 | unit | `apps/web/src/components/ui/button.spec.tsx` | Renderizado de variantes de Button, estados hover/focus/disabled/loading |
| CA-4 | unit | `apps/web/src/components/ui/input.spec.tsx` | Renderizado de Input, atributos de accesibilidad y foco |
| CA-4 | unit | `apps/web/src/components/ui/card.spec.tsx` | Renderizado de Card y sus subcomponentes |
| CA-4 | unit | `apps/web/src/components/nimbo/file-type-chip.spec.tsx` | Colores y etiquetas de chips de archivo según extensión |
| CA-4, RNF-14 | unit | `apps/web/src/components/nimbo/state-view.spec.tsx` | Estados vacío, cargando y error con botón de acción correctiva |
| CA-4 | unit | `apps/web/src/components/nimbo/citation-chip.spec.tsx` | Renderizado y accesibilidad del chip de cita en entorno oscuro |
| CA-5, CA-6 | unit / render | `apps/web/src/components/nimbo/app-layout.spec.tsx` | Layout responsivo a 360 px y respeto a `prefers-reduced-motion` |
| CA-7 | a11y | `apps/web/src/components/a11y.spec.tsx` | Cero violaciones con `jest-axe` en la galería de componentes base |

## 9. Riesgos y mitigaciones
| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Incompatibilidad de Tailwind v4 con SWC de Next.js 15 | Baja | Media | Uso del plugin oficial `@tailwindcss/postcss` y configuración limpia en `postcss.config.mjs`. |
| Conflictos de fuentes de Google en entornos sin conexión a Internet (CI) | Baja | Baja | `next/font` utiliza fallback automático a fuentes locales del sistema (`system-ui`, `ui-monospace`). |
| Regresiones en contraste al diseñar nuevas pantallas | Media | Alta | Regla dura: prohibido usar hex en línea; `jest-axe` en la suite de pruebas como compuerta de integración. |

## 10. Decisiones
- **ADR-0014**: Se adopta Tailwind CSS v4 + componentes estilo shadcn/ui con tokens personalizados de Cielo Sereno en `globals.css`.
- **DF-41 a DF-45**: Se aplican los valores de contraste corregidos como únicos tokens de texto y controles interactivos.

## 11. Aprobación de arquitectura
> Subagente: `architect`
- **Veredicto**: Aprobado
- **Observaciones**:
  1. La especificación respeta el aislamiento del frontend en `apps/web` y no introduce acoplamiento indebido con el backend ni altera contratos de red.
  2. La centralización de tokens en `globals.css` cumple con el artículo VI (DRY) y resuelve formalmente los hallazgos DF-41 a DF-48.
  3. La inclusión de `jest-axe` garantiza la verificación cuantitativa del requisito RNF-13.
