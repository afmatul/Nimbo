# Spec 010 — Renovación, vencimiento y cambio de plan

> Qué y por qué, en ≤ 150 líneas. El cómo va en `./plan.md` (obligatorio).

| Campo | Valor |
|---|---|
| Estado | En curso (2026-10-18; avance de la 010a autorizado por Adrián antes de aprobar el plan, plan §8) |
| Dueño | Juan Marcos |
| Fase | 2 |
| Requisitos | RF-22, RF-23, RF-24 (y RF-07 y RNF-05 de forma transversal) |
| Depende de | 009 (suscripción, pago simulado, facturas); 005, 006 y 007 (acciones de `storage` que se bloquean) |
| Última actualización | 2026-10-18 |

## 1. Contexto y objetivo
La 009 deja a un cliente con un plan de pago por 30 días, pero nada pasa cuando ese periodo termina. Esta spec cierra
el ciclo: la suscripción se renueva sola con la tarjeta del último pago aprobado, el cliente recibe un aviso antes de vencer,
puede renovar por adelantado, y si no paga su cuenta queda en **solo lectura** sin perder nada. También permite
programar un cambio de plan (subir, bajar o volver a Personal) que se aplica en el siguiente ciclo, sin prorrateo.

## 2. Historias de usuario
- **HU-1** Como cliente con plan de pago, quiero que mi plan se renueve solo con mi última tarjeta, para no perder acceso.
- **HU-2** Como cliente, quiero un aviso antes del vencimiento y poder apagar o encender la renovación automática, para decidir a tiempo.
- **HU-3** Como cliente, quiero renovar a mano antes de vencer (o después, si quedé en solo lectura), sin perder días pagados.
- **HU-4** Como cliente con la suscripción vencida, quiero seguir viendo y descargando mis archivos, para no perder mi trabajo mientras pago.
- **HU-5** Como cliente, quiero programar un cambio de plan para el siguiente ciclo y cancelarlo antes de que se aplique.
- **HU-6** Como Operador, quiero que cada pasada de renovación deje conteos agregados en la bitácora y saber si el proceso falla, sin ver datos de ningún cliente (el tablero llega con la 022).

## 3. Criterios de aceptación
> Dado/Cuando/Entonces en una o dos líneas. Cada criterio es verificable por una prueba y rastrea a un requisito.

**Renovación automática y aviso**
- **CA-1** (HU-1, RF-22) Dado un plan de pago vigente con renovación automática y último pago aprobado con `4242 4242 4242 4242`, cuando llega `vence_en`, entonces se cobra el precio del plan del siguiente ciclo (RN-4) con la tarjeta de ese pago (RN-2), se registra la transacción aprobada, se emite la factura `NB-AAAA-NNNN` con su correo de comprobante (como en la 009) y el nuevo periodo de 30 días empieza en el `vence_en` anterior.
- **CA-2** (HU-1, RF-22, RF-23) — error: Dado lo mismo con último pago aprobado con `4000 0000 0000 0341` (se aprueba al contratar o renovar a mano y se rechaza en el cobro automático, RN-2), cuando llega `vence_en`, entonces se registra la transacción rechazada, no hay factura, la cuenta queda vencida en **solo lectura** con su mismo plan y se envía un correo que dice que venció y cómo renovar.
- **CA-3** (HU-1, RF-22) Dado que el proceso de renovación corre dos veces para el mismo periodo (o se reintenta tras una caída), entonces hay como máximo un cobro y una factura por suscripción y periodo.
- **CA-4** (HU-6, RF-22) — error: Dado un fallo del proceso de renovación (p. ej., base de datos no disponible), cuando corre, entonces el fallo queda en la bitácora técnica con su `code` y es observable para la alerta «fallo del proceso de renovación»; las suscripciones pendientes se procesan en la siguiente corrida con su `vence_en` original.
- **CA-5** (HU-2, RF-22) Dado un plan de pago que vence dentro de N días (RN-8, 3 por defecto), cuando corre el proceso de renovación, entonces el cliente recibe **un** correo por periodo con la fecha de vencimiento, el plan y el monto del siguiente ciclo y, según el caso, la tarjeta (marca y últimos 4) que se cobrará o el aviso de que su cuenta quedará en solo lectura si no renueva.
- **CA-6** (HU-2, RF-22) Dado un plan de pago, cuando el cliente desactiva o reactiva la renovación automática, entonces se responde `200`, la pantalla lo refleja, el periodo pagado no cambia y queda en su auditoría (RF-07). Con Personal se responde `400` `BILLING_NO_PAID_SUBSCRIPTION` y nada cambia.
- **CA-7** (HU-2, RF-22, RF-23) Dado un plan de pago con la renovación automática desactivada (con o sin un cambio programado a otro plan de pago), cuando llega `vence_en`, entonces no se cobra, la cuenta queda en solo lectura y se envía el correo de CA-2; un cambio programado sigue programado y se aplica cuando el cliente renueva a mano (CA-10, CA-20).

**Renovación manual**
- **CA-8** (HU-3, RF-22) Dado un plan de pago vigente sin cambio programado, cuando el cliente paga la renovación con `4242 4242 4242 4242`, entonces hay transacción, factura y correo, y `vence_en` pasa a 30 días después del `vence_en` vigente; el resumen del pago muestra el periodo nuevo antes de pagar.
- **CA-9** (HU-3, RF-22) — error: Dado lo mismo con `4000 0000 0000 0002`, cuando paga, entonces se responde `402 BILLING_PAYMENT_REJECTED` (como la 009), no hay factura y no cambian `vence_en` ni el estado de la cuenta.
- **CA-10** (HU-3, RF-22, RF-23) Dado una cuenta en solo lectura, cuando paga la renovación con éxito, entonces el periodo nuevo de 30 días empieza en el momento del pago, la solo lectura termina de inmediato y vuelve a poder subir.
- **CA-11** (HU-3, RF-22) — error: Dado una suscripción Personal, cuando intenta renovar, entonces se responde `400` `BILLING_NO_PAID_SUBSCRIPTION` y nada se cobra.

**Solo lectura**
- **CA-12** (HU-4, RF-23) Dado una cuenta en solo lectura, cuando lista, navega, busca, previsualiza o descarga archivos y versiones, entonces funciona igual que vigente; ningún archivo, carpeta ni versión se borra por el vencimiento y los límites del plan de pago se mantienen.
- **CA-13** (HU-4, RF-23) — error: Dado una cuenta en solo lectura, cuando intenta iniciar una carga, completar una en curso, crear una carpeta, renombrar, mover, restaurar una versión o restaurar desde la papelera, entonces se responde `403` `STORAGE_ACCOUNT_READ_ONLY` con «Tu suscripción venció y tu cuenta está en solo lectura. Renueva tu plan para volver a subir, editar y compartir.» y nada cambia.
- **CA-14** (HU-4, RF-23) Dado una cuenta en solo lectura, cuando abre el explorador o una vista de escritura, entonces ve el aviso de solo lectura con el enlace «Renovar plan»; las acciones bloqueadas por CA-13 se muestran deshabilitadas con su explicación en texto y, si aun así intenta (p. ej., arrastrar un archivo), ve el mensaje de CA-13.
- **CA-15** (HU-4, RF-23) Dado una suscripción Personal, entonces nunca vence ni entra en solo lectura.

**Cambio de plan**
- **CA-16** (HU-5, RF-24) Dado un plan de pago vigente, cuando el cliente elige otro plan activo (de pago o Personal), entonces se responde `200`, el cambio queda programado para `vence_en` y la pantalla dice «Tu plan cambiará a <plan> el <fecha>»; no se cobra nada ahora y el plan, sus límites y el periodo vigente no cambian. Programar otro plan reemplaza al anterior.
- **CA-17** (HU-5, RF-24) — error: Dado un plan de pago, cuando intenta programar un plan desactivado, inexistente o el mismo que tiene, entonces se responde `400` `BILLING_PLAN_CHANGE_INVALID` («No pudimos programar el cambio. Ese plan ya no está disponible. Cierra este aviso y elige otro plan de la lista.») y nada cambia. La lista de opciones no muestra planes desactivados (PD-86).
- **CA-18** (HU-5, RF-24) — error: Dado una suscripción Personal, cuando intenta programar un cambio, entonces se responde `400` `BILLING_NO_PAID_SUBSCRIPTION`; en la pantalla, elegir un plan de pago lleva a la contratación de la 009.
- **CA-19** (HU-5, RF-24) Dado un cambio programado, cuando el cliente lo cancela antes de `vence_en`, entonces se responde `200` y la renovación sigue con el plan actual. Sin cambio programado se responde `404` `BILLING_NO_PENDING_PLAN_CHANGE`.
- **CA-20** (HU-5, RF-24, RF-22) Dado un cambio programado a otro plan de pago, cuando se renueva al vencer (automática) o desde solo lectura (CA-10), nunca por adelantado (CA-28), entonces se cobra el precio completo del plan nuevo (sin prorrateo) y, si se aprueba, el periodo nuevo usa ese plan y sus límites. Si se rechaza, aplica CA-2 con el plan anterior y el cambio sigue programado.
- **CA-21** (HU-5, RF-24) Dado un cambio programado a Personal, cuando llega `vence_en`, entonces no se cobra, la cuenta pasa a Personal sin vencimiento ni solo lectura y no pierde archivos ni carpetas; si su uso supera la cuota de Personal, las cargas se rechazan por cuota (RF-12, 007) hasta liberar espacio. Las versiones anteriores que excedan las que guarda el plan nuevo se recortan al subir la siguiente versión de cada archivo (014 CA-13); la versión actual nunca se borra, y la confirmación del cambio lo avisa antes de programarlo.
- **CA-22** (HU-5, RF-24) Dado un cambio programado, cuando cambia el estado, entonces la auditoría del cliente registra programar, cancelar y aplicar el cambio (RF-07).

**Privacidad, aislamiento y pantalla**
- **CA-23** (HU-6, RF-05, RNF-05) Dado un Administrador, Soporte u Operador, cuando llama a cualquier operación de esta spec, entonces recibe `403` y nada cambia. Cada pasada del proceso deja en la bitácora estructurada solo conteos agregados (renovadas, rechazadas, pasadas a solo lectura, avisos enviados, fallos), sin identificadores ni datos de clientes; no hay endpoint para el Operador en esta spec (el tablero llega con la 022).
- **CA-24** (RNF-05) Dado dos clientes A y B, cuando A consulta o cambia su suscripción, renovación o cambio de plan, entonces solo opera sobre la suya: no hay forma de leer ni alterar la de B.
- **CA-25** (HU-2, HU-5, RF-22, RF-24) Dado un plan de pago, cuando abre «Plan y facturación», entonces ve «Próximo cobro» (fecha, monto, marca y últimos 4), el interruptor de renovación automática, «Cambiar de plan» y el estado que corresponda de §6.
- **CA-26** (HU-3, RF-22) — error: Dado un cliente que ya pagó por adelantado el siguiente periodo, cuando intenta pagar otro, entonces se responde `409` `BILLING_ALREADY_RENEWED` y no hay cobro.
- **CA-27** (HU-5, RF-24, RF-23) Dado una cuenta en solo lectura, cuando programa el cambio a Personal, entonces se aplica de inmediato, sin cobro, y termina la solo lectura (si el uso supera la cuota de Personal, aplica CA-21).
- **CA-28** (HU-3, RF-24) — error: Dado un plan de pago vigente con **cualquier** cambio programado (a Personal o a otro plan de pago), cuando el cliente intenta renovar por adelantado, entonces se responde `409` `BILLING_PLAN_CHANGE_PENDING`, no hay cobro y nada cambia hasta que cancele el cambio; la pantalla no ofrece «Renovar ahora».
- **CA-29** (HU-5, RF-24) Dado un cambio programado a un plan que se desactiva antes de `vence_en` (011), cuando llega la renovación, entonces el cambio se descarta, se renueva con el plan actual y el cliente recibe un correo que lo explica.

## 4. Reglas de negocio
- **RN-1** El periodo de un plan de pago es de 30 días (009). El periodo nuevo empieza en el `vence_en` anterior si se paga antes (solo sin cambio programado, CA-28) o al vencer, y en el momento del pago si la cuenta ya estaba en solo lectura. No se pierden días pagados.
- **RN-2** La renovación automática cobra con la tarjeta del último pago aprobado, mediante una referencia que la pasarela entrega al aprobarlo y que no contiene el número. Nunca se guardan el número completo ni el CVC (RN-9 de la 009); marca y últimos 4 solo se muestran. Tarjetas del simulador: `4242 4242 4242 4242` aprueba siempre; `4000 0000 0000 0341` se aprueba con el cliente presente (contratar, renovar a mano) y se rechaza en el cobro automático; `4000 0000 0000 0002` se rechaza siempre.
- **RN-3** La renovación automática está activada al contratar; el cliente puede apagarla y volver a encenderla mientras su plan esté vigente. Apagarla no cancela el periodo pagado.
- **RN-4** Cada renovación cobra el precio completo, en centavos, del plan del siguiente ciclo: el programado si hay uno, si no el actual. No hay prorrateo ni reembolsos. Los impuestos y la factura siguen las reglas de la 009; la factura de la renovación automática lleva el NIT de la última factura del cliente, o `CF` si no tiene.
- **RN-5** Solo lectura = plan de pago con `vence_en` pasado y sin pago. La cuenta conserva su plan y sus límites, no baja a Personal y no pierde contenido; termina al pagar la renovación. Personal nunca entra en solo lectura.
- **RN-6** En solo lectura se permite ver, navegar, buscar, previsualizar y descargar (glosario «Degradación a solo lectura»); se rechaza todo lo que crea o modifica contenido (CA-13). Para liberar espacio se permite mandar a la papelera, eliminar definitivamente y vaciarla; también fijar accesos rápidos y consultar al agente, que no cambian contenido. En lo compartido (012, 013, acuerdo con Fátima, plan 012 D-4): con la cuenta del propietario en solo lectura se rechazan compartir, crear enlaces públicos, subir un acceso de Lector a Editor y las versiones nuevas de un Editor; se permiten quitar accesos, bajar a Lector y «Salir», que reducen lo compartido. El propietario recibe `STORAGE_ACCOUNT_READ_ONLY` (CA-13); el Editor, el código neutro que define la 012 (`STORAGE_SHARED_VERSION_UNAVAILABLE`), para no revelarle que la cuenta del otro venció. La edición `.docx` (016) y el optimizador (021) heredan esta regla cuando existan.
- **RN-7** El cambio de plan es solo programado: uno a la vez, a un plan activo distinto del actual, cancelable hasta `vence_en` y efectivo al renovar al vencer (automática) o desde solo lectura (CA-10); con un cambio programado no se renueva por adelantado (CA-28). Bajar a Personal es un cambio programado sin cobro. Desde Personal no hay cambio: se contrata (009).
- **RN-8** El aviso previo se envía N días antes de `vence_en`; N es configurable sin cambiar código y vale 3 por defecto. Un aviso por periodo.
- **RN-9** Un cobro como máximo por suscripción y periodo, sea automático o manual (Art. XI.2).
- **RN-10** El cobro automático se intenta una sola vez por periodo; si se rechaza, la cuenta sigue con la renovación manual (CA-9, CA-10). A una cuenta que ya está en solo lectura nunca se le cobra en automático.
- **RN-11** En archivos compartidos manda la cuenta propietaria del archivo: un archivo de una cuenta en solo lectura no se edita, aunque lo abra un editor con cuenta vigente (lo aplican 012 y 016).

## 5. Seguridad y privacidad
- Toca datos de un cliente (suscripción, pagos, facturas y el estado que limita sus archivos): lleva pruebas de aislamiento (CA-24).
- Auditoría visible para el cliente (RF-07): activar y desactivar la renovación automática, renovación aprobada o rechazada, entrada y salida de solo lectura, y programar, cancelar y aplicar un cambio de plan.
- Bitácoras y auditoría sin número de tarjeta ni CVC, sin contenido ni nombres de archivo; el correo solo muestra marca y últimos 4. La referencia de la tarjeta (RN-2) no sale del servidor: no llega al navegador ni a bitácoras, auditoría o correos.
- Roles internos: `403` en todas las operaciones (CA-23). Ajustar la vigencia de una cuenta es del Administrador en la 011b, no aquí.

## 6. Experiencia de usuario
| Pantalla | Mockup (`docs/design/mockups/…`) | Estados requeridos | Estado del mockup |
|---|---|---|---|
| Plan y facturación (`/suscripcion`) | `billing/suscripcion/suscripcion--{vigente,por-vencer,renovacion-desactivada,cambio-programado,cambio-a-personal,vencida,confirmar-desactivar,error-renovacion}.html` | vigente (con próximo cobro), por-vencer, vencida/solo lectura, cambio-programado (a plan de pago y a Personal), renovación-desactivada (también con un cambio programado, nota del README), confirmación al apagar, error | Existe (010) |
| Elegir plan para el cambio | `billing/planes/planes--{cambiar-plan,confirmar-cambio,confirmar-personal,confirmar-personal-solo-lectura,cambio-error}.html` | lista de planes activos, plan actual marcado, confirmación (con el aviso de versiones de CA-21), bajada a Personal (también en solo lectura, CA-27), error | Existe (010) |
| Pago de la renovación manual | `billing/pago/pago--{renovacion,renovacion-rechazado,renovacion-exito,renovacion-solo-lectura}.html` | default con el periodo nuevo, rechazado, éxito, desde solo lectura | Existe (010) |
| Aviso de solo lectura (explorador y vistas de escritura) | `shared/layout/layout--solo-lectura.html` (`ReadOnlyBanner`, RF-23) | visible con «Renovar plan», acción bloqueada | Existe (000b) |

- Por vencer: «Tu plan <plan> vence el <fecha>. Se renovará con <marca> ···· <últimos 4>.» o, sin renovación automática, «Tu plan vence el <fecha> y no se renovará. Renueva ahora para no quedar en solo lectura.»
- Sin renovación automática y con un cambio programado (CA-7, CA-28): «Tu plan vence el <fecha> y no se renovará. Para renovar ahora, primero cancela el cambio a <plan>.», con «Cancelar cambio» y sin «Renovar ahora».
- Vencida: «Tu suscripción venció. Puedes ver y descargar tus archivos, pero no subir ni editar. Renueva tu plan.»
- Cambio programado: «Tu plan cambiará a <plan> el <fecha>.» con la acción «Cancelar cambio».

## 7. Fuera de alcance
- Cobro proporcional (prorrateo) al cambiar de plan (`product-context.md` §9) y cambios de plan inmediatos.
- Reembolsos, gestionar tarjetas guardadas o cambiar la tarjeta de la renovación automática (solo se reutiliza la del último pago aprobado, RN-2), varios métodos de pago, dinero real.
- Cancelar la suscripción con efecto inmediato; dar de baja la cuenta.
- Ajuste de vigencia o de cuota por el Administrador (011b).
- Reinicio del contador de consultas del agente al renovar (llega con la 020).
- Las alertas y tableros mismos (022): aquí solo se deja observable el fallo del proceso.

## 8. Preguntas
- [RESUELTA] Mockups → se crearon con `/mockup` (2026-10-18, `358d87c`; aprobados por Juan Marcos): ocho estados de «Plan y facturación», cinco del cambio de plan y cuatro del pago de la renovación (tabla de §6). El aviso de solo lectura ya existía (`shared/layout/layout--solo-lectura.html`).
- [RESUELTA] Acciones en solo lectura → se permiten papelera (mandar, eliminar definitivamente, vaciar), accesos rápidos y agente; se bloquean restaurar desde la papelera, compartir y enlaces públicos (RN-6, CA-13).
- [RESUELTA] Reintento del cobro automático → un solo intento (RN-10).
- [RESUELTA] Pagar más de un periodo por adelantado → no, `409 BILLING_ALREADY_RENEWED` (CA-26).
- [RESUELTA] Bajar a Personal en solo lectura → inmediato y sin cobro (CA-27).
- [RESUELTA] Renovación anticipada con un cambio programado (a Personal o a otro plan de pago) → no, `409` hasta cancelar el cambio; el cambio se aplica al vencer o desde solo lectura (CA-28, CA-20; Juan Marcos, 2026-10-18, B-1 del PR #63).
- [RESUELTA] Cómo se demuestra CA-2 con el simulador → tarjeta `4000 0000 0000 0341`, aprobada con el cliente presente y rechazada en el cobro automático (RN-2; Juan Marcos, 2026-10-18, B-2 del PR #63).
- [RESUELTA] Plan programado desactivado → se descarta, se renueva con el actual y se avisa por correo (CA-29).
- [RESUELTA] Archivos compartidos → manda la cuenta propietaria del archivo (RN-11; lo aplican 012 y 016).

## 9. Registro de cambios
| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-10-16 | Creación inicial con las decisiones acordadas con Juan Marcos (tarjeta del último pago, solo lectura sin bajar a Personal, aviso a 3 días, cambio solo programado, renovación anticipada sin perder días) | Arranque de la 010 | Borrador (pendiente Adrián) |
| 2026-10-16 | Preguntas resueltas con las recomendaciones: solo lectura (RN-6, CA-13), un intento de cobro (RN-10), propietario en compartidos (RN-11), CA-26 a CA-29; mockups con `/mockup` antes de la UI | Respuestas de Juan Marcos | Borrador (pendiente Adrián) |
| 2026-10-16 | HU-6 y CA-23: los conteos del Operador quedan en la bitácora estructurada de cada pasada, sin datos de clientes y sin endpoint (tablero en la 022). RN-4: NIT de la renovación automática = el de la última factura, o `CF` | Revisión del plan por el `architect` (YAGNI: aún no hay Prometheus en la API) | Borrador (pendiente Adrián) |
| 2026-10-16 | RN-4: Juan Marcos confirma el NIT de la renovación automática (el de la última factura del cliente o `CF`) | Confirmación de Juan Marcos | Borrador (pendiente Adrián) |
| 2026-10-17 | CA-7: renovación apagada con un cambio programado a un plan de pago (no se cobra, solo lectura, el cambio sigue para la renovación manual). CA-21: al bajar de plan no se pierden archivos ni carpetas; las versiones que excedan el límite nuevo se recortan al subir la siguiente versión (014 CA-13) y la confirmación lo avisa | Revisión de la spec antes de mandarla a Adrián (huecos con CA-20 y con la poda de versiones de la 014) | Borrador (pendiente Adrián) |
| 2026-10-17 | §6: inventario de mockups corregido (el aviso de solo lectura ya existe en `shared/layout/layout--solo-lectura.html`; se nombran los archivos de cada pantalla y lo que falta) | Revisión de mockups antes de `/mockup` | Borrador (pendiente Adrián) |
| 2026-10-18 | B-1: CA-28 se generaliza a **cualquier** cambio programado (`409 BILLING_PLAN_CHANGE_PENDING`, sin «Renovar ahora»); CA-8 exige no tener cambio programado; CA-20, RN-1 y RN-7: el cambio se aplica solo al vencer (automática) o desde solo lectura (CA-10), nunca por adelantado | Auditoría de Adrián, PR #63 (decisión de Juan Marcos) | Borrador (pendiente Adrián) |
| 2026-10-18 | B-2: tarjeta de prueba `4000 0000 0000 0341` (aprobada con el cliente presente, rechazada en el cobro automático); CA-2 la usa, CA-1 cita la tarjeta completa, RN-2 lista las tres tarjetas. La 010 amplía las tarjetas de prueba de la 009 | Auditoría de Adrián, PR #63 (decisión de Juan Marcos) | Borrador (pendiente Adrián) |
| 2026-10-18 | M-2: RN-2, CA-1 y §5: la renovación automática cobra con una referencia de la tarjeta que emite la pasarela al aprobar (sin número; nunca sale del servidor); marca y últimos 4 solo se muestran; §7 aclara que no hay gestión de tarjetas guardadas | Auditoría de Adrián, PR #63 (decisión de Juan Marcos; el puerto lo revisa el `architect`) | Borrador (pendiente Adrián) |
| 2026-10-18 | M-3: RN-10 suma que una cuenta en solo lectura nunca se cobra en automático. m-2: CA-5 ya no dice «proceso diario» (la pasada es periódica, plan §1) | Auditoría de Adrián, PR #63 | Borrador (pendiente Adrián) |
| 2026-10-18 | Sin cambio de comportamiento en la spec: M-1 dos PR (010a `api`/`worker`/`storage`, 010b `web`) en `tasks.md`; M-5, m-1, m-3, m-5 y m-6 en el plan (§2, §6, §7) y en ADR-0029 (regla 3 con los `POST` que no escriben; consecuencia del nombre de `PlanLimits`) | Auditoría de Adrián, PR #63 | Borrador (pendiente Adrián) |
| 2026-10-18 | RN-6: excepciones de solo lectura en lo compartido y código neutro para el Editor (012); CA-13: el mensaje cubre compartir | Acuerdo con Fátima (plan 012 D-4) | Borrador (pendiente Adrián) |
| 2026-10-18 | §6: tarjeta como «···· <últimos 4>» (como la 009); CA-17: mensaje de `BILLING_PLAN_CHANGE_INVALID` del mockup `planes--cambio-error`. Mockups de la 010 aprobados por Juan Marcos (14 decisiones de UX) | Mockups de `billing/suscripcion`, `planes` y `pago` | Borrador (pendiente Adrián) |
| 2026-10-18 | §6: la tabla nombra los mockups que ya existen y suma el texto de la renovación apagada con un cambio programado (sin «Renovar ahora», CA-28); §8: inventario de mockups al día; estado «En curso» por el avance autorizado de la 010a | Re-verificación de Adrián, PR #63 (N-3, N-4) | Borrador (pendiente Adrián) |
| 2026-10-18 | Sin cambio de comportamiento: el plan (§2, §7, §8 punto 3) describe lo implementado en la 010a (`isChargeable`, `BillingChargingModule`, módulos del `api`, tareas movidas a T-05, PD-63 dentro de la 010a) | Tercera verificación de Adrián, PR #63 (R-1) | Borrador (pendiente Adrián) |
