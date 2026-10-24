# Mockup: Planes y comparador · Cambiar de plan

- **Spec**: 008 (`planes--plan-actual.html`) y 010 (cambio de plan programado: CA-16, CA-17, CA-20, CA-21, CA-27, CA-28).
- **Propuesta presentada**: p. 16 (`planes--plan-actual.html`).
- **Origen**: dos tecnologías en la misma carpeta.
  - `planes--plan-actual.html`: HTML empaquetado y autocontenido de la propuesta (lienzo de ≈ 1490 px). No se edita.
  - Estados de 010 (`/suscripcion/cambiar-plan`): HTML autocontenido generado con
    `../../_generadores/billing/generar-planes.js` (piezas en `_generadores/billing/billing.js`); no se edita a mano.
    Tarjetas como `PlanCard` de 008 y tabla como `PlanComparisonTable` de 009. Tokens AA, solo Inter, versión móvil real.
  - Son referencia visual; `apps/web` no los importa.
- **Estados incluidos**:
  - plan-actual: propuesta de 008, plan Equipo marcado (`planes--plan-actual.html`)
  - cambiar-plan: los cuatro planes activos con el actual marcado («Es tu plan actual», borde y distintivo), «Cambiar a …» en los demás y la comparativa (`planes--cambiar-plan.html`, CA-16, CA-17)
  - confirmar-cambio: «¿Cambiar a Pro el 4 de noviembre de 2026?», resumen (plan actual, plan nuevo, cobro al renovar Q45.00 con VISA ···· 4242) y aviso de versiones: Pro guarda 30 y Equipo 60; las anteriores que sobren se eliminan al subir la siguiente versión de cada archivo y la actual nunca se borra (`planes--confirmar-cambio.html`, CA-16, CA-20, CA-21)
  - confirmar-personal: bajar a Personal al vencer, sin cobro; avisos de versiones (3), espacio (15 GB frente a 64.2 GB usados) y edición `.docx` solo lectura; dice que no podrá renovar por adelantado (`planes--confirmar-personal.html`, CA-21, CA-28)
  - confirmar-personal-solo-lectura: con la cuenta vencida el cambio a Personal es inmediato, sin cobro, y termina la solo lectura (`planes--confirmar-personal-solo-lectura.html`, CA-27)
  - cambio-error: el plan elegido se desactivó (`BILLING_PLAN_CHANGE_INVALID`); `Alert` de error con la acción correctiva y «Cerrar» (`planes--cambio-error.html`, CA-17)
  - cargando y error de la lista: los de 008 (`loading.tsx`, `PlanCatalogError`), sin cambios.
- **Capturas**: `docs/design/capturas/billing/planes/` (`planes--<estado>--<360|1440>.png`). axe-core sin violaciones
  propias a 360 y 1440 px (la del botón de la cuenta del marco, ver `../suscripcion/README.md`); la tabla comparativa se
  desplaza dentro de su región enfocable (`tabindex="0"`), sin desbordar la página a 360 px.

## Decisiones de UX
- **Página propia** `/suscripcion/cambiar-plan` dentro del marco (migas «Cuenta / Plan y facturación / Cambiar de plan»,
  «Volver a Plan y facturación»). La intro dice cuándo se aplica, que se conservan los límites y que no hay prorrateo.
- **Plan actual sin botón deshabilitado**: «Es tu plan actual» con ícono y texto, borde `primary` y distintivo «Plan actual».
- **Confirmación** (`AlertDialog`, no destructiva: botón `primary` «Programar cambio a …»). Como el aviso de poda de
  `storage/ficha-archivo`, si hay aviso el foco inicial va a «Cancelar». El aviso es `warning` con título («… guarda
  menos versiones que tu plan actual» o «Personal incluye menos que tu plan actual») y una lista con cada consecuencia
  en texto; el espacio solo aparece si el uso supera la cuota del plan nuevo (Pro: no; Personal: sí).
- **Desde Personal** no hay cambio: «Contratar» de la 008/009 (CA-18); no se dibuja aquí.

## Pendiente
- Estado del inventario: default (sin plan actual) de 008.
- `planes--plan-actual.html`: «Hablar con ventas» no tiene flujo; botón `#6B8DD6` no cumple AA (DF-41); sin versión móvil real.
