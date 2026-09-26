# Mockup: Explorador de archivos

- **Spec**: 005–007
- **Hoja de la entrega**: 04 y 04b
- **Origen**: HTML empaquetado y autocontenido (`.html`, Cielo Sereno, lienzo de ≈ 1490 px con el rótulo de la hoja). Es referencia visual; `apps/web` no lo importa.
- **Estados incluidos**:
  - cuadricula (`explorador--cuadricula.html`, hoja 04)
  - lista con 2 elementos seleccionados (`explorador--lista.html`, hoja 04b)
- **Capturas**: `docs/design/capturas/storage/explorador/` (`explorador--<estado>--<360|1440>.png`)

## Decisiones de UX
- Dos vistas conmutables (Tarjetas / Lista); el estado de indexación viaja en la tarjeta o en la fila.
- Zona de arrastre como última tarjeta; barra lateral con cuota y aviso de límite que enlaza al optimizador.
- La lista muestra versión y autor de la última versión, y una barra de acciones para la selección.

## Pendiente
- Datos de ejemplo contra el catálogo (product-context §3): la zona de arrastre dice «máx. 2 GB por archivo», pero el plan Equipo permite 1 GB; y la lista incluye archivos de 8.5 GB y 18 GB.
- Estados del inventario: vacio, cargando y arrastre.
- Botón principal `#6B8DD6` con texto blanco (3.28:1) no cumple AA (DF-41); la implementación usa el token corregido.
- Versión móvil real a 360 px: el mockup está diseñado para escritorio y la captura a 360 px muestra el mismo lienzo.
