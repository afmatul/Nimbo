# Spec 004 — Auditoría

> Qué y por qué. El cómo va en `./plan.md` (aprobado) y el orden en `./tasks.md`.

| Campo | Valor |
|---|---|
| Estado | En revisión (2026-10-05; plan aprobado por Adrián el 2026-10-05) |
| Dueño | Adrián |
| Fase | 1 |
| Requisitos | RF-07 (principal); aplican RNF-05, RNF-13, RNF-17 |
| Depende de | 003 (`Actor`, roles, RLS). Hacia atrás: 005 y 006 ya llaman a `IAuditLogger` con el adaptador provisional; 004 lo sustituye sin tocarlos |
| Módulo | T2 `audit` (ADR-0010: sin dependencias salvo `shared`). DF: 03 (aceptado), 12 (se decide aquí), 15 (falta `AuditController`) |
| Lo consume | 011 (Fátima): acciones internas sobre cuentas ajenas; 012 (compartición) y otras specs |
| Última actualización | 2026-10-05 (correcciones de la revisión) |

## 1. Contexto y objetivo
Hoy `IAuditLogger` solo escribe una línea en el log técnico (005 D-11): nadie puede consultarla. La propuesta promete que
toda acción de un rol interno sobre una cuenta ajena queda registrada y **el cliente afectado la ve** (RF-07, Art. IX).
Esta spec entrega el registro **persistente e inmutable** de eventos y la **consulta por su afectado**. No decide qué
acciones internas existen (eso es 011): solo las guarda y las muestra, sin nombres de archivo ni contenido.

## 2. Historias de usuario
- **HU-1** Como cliente, quiero ver qué hizo el personal de Nimbo sobre mi cuenta, para confiar en que nadie ve mis archivos.
- **HU-2** Como dueño de otra spec, quiero registrar un evento con el mismo contrato de hoy y que quede guardado, para no reescribir mis llamadas.
- **HU-3** Como equipo, queremos que un cliente nunca vea eventos de otro y que ningún evento lleve datos prohibidos.

## 3. Criterios de aceptación
### Registro
- **CA-1** (HU-2, RF-07) Dado un llamado a `IAuditLogger.record` con una acción del catálogo, actor, afectado y recurso opcional, cuando termina, entonces queda un evento con acción, id y rol del actor, id del afectado, id del recurso, atributos planos, fecha y `correlationId`.
- **CA-2** (HU-2) Dados los consumidores actuales (005 y 006), cuando se activa la persistencia, entonces siguen compilando y pasando sus pruebas sin cambios y sus eventos aparecen guardados.
- **CA-3** (HU-3, RNF-17) — error: Dada una acción fuera del catálogo, cuando se intenta registrar, entonces no se guarda, se anota `audit.record_failed` en la bitácora técnica y quien llama no recibe excepción.
- **CA-4** (HU-3, Art. IX) — error: Dados atributos con una clave prohibida (nombre de archivo, URL, token, contraseña, clave de enlace) o un valor no plano, cuando se registra, entonces el evento se guarda sin ese dato y se anota `audit.record_failed` con el motivo, sin repetir el valor.
- **CA-5** (HU-2) — error: Dada una base de datos no disponible, cuando se registra un evento de un consumidor de mejor esfuerzo, entonces la operación del consumidor no se revierte y el fallo queda en la bitácora técnica. Los eventos internos (011) usan escritura síncrona en la misma transacción: si falla, la acción interna se revierte (D-5).
- **CA-6** (HU-3) Dado un evento guardado, cuando cualquiera (incluido el Administrador) intenta modificarlo o borrarlo por la API, entonces no existe ruta que lo permita; y a nivel de base de datos la aplicación no puede actualizarlo ni borrarlo (D-7).

### Consulta por el cliente afectado
- **CA-7** (HU-1, RF-07) Dado un cliente con eventos como afectado, cuando consulta su actividad, entonces recibe solo esos eventos, del más reciente al más antiguo, con fecha, acción en español, origen (rol del actor), si aplica, tipo y cantidad del recurso y, en la purga, si la pidió el cliente o la hizo la purga programada de la papelera (`trigger`: `manual` · `scheduled`) (D-1, D-2, D-3).
- **CA-8** (HU-1, RNF-05) — error: Dado un cliente A y eventos del cliente B, cuando A consulta, entonces no ve ninguno de B; pedir el evento de B por su id responde `NOT_FOUND`, igual que si no existiera.
- **CA-9** (HU-1) Dado más eventos de los que caben en una página, cuando consulta, entonces recibe el tamaño de página fijo y un cursor para la siguiente (20 por página, D-8).
- **CA-10** (HU-1) Dado el filtro por rango de fechas o por origen («Yo» / «Personal de Nimbo»), cuando consulta, entonces solo recibe los que cumplen (D-8).
- **CA-11** (HU-1) Dado un cliente sin eventos, cuando consulta, entonces recibe una lista vacía (no un error).
- **CA-12** (RF-05) — error: Dada una consulta sin sesión, responde `UNAUTHENTICATED` (401). Dado un rol interno (Administrador, Soporte, Operador), cuando consulta, entonces solo ve los eventos de su propia cuenta como afectado; no existe consulta de la actividad de otra cuenta, ni siquiera para ellos.
- **CA-13** (RF-07, Art. IX) Dado un evento cuyo actor es un rol interno y cuyo afectado es un cliente, cuando el cliente lo consulta, entonces aparece siempre (nunca se puede ocultar ni filtrar fuera del alcance del cliente).
- **CA-14** (HU-3, Art. IX) — error: Dada cualquier respuesta de consulta, cuando se inspecciona, entonces no contiene nombres de archivo ni de carpeta, contenido, URLs, tokens, contraseñas ni claves de enlaces, ni correo o nombre del actor (D-2).

### Interfaz (D-4)
- **CA-15** (HU-1, RNF-13) Dado un cliente con sesión, cuando abre «Mi actividad» desde el menú de la cuenta, entonces ve la página completa: lista de eventos, filtros por fechas y origen, «Cargar más», y los estados de carga, vacío, error y sin resultados con el filtro; usable desde 360 px, contraste AA y accesible por teclado.

## 4. Reglas de negocio
- **RN-1** El **afectado** de un evento es la cuenta cuyos datos o estado cambian; el **actor** es quien ejecuta. Pueden ser la misma persona.
- **RN-2** Un evento es de solo adición: no se edita ni se borra. Corregir un error es agregar otro evento.
- **RN-3** El catálogo de acciones es cerrado; cada spec agrega las suyas con tipo de recurso y atributos permitidos. 004 no inventa acciones de negocio.
- **RN-4** Los eventos guardan identificadores y atributos planos, nunca nombres (ADR-0010). El nombre del recurso no se resuelve al consultar (D-3).
- **RN-5** Los 401/403 y los fallos técnicos van a la bitácora técnica (003 CA-16), no a esta auditoría.
- **RN-6** El motivo escrito de Soporte (003 D-4) se guarda con el evento y lo ve el cliente; su captura y validación son de 011 (D-6).

## 5. Seguridad y privacidad
- ¿Toca datos de un cliente? **Sí** → lleva pruebas de aislamiento (`test/isolation`): un cliente no lee eventos de otro, por lista ni por id.
- ¿Qué se audita? Es esta spec la que guarda; qué se audita lo declara cada spec. Aquí: persistencia y consulta, y que consultar no se audita.
- ¿Qué NO aparece? Nombres de archivo o carpeta, contenido, URLs firmadas, contraseñas, tokens, claves de enlaces, correos del actor.
- Roles internos: pueden ser **actores** de eventos (vía 011) pero nunca leen la actividad de otro; no existe suplantación.
- La tabla es de datos de cliente: lleva RLS por usuario afectado además del filtro en la consulta (ADR-0005).

## 6. Experiencia de usuario
| Pantalla | Mockup | Estados requeridos | Estado del mockup |
|---|---|---|---|
| «Mi actividad» (entrada en el menú de la cuenta) | `docs/design/mockups/audit/mi-actividad/` (capturas en `docs/design/capturas/audit/mi-actividad/`) | cargando, vacío, error, con datos, «Cargar más», vacío con filtros, rango inválido, fin de lista | Creado por el `ui-designer` (11 estados, 360 y 1440 px) |

- Mensajes clave (tuteo): vacío «Aún no hay actividad en tu cuenta»; error «No pudimos cargar tu actividad. Intenta de nuevo».
- Sin mockup en la propuesta firmada (p. 03–18): la pantalla, sus filtros y la entrada del menú de la cuenta se diseñan en el plan.

## 7. Fuera de alcance
- Crear las acciones internas (suspender, ajustar cuota, restaurar con motivo, revocar sesiones): **011**. 004 solo provee registro y consulta.
- Consulta de la auditoría de otras cuentas por personal interno; exportación (CSV/PDF); alertas o notificaciones por evento; búsqueda de texto.
- Bitácora técnica de operación (Pino/Loki; RNF-17), historial de versiones de archivos (014) y presencia.
- Auditar crear, renombrar, mover o leer listados (006 D-fuera-de-alcance).
- Firmas, cadenas de hash o almacenamiento WORM de los eventos (YAGNI).

## 8. Decisiones y preguntas
Sin preguntas abiertas. Decisiones de Adrián (2026-10-05):
- **D-1 Eventos visibles**: acciones internas sobre su cuenta y sus operaciones sensibles (carga, descarga, eliminar, restaurar, vaciar, purgar). Porque RF-07 dice «operaciones sensibles» y 005/006 ya los emiten; los inicios de sesión los cubre 002.
- **D-2 Actor visible**: solo el rol («Soporte de Nimbo», «Tú»), nunca nombre ni correo. Protege al personal y mantiene `audit` sin depender de M1 (ADR-0010).
- **D-3 Recurso sin nombre**: tipo y cantidad desde los atributos («3 elementos a la papelera», «1 archivo, 12 MB»). No se resuelven nombres: costaría una dependencia con `storage` y falla si el recurso se purgó.
- **D-4 Interfaz**: API y página «Mi actividad» completa dentro de 004 (menú de la cuenta, filtros, paginación, estados, AA). RF-07 pide «consultable» y nadie más la construye. El mockup lo crea el `ui-designer` durante el plan.
- **D-5 Garantía de escritura**: mixta. Mejor esfuerzo posterior al commit para 005 y 006 (no se tocan); escritura síncrona en la misma transacción para 011, para que no exista acción interna sin rastro.
- **D-6 Motivo de Soporte**: texto libre de hasta 500 caracteres, guardado y visible al cliente; 011 lo captura, valida y advierte de no escribir nombres de archivo.
- **D-7 Inmutabilidad**: solo adición reforzada en la base (la aplicación inserta y lee; sin UPDATE, DELETE ni TRUNCATE), sin cadenas de hash (YAGNI).
- **D-8 Retención, paginación y filtros**: sin borrado automático mientras exista la cuenta; al eliminarla se anonimiza el actor interno (política de privacidad, a confirmar con 001). Cursor de 20 por página; filtros por fechas y origen («Yo» / «Personal de Nimbo»); sin búsqueda de texto.
- **D-9 DF-12**: `actor_id`, `rol_actor`, `usuario_afectado_id`, `recurso_id` nullable y `tipo_recurso`; el `architect` actualiza el E-R y `design-findings.md` en el plan.
- **D-10 DF-15**: `AuditController` en `audit` con una sola ruta de lectura para el usuario autenticado.
- **D-11 Eventos previos**: los de 005 y 006 anteriores a 004 solo existen en el log técnico y no se migran.

## 9. Registro de cambios
| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-10-04 | Borrador inicial | Petición de Adrián | — |
| 2026-10-05 | Preguntas Q-1…Q-11 resueltas como D-1…D-11; UI completa en 004 | Respuestas de Adrián | Adrián |
| 2026-10-05 | Plan aprobado; spec en `Lista`. La escritura síncrona (D-5) se ofrece ya como `IAuditLogger.recordInTransaction`; mockup enlazado | Aprobación del plan | Adrián |
| 2026-10-05 | CA-2 se cumple en comportamiento: los dos dobles de 005/006 que implementan `IAuditLogger` (`file.service.spec.ts`, `test/support/storage-fakes.ts`) solo agregan `recordInTransaction` para ajustarse al tipo del puerto ampliado; ninguna prueba ni servicio de storage cambia | T-04: la escritura síncrona entra al puerto | Adrián (ratificado en la revisión, 2026-10-05) |
| 2026-10-05 | CA-7: el evento expone `trigger` opcional (`manual` · `scheduled`, los valores que 006 emite en `node.purged`), para que la purga programada de la papelera no se lea como una acción del cliente aunque su actor sea el dueño. Contrato: `auditEventResponseSchema.trigger` y `AUDIT_TRIGGERS`; el mapeador lo copia solo si es válido | Decisión de Adrián del 2026-10-05 en la revisión (I-3) | Adrián |
