# Mockup: Resumen de espacio

- **Spec**: 007
- **Hoja de la entrega**: 08c (opcional)
- **Origen**: HTML empaquetado y autocontenido (`.html`, Cielo Sereno, lienzo de ≈ 1490 px con el rótulo de la hoja). Es referencia visual; `apps/web` no lo importa.
- **Estados incluidos**:
  - default (`resumen-espacio.html`)
- **Capturas**: `docs/design/capturas/storage/resumen-espacio/` (`resumen-espacio--<estado>--<360|1440>.png`)

## Decisiones de UX
- Tablero de cuota: uso contra plan, consultas del ciclo, renovación, distribución por tipo y archivos más grandes con entrada al optimizador.

## Pendiente
- Datos de ejemplo contra el catálogo: dice «2 GB por archivo» para el plan Equipo (es 1 GB); ofrece «Ampliar a 1 TB · Q210/mes», un plan que no existe (el siguiente es Institucional, 2 TB, Q450); y lista un archivo de 42 GB.
- Botón principal `#6B8DD6` con texto blanco (3.28:1) no cumple AA (DF-41); la implementación usa el token corregido.
- Versión móvil real a 360 px: el mockup está diseñado para escritorio y la captura a 360 px muestra el mismo lienzo.
