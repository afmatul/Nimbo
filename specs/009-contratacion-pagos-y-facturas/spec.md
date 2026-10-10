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
Permitir a los clientes contratar planes mediante un flujo de pago simulado, recibir su comprobante y factura descargable en PDF, y consultar su historial de transacciones. Además, resuelve los pendientes de integración de `billing`: asigna la suscripción Personal al verificar la cuenta (PD-40), concilia cuentas sin suscripción, expone el catálogo mínimo para el registro y conecta los límites de cuota a la suscripción activa (PD-80), rechazando planes desactivados (PD-86).

## 2. Historias de usuario
- **HU-1** Como visitante verificado, quiero que mi cuenta tenga automáticamente el plan Personal activo, para poder utilizar el almacenamiento de inmediato.
- **HU-2** Como visitante en registro, quiero ver el catálogo mínimo de planes activos, para conocer las opciones disponibles antes de crear mi cuenta.
- **HU-3** Como cliente con sesión, quiero contratar un plan mediante pago simulado ingresando datos de tarjeta y NIT, para ampliar mi cuota y capacidades.
- **HU-4** Como cliente con sesión, quiero consultar mi historial de pagos y descargar la factura en PDF de cada transacción exitosa, para llevar mi control contable.

## 3. Criterios de aceptación
> Dado/Cuando/Entonces en una o dos líneas. Cada criterio es verificable por una prueba y rastrea a un requisito.

- **CA-1** (HU-1, RF-20, PD-40) Dado el evento `identity.client-account-verified` con `userId`, cuando `billing` lo procesa, entonces crea de forma idempotente una fila en `suscripcion` con el plan `personal`, estado `activa` y sin vencimiento (`vence_en = null`). Si ya existe, no hace nada.
- **CA-2** (HU-1, RF-20, PD-40, PD-80) Dado que existen cuentas de cliente verificadas sin suscripción, cuando corre el proceso de conciliación idempotente, entonces les asigna una suscripción `personal` activa. `IPlanLimitsProvider.limitsFor` y `SubscriptionAdministration` consultan la suscripción activa en `suscripcion`; si la cuenta está sin verificar (sin fila), devuelven los límites de Personal por degradación elegante.
- **CA-3** (HU-2, RF-19, PD-40, PD-48, PD-86) Dado el catálogo en base de datos, cuando se consulta `GET /plans`, entonces responde `200` con los planes donde `desactivado_en IS NULL`, ordenados por `precio_centavos` ASC, cada uno con `id`, `name`, `priceCents` (entero) y `free` (`true` solo si `precio_centavos == 0`).
- **CA-4** (HU-3, RF-20, PD-86) Dado un cliente autenticado en `/planes/contratar?plan={slug}`, cuando envía tarjeta `4242 4242 4242 4242`, fecha futura, CVC y NIT (o «CF»), entonces se procesa el cobro por `precio_centavos`, se crea la transacción con referencia `SIM-AAAA-NNNNNN` (`aprobada`), se actualiza la suscripción al nuevo plan por 30 días, se emite la factura `NB-AAAA-NNNN` con desglose de IVA (12%), se guarda en MinIO, se encola el correo con comprobante y la pantalla muestra «Pago aprobado».
- **CA-5** (HU-3, RF-20) — error pago rechazado: Dado un cliente que envía la tarjeta de prueba `4000 0000 0000 0002`, cuando se procesa el cobro, entonces la transacción se registra como `rechazada`, la suscripción no cambia, no se genera factura ni correo, y la respuesta es `402` con `BILLING_PAYMENT_REJECTED` y mensaje «La tarjeta fue rechazada. No se hizo ningún cargo. Prueba con otra tarjeta.»
- **CA-6** (HU-3, RF-20, PD-86) — error plan no disponible: Dado un intento de contratar un plan desactivado (`desactivado_en IS NOT NULL`), inexistente o el plan `personal` (que no admite cobro), cuando se envía la solicitud, entonces se responde `400` con `BILLING_PLAN_NOT_AVAILABLE` y no se efectúa cargo ni transacción.
- **CA-7** (HU-4, RF-20, RNF-05) Dado un cliente autenticado, cuando consulta `GET /api/v1/billing/history` o abre `/suscripcion`, entonces recibe la lista de sus transacciones y facturas pagadas (fecha, número `NB-AAAA-NNNN`, comprobante `SIM-AAAA-NNNNNN`, monto en centavos, plan y estado). Otra cuenta no ve estas filas (aislamiento).
- **CA-8** (HU-4, RF-21, RNF-06) Dado un cliente dueño de una factura, cuando solicita descargar el PDF (`GET /api/v1/billing/invoices/:id/download`), entonces recibe una URL firmada temporal (5 min) para descargar el archivo desde MinIO. Si no pertenece al actor, responde `404` con `BILLING_INVOICE_NOT_FOUND`.

## 4. Reglas de negocio
- **RN-1** Dinero en centavos enteros (`integer`, GTQ) y almacenamiento en bytes (`bigint`) (ADR-0016). Formato visual Qxx.xx en `web`.
- **RN-2** IVA y redondeo con aritmética entera: Todo precio de catálogo incluye IVA (12% tasa Guatemala). `subtotal_centavos = Math.round((precio_centavos * 100) / 112)`, `iva_centavos = precio_centavos - subtotal_centavos`. Para Equipo (11000 cts): `(11000 * 100) / 112 = 9821` (Q98.21), `iva = 1179` (Q11.79), total 11000 cts (Q110.00). Personal (Q0.00) no genera cobro ni factura.
- **RN-3** Tarjetas de prueba: `4242 4242 4242 4242` aprueba siempre; `4000 0000 0000 0002` rechaza siempre; otras tarjetas devuelven error de validación.
- **RN-4** Vigencia: Planes de pago duran 30 días (`vence_en = now() + 30 días`). Personal tiene `vence_en = null`.
- **RN-5** Numeración: Facturas llevan formato correlativo fiscal `NB-AAAA-NNNN` (ej. `NB-2026-0912`); comprobantes de pasarela llevan `SIM-AAAA-NNNNNN` (ej. `SIM-2026-000142`).
- **RN-6** Solo planes con `desactivado_en IS NULL` se ofrecen y contratan (PD-86).
- **RN-7** Cuentas sin verificar: devuelven límites de Personal y no tienen fila en `suscripcion` hasta su verificación (PD-80).
- **RN-8** Retención contable: Las facturas se conservan en histórico por 7 años.

## 5. Seguridad y privacidad
- ¿Toca datos de un cliente? Sí → `suscripcion`, `transaccion` y `factura` tienen RLS obligatorio (`usuario_id = actor.id`). Pruebas de aislamiento requeridas (RNF-05).
- ¿Qué va a auditoría (RF-07)? ¿Qué NO debe aparecer en bitácoras? Auditoría registra `billing.subscription_created` y `billing.payment_processed`. Las bitácoras técnicas nunca contienen números completos de tarjeta ni CVC; solo `tarjeta_ultimos4`.
- ¿Qué roles internos intentan esto y qué reciben? Roles internos (Admin, Soporte, Operador) reciben `403 SHARED_FORBIDDEN` en rutas de cobro de clientes; no pueden suplantar ni pagar en nombre de un usuario.

## 6. Experiencia de usuario
| Pantalla | Mockup (`docs/design/mockups/…`) | Estados requeridos | Estado del mockup |
|---|---|---|---|
| Pago simulado | `docs/design/mockups/billing/pago/` | formulario, procesando, rechazado, aprobado | Borrador |
| Plan y facturación | `docs/design/mockups/billing/suscripcion/` | con facturas, vacio, descargando | Borrador |

- Mensajes clave (español, tuteo, con acción correctiva):
  - Error: «La tarjeta fue rechazada. No se hizo ningún cargo. Prueba con otra tarjeta.»
  - Éxito: «Tu plan {nombre} ya está activo. Te enviamos el comprobante a {correo}.»
  - Vacío: «Aún no tienes facturas ni pagos registrados.»
  - Botones y contraste: Se utiliza el token `primary` corregido de Cielo Sereno (`#4A6FA5`, DF-41) en lugar de `#6B8DD6` para cumplir contraste AA.
  - Ruta de suscripción: `/suscripcion` (`apps/web/src/app/(app)/(cliente)/suscripcion/page.tsx`). La spec 009 construye el marco base con la tarjeta de plan actual, datos de facturación e historial de facturas; la spec 010 reutilizará esta pantalla para añadir renovación y cambio de plan.

## 7. Fuera de alcance
- Renovación automática por cron, aviso previo y renovación manual anticipada (Spec 010).
- Estado de cuenta en solo lectura tras vencimiento (Spec 010).
- Cambio de plan programado para el siguiente ciclo (Spec 010).
- Columnas `plan_pendiente_id` y `uso_agente` (DF-25, spec 010) y `cuota_extra_bytes` (DF-26, spec 011b).
- Descarga masiva «Descargar todas» en ZIP (se descargan PDFs individuales por YAGNI).
- Edición interactiva de datos de facturación fuera del flujo de pago (queda para 010/011b).
- Pasarelas de pago reales (Stripe, etc.) y administración del catálogo (Spec 011).

## 8. Preguntas
- [ABIERTA] ¿Qué plan muestra una cuenta de cliente sin verificar en administración (PD-80)? — bloquea: no. Propuesta: mientras no tenga suscripción por no estar verificada, reportar «Personal» o «—» (sin suscripción) y limitsFor degrada a Personal por robustez.
- [ABIERTA] ¿Cómo se retoma la elección de plan de pago hecha en el registro (001 CA-28)? — bloquea: no. Propuesta: diferir a decisión de diseño si se muestra un aviso contextual en la app hacia `/planes/contratar?plan={slug}` o si el usuario contrata directamente desde la navegación/catálogo sin banner propio.
- [RESUELTA] ¿Cómo se almacenan las facturas PDF? → En MinIO vía `IObjectStorage`, entregando URL firmada temporal de descarga (2026-10-09, usuario).
- [RESUELTA] ¿Se envía correo de comprobante? → Sí, encolado en `notifications` (`IMailer` / cola `mail`) al aprobar el pago (2026-10-09, usuario).
- [RESUELTA] ¿Alcance de PD-40 y PD-80? → Se incluyen en esta spec: oyente Personal, conciliación, catálogo registro y límites por suscripción activa (2026-10-09, usuario).

## 9. Registro de cambios
| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-10-09 | Creación inicial de la spec | Arranque de contratación, pagos y facturas (Fase 2) | Borrador (Juan Marcos) |
| 2026-10-09 | Ajustes de numeración de facturas, redondeo de IVA, preguntas abiertas para PD-80 y 001 CA-28 | Revisión de consistencia con mockups y líder técnico | Borrador (Juan Marcos) |
