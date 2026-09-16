# Mockup: Explorador de archivos

- **Spec**: 005–007
- **Origen**: exportado desde Claude Design (`.dc.html`, Cielo Sereno, 1440 × 900). Es referencia visual; `apps/web` no lo importa.
- **Estados incluidos**: cuadricula, lista
- **Capturas**: `docs/design/capturas/storage/explorador/` (360 y 1440 px)

## Decisiones de UX
- Dos vistas conmutables (Tarjetas / Lista); el estado de indexación viaja en la tarjeta o en la fila.
- Zona de arrastre siempre visible como última tarjeta; muestra el límite por archivo del plan.
- Barra lateral con cuota y aviso de límite que enlaza al optimizador.

## Pendiente
- Estados que faltan respecto al inventario de `docs/sdd/ui-guidelines.md` §7 (vacío, cargando, error, etc.).
- Versión móvil real a 360 px: el mockup está diseñado a 1440 px y se recorta en móvil.
