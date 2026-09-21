# Spec 000b — Sistema de Diseño Cielo Sereno y Fundaciones de UI

| Campo | Valor |
|---|---|
| Estado | Borrador |
| Dueño | Fátima (4) |
| Fase | 1 |
| Requisitos | RNF-13, RNF-14 |
| Depende de | 000 |
| Última actualización | 2026-09-20 |

## 1. Contexto y problema
Nimbo requiere una identidad visual coherente y accesible desde el inicio de la Fase 1 para que todos los módulos (`identity`, `storage`, `sharing`, `billing`, `backoffice`, etc.) compartan componentes de interfaz consistentes, tipografías y reglas de accesibilidad sin duplicar esfuerzos ni inventar estilos arbitrarios. La propuesta de diseño original «Cielo Sereno» (`docs/design/design-system/design-cielo-sereno.md`) presentaba problemas críticos de contraste (hallazgos DF-41 a DF-45) que impiden cumplir WCAG 2.1 AA (RNF-13) si no se ajustan los tonos de texto, bordes de controles e interactivos.

## 2. Objetivo
Establecer la infraestructura visual completa en `apps/web` (Next.js + Tailwind v4 + shadcn/ui): tokens de color Cielo Sereno con contraste AA verificado, tipografías (`Inter` y `JetBrains Mono`), layout base responsivo (desde 360 px), componentes atómicos y de dominio base (`components/nimbo/`), y validación automatizada de accesibilidad (axe).

## 3. Actores
- **Cliente**: Usuario final que interactúa con la plataforma desde cualquier dispositivo (móvil o escritorio).
- **Desarrollador / Diseñador del equipo**: Constructor de módulos que consume los tokens y componentes base para crear las interfaces de cada spec.
- **Sistema (Pruebas E2E / CI)**: Validador automatizado que asegura cero violaciones de accesibilidad WCAG AA.

## 4. Historias de usuario
- **HU-1**: Como usuario de Nimbo, quiero ver una interfaz visualmente limpia, agradable y accesible, para interactuar con la plataforma cómodamente sin fatiga visual y con elementos claramente legibles en cualquier tamaño de pantalla.
- **HU-2**: Como usuario con capacidades visuales reducidas o preferencias de accesibilidad, quiero que los textos, botones y controles interactivos cumplan con contraste mínimo 4.5:1 (WCAG AA) y respeten `prefers-reduced-motion`, para navegar de forma inclusiva y sin barreras.
- **HU-3**: Como desarrolladora de Nimbo, quiero disponer de una biblioteca de tokens y componentes base bien documentada en `apps/web`, para construir las pantallas de las specs (login, explorador, planes) usando únicamente tokens semánticos sin escribir valores hexadecimales arbitrarios.

## 5. Criterios de aceptación
- **CA-1** (HU-3, RNF-13) — Configuración central de tokens en `globals.css`
  - **Dado** el archivo `apps/web/src/app/globals.css`,
  - **Cuando** se compila el proyecto y se evalúan las variables CSS de Tailwind v4 y shadcn/ui,
  - **Entonces** todos los tokens de Cielo Sereno (colores primarios, semánticos, neutros, superficies y panel del agente) están definidos como variables CSS sin valores hexadecimales directos en componentes (`DF-47`).

- **CA-2** (HU-2, RNF-13) — Cumplimiento de contraste WCAG 2.1 AA (DF-41 a DF-45)
  - **Dado** cualquier elemento interactivo o texto de la interfaz,
  - **Cuando** se mide el contraste de luminancia relativa según WCAG 2.1:
    - Botones CTA y enlaces interactivos utilizan `#4A6FA5` (hover `#3B5A8A`), logrando contraste ≥ 4.5:1 con fondo blanco.
    - Texto atenuado (`text-muted`) utiliza `#5E7389`, logrando contraste ≥ 4.5:1 sobre fondo claro.
    - Textos semánticos de éxito, advertencia y peligro utilizan `#3A7560`, `#8A6424` y `#A34F4F` respectivamente (contraste ≥ 4.5:1).
    - Botón de acción destructiva utiliza `#A34F4F` con texto blanco (contraste ≥ 4.5:1).
    - Bordes de controles interactivos (inputs) utilizan `#7F93AA`, logrando contraste no-texto ≥ 3.0:1 (WCAG 1.4.11).
  - **Entonces** ningún texto o control interactivo falla el criterio de contraste AA.

- **CA-3** (HU-1, RNF-13) — Tipografía tipada e integrada
  - **Dado** el layout raíz de Next.js (`layout.tsx`),
  - **Cuando** se cargan las fuentes de la aplicación,
  - **Entonces** la tipografía principal es `Inter` (sans) y la tipografía para metadatos/código/cifras es `JetBrains Mono` (mono), cargadas mediante `next/font` de forma optimizada y con cifras tabulares (`tabular-nums` / `tnum`).

- **CA-4** (HU-1, HU-3, RNF-13) — Componentes base (`components/nimbo` y shadcn)
  - **Dado** el directorio `apps/web/src/components/`,
  - **Cuando** un desarrollador importa componentes base:
    - `Button`: variantes `primary`, `destructive`, `secondary`, `outline`, `ghost`, `link`, con tamaños estándar y estados `hover`, `focus-visible` (anillo de foco `#4A6FA5`), `disabled` y `loading`.
    - `Input`: campo de texto con borde `#7F93AA`, foco visible y estados de error con mensaje accesible.
    - `Card`: contenedor con fondo `#FAFCFF`, borde `#DDE6F0` y padding responsivo.
    - `Badge`: chips de estado y chips de tipo de archivo (`.docx`, `.xlsx`, `.pptx`, `.pdf`, imagen, otro) con texto oscuro contrastado y fondo al 12% (`DF-44`).
    - `AgentQuoteChip`: chip de cita documental del agente IA con estilo para el panel oscuro (`#2C3A52`, texto claro y cita).
    - `StateView`: componente reutilizable para estados `empty` (vacío), `loading` (carga con indicador accesible), y `error` (con mensaje claro y botón de acción correctiva, RNF-14).
  - **Entonces** cada componente cuenta con sus pruebas unitarias/de renderizado y no utiliza valores hexadecimales en línea.

- **CA-5** (HU-1, RNF-13) — Responsividad móvil desde 360 px
  - **Dado** un dispositivo con ancho de viewport de 360 px (p. ej. Galaxy S8 / iPhone SE en móvil estrecho),
  - **Cuando** se visualiza el layout base de Nimbo (encabezado, barra de navegación/sidebar y contenido),
  - **Entonces** no existe desbordamiento horizontal (`overflow-x`), los elementos interactivos tienen un área táctil mínima de 44x44 px y la barra lateral se colapsa en un menú accesible (drawer/hamburguesa).

- **CA-6** (HU-2, RNF-13) — Animaciones y movimiento reducido
  - **Dado** un usuario que tiene activada la preferencia de accesibilidad `prefers-reduced-motion: reduce` en su sistema,
  - **Cuando** navega por la interfaz y se activan transiciones o animaciones,
  - **Entonces** las transiciones se desactivan o sustituyen por transiciones instantáneas sin efectos de movimiento.

- **CA-7** (HU-2, RNF-13) — Auditoría automatizada de accesibilidad (axe)
  - **Dado** el árbol de componentes y la página base de estado/inicio,
  - **Cuando** se ejecutan las pruebas de accesibilidad con `jest-axe` o `axe-core`,
  - **Entonces** el reporte devuelve 0 violaciones de reglas WCAG 2.1 nivel AA.

## 6. Reglas de negocio
- **RN-1**: El color nunca debe ser el único medio para transmitir información (éxito, error, advertencia, tipo de archivo o cuota); siempre debe ir acompañado de ícono, texto explicativo o badge legible.
- **RN-2**: La única fuente de verdad para estilos y colores es `apps/web/src/app/globals.css`. Queda estrictamente prohibido usar utilidades con valores arbitrarios de Tailwind (p. ej. `bg-[#6B8DD6]` o `text-[#1E2D40]`).
- **RN-3**: Los mensajes de estado y error deben estar en español, usando el trato de tuteo y proporcionando siempre una acción correctiva (RNF-14).

## 7. Requisitos no funcionales aplicables
| RNF | Cómo aplica aquí | Cómo se verifica |
|---|---|---|
| RNF-13 | Usable desde 360 px, interfaz en español, contraste WCAG AA en todos los elementos interactivos y textos | Pruebas automáticas con `jest-axe`, inspección de contraste y pruebas responsivas en Jest |
| RNF-14 | Todo estado de error debe tener acción correctiva; estados de carga para operaciones > 2 s | Pruebas de componentes `StateView` con variantes de error y loading |

## 8. Seguridad y privacidad
- ¿Toca contenido de archivos? No.
- ¿Qué acciones van a auditoría (RF-07)? Ninguna (son componentes visuales cliente).
- ¿Qué operaciones requieren límite de tasa? No aplica.
- ¿Qué NO debe aparecer en bitácoras? No aplica a componentes UI.

## 9. Experiencia de usuario
| Pantalla / Componente | Mockup | Capturas | Estados requeridos | Estado del mockup |
|---|---|---|---|---|
| Layout base y navegación | `docs/design/mockups/` | `docs/design/capturas/` | desktop (sidebar expandida), móvil 360px (menú colapsado) | Aprobado |
| Componentes base `nimbo/` | `docs/design/design-system/` | — | default, hover, focus-visible, active, disabled, loading, error | Aprobado |
| Panel del Agente (estilo oscuro) | `docs/design/mockups/agente/` | — | default, con citas, expandido/colapsado | Aprobado |

- Mensajes clave (español, tuteo, con acción correctiva):
  - Botón de reintento: «Reintentar»
  - Carga: «Cargando información...»
  - Estado vacío: «No hay elementos disponibles para mostrar»
- Diferencias aceptadas respecto al mockup:
  - Se sustituyen los tonos de texto y botones que no cumplían AA por los tonos corregidos de DF-41 a DF-45 (`#4A6FA5` para botones primarios en vez de `#6B8DD6`, etc.).

## 10. Fuera de alcance
- No incluye lógica de negocio ni llamadas a la API de backend (eso corresponde a cada spec funcional: 001, 005, etc.).
- No incluye pantallas completas de explorador de archivos ni editor de ONLYOFFICE (se construirán en las specs 005-007 y 016).
- Fuera de alcance el modo oscuro global en esta fase (Cielo Sereno define tema claro para la app y tema oscuro encapsulado exclusivamente para el panel del Agente IA).

## 11. Preguntas
- [ABIERTA] ¿Confirmamos la instalación de `clsx`, `tailwind-merge`, `class-variance-authority` y `lucide-react` para la base de componentes accesibles tipo shadcn en `apps/web`? — bloquea: no.
- [RESUELTA] ¿Qué tonos se usarán para resolver el contraste en botones primarios y links? → Se adoptan `#4A6FA5` (primario) y `#3B5A8A` (hover) según DF-41 y `ui-guidelines.md` §2. (2026-09-20, Fátima)
- [RESUELTA] ¿Se mantendrán los colores decorativos originales? → Sí, `#6B8DD6`, `#6DB99A`, etc., se reservan para íconos grandes, barras de progreso e ilustraciones donde no hay texto superpuesto. (2026-09-20, Fátima)

## 12. Registro de cambios
| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-09-20 | Creación del borrador de la spec | Inicio de implementación de la base de diseño para la Fase 1 | Fátima |
