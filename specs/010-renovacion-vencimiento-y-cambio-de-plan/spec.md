# Spec 010 — Renovación, vencimiento y cambio de plan

> Qué y por qué, en ≤ 150 líneas. El cómo va en `./plan.md` (obligatorio).

| Campo | Valor |
|---|---|
| Estado | Borrador |
| Dueño | Juan Marcos |
| Fase | 2 |
| Requisitos | RF-22, RF-23, RF-24 (y RF-07 y RNF-05 de forma transversal) |
| Depende de | 009 (suscripción, pago simulado, facturas); 005, 006 y 007 (acciones de `storage` que se bloquean) |
| Última actualización | 2026-10-16 |

## 1. Contexto y objetivo
La 009 deja a un cliente con un plan de pago por 30 días, pero nada pasa cuando ese periodo termina. Esta spec cierra
el ciclo: la suscripción se renueva sola con la última tarjeta aprobada, el cliente recibe un aviso antes de vencer,
puede renovar por adelantado, y si no paga su cuenta queda en **solo lectura** sin perder nada. También permite
programar un cambio de plan (subir, bajar o volver a Personal) que se aplica en el siguiente ciclo, sin prorrateo.

## 2. Historias de usuario
- **HU-1** Como cliente con plan de pago, quiero que mi plan se renueve solo con mi última tarjeta, para no perder acceso.
- **HU-2** Como cliente, quiero un aviso antes del vencimiento y poder apagar o encender la renovación automática, para decidir a tiempo.
- **HU-3** Como cliente, quiero renovar a mano antes de vencer (o después, si quedé en solo lectura), sin perder días pagados.
- **HU-4** Como cliente con la suscripción vencida, quiero seguir viendo y descargando mis archivos, para no perder mi trabajo mientras pago.
- **HU-5** Como cliente, quiero programar un cambio de plan para el siguiente ciclo y cancelarlo antes de que se aplique.
- **HU-6** Como Operador, quiero conteos de renovaciones y saber si el proceso falla, sin ver datos de ningún cliente.

## 3. Criterios de aceptación
> Dado/Cuando/Entonces en una o dos líneas. Cada criterio es verificable por una prueba y rastrea a un requisito.

**Renovación automática y aviso**
- **CA-1** (HU-1, RF-22) Dado un plan de pago vigente con renovación automática y último pago aprobado con tarjeta terminada en `4242`, cuando llega `vence_en`, entonces se cobra el precio del plan del siguiente ciclo (RN-4) con esa marca y últimos 4, se registra la transacción aprobada, se emite la factura `NB-AAAA-NNNN` con su correo de comprobante (como en la 009) y el nuevo periodo de 30 días empieza en el `vence_en` anterior.
- **CA-2** (HU-1, RF-22, RF-23) — error: Dado lo mismo con tarjeta terminada en `0002`, cuando llega `vence_en`, entonces se registra la transacción rechazada, no hay factura, la cuenta queda vencida en **solo lectura** con su mismo plan y se envía un correo que dice que venció y cómo renovar.
- **CA-3** (HU-1, RF-22) Dado que el proceso de renovación corre dos veces para el mismo periodo (o se reintenta tras una caída), entonces hay como máximo un cobro y una factura por suscripción y periodo.
- **CA-4** (HU-6, RF-22) — error: Dado un fallo del proceso de renovación (p. ej., base de datos no disponible), cuando corre, entonces el fallo queda en la bitácora técnica con su `code` y es observable para la alerta «fallo del proceso de renovación»; las suscripciones pendientes se procesan en la siguiente corrida con su `vence_en` original.
- **CA-5** (HU-2, RF-22) Dado un plan de pago que vence dentro de N días (RN-8, 3 por defecto), cuando corre el proceso diario, entonces el cliente recibe **un** correo por periodo con la fecha de vencimiento, el plan y el monto del siguiente ciclo y, según el caso, la tarjeta (marca y últimos 4) que se cobrará o el aviso de que su cuenta quedará en solo lectura si no renueva.
- **CA-6** (HU-2, RF-22) Dado un plan de pago, cuando el cliente desactiva o reactiva la renovación automática, entonces se responde `200`, la pantalla lo refleja, el periodo pagado no cambia y queda en su auditoría (RF-07). Con Personal se responde `400` `BILLING_NO_PAID_SUBSCRIPTION` y nada cambia.
- **CA-7** (HU-2, RF-22, RF-23) Dado un plan de pago con la renovación automática desactivada y sin cambio programado, cuando llega `vence_en`, entonces no se cobra, la cuenta queda en solo lectura y se envía el correo de CA-2.

**Renovación manual**
- **CA-8** (HU-3, RF-22) Dado un plan de pago vigente, cuando el cliente paga la renovación con `4242 4242 4242 4242`, entonces hay transacción, factura y correo, y `vence_en` pasa a 30 días después del `vence_en` vigente; el resumen del pago muestra el periodo nuevo antes de pagar.
- **CA-9** (HU-3, RF-22) — error: Dado lo mismo con `4000 0000 0000 0002`, cuando paga, entonces se responde `402 BILLING_PAYMENT_REJECTED` (como la 009), no hay factura y no cambian `vence_en` ni el estado de la cuenta.
- **CA-10** (HU-3, RF-22, RF-23) Dado una cuenta en solo lectura, cuando paga la renovación con éxito, entonces el periodo nuevo de 30 días empieza en el momento del pago, la solo lectura termina de inmediato y vuelve a poder subir.
- **CA-11** (HU-3, RF-22) — error: Dado una suscripción Personal, cuando intenta renovar, entonces se responde `400` `BILLING_NO_PAID_SUBSCRIPTION` y nada se cobra.

**Solo lectura**
- **CA-12** (HU-4, RF-23) Dado una cuenta en solo lectura, cuando lista, navega, busca, previsualiza o descarga archivos y versiones, entonces funciona igual que vigente; ningún archivo, carpeta ni versión se borra por el vencimiento y los límites del plan de pago se mantienen.
- **CA-13** (HU-4, RF-23) — error: Dado una cuenta en solo lectura, cuando intenta iniciar una carga, completar una en curso, crear una carpeta, renombrar, mover o restaurar una versión, entonces se responde `403` `STORAGE_ACCOUNT_READ_ONLY` con «Tu suscripción venció y tu cuenta está en solo lectura. Renueva tu plan para volver a subir y editar.» y nada cambia. Lo que diga la pregunta 2 se agrega aquí.
- **CA-14** (HU-4, RF-23) Dado una cuenta en solo lectura, cuando abre el explorador o una vista de escritura, entonces ve el aviso de solo lectura con el enlace «Renovar plan»; las acciones bloqueadas por CA-13 se muestran deshabilitadas con su explicación en texto y, si aun así intenta (p. ej., arrastrar un archivo), ve el mensaje de CA-13.
- **CA-15** (HU-4, RF-23) Dado una suscripción Personal, entonces nunca vence ni entra en solo lectura.

**Cambio de plan**
- **CA-16** (HU-5, RF-24) Dado un plan de pago vigente, cuando el cliente elige otro plan activo (de pago o Personal), entonces se responde `200`, el cambio queda programado para `vence_en` y la pantalla dice «Tu plan cambiará a <plan> el <fecha>»; no se cobra nada ahora y el plan, sus límites y el periodo vigente no cambian. Programar otro plan reemplaza al anterior.
- **CA-17** (HU-5, RF-24) — error: Dado un plan de pago, cuando intenta programar un plan desactivado, inexistente o el mismo que tiene, entonces se responde `400` `BILLING_PLAN_CHANGE_INVALID` y nada cambia. La lista de opciones no muestra planes desactivados (PD-86).
- **CA-18** (HU-5, RF-24) — error: Dado una suscripción Personal, cuando intenta programar un cambio, entonces se responde `400` `BILLING_NO_PAID_SUBSCRIPTION`; en la pantalla, elegir un plan de pago lleva a la contratación de la 009.
- **CA-19** (HU-5, RF-24) Dado un cambio programado, cuando el cliente lo cancela antes de `vence_en`, entonces se responde `200` y la renovación sigue con el plan actual. Sin cambio programado se responde `404` `BILLING_NO_PENDING_PLAN_CHANGE`.
- **CA-20** (HU-5, RF-24, RF-22) Dado un cambio programado a otro plan de pago, cuando se renueva (automática o manual), entonces se cobra el precio completo del plan nuevo (sin prorrateo) y, si se aprueba, el periodo nuevo usa ese plan y sus límites. Si se rechaza, aplica CA-2 con el plan anterior y el cambio sigue programado.
- **CA-21** (HU-5, RF-24) Dado un cambio programado a Personal, cuando llega `vence_en`, entonces no se cobra, la cuenta pasa a Personal sin vencimiento ni solo lectura y no pierde contenido; si su uso supera la cuota de Personal, las cargas se rechazan por cuota (RF-12, 007) hasta liberar espacio.
- **CA-22** (HU-5, RF-24) Dado un cambio programado, cuando cambia el estado, entonces la auditoría del cliente registra programar, cancelar y aplicar el cambio (RF-07).

**Privacidad, aislamiento y pantalla**
- **CA-23** (HU-6, RF-05, RNF-05) Dado un Administrador, Soporte u Operador, cuando llama a cualquier operación de esta spec, entonces recibe `403` y nada cambia. El Operador solo ve conteos agregados (renovaciones aprobadas y rechazadas, cuentas en solo lectura, cambios programados), sin identificadores de cuenta.
- **CA-24** (RNF-05) Dado dos clientes A y B, cuando A consulta o cambia su suscripción, renovación o cambio de plan, entonces solo opera sobre la suya: no hay forma de leer ni alterar la de B.
- **CA-25** (HU-2, HU-5, RF-22, RF-24) Dado un plan de pago, cuando abre «Plan y facturación», entonces ve «Próximo cobro» (fecha, monto, marca y últimos 4), el interruptor de renovación automática, «Cambiar de plan» y el estado que corresponda de §6.

## 4. Reglas de negocio
- **RN-1** El periodo de un plan de pago es de 30 días (009). El periodo nuevo empieza en el `vence_en` anterior si se paga antes o al vencer, y en el momento del pago si la cuenta ya estaba en solo lectura. No se pierden días pagados.
- **RN-2** La renovación automática cobra con la marca y los últimos 4 de la tarjeta del último pago aprobado. Nunca se guardan el número completo ni el CVC (RN-9 de la 009). En el simulador deciden los últimos 4: `4242` aprueba y `0002` rechaza.
- **RN-3** La renovación automática está activada al contratar; el cliente puede apagarla y volver a encenderla mientras su plan esté vigente. Apagarla no cancela el periodo pagado.
- **RN-4** Cada renovación cobra el precio completo, en centavos, del plan del siguiente ciclo: el programado si hay uno, si no el actual. No hay prorrateo ni reembolsos. Los impuestos y la factura siguen las reglas de la 009.
- **RN-5** Solo lectura = plan de pago con `vence_en` pasado y sin pago. La cuenta conserva su plan y sus límites, no baja a Personal y no pierde contenido; termina al pagar la renovación. Personal nunca entra en solo lectura.
- **RN-6** En solo lectura se permite ver, navegar, buscar, previsualizar y descargar (glosario «Degradación a solo lectura»); se rechaza todo lo que crea o modifica contenido (CA-13). La edición `.docx` (016) y el optimizador (021) heredan esta regla cuando existan.
- **RN-7** El cambio de plan es solo programado: uno a la vez, a un plan activo distinto del actual, cancelable hasta `vence_en` y efectivo al renovar. Bajar a Personal es un cambio programado sin cobro. Desde Personal no hay cambio: se contrata (009).
- **RN-8** El aviso previo se envía N días antes de `vence_en`; N es configurable sin cambiar código y vale 3 por defecto. Un aviso por periodo.
- **RN-9** Un cobro como máximo por suscripción y periodo, sea automático o manual (Art. XI.2).

## 5. Seguridad y privacidad
- Toca datos de un cliente (suscripción, pagos, facturas y el estado que limita sus archivos): lleva pruebas de aislamiento (CA-24).
- Auditoría visible para el cliente (RF-07): activar y desactivar la renovación automática, renovación aprobada o rechazada, entrada y salida de solo lectura, y programar, cancelar y aplicar un cambio de plan.
- Bitácoras y auditoría sin número de tarjeta ni CVC, sin contenido ni nombres de archivo; el correo solo muestra marca y últimos 4.
- Roles internos: `403` en todas las operaciones (CA-23). Ajustar la vigencia de una cuenta es del Administrador en la 011b, no aquí.

## 6. Experiencia de usuario
| Pantalla | Mockup (`docs/design/mockups/…`) | Estados requeridos | Estado del mockup |
|---|---|---|---|
| Plan y facturación (`/suscripcion`) | `billing/suscripcion/` | vigente (con próximo cobro), por-vencer, vencida/solo lectura, cambio-programado, renovación-desactivada | Borrador (solo `vigente`) |
| Elegir plan para el cambio | `billing/planes/` (`plan-actual`) | lista de planes activos, plan actual marcado, confirmación, error | Borrador (`plan-actual`) |
| Pago de la renovación manual | `billing/pago/` | default con el periodo nuevo, rechazado, éxito | Borrador (`default`) |
| Aviso de solo lectura (explorador y vistas de escritura) | sin mockup (`ReadOnlyBanner` de `ui-guidelines.md` §4) | visible con «Renovar plan», acción bloqueada | Falta |

- Por vencer: «Tu plan <plan> vence el <fecha>. Se renovará con <marca> •••• <últimos 4>.» o, sin renovación automática, «Tu plan vence el <fecha> y no se renovará. Renueva ahora para no quedar en solo lectura.»
- Vencida: «Tu suscripción venció. Puedes ver y descargar tus archivos, pero no subir ni editar. Renueva tu plan.»
- Cambio programado: «Tu plan cambiará a <plan> el <fecha>.» con la acción «Cancelar cambio».

## 7. Fuera de alcance
- Cobro proporcional (prorrateo) al cambiar de plan (`product-context.md` §9) y cambios de plan inmediatos.
- Reembolsos, tarjetas guardadas o cambiar la tarjeta de la renovación automática, varios métodos de pago, dinero real.
- Cancelar la suscripción con efecto inmediato; dar de baja la cuenta.
- Ajuste de vigencia o de cuota por el Administrador (011b).
- Reinicio del contador de consultas del agente al renovar (llega con la 020).
- Las alertas y tableros mismos (022): aquí solo se deja observable el fallo del proceso.

## 8. Preguntas
- [ABIERTA] ¿Se crean con `/mockup` los estados por-vencer, vencida, cambio-programado y renovación-desactivada de «Plan y facturación», la elección de plan y el aviso de solo lectura, o se usan patrones existentes (`Alert`, `ReadOnlyBanner`, tarjetas de `planes--plan-actual`, `pago`)? — bloquea: sí
- [ABIERTA] En solo lectura, ¿qué pasa con las acciones que el glosario no menciona: enviar a la papelera, restaurar desde ella, eliminar definitivamente o vaciarla (liberan espacio), compartir y enlaces públicos (012, 013), fijar accesos rápidos (RF-38) y consultar al agente (020)? — bloquea: sí (define CA-13)
- [ABIERTA] Tras un cobro automático rechazado, ¿se reintenta? Propuesta: un solo intento; después, renovación manual. — bloquea: no
- [ABIERTA] ¿Se puede pagar por adelantado más de un periodo? Propuesta: no; con el siguiente ya pagado, `409` `BILLING_ALREADY_RENEWED`. — bloquea: no
- [ABIERTA] Con la cuenta ya en solo lectura, ¿bajar a Personal se aplica de inmediato y sin cobro? Propuesta: sí. — bloquea: no
- [ABIERTA] Con un cambio a Personal programado, ¿se ofrece la renovación manual anticipada? Propuesta: no, hasta cancelar el cambio. — bloquea: no
- [ABIERTA] Si el plan programado se desactiva (011) antes de aplicarse, ¿qué hace la renovación? Propuesta: lo descarta, renueva con el plan actual y lo avisa por correo. — bloquea: no
- [ABIERTA] Archivos compartidos: ¿un editor puede editar el `.docx` de un propietario en solo lectura, y un cliente en solo lectura puede editar como editor archivos de una cuenta vigente? Propuesta: manda la cuenta propietaria del archivo. — bloquea: no (bloquea a la 016)

## 9. Registro de cambios
| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-10-16 | Creación inicial con las decisiones acordadas con Juan Marcos (tarjeta del último pago, solo lectura sin bajar a Personal, aviso a 3 días, cambio solo programado, renovación anticipada sin perder días) | Arranque de la 010 | Borrador (pendiente Adrián) |
