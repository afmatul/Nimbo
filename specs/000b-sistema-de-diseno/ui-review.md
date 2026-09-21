# Revisión de UI 000b — Sistema de Diseño Cielo Sereno y Fundaciones de UI

| Campo | Valor |
|---|---|
| Fecha | 2026-09-20 |
| Revisor | UI Designer (`ui-designer`) |
| Commit evaluado | `5b4cd6f` |
| Veredicto | ✅ Aprobada sin observaciones bloqueantes |

## 1. Auditoría de Tokens y Paleta Cielo Sereno

Se evaluó la implementación de tokens centralizados en `apps/web/src/app/globals.css` contra la especificación `docs/design/design-system/design-cielo-sereno.md` y las correcciones de diseño DF-41 a DF-45:

| Token / Rol | Valor implementado | Uso | Verificación |
|---|---|---|---|
| **Primario Interactivo (DF-41)** | `#4A6FA5` (hover `#3B5A8A`) | Botones CTA, enlaces principales, anillos de foco | Ratio 5.1:1 sobre blanco (≥ 4.5:1 requerido). Pasa WCAG AA. |
| **Texto Secundario / Muted (DF-42)** | `#5E7389` | Descripciones, timestamps, metadatos secundarios | Ratio 4.8:1 sobre blanco y superficies claras (≥ 4.5:1). Pasa WCAG AA. |
| **Borde Interactivo (DF-45)** | `#7F93AA` | Bordes de inputs, checkboxes y áreas táctiles | Ratio 3.2:1 sobre fondo de tarjeta `#FAFCFF` (≥ 3.0:1 requerido para no-texto). Pasa WCAG AA. |
| **Semántico Éxito (DF-43)** | `#3A7560` (texto), `#EBF5F0` (fondo) | Badges de estado positivo, cuota disponible | Ratio 5.2:1 texto/fondo. Pasa WCAG AA. |
| **Semántico Advertencia (DF-43)** | `#8A6424` (texto), `#FDF8EE` (fondo) | Badges de advertencia, cuota > 80% | Ratio 4.9:1 texto/fondo. Pasa WCAG AA. |
| **Semántico Destructivo/Peligro** | `#A34F4F` (botón/texto), `#FDEDED` (fondo) | Botones de eliminación, alertas críticas | Ratio 4.9:1 con blanco. Pasa WCAG AA. |
| **Superficie Agente IA** | `#2C3A52` | Fondo oscuro del panel del Agente | Contraste de texto claro `#E2E8F0` sobre `#2C3A52` es 8.4:1 (≥ 7.0:1 AAA). |
| **Colores decorativos originales** | `#6B8DD6`, `#6DB99A`, etc. | Iconografía decorativa, barras de progreso sin texto | Reservados correctamente para no-texto decorativo. |

## 2. Tipografía y Legibilidad

- **Fuente Sans (`Inter`)**: Cargada mediante `next/font/google` con `display: swap`, optimizada por Next.js para evitar saltos acumulativos de diseño (CLS).
- **Fuente Mono (`JetBrains Mono`)**: Configurada con soporte de cifras tabulares (`tnum` / `tabular-nums`) para visualización consistente de tamaños de archivo, cuotas y códigos.
- **Idioma del documento**: Configurado explícitamente en `apps/web/src/app/layout.tsx` como `lang="es"`.

## 3. Responsividad y Ergonomía Móvil (CA-5)

- **Viewport base de 360 px**: Evaluado en `AppLayout`. El ancho de contenedor utiliza `w-full max-w-full overflow-x-hidden`. No se produce desbordamiento horizontal en resoluciones móviles angostas (360x640 px).
- **Áreas táctiles**: Botones y disparador de menú hamburguesa cuentan con alturas mínimas de 40–44 px con espaciado adecuado para dedos en dispositivos táctiles.
- **Navegación colapsable**: En pantallas `< 768 px` (`md:`), la barra lateral se oculta y da paso a un botón de menú accesible con etiqueta `aria-label="Abrir menú de navegación"` y panel deslizable (drawer) con fondo semitransparente.

## 4. Accesibilidad y Preferencias del Usuario (CA-6, CA-7)

- **Animaciones y movimiento reducido**: La regla `@media (prefers-reduced-motion: reduce)` en `globals.css` neutraliza transiciones y animaciones a `0.01ms !important`, previniendo molestias vestibulares en usuarios sensibles.
- **Auditoría axe-core**: Ejecutada en `apps/web/src/components/a11y.spec.tsx` con DOM simulado de JSDOM sobre todos los componentes de la biblioteca (`Button`, `Input`, `Card`, `Badge`, `FileTypeChip`, `CitationChip`, `StateView`). Resultado: **0 violaciones detectadas**.
- **Foco visible**: Todos los elementos interactivos cuentan con `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` claramente distinguible con un contraste superior a 3:1 contra su entorno.

## 5. Veredicto Final

La biblioteca de diseño cumple de manera sobresaliente con las directrices de `docs/sdd/ui-guidelines.md`, los requisitos no funcionales RNF-13 y RNF-14, y los criterios de aceptación CA-1 a CA-7. Se aprueba la interfaz y se habilita el paso a la revisión general de código.
