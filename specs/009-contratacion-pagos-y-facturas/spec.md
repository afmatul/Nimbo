# Spec 009 — Contratación, pagos y facturas

> Qué y por qué, en ≤ 150 líneas. El cómo va en `./plan.md` (obligatorio).

| Campo | Valor |
|---|---|
| Estado | Borrador |
| Dueño | Juan Marcos |
| Fase | 2 |
| Requisitos | RF-20, RF-21, RF-19 (parcial), RNF-05, RNF-06, RNF-13, RNF-14 |
| Depende de | 008 |
| Última actualización | 2026-10-09 |

## 1. Contexto y objetivo
Permitir a los clientes contratar un plan con pago simulado, recibir su comprobante y una factura PDF descargable, y consultar su historial. Además cierra los pendientes de integración de `billing`: suscripción Personal al verificar la cuenta y conciliación (PD-40), catálogo mínimo para el registro (PD-40, PD-48), límites y administración leídos de la suscripción (PD-80) y planes desactivados fuera de la contratación (PD-86).

## 2. Historias de usuario
- **HU-1** Como cliente que verifica su correo, quiero tener el plan Personal activo de inmediato, para usar mi espacio sin pasos extra.
- **HU-2** Como visitante en el registro, quiero ver los planes activos con su precio, para conocer las opciones antes de crear la cuenta.
- **HU-3** Como cliente con sesión, quiero contratar un plan de pago con tarjeta de prueba y NIT, para ampliar mi cuota.
- **HU-4** Como cliente con sesión, quiero ver mis pagos y descargar la factura PDF de cada pago aprobado, para llevar mi control contable.

## 3. Criterios de aceptación
- **CA-1** (HU-1, RF-20, PD-40) Dado el evento `identity.client-account-verified`, cuando `billing` lo procesa, entonces crea una suscripción al plan `personal` sin vencimiento (`vence_en` nulo). Si el cliente ya tiene suscripción, no cambia nada (idempotente).
- **CA-2** (HU-1, RF-20, PD-40, PD-80) Dado un cliente verificado sin suscripción, cuando corre la conciliación, entonces recibe la suscripción `personal`; repetirla no duplica. `IPlanLimitsProvider.limitsFor` y `SubscriptionAdministration` leen la suscripción del cliente. Si no hay fila, `limitsFor` conserva el comportamiento actual (límites de Personal, PD-40).
- **CA-3** (HU-2, RF-19, PD-40, PD-48, PD-86) Dado el catálogo, cuando se consulta `GET /plans` sin sesión, entonces responde `200` con los planes con `desactivado_en` nulo, ordenados por precio ascendente, cada uno con `id`, `name`, `priceCents` (entero) y `free` (`true` solo con precio 0).
- **CA-4** (HU-3, RF-20, PD-86) Dado un cliente con sesión que contrata un plan de pago con la tarjeta `4242 4242 4242 4242` vigente, CVC y NIT (o «CF»), cuando envía el pago, entonces se registra una transacción `aprobada` con referencia `SIM-AAAA-NNNNNN`, su suscripción pasa al plan contratado por 30 días y la pantalla muestra «Pago aprobado» con la referencia.
- **CA-5** (HU-3, RF-20) — error: Dado el pago con `4000 0000 0000 0002`, cuando se procesa, entonces la transacción queda `rechazada`, la suscripción no cambia, no hay factura ni correo y la respuesta es `402 BILLING_PAYMENT_REJECTED`.
- **CA-6** (HU-3, RF-20, PD-86) — error: Dado un plan desactivado, inexistente o `personal`, cuando se envía el pago, entonces `400 BILLING_PLAN_NOT_AVAILABLE` sin transacción ni cargo. Dados una tarjeta distinta de las dos de prueba, un vencimiento pasado o un NIT mal formado, entonces `422` con los campos y sin transacción.
- **CA-7** (HU-3, RF-21) Dado un pago aprobado, cuando termina, entonces se emite la factura `NB-AAAA-NNNN` con subtotal, IVA y total, el PDF queda guardado y se encola un correo de comprobante al cliente. Un pago rechazado no emite ninguno.
- **CA-8** (HU-4, RF-20, RNF-05) Dado un cliente con sesión, cuando consulta su historial (API o `/suscripcion`), entonces ve sus transacciones y facturas (fecha, referencia, número de factura, monto, plan, estado) y ninguna de otra cuenta. Sin pagos, ve el estado vacío.
- **CA-9** (HU-4, RF-21, RNF-06) Dado el dueño de una factura, cuando pide descargarla, entonces recibe un enlace temporal de 5 minutos al PDF. Si la factura no es suya o no existe, `404 BILLING_INVOICE_NOT_FOUND`.

## 4. Reglas de negocio
- **RN-1** Dinero en centavos enteros (`integer`, GTQ) y tamaños en bytes (`bigint`, texto decimal en JSON) (ADR-0016). El formato `Qxx.xx` es solo de `web`.
- **RN-2** El precio de catálogo ya incluye IVA (12 %). El subtotal es `precio × 100 / 112` en aritmética entera, redondeado al centavo (mitades hacia arriba); el IVA es `precio − subtotal`. Equipo: 11 000 → subtotal 9 821, IVA 1 179, total 11 000. Personal no cobra ni factura.
- **RN-3** `4242 4242 4242 4242` aprueba siempre y `4000 0000 0000 0002` rechaza siempre. Solo se guarda la marca y los últimos 4 dígitos.
- **RN-4** Un plan de pago dura 30 días desde el pago (`vence_en`). Personal no vence.
- **RN-5** La factura lleva el correlativo `NB-AAAA-NNNN` (mockup de suscripción). El comprobante de la pasarela simulada lleva `SIM-AAAA-NNNNNN` (mockup de pago). Son números distintos.
- **RN-6** Solo se ofrecen y contratan planes con `desactivado_en` nulo (PD-86, 011 CA-10).
- **RN-7** Las facturas y transacciones no se borran: el histórico se conserva 7 años.

## 5. Seguridad y privacidad
- `suscripcion`, `transaccion` y `factura` son datos de cliente: RLS forzado por `usuario_id` y pruebas de aislamiento (RNF-05).
- Las bitácoras técnicas registran el intento y el resultado con `correlationId`, nunca el número de tarjeta, el CVC ni el NIT.
- Los roles internos reciben `403 SHARED_FORBIDDEN` en las rutas de cobro y no pagan por un cliente.
- Los PDF no contienen datos de archivos del cliente. La descarga usa enlace temporal; no hay URL pública.

## 6. Experiencia de usuario
| Pantalla | Mockup (`docs/design/mockups/…`) | Estados requeridos | Estado del mockup |
|---|---|---|---|
| Pago simulado | `billing/pago/` | formulario, procesando, rechazado, aprobado | Borrador |
| Plan e historial de facturas | `billing/suscripcion/` | con facturas, vacío | Borrador |

- Mensajes (español, tuteo): rechazo «La tarjeta fue rechazada. No se hizo ningún cargo. Prueba con otra tarjeta.»; éxito «Tu plan {nombre} ya está activo. Te enviamos el comprobante a {correo}.»; vacío «Aún no tienes facturas ni pagos registrados.»
- El botón principal usa el token `primary` de Cielo Sereno, no `#6B8DD6` del mockup, que da 3.28:1 y no cumple AA (DF-41, RNF-13).
- `/suscripcion` es la pantalla de `billing/suscripcion/`. La 009 construye plan actual e historial; la 010 la amplía con renovación y cambio de plan.

## 7. Fuera de alcance
- Renovación, aviso previo, vencimiento, solo lectura y cambio de plan (010). Mientras tanto, pasar `vence_en` no cambia los límites.
- Columnas `estado`, `plan_pendiente_id` y `uso_agente` (DF-25, 010) y `cuota_extra_bytes` (DF-26, 011b).
- «Descargar todas» y edición de datos de facturación fuera del pago.
- Pasarelas reales y administración del catálogo (011).

## 8. Preguntas
- [ABIERTA] ¿Qué plan muestra administración para un cliente sin verificar (PD-80)? — bloquea: no. Propuesta: «Personal» solo si tiene fila; sin fila, «—».
- [ABIERTA] ¿Cómo se retoma el plan de pago elegido en el registro (001 CA-28, en suspenso)? — bloquea: no. Propuesta: sin aviso propio; el cliente contrata desde `/planes`.
- [ABIERTA] ¿Desde dónde se llega a `/planes/contratar`? 008 dejó fuera el botón al pago — bloquea: sí (T-08). Propuesta: botón «Contratar» en las tarjetas de pago de `/planes`.
- [ABIERTA] ¿Qué pasa si un cliente con plan de pago contrata otro? — bloquea: sí (CA-6). Propuesta: la 009 solo contrata desde Personal; lo demás es cambio de plan (010) y responde `400 BILLING_PLAN_NOT_AVAILABLE`.
- [ABIERTA] ¿Dónde se calcula el desglose de IVA que muestra el resumen antes de pagar? — bloquea: no. Propuesta: una sola función pura compartida entre `api` y `web` (DRY).
- [ABIERTA] ¿Pagos y altas de suscripción generan eventos de auditoría (RF-07)? — bloquea: no. Propuesta: no en esta spec (como 008); solo bitácora técnica.
- [RESUELTA] ¿Dónde se guardan las facturas PDF? → MinIO vía `IObjectStorage`, descarga con enlace temporal (2026-10-09, usuario)
- [RESUELTA] ¿Correo de comprobante? → Sí, encolado en `notifications` al aprobar el pago (2026-10-09, usuario)
- [RESUELTA] ¿Alcance de PD-40, PD-80 y PD-86? → Entran en la 009 (2026-10-09, usuario)

## 9. Registro de cambios
| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-10-09 | Creación inicial de la spec | Arranque de la Fase 2 | Borrador (pendiente Adrián) |
| 2026-10-09 | Criterios separados por flujo (CA-1 a CA-9), factura `NB-` vs comprobante `SIM-`, IVA en enteros, sin auditoría, sin `estado` ni CA-28; seis preguntas abiertas | Revisión de coherencia con plan, mockups y YAGNI | Pendiente Adrián |
