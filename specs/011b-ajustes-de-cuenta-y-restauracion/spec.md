# Spec 011b — Ajustes de cuenta y restauración por Soporte

> Qué y por qué, en ≤ 150 líneas. El cómo va en `./plan.md` (obligatorio).

| Campo | Valor |
|---|---|
| Estado | Borrador (2026-10-22) |
| Dueño | Fátima |
| Fase | 2 |
| Requisitos | RF-05, RF-06, RF-07, RF-12, RF-22, RF-23, RF-24; RNF-05, RNF-13, RNF-14, RNF-17 |
| Depende de | 004, 006, 007 (resumen de espacio, P-3), 009, 010, 011 |
| Última actualización | 2026-10-22 |

## 1. Contexto y objetivo
La 011 dejó fuera, por tamaño, tres operaciones que la matriz de roles ya define: el Administrador ajusta la cuota y la
vigencia de una cuenta, y Soporte restaura un elemento de la papelera de un cliente con un motivo escrito (P-8 de la
011). Esta spec las cierra sin reabrir la 011: no cambia planes, precios ni cobros, y no da a ningún rol interno acceso
al contenido. El resultado es que una cuenta puede recibir espacio o tiempo extra sin contratar otro plan, y que Soporte
puede deshacer una eliminación concreta dejando rastro visible para el cliente.

## 2. Historias de usuario
- **HU-1** Como Administrador, quiero dar a una cuenta un espacio extra temporal, para resolver una necesidad puntual sin cambiar su plan.
- **HU-2** Como Administrador, quiero extender la vigencia de una cuenta de pago, para darle un plazo y quitarle la solo lectura sin registrar un cobro.
- **HU-3** Como Soporte, quiero ver la papelera de un cliente y restaurar un elemento con un motivo, para corregir una eliminación sin pedirle al cliente que lo haga.
- **HU-4** Como cliente, quiero ver en mi actividad los ajustes y la restauración hechos por el personal, con su motivo, para saber qué cambió en mi cuenta.
- **HU-5** Como Administrador, quiero ver en la ficha de la cuenta su cuota, su extra y su vencimiento, para decidir antes de ajustar.

## 3. Criterios de aceptación
> Dado/Cuando/Entonces en una o dos líneas. Cada criterio es verificable por una prueba y rastrea a un requisito.

**Cuota**
- **CA-1** (HU-1, RF-06, RF-12) Dado un cliente con suscripción, cuando el Administrador fija un extra de X bytes hasta una fecha futura, entonces la cuota efectiva pasa a ser la del plan + X hasta esa fecha, la ficha lo muestra y la acción queda en la auditoría del cliente.
- **CA-2** (HU-1, RF-06, RF-12) - error: Dado un extra que dejaría la cuota total por debajo de lo ya usado, cuando se intenta guardar, entonces se responde `422` `BACKOFFICE_QUOTA_BELOW_USAGE` con el usado y el total resultante, y nada cambia.
- **CA-3** (HU-1, RF-06) - error: Dado un extra de cero o negativo, una fecha pasada, una cuenta interna, una cuenta sin suscripción o un cliente inexistente, cuando se intenta guardar, entonces se responde `422` `BACKOFFICE_QUOTA_INVALID` o `404` `IDENTITY_ACCOUNT_NOT_FOUND` según el caso, y nada cambia.
- **CA-4** (HU-1, RF-12) Dado un extra vigente, cuando el Administrador lo cambia, lo quita o lo acorta (sin dejar la cuota bajo lo usado), entonces rige el valor nuevo, se audita y no se borra ningún archivo; al vencer la fecha, la cuota vuelve a la del plan sin trabajo programado.
- **CA-5** (HU-4, RF-12) Dado un extra vigente, cuando el cliente abre el resumen de espacio, entonces ve la cuota total y una nota con los GB extra y hasta cuándo; al vencer, la nota desaparece. *(Sujeto a P-3.)*

**Vigencia**
- **CA-6** (HU-2, RF-06, RF-23) Dado un cliente con plan de pago, cuando el Administrador fija un `vence_en` posterior al actual y a ahora, entonces conserva plan y límites, si estaba en solo lectura vuelve a `vigente` de inmediato y la acción queda en su auditoría.
- **CA-7** (HU-2, RF-06, RF-23) - error: Dado una cuenta con plan Personal, una cuenta sin suscripción, una cuenta interna, un cliente inexistente o una fecha que no extiende (incluida una fecha que no sea posterior a ahora para una cuenta en solo lectura), cuando se intenta guardar, entonces se responde `422` `BACKOFFICE_VALIDITY_NOT_EXTENDED` o `404` `IDENTITY_ACCOUNT_NOT_FOUND` y nada cambia; Personal se explica con «Personal no vence».
- **CA-8** (HU-2, RF-22, RF-24) Dado un ajuste de vigencia, entonces no hay cobro ni factura, no cambia la renovación automática ni el cambio de plan programado, y el siguiente ciclo usa el `vence_en` nuevo como fecha de vencimiento.
- **CA-9** (HU-4, RF-07, RF-23) Cuando se extiende la vigencia, entonces el cliente ve la fecha nueva en «Plan y facturación», el aviso de solo lectura desaparece si estaba vencido y su actividad registra la acción con el rol de Administración.

**Restauración por Soporte**
- **CA-10** (HU-3, RF-05, RF-06) Dado un cliente identificado por su correo, cuando Soporte abre su papelera, entonces ve solo las raíces (archivos y carpetas) con nombre, tipo, tamaño, fecha de eliminación, fecha de purga y ubicación original, solo con retención vigente; no ve contenido, versiones, claves de objeto ni URLs, y la consulta queda en la auditoría del cliente como la de metadatos de la 011.
- **CA-11** (HU-3, RF-05, RF-07) Dado un elemento raíz de la papelera de ese cliente, cuando Soporte lo restaura con un motivo de 1 a 500 caracteres, entonces vuelve a su carpeta original o a la raíz con las reglas de 006 CA-13 a CA-15, el motivo queda en el evento `node.restored` visible para el cliente con el rol `SUPPORT`, y Soporte recibe el resultado (restaurado, renombrado o movido a la raíz) sin ver el contenido.
- **CA-12** (HU-3, RF-05) - error: Dado un motivo vacío o de más de 500 caracteres, un elemento que no es raíz, que no está en la papelera, que es de otro cliente o cuya retención ya venció, o un correo que no es de un cliente, cuando se intenta restaurar, entonces se responde `422` `BACKOFFICE_INVALID_INPUT` si el motivo no vale, `422` `BACKOFFICE_INVALID_QUERY` si el correo no vale, `404` `BACKOFFICE_CLIENT_NOT_FOUND` o `404` `STORAGE_NODE_NOT_FOUND` según el caso, sin guardar el motivo y sin cambiar nada; el mismo 404 cubre «no existe» y «no es tuyo».
- **CA-13** (HU-3, RF-05) Dado cualquier rol interno, cuando intenta purgar, vaciar, descargar o previsualizar la papelera de un cliente, entonces recibe `403`; Soporte solo restaura y el Administrador no restaura.
- **CA-14** (HU-4, RF-07) Cuando Soporte restaura, entonces el cliente ve en «Mi actividad» la restauración con el motivo escrito, sin nombre de archivo en la bitácora técnica ni en los logs, y sin datos del actor más allá de su rol.
- **CA-15** (RNF-05) Dado dos clientes A y B, cuando Soporte restaura un elemento de A, entonces solo cambia la papelera de A; B no cambia y no hay forma de alcanzarlo sin su correo.
- **CA-16** (RF-05) Dado un Administrador, Soporte, Operador o Cliente, cuando llama a las rutas de esta spec fuera de su rol, entonces recibe `403` `SHARED_FORBIDDEN`; sin token, `401` `SHARED_UNAUTHENTICATED`.
- **CA-17** (RNF-13, RNF-14) Dado el Administrador o Soporte en la interfaz, cuando ajusta, restaura o recibe un error, entonces ve carga, éxito o error con acción correctiva, funciona a 360 px y usa las etiquetas y el contraste del sistema de diseño.

## 4. Reglas de negocio
- **RN-1** La cuota efectiva es la del plan más un único extra por cuenta, vigente mientras `ahora < fin`; el extra reemplaza al anterior, se guarda en bytes (DF-26) y nunca deja el total por debajo de `espacio_usado`. El vencimiento se calcula al leer: no hay job ni evento de expiración.
- **RN-2** La vigencia solo se extiende: la fecha nueva debe ser posterior a la actual y, si la cuenta está en solo lectura, posterior a ahora. No aplica a Personal. No se registra pago ni factura; no se toca `iniciado_en`; el cambio programado y la renovación automática siguen como estaban.
- **RN-3** Soporte solo restaura raíces de la papelera con retención vigente, con las reglas de 006. El motivo es obligatorio, se recorta, máximo 500 caracteres; la interfaz avisa de no escribir nombres de archivo ni datos personales. Soporte no purga, no vacía, no descarga, no previsualiza y no ve versiones. La restauración en una cuenta en solo lectura queda pendiente de P-1.
- **RN-4** Auditoría visible (RF-07): `account.quota_adjusted`, `account.validity_adjusted`, `node.restored` con `note` y, si la cuenta sale de solo lectura, el evento de 010 que corresponda. Los eventos no llevan contenido, nombres de archivo, claves de objeto, URLs, tarjeta ni correo; el motivo solo sale en la auditoría del cliente, nunca en logs técnicos.
- **RN-5** Roles: Administración ajusta cuota y vigencia; Soporte restaura; Operador no hace ninguna de las tres; el Cliente no las llama. Administración no restaura y Soporte no ajusta cuota ni vigencia.
- **RN-6** La cuota extra se aplica también a Personal; la vigencia no. *(Sujeto a P-4.)*
- **RN-7** Las tres acciones se permiten sobre cuentas activas o suspendidas y no cambian su estado; suspender sigue revocando sesiones y congelando compartidos (011 RN-6). *(Sujeto a P-6.)*
- **RN-8** Los tamaños se capturan en GB con el mismo formato que el catálogo de planes y se guardan en bytes exactos (ADR-0016); la diferencia de bases con `formatBytes` de `storage` sigue en PD-91. Las fechas se muestran en hora de Guatemala y con el formato del sistema. No se inventan topes de cuota ni de fecha: la interfaz muestra el total resultante antes de confirmar.

## 5. Seguridad y privacidad
- **Toca datos de un cliente: sí** → pruebas de aislamiento bloqueantes (RNF-05), además de las unitarias y de integración.
- **Auditoría (RF-07):** las tres acciones, el motivo de Soporte y la salida de solo lectura. **No** debe aparecer en bitácoras ni logs: contenido, nombres de archivo o carpeta, claves de objeto, URLs firmadas, datos de tarjeta, correo del cliente ni el motivo.
- **Roles internos:** Administración (cuota y vigencia), Soporte (leer raíces de papelera y restaurar), Operador (nada) y Cliente (nada). Ningún rol suplanta al cliente ni obtiene contenido.
- **Excepción de escritura:** restaurar es la primera escritura de un rol interno sobre datos de `storage` de un cliente. La autorización debe resolverse en la consulta, limitarse a la raíz indicada y ejecutarse en la misma transacción que su evento de auditoría; el plan la detalla y, si cambia la arquitectura de autorización, se aprueba con ADR antes de implementar.
- **Motivo:** texto libre de 1 a 500 caracteres; se guarda en la auditoría del cliente y se advierte que no incluya nombres de archivo ni datos personales. No se intenta detectar nombres en el servidor (no es fiable); la lista blanca de atributos y el largo son la defensa.

## 6. Experiencia de usuario
| Pantalla | Mockup (`docs/design/mockups/…`) | Estados requeridos | Estado del mockup |
|---|---|---|---|
| Ficha de cuenta, bloque «Límites y vigencia» (Administración) | `backoffice/admin/admin--*.html` (existe, 011) | actual, ajustar cuota, cuota bajo lo usado, cuota inválida, cuota guardada, extender vigencia, fecha no posterior, Personal sin vigencia, sin suscripción, cargando, error | Por crear con `/mockup` sobre el existente |
| Papelera del cliente (Soporte) | `backoffice/soporte/soporte--*.html` (existe, 011) | lista de raíces, vacía, cargando, error, confirmar restauración con motivo, motivo inválido, restaurando, restaurado, renombrado, movido a la raíz, retención vencida | Por crear con `/mockup` sobre el existente |

- **Mensajes clave:** «La cuota total no puede quedar por debajo de lo que la cuenta ya usa (<usado>).» · «Solo puedes extender la vigencia: la fecha nueva debe ser posterior al <fecha>.» · «Personal no vence: no tiene vigencia que extender.» · «El motivo se guarda en la actividad del cliente. No escribas nombres de archivo ni datos personales.» · «Tu cuota incluye <X> GB extra hasta el <fecha>.» · «Restauramos «<nombre>» en <carpeta>.» · «Restauramos «<nombre>» como «<nuevo>» porque ya existía uno con ese nombre.» · «La carpeta original ya no está disponible. Restauramos «<nombre>» en Mis archivos.»
- **Cliente:** no hay pantallas nuevas; ve la cuota extra en el resumen de espacio (P-3), la fecha nueva en «Plan y facturación» y las acciones en «Mi actividad» con el bloque de motivo que ya existe en 004.
- **Sin interfaz:** no aplica.

## 7. Fuera de alcance
- Cambiar planes, precios o catálogo (011), contratar (008/009), cambiar de plan (010), cobrar, facturar, prorratear o reembolsar por una extensión.
- Que Soporte purgue, vacíe, descargue, previsualice o restaure versiones; que Administración restaure; que Soporte ajuste cuota o vigencia; cualquier acción del Operador.
- Varios extras por cuenta, extras recurrentes, cuotas por carpeta, ampliación automática o un trabajo que borre extras al vencer (el vencimiento es perezoso).
- Extender la vigencia de Personal, cambiar `iniciado_en`, emitir un pago o una factura por la extensión.
- Correos al cliente por ajustes o restauración (sujeto a P-7); rediseño de la auditoría (004) o de las bitácoras técnicas (022b); reabrir la 011.

## 8. Preguntas
- [RESUELTA] (2026-10-03, Fátima) **P-2/P-3 de la 011** → 011b: extra sobre el plan, nunca por debajo de lo usado, con fecha de fin; vigencia solo se extiende, quita la solo lectura y no aplica a Personal.
- [ABIERTA] **P-1** ¿Soporte puede restaurar cuando la cuenta está en solo lectura? Recomendación: sí, porque no es una escritura del cliente y no cambia su cuota; el cliente seguirá sin poder subir ni editar. — bloquea: **sí**.
- [ABIERTA] **P-2** ¿La restauración cubre raíces de archivos **y** carpetas, o solo archivos? Recomendación: raíces de ambos, para respetar la semántica de 006 y no sacar un archivo de una carpeta en papelera. — bloquea: **sí**.
- [ABIERTA] **P-3** ¿El cliente ve el extra y su fecha en el resumen de espacio? Recomendación: sí; si no, solo vería una cuota mayor sin explicación. — bloquea: **sí**.
- [ABIERTA] **P-4** ¿La cuota extra aplica también a Personal? Recomendación: sí; P-3 solo excluyó la vigencia. — bloquea: no.
- [ABIERTA] **P-5** ¿El Administrador puede quitar o acortar un extra antes de su fecha? Recomendación: sí, si la cuota no queda por debajo de lo usado; se audita. — bloquea: no.
- [ABIERTA] **P-6** ¿Se permiten las tres acciones sobre una cuenta suspendida? Recomendación: sí, sin cambiar su estado; la suspensión no borra datos (011 RN-6). — bloquea: no.
- [ABIERTA] **P-7** ¿La extensión de vigencia envía un correo al cliente? Recomendación: no; lo ve en «Plan y facturación» y en su actividad (YAGNI). — bloquea: no.
- [ABIERTA] **P-8** ¿La extensión deja la renovación automática como está y, al llegar la fecha nueva, se intenta el cobro si está activa? Recomendación: sí; no hay cobro al extender. — bloquea: no.
- [ABIERTA] **P-9** ¿Ajustar cuota o vigencia exige un motivo? Recomendación: no; 004 D-6 reserva el motivo para Soporte. — bloquea: no.

## 9. Registro de cambios
| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-10-22 | Creación inicial con las decisiones P-2/P-3/P-8 de la 011, tres operaciones y las preguntas abiertas | Arranque de la 011b | Borrador (pendiente Adrián) |
