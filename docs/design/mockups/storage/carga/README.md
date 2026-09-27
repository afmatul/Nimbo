# Mockup: Carga en progreso

- **Spec**: 005
- **Propuesta presentada**: p. 10.
- **Cambios respecto de la propuesta**: ninguno en el mockup; al implementar, el botón principal usa el token corregido (DF-41) en lugar de `#6B8DD6`.
- **Origen**: HTML empaquetado y autocontenido (`.html`, Cielo Sereno, lienzo de ≈ 1490 px con el rótulo de la hoja). Es referencia visual; `apps/web` no lo importa.
- **Estados incluidos**:
  - progreso (`carga--progreso.html`): panel con 3 archivos (subiendo, en cola, subido)
- **Capturas**: `docs/design/capturas/storage/carga/` (`carga--<estado>--<360|1440>.png`)

## Decisiones de UX
- Panel flotante sobre el explorador con porcentaje, bytes, velocidad y tiempo restante; el archivo subido aparece en la lista marcado como NUEVO.

## Pendiente
- Datos de ejemplo: `Grabacion_sesion_14.mp4` pesa 1.2 GB y el plan Equipo permite 1 GB por archivo.
- Estados del inventario: reanudar, rechazo-cuota y tipo-invalido.
- Botón principal `#6B8DD6` con texto blanco (3.28:1) no cumple AA (DF-41); la implementación usa el token corregido.
- Versión móvil real a 360 px: el mockup está diseñado para escritorio y la captura a 360 px muestra el mismo lienzo.
