# ADR-0014 — Tokens de Cielo Sereno ajustados a WCAG AA, mapeados a Tailwind v4 y shadcn/ui

| Campo | Valor |
|---|---|
| Estado | Propuesto |
| Fecha | 2026-09-22 |
| Decisores | Fátima (diseño y frontend), Adrián (architect), equipo Nimbo |
| Specs relacionadas | 000b (DF-41 a DF-48, CA-1 a CA-7, RNF-13, RNF-14) |

## Contexto

El sistema de diseño visual de Nimbo («Cielo Sereno») define una paleta sobria de baja saturación con superficies azuladas y neutras. Sin embargo, la auditoría inicial de accesibilidad (hallazgos DF-41 a DF-48) detectó que los contrastes preliminares de botones principales, textos atenuados, colores semánticos y bordes de control no alcanzaban el ratio mínimo 4.5:1 exigido por WCAG 2.1 AA (RNF-13).

Además, se requería una infraestructura de componentes en `apps/web` (Next.js 15) que permitiera construir rápidamente pantallas responsivas desde 360 px (CA-5), garantizando cero colores hexadecimales en línea, foco visible consistente y ausencia de regresiones de accesibilidad durante el desarrollo.

## Opciones consideradas

1. **Tailwind CSS v4 + variables CSS nativas en `globals.css` mapeadas a utilidades semánticas y componentes estilo shadcn/ui (Elegida)**
   - *Pros:* Variables CSS nativas en `:root` y `@theme inline` como única fuente de verdad; sin dependencias pesadas de runtime; componentes accesibles y personalizables en código fuente sin sobrecarga; compatible con Server Components de Next.js; soporte nativo de `prefers-reduced-motion` y `tabular-nums`.
   - *Contras:* Tailwind v4 es reciente y requirió configurar `@tailwindcss/postcss` para compatibilidad limpia con el compilador.
2. **Biblioteca de componentes monolítica externa (ej. MUI, Ant Design, Mantine)**
   - *Pros:* Componentes prehechos y listos para usar.
   - *Contras:* Alto peso en el bundle cliente; sobreescribe tokens con su propio motor de estilos (Emotion/CSS-in-JS); muy difícil de adaptar con precisión a la paleta estricta de Cielo Sereno y a la regla de cero dependencias sobrantes.
3. **CSS Modules o Vanilla Extract manual por componente**
   - *Pros:* Estándar y desacoplado.
   - *Contras:* Mayor fricción y duplicación de código; riesgo elevado de reintroducir colores hexadecimales dispersos; desarrollo significativamente más lento para un equipo de 4 personas con plazo de 10 semanas.

## Decisión

Se adopta **Tailwind CSS v4 + componentes base estilo shadcn/ui**, organizados bajo las siguientes reglas:
1. **Única fuente de verdad:** Todos los tokens de Cielo Sereno residen exclusivamente en `apps/web/src/app/globals.css`. Los ajustes matemáticos de DF-41 a DF-45 garantizan ratios WCAG AA (≥ 4.5:1 para texto normal y ≥ 3.0:1 para controles y focos).
2. **Verificación automatizada:** Se introducen pruebas unitarias automatizadas con lectura directa del archivo CSS para evaluar contraste matemático, pruebas de renderizado DOM con `jsdom`, y auditorías de accesibilidad con `axe-core` para asegurar 0 violaciones WCAG AA.
3. **Ergonomía táctil y teclado:** Todo control interactivo (`Button`, `Input`, `StateView`, etc.) mantiene una altura o área de interacción mínima de 44 px (h-11) y anillos de foco visibles (`focus-visible:ring-2`).

## Consecuencias

- **Positivas:** Estilo visual unificado en todo el frontend; prevención de desalineaciones cromáticas; pruebas en CI que bloquean cualquier intento de reintroducir colores no accesibles o controles subdimensionados.
- **Negativas / deuda aceptada:** Los nuevos desarrolladores deben ceñirse estrictamente a las clases semánticas de Tailwind (`text-muted-foreground`, `bg-card`, `border-input`, etc.) y tienen prohibido el uso de valores arbitrarios entre corchetes (`bg-[#...]`) o colores genéricos de Tailwind.
- **Cómo sabremos si fue un error:** Si la suite de pruebas con `axe-core` o los tests de contraste en CI generan fricción indebida o si surgen incompatibilidades de rendimiento en producción con Next.js 15.
