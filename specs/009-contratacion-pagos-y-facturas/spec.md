# Spec 009 — Contratación, pagos y facturas

> Qué y por qué, en ≤ 150 líneas. El cómo va en `./plan.md` (obligatorio).

| Campo | Valor |
|---|---|
| Estado | Borrador |
| Dueño | Juan Marcos |
| Fase | 2 |
| Requisitos | RF-20, RF-21, RF-19 (parcial), RNF-05, RNF-06, RNF-13, RNF-14 |
| Depende de | 008; 011 ya integrada (columna `plan.desactivado_en`, esquema único de plan y fachada `SubscriptionAdministration`) |
| Última actualización | 2026-10-11 |

## 1. Contexto y objetivo
Permitir a los clientes contratar un plan con pago simulado, recibir su comprobante y una factura PDF descargable, y consultar su historial. Además cierra los pendientes de integración de `billing`: suscripción Personal al verificar la cuenta y conciliación (PD-40), catálogo mínimo para el registro (PD-40, PD-48) y límites y administración leídos de la suscripción (PD-80) sobre la fachada provista por la 011. Los planes desactivados quedan fuera de la contratación (PD-86), pero PD-86 sigue abierto porque lo cierra la 010.

Esta spec también bautiza el puerto `INotifier` de `notifications` (RN-8): `billing` avisa por ahí, no por `IMailer`, que es de `identity`.

## 2. Historias de usuario
- **HU-1** Como cliente que verifica su correo, quiero tener el plan Personal activo de inmediato, para usar mi espacio sin pasos extra.
- **HU-2** Como visitante en el registro, quiero ver los planes activos con su precio, para conocer las opciones antes de crear la cuenta.
- **HU-3** Como cliente con sesión, quiero contratar un plan de pago con tarjeta de prueba y NIT, para ampliar mi cuota.
- **HU-4** Como cliente con sesión, quiero ver mis pagos y descargar la factura PDF de cada pago aprobado, para llevar mi control contable.

## 3. Criterios de aceptación
- **CA-1** (HU-1, RF-20, PD-40) Dado el evento `identity.client-account-verified`, cuando `billing` lo procesa con el `userId` del evento y el actor del dueño, entonces crea una suscripción al plan `personal` sin vencimiento (`vence_en` nulo). Si el cliente ya tiene suscripción, no cambia nada (idempotente). Si el oyente falla, la verificación no se ve afectada (ADR-0019).
- **CA-2** (HU-1, RF-20, PD-40, PD-80) Dado un cliente verificado sin suscripción, cuando corre la conciliación, entonces recibe la suscripción `personal` con el actor del dueño; repetirla no duplica. La conciliación solo obtiene los `usuario_id` verificados y sin suscripción mediante una función de lectura (ADR-0021) y corre como trabajo repetible del `worker`; no escribe sin actor. `IPlanLimitsProvider.limitsFor` y `SubscriptionAdministration` (`planNamesFor`, `clientCountsByPlan`) leen la suscripción del cliente: con fila, el plan de esa suscripción; sin fila, límites de Personal (PD-40). Un cliente con plan de pago nunca recibe límites de Personal por leer sin actor. Un plan desactivado no cambia los límites de quien ya lo tiene (011 CA-10): ni `limitsFor` ni la administración filtran por `desactivado_en`, y el conteo por plan incluye los desactivados con cuentas.
- **CA-3** (HU-2, RF-19, PD-40, PD-48) Dado el catálogo, cuando se consulta `GET /plans` sin sesión, entonces responde `200` con los planes con `desactivado_en` nulo, ordenados por precio ascendente, cada uno con `id`, `name`, `priceCents` (entero) y `free` (`true` solo con precio 0). No incluye `slug`: es un catálogo mínimo para el registro y comparte el esquema de plan de 008/011 (PD-83).
- **CA-4** (HU-3, RF-20, PD-86) Dado un cliente con sesión en el plan Personal (o verificado y aún sin fila, que cuenta como Personal) que contrata un plan de pago con la tarjeta `4242 4242 4242 4242` vigente, CVC y NIT (o «CF»), cuando envía el pago, entonces se registra una transacción `aprobada` con referencia `SIM-AAAA-NNNNNN`, su suscripción pasa al plan contratado por 30 días y la pantalla muestra «Pago aprobado» con la referencia.
- **CA-5** (HU-3, RF-20) — error: Dado el pago con `4000 0000 0000 0002`, cuando se procesa, entonces la transacción queda `rechazada`, la suscripción no cambia, no hay factura ni correo y la respuesta es `402 BILLING_PAYMENT_REJECTED`.
- **CA-6** (HU-3, RF-20, PD-86) — error: Dado un plan desactivado, inexistente o `personal`, o un cliente que ya tiene un plan de pago vigente, cuando se envía el pago, entonces `400 BILLING_PLAN_NOT_AVAILABLE` sin transacción ni cargo (el cambio de plan es de la 010). Dados una tarjeta distinta de las dos de prueba, un vencimiento pasado o un NIT mal formado, entonces `422` con los campos y sin transacción.
- **CA-7** (HU-3, RF-21) Dado un pago aprobado, cuando se confirma, entonces se registra la factura `NB-AAAA-NNNN` con subtotal, IVA y total (RN-2) junto con el pago. Después de confirmar se guarda el PDF y se envía el comprobante al cliente por `INotifier`. Si el PDF o el aviso fallan, el pago y la suscripción se mantienen, el historial muestra el pago y un reintento por `transaccion_id` repone lo que falte, sin duplicar factura ni correo. Un pago rechazado no emite ninguno.
- **CA-8** (HU-4, RF-20, RNF-05) Dado un cliente con sesión, cuando consulta su historial (API o `/suscripcion`), entonces ve sus transacciones y facturas (fecha, referencia, número de factura, monto, plan, estado) y ninguna de otra cuenta. Sin pagos, ve el estado vacío.
- **CA-9** (HU-4, RF-21, RNF-06) Dado el dueño de una factura, cuando pide descargarla, entonces recibe un enlace temporal de 5 minutos al PDF; si el PDF faltaba, se repone antes de responder. Si la factura no es suya o no existe, `404 BILLING_INVOICE_NOT_FOUND`.
- **CA-10** (HU-3, RF-20) — concurrencia: Dadas dos solicitudes de pago simultáneas del mismo cliente desde Personal, cuando se procesan, entonces solo una cobra y cambia la suscripción; la otra espera, ve que la cuenta ya no está en Personal y responde `400 BILLING_PLAN_NOT_AVAILABLE` sin otra transacción.

## 4. Reglas de negocio
- **RN-1** Dinero en centavos enteros (`integer`, GTQ) y tamaños en bytes (`bigint`, texto decimal en JSON) (ADR-0016). El formato `Qxx.xx` es solo de `web`.
- **RN-2** El precio de catálogo ya incluye IVA (12 %). El subtotal es `precio × 100 / 112` en aritmética entera, redondeado al centavo (mitades hacia arriba); el IVA es `precio − subtotal`. Equipo: 11 000 → subtotal 9 821, IVA 1 179, total 11 000. Personal no cobra ni factura. El cálculo vive en una sola función pura, `breakdown(priceCents)`, en `packages/contracts`, que usan la API y la web.
- **RN-3** `4242 4242 4242 4242` aprueba siempre y `4000 0000 0000 0002` rechaza siempre. El simulador es determinista. Solo se guarda la marca y los últimos 4 dígitos.
- **RN-4** Un plan de pago dura 30 días desde el pago (`vence_en`). Personal no vence.
- **RN-5** La factura lleva el correlativo `NB-AAAA-NNNN` y el comprobante `SIM-AAAA-NNNNNN`. El año es el del pago y la secuencia no se reinicia por año.
- **RN-6** Solo se ofrecen y contratan planes con `desactivado_en` nulo (PD-86, 011 CA-10). Se contrata por el `slug` de cualquier plan activo.
- **RN-7** Las facturas y transacciones no se borran: el histórico se conserva 7 años.
- **RN-8** `billing` avisa al cliente por el puerto `INotifier`, que declara `notifications` en su `index.ts` (Art. IV, ISP). Tiene un método `notify` con destinatario, asunto, texto, HTML y clave de idempotencia. El primer canal es correo (cola `mail`, ADR-0018). `billing` no importa `IMailer` ni crea la tabla `notificacion`.
- **RN-9** El cobro es una sola transacción con la suscripción bloqueada (`FOR UPDATE`) y es idempotente ante solicitudes simultáneas (CA-10). El PDF y el aviso van después de confirmar y no revierten el cobro.

## 5. Seguridad y privacidad
- `suscripcion`, `transaccion` y `factura` son datos de cliente: RLS forzado por `usuario_id` y pruebas de aislamiento (RNF-05). Para que `backoffice` muestre el plan de una cuenta (011 CA-1, CA-12), `suscripcion` admite además lectura a `ADMIN` y `OPERATOR`; `transaccion` y `factura` no tienen política interna.
- Toda escritura de cliente usa el actor del dueño, incluidos el oyente y la conciliación. La única lectura sin actor es la función de la conciliación (ADR-0021).
- Las bitácoras técnicas registran el intento y el resultado con `correlationId`. No se guardan el número de tarjeta ni el CVC. El NIT se guarda solo en `factura` y se suma a los campos redactados.
- El cobro tiene límite de tasa por cliente (`billing:subscribe:{actor}`).
- Los roles internos reciben `403 SHARED_FORBIDDEN` en las rutas de cobro.
- Los PDF no contienen datos de archivos del cliente. La descarga usa enlace temporal de 5 minutos a un solo objeto.

## 6. Experiencia de usuario
| Pantalla | Mockup (`docs/design/mockups/…`) | Estados requeridos | Estado del mockup |
|---|---|---|---|
| Pago simulado | `billing/pago/` | formulario, procesando, rechazado, aprobado | Aprobado |
| Plan e historial de facturas | `billing/suscripcion/` | con facturas, vacío | Aprobado |

- Mensajes: rechazo «La tarjeta fue rechazada. No se hizo ningún cargo. Prueba con otra tarjeta.»; éxito «Tu plan {nombre} ya está activo. Te enviamos el comprobante a {correo}.»; vacío «Aún no tienes facturas ni pagos registrados.»
- El botón principal usa el token `primary` de Cielo Sereno (DF-41, RNF-13).
- Las tarjetas de plan de pago en `/planes` llevan un botón «Contratar» que abre `/planes/contratar?slug=…` (con el `slug` de `GET /api/v1/billing/plans` de la 008). La pantalla de pago calcula el resumen con `breakdown`.

## 7. Fuera de alcance
- Renovación, aviso previo, vencimiento, solo lectura y cambio de plan (010).
- Columnas `estado`, `plan_pendiente_id` y `uso_agente` (DF-25, 010) y `cuota_extra_bytes` (DF-26, 011b).
- Pasarela probabilística del diagrama (se abre un DF; el simulador es determinista).
- Otros canales de `INotifier` y la tabla `notificacion`.
- «Descargar todas» y edición de datos de facturación fuera del pago.

## 8. Preguntas [RESUELTAS]
- [RESUELTA] ¿Desde dónde se llega a `/planes/contratar`? → Botón «Contratar» en las tarjetas de pago de `/planes`, con `?slug=` (2026-10-11).
- [RESUELTA] ¿Qué pasa si un cliente con plan de pago contrata otro? → `400 BILLING_PLAN_NOT_AVAILABLE` sin transacción; el cambio es de la 010 (CA-6) (2026-10-11).
- [RESUELTA] ¿Dónde se calcula el desglose de IVA? → `breakdown(priceCents)` en `packages/contracts`, compartida por `Money` y el formulario (RN-2) (2026-10-11).
- [RESUELTA] ¿Dónde se guardan las facturas PDF? → MinIO vía `IObjectStorage`, descarga con enlace temporal (2026-10-09).
- [RESUELTA] ¿Correo de comprobante? → Sí, por `INotifier` al aprobar el pago (2026-10-11).
- [RESUELTA] ¿Alcance de PD-40, PD-48, PD-80 y PD-86? → PD-40, PD-48 y PD-80 se cierran; PD-86 solo se referencia y sigue abierto por la 010 (2026-10-11).

## 9. Registro de cambios
| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-10-09 | Creación inicial de la spec | Arranque de la Fase 2 | Borrador |
| 2026-10-11 | Integración completa con spec 011, `INotifier`, concurrencia, `breakdown` en contracts y cierre de PD-48 | Revision 009 y alineación con 011 | Borrador |