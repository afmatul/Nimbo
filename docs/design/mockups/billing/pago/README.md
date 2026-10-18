# Mockup: Pago simulado · Pago de la renovación

- **Spec**: 009 (`pago.html`) y 010 (renovación manual: CA-8 a CA-10, RN-1, RN-2).
- **Propuesta presentada**: No presentada (diseño interno).
- **Origen**: dos tecnologías en la misma carpeta.
  - `pago.html`: HTML empaquetado y autocontenido de la 009 (lienzo de ≈ 1490 px). No se edita.
  - Estados de 010 (`/suscripcion/renovar`): HTML autocontenido generado con `../../_generadores/billing/generar-pago.js`
    (piezas en `_generadores/billing/billing.js`); no se edita a mano. Reproduce el formulario que implementó la 009
    (`payment-form.tsx`, `payment-summary.tsx`). Tokens AA, solo Inter, versión móvil real a 360 px.
  - Son referencia visual; `apps/web` no los importa.
- **Estados incluidos**:
  - default: `pago.html` (contratación de la 009)
  - renovacion: renovar por adelantado (vence el 19 de octubre); el resumen muestra «Periodo nuevo: del 19 de octubre al 18 de noviembre de 2026» y que no se pierden días (`pago--renovacion.html`, CA-8, RN-1)
  - renovacion-rechazado: `4000 0000 0000 0002`; `Alert` de error con el mensaje del catálogo de la 009 y «Tu plan y su vencimiento no cambiaron.» (`pago--renovacion-rechazado.html`, CA-9)
  - renovacion-exito: «Pago aprobado», referencia, factura y periodo nuevo; «Ir a Plan y facturación» (`pago--renovacion-exito.html`, CA-8)
  - renovacion-solo-lectura: desde una cuenta vencida, el periodo nuevo empieza hoy y termina la solo lectura (`pago--renovacion-solo-lectura.html`, CA-10)
- **Capturas**: `docs/design/capturas/billing/pago/` (`pago--<estado>--<360|1440>.png`). axe-core sin violaciones a 360 y
  1440 px, sin desbordamiento horizontal, objetivos ≥ 24 px (44 px en los campos y botones), sin errores de consola.

## Decisiones de UX
- **Mismo formulario que la 009**: número con la marca (VISA) dentro del campo, vencimiento con la ayuda «Mes y año,
  como 12/28.», CVC oculto (`password`) y NIT; sin «Nombre en la tarjeta». Título «Renovar tu plan» con el distintivo
  «Simulado» (texto, no solo color). Página sin barra lateral, como `/planes/contratar`.
- **Periodo nuevo** destacado en el resumen (fondo `brand` al 12 % y barra de 3 px; el texto lo dice todo) con su
  explicación: «Empieza cuando termina tu periodo actual: no pierdes días pagados.» o, en solo lectura, «Empieza hoy…».
- **Tarjetas de prueba**: las tres de RN-2 (`4242…` aprueba siempre; `4000 0000 0000 0341` aprueba ahora y se rechaza en
  el cobro automático; `4000 0000 0000 0002` rechaza siempre).
- **NIT** precargado con el de la última factura (editable). El monto y el plan son los del siguiente ciclo; con un cambio
  programado no se llega aquí por adelantado (CA-28), solo desde solo lectura (CA-10, CA-20), y entonces el resumen es el del plan nuevo.
- En la barra superior, el botón de la cuenta toma su nombre del texto visible («Lucía Barrios, menú de la cuenta»).

## Pendiente
- `pago.html`: estados rechazado y éxito de la contratación (la 009 los implementó sin mockup); botón `#6B8DD6` no
  cumple AA (DF-41); sin versión móvil real.
