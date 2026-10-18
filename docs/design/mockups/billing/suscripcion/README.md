# Mockup: Plan y facturación

- **Spec**: 009 (pantalla base) y 010 (renovación, vencimiento y cambio de plan: CA-2, CA-5 a CA-7, CA-14, CA-16,
  CA-19, CA-21, CA-25, CA-28; §6).
- **Propuesta presentada**: p. 17 (`suscripcion--propuesta.html`).
- **Origen**: dos tecnologías en la misma carpeta.
  - Estados de 010 (incluido `vigente`): HTML autocontenido generado con
    `../../_generadores/billing/generar-suscripcion.js` (piezas comunes en `_generadores/billing/billing.js`; ver
    [`_generadores/README.md`](../../_generadores/README.md)); no se edita a mano. Reproduce la pantalla que implementó la
    009 (`apps/web/src/features/billing/components/plan-and-billing.tsx` y sus tarjetas) y le suma lo de la 010. Tokens AA
    de `ui-guidelines.md` §2–§3, solo Inter, cifras con `tabular-nums`, versión móvil real a 360 px.
  - `suscripcion--propuesta.html`: el paquete de la propuesta (antes `suscripcion--vigente.html`). Es histórico: muestra
    «Consumo del ciclo» de agente y versiones, «Cambiar» del método de pago, «Editar» de los datos fiscales y «Descargar
    todas», que la 009 no implementó y la 010 no agrega. Su botón principal `#6B8DD6` no cumple AA (DF-41).
  - Son referencia visual; `apps/web` no los importa.
- **Estados incluidos** (plan Equipo, Q110.00; hoy: 17 de octubre de 2026):
  - vigente: «Próximo cobro» (fecha, monto, marca y últimos 4), interruptor activado, «Renovar ahora» y «Cambiar de plan» (`suscripcion--vigente.html`, CA-25)
  - por-vencer: vence en 2 días; `Alert` informativo «Tu plan Equipo vence el 19 de octubre de 2026. Se renovará con Visa •••• 4242.» (`suscripcion--por-vencer.html`, §6, CA-5)
  - renovacion-desactivada: interruptor apagado, «No habrá cobro automático», `Alert` `warning` «Tu plan vence el … y no se renovará. Renueva ahora para no quedar en solo lectura.» con «Renovar ahora» (`suscripcion--renovacion-desactivada.html`, §6, CA-6, CA-7)
  - cambio-programado: a Pro; `Alert` «Tu plan cambiará a Pro el 4 de noviembre de 2026.» con «Cancelar cambio»; el próximo cobro es Q45.00 (precio completo de Pro) y **no hay «Renovar ahora»** (`suscripcion--cambio-programado.html`, CA-16, CA-19, CA-20, CA-28)
  - cambio-a-personal: sin cobro, aviso de cuota de Personal, «Cancelar cambio», sin «Renovar ahora» ni interruptor (`suscripcion--cambio-a-personal.html`, CA-21, CA-28)
  - vencida: aviso de solo lectura (la pieza `ReadOnlyBanner` de `shared/layout`) con el texto de §6 y «Renovar plan»; distintivo «Vencida» con candado; el cobro automático con VISA ···· 0341 aparece como «Pago rechazado»; interruptor deshabilitado con su explicación (`suscripcion--vencida.html`, §6, CA-2, CA-14)
  - confirmar-desactivar: apagar el interruptor pide confirmación con la consecuencia (`suscripcion--confirmar-desactivar.html`, plan 010)
  - error-renovacion: el cambio del interruptor falló; `Alert` de error con «Reintentar» dentro de «Próximo cobro» (`suscripcion--error-renovacion.html`)
  - propuesta: paquete de la propuesta, solo como referencia (`suscripcion--propuesta.html`)
  - cargando y error de la pantalla: los de la 009 (`StateView`), sin cambios.
- **Capturas**: `docs/design/capturas/billing/suscripcion/` (`suscripcion--<estado>--<360|1440>.png`). axe-core 4.14 sin
  violaciones propias a 360 y 1440 px, sin desbordamiento horizontal a 360 px, objetivos ≥ 24 px y sin errores de consola.
  Única violación: `label-content-name-mismatch` del botón de la cuenta del marco compartido (`marco/marco.js`), que
  también marca Seguridad (aprobado) con esta versión de axe: es del marco, no de esta pantalla (ver «Pendiente»).

## Decisiones de UX
- **Base = la 009 implementada**: título solo en las migas «Cuenta / Plan y facturación» (`h1` para lectores),
  «Consumo del plan» solo con almacenamiento y límites, «Método de pago» sin «Cambiar», «Datos de facturación» sin
  «Editar», «Pagos y facturas» sin «Descargar todas». Plan Equipo con 64.2 GB usados (cabe en Pro y no en Personal).
- **Aviso de estado arriba del contenido**, a todo el ancho, con el texto literal de §6: `info` para por vencer con
  renovación y para el cambio programado; `warning` cuando no se renovará; `ReadOnlyBanner` cuando venció.
- **Tarjeta del plan**: «Cambiar de plan» (outline) reemplaza a «Ver comparativa» de la 009, porque la página del
  cambio ya incluye la comparativa. Los datos quedan en «Activo hasta» (o «Venció el») e «Importe»; «Método» sale de
  esta tarjeta porque la tarjeta ya está en «Próximo cobro» y en «Método de pago».
- **«Próximo cobro»** (tarjeta nueva, `next-charge-card`): fecha, monto con el plan del siguiente ciclo (RN-4: con un
  cambio a Pro programado muestra Q45.00 · plan Pro) y tarjeta (marca y últimos 4 de la tarjeta guardada, solo para
  mostrar, RN-2). Sin renovación automática, en vez de los datos dice «No habrá cobro automático. Tu plan vence el …».
- **Interruptor** (`Switch`, `role="switch"`): estado también en texto («Activada»/«Desactivada»), etiqueta visible y
  ayuda con la consecuencia. Apagarlo pide confirmación; encenderlo no. En vencida queda deshabilitado con «Podrás
  activarla cuando renueves tu plan.»; con el cambio a Personal se reemplaza por el texto «La renovación automática no aplica…».
- **«Renovar ahora» aparece una sola vez**: en el pie de «Próximo cobro» (outline) si el plan está vigente sin cambio
  programado; en el `Alert` `warning` (primary) si la renovación está apagada; con cualquier cambio programado no
  aparece y el pie explica que primero hay que cancelar el cambio (CA-28). En vencida, la acción es «Renovar plan» del aviso.
- **Vencida**: el aviso reutiliza la pieza del layout (`M.avisoSoloLectura`, `shared/layout/layout--solo-lectura`) con
  título «Tu suscripción venció.» y el resto del texto de §6; el botón «Renovar plan» lleva al pago de la renovación.
- Las acciones que llevan a otro mockup están enlazadas (Cambiar de plan → `planes--cambiar-plan`, Renovar → `pago--renovacion`).

## Pendiente
- Aprobación de Juan Marcos de las decisiones de arriba (ver la lista numerada del informe de `/mockup` de la 010).
- `label-content-name-mismatch` del botón de la cuenta en el marco compartido (aria-label «Menú de la cuenta de …»
  frente al nombre visible): corregirlo en `marco/marco.js` cambiaría los mockups aprobados; se propone usar el nombre
  visible más un texto solo para lectores, como el pago de la renovación.
