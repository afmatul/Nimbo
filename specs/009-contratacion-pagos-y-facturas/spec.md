# Spec 009 — Contratación, pagos y facturas

> Qué y por qué, en ≤ 150 líneas. El cómo va en `./plan.md` (obligatorio).

| Campo | Valor |
|---|---|
| Estado | En curso (plan aprobado por Adrián el 2026-10-15) |
| Dueño | Juan Marcos |
| Fase | 2 |
| Requisitos | RF-20, RF-21, RNF-05, RNF-06, RNF-13, RNF-14 |
| Depende de | 008, la parte de `billing` de la 011 (T-09: `plan.desactivado_en`, `Plan` y el catálogo del Administrador, DF-65) y la de `identity` (`IAccountDirectoryRepository`). La T-09 de la 011 depende a su vez de la T-01 de esta spec (`domain/plan-slug.ts`). `SubscriptionAdministration` la crea esta spec (T-03, PD-80) |
| Última actualización | 2026-10-14 |

## 1. Contexto y objetivo
Permitir a los clientes contratar un plan con pago simulado, recibir su comprobante y una factura PDF descargable, y consultar su historial. Además cierra pendientes de integración de `billing`: suscripción Personal al verificar la cuenta y conciliación (PD-40, puntos 1 y 2) y límites y administración leídos de la suscripción (PD-80). El catálogo público, también el del registro, lo sirve la 008 (RN-8, PD-48): esta spec no crea otra ruta de planes. Los planes desactivados quedan fuera de la contratación (PD-86), que sigue abierto por la 010.

## 2. Historias de usuario
- **HU-1** Como cliente que verifica su correo, quiero tener el plan Personal activo de inmediato, para usar mi espacio sin pasos extra.
- **HU-2** Como cliente con sesión, quiero contratar un plan de pago desde el catálogo con tarjeta de prueba y NIT, para ampliar mi cuota.
- **HU-3** Como cliente con sesión, quiero ver mis pagos y descargar la factura PDF de cada pago aprobado, para llevar mi control contable.

## 3. Criterios de aceptación
- **CA-1** (HU-1, RF-20, PD-40) Dado el evento `identity.client-account-verified`, cuando `billing` lo procesa, entonces crea una suscripción al plan `personal` sin vencimiento (`vence_en` nulo). Si el cliente ya tiene suscripción, no cambia nada (idempotente).
- **CA-2** (HU-1, RF-20, PD-40, PD-80) Dado un cliente verificado sin suscripción, cuando corre la conciliación, entonces recibe la suscripción `personal`; repetirla no duplica. `IPlanLimitsProvider.limitsFor` y `SubscriptionAdministration` leen la suscripción del cliente. Si no hay fila, `limitsFor` conserva el comportamiento actual (límites de Personal, PD-40) y administración muestra «—» (`planName` nulo).
- **CA-3** (HU-2, RF-20, PD-86) Dado un cliente con sesión que contrata un plan de pago con la tarjeta `4242 4242 4242 4242` vigente, CVC y NIT (o «CF»), cuando envía el pago, entonces se registra una transacción `aprobada` con referencia `SIM-AAAA-NNNNNN`, su suscripción pasa al plan contratado por 30 días y la pantalla muestra «Pago aprobado» con la referencia.
- **CA-4** (HU-2, RF-20) — error: Dado el pago con `4000 0000 0000 0002`, cuando se procesa, entonces la transacción queda `rechazada`, la suscripción no cambia, no hay factura ni correo y la respuesta es `402 BILLING_PAYMENT_REJECTED`.
- **CA-5** (HU-2, RF-20, PD-86) — error: Dado un plan desactivado, inexistente o `personal`, o un cliente cuya cuenta ya no está en Personal (tiene un plan de pago, o un segundo pago simultáneo llega después de uno aprobado), cuando se envía el pago, entonces `400 BILLING_PLAN_NOT_AVAILABLE` sin transacción ni cargo; el cambio de plan es de la 010. Dados datos de pago fuera de RN-9 (forma de la tarjeta, número que no sea de 16 dígitos o distinto de las dos tarjetas de prueba, vencimiento pasado, NIT mal formado), entonces `422` con `fields` y sin transacción. Si el cliente hace demasiados intentos seguidos, `429` sin transacción.
- **CA-6** (HU-2, RF-21) Dado un pago aprobado, cuando termina, entonces se emite la factura `NB-AAAA-NNNN` con subtotal, IVA y total, el PDF queda guardado y el cliente recibe un correo de comprobante. Un pago rechazado no emite ninguno. Si el PDF o el correo fallan después del cobro, el pago y la suscripción se conservan, el historial muestra el pago y un reintento automático repone el PDF y el correo.
- **CA-7** (HU-3, RF-20, RNF-05) Dado un cliente con sesión, cuando consulta su historial (API o `/suscripcion`), entonces ve sus transacciones y facturas (fecha, referencia, número de factura, monto, plan, estado) y ninguna de otra cuenta; una factura cuyo PDF aún no existe se muestra sin enlace de descarga. Sin pagos, ve el estado vacío.
- **CA-8** (HU-3, RF-21, RNF-06) Dado el dueño de una factura con PDF, cuando pide descargarla, entonces recibe un enlace temporal de 5 minutos al PDF. Si la factura no es suya, no existe o aún no tiene PDF, `404 BILLING_INVOICE_NOT_FOUND`.
- **CA-9** (HU-2, RF-20) Dadas las tarjetas de plan de pago de `/planes` (008), cuando se muestran, entonces cada una trae el botón «Contratar», que lleva a `/planes/contratar?slug={slug}` con el `slug` de la respuesta de la 008. Las tarjetas de un plan gratuito no lo traen.

## 4. Reglas de negocio
- **RN-1** Dinero en centavos enteros (`integer`, GTQ) y tamaños en bytes (`bigint`, texto decimal en JSON) (ADR-0016). El formato `Qxx.xx` lo da una sola función, `formatGtq(cents)` en `packages/contracts`, que usan la factura PDF y `web` (ADR-0028).
- **RN-2** El precio de catálogo ya incluye IVA (12 %). El subtotal es `precio × 100 / 112` en aritmética entera, redondeado al centavo (mitades hacia arriba); el IVA es `precio − subtotal`. Equipo: 11 000 → subtotal 9 821, IVA 1 179, total 11 000. Personal no cobra ni factura. El desglose se calcula en una sola función pura, `breakdown(priceCents)`, en `packages/contracts`, que usan la API y el formulario.
- **RN-3** `4242 4242 4242 4242` aprueba siempre y `4000 0000 0000 0002` rechaza siempre: el simulador es determinista. Solo se guarda la marca y los últimos 4 dígitos.
- **RN-4** Un plan de pago dura 30 días desde el pago (`vence_en`). Personal no vence.
- **RN-5** La factura lleva el correlativo `NB-AAAA-NNNN` (mockup de suscripción). El comprobante de la pasarela simulada lleva `SIM-AAAA-NNNNNN` (mockup de pago). Son números distintos.
- **RN-6** Solo se contratan planes con `desactivado_en` nulo (PD-86, 011 CA-10).
- **RN-7** Las facturas y transacciones no se borran: el histórico se conserva 7 años.
- **RN-8** El cobro y el cambio de suscripción se confirman juntos o no se confirman. El PDF y el correo se generan después y no revierten el cobro.
- **RN-9** Los datos de pago son `card: { number, expMonth, expYear, cvc }` y `nit`. `number` son 16 dígitos (el formulario puede mostrarlos con espacios, pero no se envían); `expMonth` va de 1 a 12 y el mes de `expYear` no ha pasado; `cvc` son 3 dígitos; `nit` es `CF` o de 5 a 12 dígitos. Cualquier otra cosa es `422` con `fields`.

## 5. Seguridad y privacidad
- `suscripcion`, `transaccion` y `factura` son datos de cliente: RLS forzado por `usuario_id` y pruebas de aislamiento (RNF-05).
- No se guardan el número de tarjeta ni el CVC. El NIT se guarda solo en `factura`.
- Las bitácoras técnicas registran el intento y el resultado con `correlationId`, nunca el número de tarjeta, el CVC ni el NIT (se redactan `card`, `number`, `cvc` y `nit`).
- Los roles internos reciben `403 SHARED_FORBIDDEN` en las rutas de cobro y no pagan por un cliente.
- El Administrador conoce del plan de un cliente solo su nombre (011 CA-1); el Administrador y el Operador, solo conteos agregados por plan (011 CA-8 y CA-12). El Operador nunca recibe el plan de un cliente. Ningún rol interno lee filas de suscripción, transacciones ni facturas.
- Los PDF no contienen datos de archivos del cliente. La descarga usa enlace temporal; no hay URL pública.

## 6. Experiencia de usuario
| Pantalla | Mockup (`docs/design/mockups/…`) | Estados requeridos | Estado del mockup |
|---|---|---|---|
| Pago simulado | `billing/pago/` | cargando, formulario, procesando, rechazado, aprobado, error | Borrador (solo `default`) |
| Plan e historial de facturas | `billing/suscripcion/` | cargando, con facturas, vacío, error | Borrador (solo `vigente`) |

- Mensajes (español, tuteo; los de error salen del catálogo de errores del frontend por código, Art. VI.3): rechazo «La tarjeta fue rechazada. No se hizo ningún cargo. Prueba con otra tarjeta.»; éxito «Tu plan {nombre} ya está activo. Te enviamos el comprobante a {correo}.»; vacío «Aún no tienes facturas ni pagos registrados.»
- Los estados sin mockup siguen los patrones de `ui-guidelines.md` (Art. XIII.3): «procesando» con indicador de progreso (RNF-14) y error con acción correctiva («Reintentar» o «Prueba con otra tarjeta»).
- El botón principal usa el token `primary` de Cielo Sereno, no `#6B8DD6` del mockup, que da 3.28:1 y no cumple AA (DF-41, RNF-13).
- `/suscripcion` es la pantalla de `billing/suscripcion/`. La 009 construye plan actual e historial; la 010 la amplía con renovación y cambio de plan.
- `/planes` (008) suma solo el botón «Contratar» en las tarjetas de pago (CA-9); el resto de la pantalla no cambia.

## 7. Fuera de alcance
- Catálogo público y comparador, también el del registro (008). Esta spec no agrega rutas de planes.
- Renovación, aviso previo, vencimiento, solo lectura y cambio de plan (010). Mientras tanto, pasar `vence_en` no cambia los límites.
- Columnas `estado`, `plan_pendiente_id` y `uso_agente` (DF-25, 010) y `cuota_extra_bytes` (DF-26, 011b).
- «Descargar todas» y edición de datos de facturación fuera del pago.
- Pasarelas reales y administración del catálogo (011).

## 8. Preguntas
- [ABIERTA] ¿Cómo se retoma el plan de pago elegido en el registro (001 CA-28, en suspenso)? — bloquea: no. Propuesta: sin aviso propio; el cliente contrata desde `/planes`.
- [ABIERTA] ¿Pagos y altas de suscripción generan eventos de auditoría (RF-07)? — bloquea: no. Propuesta: no en esta spec (como 008); solo bitácora técnica.
- [RESUELTA] ¿Dónde se guardan las facturas PDF? → MinIO vía `IObjectStorage`, descarga con enlace temporal (2026-10-09, usuario)
- [RESUELTA] ¿Correo de comprobante? → Sí, al aprobar el pago, por el puerto de `notifications` (2026-10-09, usuario)
- [RESUELTA] ¿Alcance de PD-40, PD-80 y PD-86? → Entran en la 009; el punto 3 de PD-40 y PD-48 los cubre la 008 (2026-10-09, usuario)
- [RESUELTA] ¿Desde dónde se llega a `/planes/contratar`? → Botón «Contratar» en las tarjetas de pago de `/planes` (CA-9) (2026-10-10, revisión)
- [RESUELTA] ¿Qué pasa si un cliente con plan de pago contrata otro? → `400 BILLING_PLAN_NOT_AVAILABLE` sin transacción; el cambio de plan es de la 010 (CA-5) (2026-10-10, revisión)
- [RESUELTA] ¿Dónde se calcula el desglose de IVA? → `breakdown(priceCents)`, función pura en `packages/contracts` (RN-2) (2026-10-10, revisión)
- [RESUELTA] ¿Qué plan muestran límites y administración para un cliente sin fila de suscripción (PD-80)? → Con fila, el plan de la suscripción; sin fila, `limitsFor` devuelve Personal y administración muestra «—» (`planName` nulo) (2026-10-14, revisión I-7)
- [RESUELTA] ¿Hay un catálogo público propio de la 009 para el registro? → No: `GET /api/v1/billing/plans` de la 008 es el único (008 RN-8) (2026-10-11, revisión)

## 9. Registro de cambios
| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-10-09 | Creación inicial de la spec | Arranque de la Fase 2 | Borrador (pendiente Adrián) |
| 2026-10-09 | Criterios separados por flujo, factura `NB-` vs comprobante `SIM-`, IVA en enteros, sin auditoría, sin `estado` ni CA-28; seis preguntas abiertas | Revisión de coherencia con plan, mockups y YAGNI | Pendiente Adrián |
| 2026-10-10 | Tres preguntas cerradas; pagos simultáneos en CA-5; reintento en CA-6; NIT solo en `factura`; RN-8; depende de la parte de `billing` de la 011 | Primera revisión de la 009 y contraste con la 011 | Pendiente Adrián |
| 2026-10-11 | Se elimina el catálogo propio (CA-3, HU-2, `GET /plans`) y se renumeran HU y CA; RF-19 sale de los requisitos; CA-5 suma `429`; CA-7 y CA-8 cubren la factura sin PDF; estados de carga y error en §6; privacidad de Administrador y Operador en §5 | Segunda revisión de la 009 (B-1, I-7, I-10) y 008 final | Pendiente Adrián |
| 2026-10-11 | Depende también de la parte de `identity` de la 011 (`IAccountDirectoryRepository`) | Tercera revisión de la 009 (N-3) | Pendiente Adrián |
| 2026-10-14 | RN-9 fija la forma de los datos de pago (tarjeta de 16 dígitos, NIT `CF` o de 5 a 12 dígitos) y CA-5 la usa; se cierra la pregunta de PD-80; se redacta `number` | Cuarta revisión de la 009 (I-7, I-8) | Pendiente Adrián |
| 2026-10-14 | §5: solo el Administrador conoce el nombre del plan de un cliente; el Operador, solo conteos (como plan §3 y ADR-0021) | Quinta revisión de la 009 (N-1) | Pendiente Adrián |
| 2026-10-14 | `SubscriptionAdministration` la crea esta spec (T-03) sin `clientCount`; la T-09 de la 011 solo aporta el catálogo y depende de la T-01 (`plan-slug.ts`) | Acuerdo con Fátima sobre `arreglos-011.md` (puntos 1–6, 8 y 9) | Pendiente Adrián |
| 2026-10-15 | RN-1: el formato `Qxx.xx` sale de `formatGtq` en `contracts` (PDF y `web`) | Aprobación de Adrián sobre `propose.md` y ADR-0028 | Adrián |
