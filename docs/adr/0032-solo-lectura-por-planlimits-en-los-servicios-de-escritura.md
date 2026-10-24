# ADR-0032 — La solo lectura por vencimiento se comprueba en los servicios de escritura con `PlanLimits.readOnly`, no con un guard global

| Campo | Valor |
|---|---|
| Estado | Aceptado (2026-10-20, Adrián: aprobación de la spec 010, registrada en el plan 010 §8 el 2026-10-21); propuesto el 2026-10-16 y ajustado el 2026-10-18 por la auditoría de Adrián en el PR #63 (rutas de la regla 3 y nombre de `PlanLimits`). **Enmienda** `architecture.md` §7.5 y la nota de DF-51 / ADR-0022 sobre el contenido de `PlanLimits` |
| Fecha | 2026-10-16 |
| Numeración | Redactado como ADR-0029; pasa a **0032** porque la 016 entró antes a `main` con su ADR-0029 (N-1 del PR #63, paso 3) |
| Decisores | `architect` (revisión del plan 010), Juan Marcos (dueño de `billing`), Adrián (dueño de `storage`, aprueba) |
| Specs relacionadas | 010 (RF-23, CA-12, CA-13, RN-6, RN-11); heredan la regla 012, 013, 016 y 021 |

## Contexto

RF-23 exige que una cuenta con la suscripción de pago vencida quede en **solo lectura**: puede ver, buscar, previsualizar y
descargar, pero no subir, crear, renombrar, mover ni restaurar (spec 010 CA-12, CA-13, RN-6). `architecture.md` §7.5 dice
desde la Fase 0 que «un guard global bloquea escrituras de cuentas en solo lectura (API, callback de edición, restauración,
optimizador)». El estado vive en `billing` (`suscripcion.estado`); quien debe negarse es `storage` (y más adelante `sharing`,
`editing` y `optimizer`), y `storage` no puede importar `billing` (DF-51, ADR-0022, `boundaries.js`).

Fuerzas: equipo de 4, Fase 2 con fecha estimada del 14/10 ya vencida, servidor de 8 GB, prueba de aislamiento bloqueante.
La nota de DF-51 dice que `PlanLimits` «solo lleva límites de almacenamiento» y que otros límites van por un puerto que declare
`billing` (ISP). Ya se le sumaron `trashRetentionDays` (006), `planName` (007) y `retainedVersions` (014), siempre con la misma
justificación: los consume `storage` mismo. Juan Marcos acordó en la spec 010 no abrir un puerto nuevo entre módulos.

## Opciones consideradas

1. **A. Guard HTTP global (lo que dice §7.5).** `shared` declara un puerto de «estado de la cuenta» que implementa `billing`
   (como el puerto token→`Actor`) y un `ReadOnlyGuard` con un decorador `@Writes()` en cada ruta de escritura.
   - Pros: un único punto en la capa HTTP; el decorador se ve en el controlador.
   - Contras: **no cubre lo que §7.5 mismo enumera**: el callback de edición y el optimizador corren en el `worker` o fuera de una
     ruta del cliente. El guard solo conoce al **actor** antes de resolver el nodo, así que no puede aplicar RN-11 (manda la cuenta
     propietaria del archivo). Es opt-in por ruta (un decorador olvidado es una escritura abierta) y pone una regla de negocio en
     `shared`, que no carga reglas de negocio (DF-49). Suma un puerto `shared → billing` que ninguna otra spec necesita.
2. **B. Comprobación en los servicios de escritura con `PlanLimits.readOnly`** (plan 010).
   - Pros: sin puerto ni arista nuevos; el dato llega por la lectura que `billing` ya hace de la misma fila de `suscripcion`
     (upload y restauración ya piden `limitsFor`, sin consulta extra). Cubre cualquier entrada que llame al servicio (`api` o
     `worker`). El error (`STORAGE_ACCOUNT_READ_ONLY`) es de `storage`, que es quien rechaza. Se prueba con el doble de
     `IPlanLimitsProvider` que ya existe.
   - Contras: ensancha `PlanLimits` con algo que no es un límite del plan sino un estado de la cuenta. Cada servicio de escritura
     nuevo debe acordarse de llamar la comprobación (se mitiga con un único colaborador y una prueba que recorre las rutas de
     escritura). Las operaciones de carpeta, que hoy no leen límites, suman una consulta indexada por usuario.
3. **C. Puerto aparte `IAccountStanding` declarado por `storage` e implementado por `billing`.**
   - Pros: ISP estricto; `PlanLimits` sigue siendo solo límites.
   - Contras: segundo puerto con el mismo implementador y la misma fila; carga y restauración leerían la suscripción dos veces;
     otro enlace en `PlanLimitsBindingModule`. Contradice lo acordado en la spec 010 sin un beneficio que se vea en la exposición.
4. **D. RLS que niega escrituras de cuentas vencidas** (políticas de `archivo`, `carpeta` y `carga` que leen `suscripcion`).
   - Contras: acopla las políticas de `storage` a una tabla de `billing`, devuelve errores genéricos de la base en lugar de
     `403` con mensaje, y complica la prueba de aislamiento. Descartada.
5. **E. Posponer.** RF-23 es «Debe» de la Fase 2: no es viable.

## Decisión

**Opción B**, con estas reglas:

1. `PlanLimits` pasa a describirse como **condiciones de almacenamiento de la cuenta del actor** que consume `storage` mismo:
   límites del plan, retención, nombre visible y `readOnly`. La regla ISP de DF-51 se mantiene para **otros** módulos: si
   `editing`, `intelligence` u otro necesitan algo que no consume `storage`, lo piden por un puerto que declara `billing`.
2. Un único colaborador de `storage` (`WritableAccountPolicy` en el plan 010; no es un guard de
   Nest) ofrece `assertWritable(actor)` y la función pura `assertWritableLimits(limits)` para los servicios que ya tienen los
   límites. Nadie más interpreta `readOnly`.
3. La comprobación va en la capa de aplicación, antes de la transacción del servicio, nunca en el controlador. Una prueba de
   integración recorre **todas** las rutas de escritura de `storage` (las diez de la 010: `POST /uploads`,
   `POST /uploads/:id/complete`, `POST /folders`, `PATCH /folders/:id`, `POST /folders/:id/move`, `PATCH /files/:id`,
   `POST /files/:id/move`, `POST /files/:id/versions/:versionId/restore`, `POST /trash/files/:id/restore` y
   `POST /trash/folders/:id/restore`) y una lista explícita de las permitidas, incluidos los `POST` que no escriben
   contenido: papelera (`DELETE /files/:id`, `DELETE /folders/:id`), purga (`DELETE /trash/files/:id`,
   `DELETE /trash/folders/:id`), vaciar (`DELETE /trash`), accesos rápidos (`PUT` y `DELETE /quick-access/pins/…`,
   `POST /quick-access/recents/…`), descargas (`POST /files/:id/download-url` y
   `POST /files/:id/versions/:versionId/download-url`), `resume` (`POST /uploads/:id/resume`) y `cancel`
   (`DELETE /uploads/:id`). Una ruta de escritura sin clasificar hace fallar la prueba.
4. **RN-11 (propietario del archivo) no cabe en `limitsFor(actor)`**: cuando 012 y 016 permitan que un editor escriba en nodos de
   otra cuenta, deberán consultar el estado del **propietario** sin fabricar un actor ajeno. Esa forma (método nuevo del puerto
   o función de lectura bajo ADR-0021) se decide en el plan de 012; hasta entonces solo escribe el dueño y `actor` coincide con
   el propietario.
5. `billing` es el único que calcula `readOnly` (de `suscripcion.estado`); sin fila o con rol interno, `false`.

## Consecuencias

- Positivas: sin puerto, arista ni dependencia nuevos; el DAG no cambia; la regla cubre `api` y `worker`; los módulos que
  heredan RN-6 (`sharing`, `editing`, `optimizer`) ya dependen de `storage` y usan el mismo campo y el mismo colaborador.
- Negativas / deuda aceptada: `PlanLimits` mezcla límites y estado de la cuenta; las operaciones de carpeta hacen una lectura
  más; la cobertura depende de la prueba que recorre rutas.
- **El nombre `PlanLimits` deja de describir lo que contiene** (auditoría de Adrián, PR #63, M-5). La 010 no lo renombra
  (tocaría todo `storage` y sus pruebas en un PR ya grande): se anota en DF-77 y se propone renombrarlo (p. ej.,
  `StorageConditions`, con su puerto y su adaptador) en el refactor de PD-63.
- Documentos a actualizar al aceptar:
  - `architecture.md` §7.5: «`RenewalScheduler` (cola `subscription-renewal` con `upsertJobScheduler`, en el `worker`) lista con
    funciones de mantenimiento (ADR-0021) y renueva o vence cada cuenta como su dueño … La solo lectura la comprueban los
    servicios de escritura de cada módulo con `PlanLimits.readOnly` (ADR-0032); no hay guard global.»
  - `architecture.md` §8: la fila `RenewalScheduler (@Cron)` pasa a `subscription-renewal` (repetible, concurrencia 1,
    idempotente por suscripción y `vence_en` con `FOR UPDATE`).
  - `architecture.md` §3 (nota DF-51) y el comentario de `storage/application/plan-limits.ts`: la redacción de la regla 1.
  - `architecture.md` §6 punto 6: sumar `suscripciones_por_renovar` y `suscripciones_por_avisar` a la lista de accesos sin actor.
  - Diagramas: M2 (colaborador de solo lectura y `PlanLimits.readOnly`) y M4 (`RenewalScheduler` sin `@Cron`); van en PD-96.
- Cómo sabremos si fue un error: si aparece una escritura de `storage` sin la comprobación que la prueba de rutas no detecta;
  si 012 o 016 no pueden aplicar RN-11 sin fabricar un actor del propietario; o si un tercer campo que no es de almacenamiento
  quiere entrar en `PlanLimits` (entonces se separa con la opción C).
