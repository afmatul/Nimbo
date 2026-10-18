# ADR-0030 — Compartición: arista `sharing → identity`, función `nodos_compartidos()` y ámbito delegado del propietario

| Campo | Valor |
|---|---|
| Estado | Propuesto (2026-10-17); falta el acuerdo del equipo (Adrián). **Enmienda** ADR-0010 (aristas de `sharing` y regla 3 de `architecture.md` §3), ADR-0005 (actuar como el dueño también en el `api`) y, si se acepta, la regla 4 de ADR-0029 (Propuesto, rama de la 010) |
| Fecha | 2026-10-17 |
| Decisores | `architect` (revisión del plan 012), Fátima (dueña de `sharing`, decisiones D-1, D-2 y D-3), Adrián (dueño de `access`, `storage` e `identity`; aprueba) |
| Specs relacionadas | PD-20 y DF-10 (contraseña de enlaces, 013); DF-71; 012 (RF-16, RF-18; CA-2, CA-10, CA-13, CA-14, CA-23, CA-24, CA-28; RN-6, RN-7, RN-10, RN-14); la heredan 013 (enlaces públicos y suspensión), 016 (edición del Editor), 018 y 020 (lo compartido por `accessibleNodes`) |

## Contexto

La 012 hace que un cliente vea, descargue y, como Editor, suba versiones de archivos **de otra cuenta**. Hasta hoy toda la
arquitectura supone que «lo que ve el actor es suyo»: `accessibleNodes(actor)` solo tiene la rama de propiedad (005, 006),
las políticas RLS de `archivo`, `carpeta`, `version_archivo` y `carga` solo admiten al dueño, y quienes hoy llaman a
`createActor` (el guard JWT, los procesadores de mantenimiento y, con 009 y 015, trabajos, un oyente y el *handshake*)
actúan como la cuenta del token o como el dueño de la fila que procesan, nunca como **otra** cuenta tras autorizar a un
tercero. Tres fuerzas obligan a decidir antes del código:

1. **Destinatario por correo** (CA-2, CA-6, CA-23). `sharing` debe resolver un correo a una cuenta de cliente verificada y
   activa y mostrar nombre y correo de las personas con acceso. Son datos de `identity`, y ADR-0010 no permite
   `sharing → identity`.
2. **Suspensión** (RN-10, CA-23). Una cuenta suspendida (propietaria o destinataria) deja sin efecto sus comparticiones sin
   borrarlas. «Qué ve el actor» vive dentro de la consulta (ADR-0005, DF-32), así que la regla tiene que leer
   `usuario.estado`, que es de `identity`. ADR-0005 pide además que la regla no se duplique entre el filtro de la consulta y la
   política RLS: «se extrae a una función SQL `STABLE` versionada que usan los dos».
3. **Versión del Editor con el plan del propietario** (CA-13, CA-14, RN-7, RN-14). La versión suma en la cuota del
   propietario, usa su máximo por archivo, su retención y su solo lectura (010). Todo eso ya lo hacen `UploadService`,
   `QuotaService`, `FileVersionService`, `VersionPruner` e `IPlanLimitsProvider.limitsFor(actor)` **para el actor**, bajo
   RLS del actor. ADR-0029 (regla 4) pidió que 012 resolviera esto «sin fabricar un actor ajeno» y lo dejó como criterio de
   error.

Restricciones: equipo de 4, Fase 2 ya atrasada, un servidor de 8 GB, prueba de aislamiento bloqueante, y la exposición final
exige poder defender que «nadie ve lo ajeno» con dos barreras independientes.

## Opciones consideradas

### Parte 1 — Destinatario y datos de contacto

1. **1A. Arista `sharing → identity` con una fachada concreta** (`ShareRecipientDirectory` en `IdentityReadersModule`, como
   `backoffice → identity` en 011 y `billing → identity` en 009).
   - Pros: el DAG sigue acíclico (`identity` no depende de `sharing` ni de nada que dependa de él); sin interfaz nueva
     (Art. V.2: no hay ciclo ni segunda implementación; DF-04); la regla «cliente, verificado, activo» la decide `identity`.
   - Contras: una arista más que explicar; `sharing` carga `IdentityReadersModule`.
2. **1B. Puerto declarado por `sharing` e implementado por `identity`.**
   - Contras: crea `identity → sharing`; el módulo base de cuentas pasaría a depender de un módulo de negocio que lo
     usa. Interfaz con una sola implementación para evitar una arista que no forma ciclo (V.2 no lo justifica).
3. **1C. Puerto en `shared` que implementa `identity`** (como token→`Actor`).
   - Contras: pone una regla de negocio (quién es compartible) en `shared`, que no la lleva (DF-49).
4. **1D. `sharing` lee `usuario` por SQL.** Cuarta excepción a «cada módulo es dueño de sus tablas» para algo que una
   fachada resuelve sin excepción. Descartada.
5. **Posponer.** CA-1 es el corazón de RF-16: no es viable.

### Parte 2 — Una sola regla de «qué ve el actor» con suspensión

1. **2A. Función `nodos_compartidos()` en `access`** (`STABLE`, `SECURITY DEFINER`, sin parámetros: lee el actor de la
   sesión) que devuelve las comparticiones directas y heredadas vigentes del actor `CLIENT`, una fila por nodo con el
   nivel de mayor precedencia, sin papelera y con las dos cuentas `activa`. La usan `accessibleNodes(actor)` y las políticas
   RLS de lectura de `archivo`, `carpeta` y la versión actual de `version_archivo`.
   - Pros: una sola definición (DF-32, Art. VI) que el código y la base comparten; la suspensión se aplica en la consulta,
     sin borrar ni marcar filas; la función se prueba de forma exhaustiva en `test/isolation`.
   - Contras: `SECURITY DEFINER` en el camino de cada consulta de nodos, que no se inserta en línea y se calcula entera por
     consulta; la regla de tablas suma una excepción (`access` lee `usuario.estado`); el dueño de la función también está bajo
     `FORCE` y necesita políticas `TO CURRENT_USER` en `archivo`, `carpeta` y `comparticion`.
2. **2B. Regla duplicada: CTE en TypeScript y la misma lógica en cada política** (sin función).
   - Contras: una política de `archivo` que lee `comparticion` y `carpeta` bajo RLS de `nimbo_app` ve solo lo que ya ve el
     actor (recursión de políticas o resultados vacíos); y es la duplicación que ADR-0005 prohíbe. Descartada.
3. **2C. Marca de suspensión en `comparticion`, escrita por `identity` al suspender** (o por `sharing` al consumir un evento).
   - Contras: `identity` escribiría una tabla ajena, o un evento asíncrono dejaría una ventana en la que lo suspendido sigue
     visible; reactivar exige revertir la marca. Más piezas que una lectura.
4. **2D. Filtrar la suspensión después de consultar.** Prohibido (`CLAUDE.md`, ADR-0005).
5. **Posponer RN-10.** Dejaría una cuenta suspendida compartiendo contenido (PD-78, 011 RN-6): no es viable.

### Parte 3 — Escritura del Editor con el plan del propietario

1. **3A. Ámbito delegado del propietario desde un solo punto** (`SharedVersionUploadService` de `storage`): en
   `withActor(editor)` comprueba `PermissionResolver.can(editor, fileId, CREATE_VERSION)` y obtiene el propietario; después
   fabrica **una vez** `createActor(ownerId, CLIENT)` y ejecuta la carga de 005/014 en modo «reemplazar el archivo X» con el
   Editor como autor. Cuota, máximo, retención y `readOnly` salen de los puertos de siempre para el propietario.
   - Pros: sin tocar la RLS de escritura ni `billing`; reutiliza todo el ciclo de versiones (DF-17); es el patrón que ADR-0005 y
     ADR-0021 ya usan en el `worker` («la petición que lo encoló ya pasó la autorización»), ahora en el mismo proceso y con la
     autorización inmediatamente antes.
   - Contras: un error antes de delegar escribiría como el dueño; la auditoría, la tasa y el autor deben tomarse del Editor y
     no del actor delegado; hay que impedir que otro servicio copie el patrón.
2. **3B. Políticas RLS de escritura para el Editor** (`archivo`, `version_archivo`, `carga`, `usuario.espacio_usado` del
   propietario).
   - Contras: la RLS no limita columnas (el Editor podría renombrar o mover por SQL); cuota por cuenta ajena en
     `IQuotaRepository`; un método nuevo de `IPlanLimitsProvider` para leer el plan de otra cuenta (la RLS de `suscripcion` solo
     deja la propia); la poda pasaría al `worker`. Más superficie en las dos barreras.
3. **3C. Función `SECURITY DEFINER` que registra la versión.** Rompe la lista de ADR-0021 (solo lectura) y saca la escritura
   de la RLS. Descartada.
4. **Posponer CA-13 a la 016.** Contradice la decisión de producto P-1 de la spec 012; no le toca al `architect`.

## Decisión

**1A, 2A y 3A**, con estas reglas.

**1. Arista y fachada.** `sharing` puede importar `identity`, solo desde `identity/index.ts`. `ShareRecipientDirectory` es
una clase concreta en `IdentityReadersModule`: `findShareable(actor, email)` devuelve la cuenta solo si es `CLIENT`,
verificada y `activa` (los cuatro fallos son `null`, CA-2), y `contactsOf(actor, ids)` devuelve nombre y correo de cuentas de
cliente para filas que `sharing` ya autorizó (enriquece, no autoriza). `boundaries.js` y `module-graph.spec.ts` suman
`sharing: [..., 'identity']`, con el *fixture* negativo `sharing-imports-identity-internals.ts`. El DAG resultante:
`identity → notifications, audit`; `sharing → access, storage, audit, identity`; nadie depende de `sharing`.

**1 bis. PD-20 (contraseña de enlaces públicos, 013; DF-10) se decide con la misma arista.** `sharing` obtiene el hash
Argon2id de `identity` por `identity/index.ts`, con una fachada concreta en `IdentityReadersModule` que envuelve el
`IPasswordHasher` existente (`hash` y `verify`; `IPasswordHasher` y `Argon2idHasher` siguen internos). Sin puerto nuevo
en `shared` y sin moverlo allí: el hasher ya es un puerto de V.2 (a) con su implementación; los parámetros de Argon2id son
la política de contraseñas de `identity`, y una sola fuente evita que dos módulos los configuren distinto (DF-10, DRY);
`shared` no gana nada que no tenga ya un dueño. No veo un motivo técnico en contra: la arista ya existe por la Parte 1, no
crea ciclo y la verificación de enlaces es síncrona. El nombre de la fachada y su forma exacta los fija el plan de 013; si
013 necesitara algo más que hash y verificación, se revisa este punto. Así la arista `sharing → identity` se decide una
sola vez para 012 y 013.

**2. `nodos_compartidos()`** (lista de ADR-0021 §3, adaptada a una función con actor):
- Solo lectura; devuelve `(tipo_nodo, nodo_id, nivel, propietario_id)`, **una fila por nodo** con el nivel de mayor
  precedencia (RN-6). La rama de propiedad y la de comparticiones son disjuntas (`ck_comparticion_no_propia`), así que
  `accessibleNodes` las une con `UNION ALL` sin agrupar y la rama de propiedad conserva sus índices.
- Sin parámetros: el actor sale de `nimbo_actor_id()` y `nimbo_actor_role()` de la sesión que fijó `withActor`. Un
  parámetro de usuario convertiría la función en un oráculo de las comparticiones de cualquiera.
- Cerrada por defecto: vacía salvo `nimbo_actor_role() = 'CLIENT'` (sin actor, vacía).
- `SET search_path = pg_catalog, pg_temp`, todo nombre calificado con `public.`; `REVOKE ALL … FROM PUBLIC` y `EXECUTE` solo
  para `nimbo_app`; dueño = el rol que migra, `NOSUPERUSER` en la prueba (un superusuario ignora RLS y la prueba pasaría en
  vacío). Políticas `*_lectura_definidor … FOR SELECT TO CURRENT_USER` en `archivo`, `carpeta` (vivos) y `comparticion`.
- Sin tope de filas: a diferencia de un barrido, un tope cambiaría la respuesta («qué ve el actor»). El costo se acota con
  índices (`idx_comparticion_recibidas`, `idx_carpeta_ruta` y `idx_archivo_carpeta_creado` con `propietario_id` en la
  condición; prefijo de `ruta` por rango `~>=~`/`~<~`, porque un `LIKE` con patrón de columna no usa el índice), `EXPLAIN`
  en integración y k6 en 023.
- **Enumeración**: no hay exposición nueva. Quien controle `nimbo_app` y fije `app.actor_id` ya lee por RLS lo que la función
  devuelve para ese actor; la función no amplía lo que la RLS deja ver.
- **Tercera excepción de tablas** (`architecture.md` §3): `access` lee `usuario.estado`, **solo** dentro de esta función.
  Lo hace cumplir la revisión del `architect` y una prueba de aislamiento (suspender y reactivar).
- Políticas que cambian con la lectura ampliada: `archivo` y `carpeta` suman una política `FOR SELECT` de lo compartido;
  `version_archivo_cliente` se recrea con `archivo.propietario_id = nimbo_actor_id()` (hoy solo exige el archivo visible y,
  con la lectura ampliada, daría `INSERT`/`UPDATE`/`DELETE` y lectura de versiones anteriores ajenas); una política aparte
  deja leer solo la versión actual de lo compartido; `acceso_rapido_cliente` se amplía a propósito (CA-17).
  `evento_auditoria` suma una política de alta (`evento_auditoria_alta_compartida`) para el cliente a nombre propio, que
  admite exactamente `share.left`, `file.upload_completed` (modo reemplazo) y `file.version_pruned`, con afectado =
  propietario según la función.

**3. Ámbito delegado.**
- El único que actúa como **otra** cuenta tras autorizar a un tercero es `SharedVersionUploadService`, y solo después de
  `can(editor, fileId, CREATE_VERSION)` en la misma petición. La autorización se repite en `init`, `resume`, `complete` y
  `cancel`; los tres últimos exigen además `carga.iniciada_por` = Editor y el `fileId` fijado en la carga (CA-28).
- La delegación viaja como un valor `{ owner, author }`: el propietario para RLS, cuota, límites y retención; el Editor para
  la tasa, el autor de la versión (`carga.iniciada_por` → `version_archivo.creado_por`) y la auditoría. Los eventos de 014
  CA-19 se conservan: `file.upload_completed` (modo reemplazo) y, si hay poda, `file.version_pruned` (`VersionPruner`,
  `version-pruner.ts`, hoy con `actor` del ámbito), los dos con actor = Editor (`author`) y afectado = propietario. Los errores
  de cuota y máximo salen sin `details` (CA-14); la solo lectura del propietario, con el código neutro
  `STORAGE_SHARED_VERSION_UNAVAILABLE` («No puedes subir versiones a este archivo por ahora.»), sin revelar la causa.
- **Cumplimiento**: una regla `no-restricted-syntax` en `packages/config/eslint/rls.js` prohíbe `createActor(…)` salvo en
  una **lista cerrada por archivo** (las pruebas quedan fuera), con *fixture* negativo en `rls.spec.ts`. Llamadores actuales y
  conocidos (verificados el 2026-10-17):
  - `main`: `apps/api/src/shared/presentation/auth/jwt-auth.guard.ts`; `apps/api/src/modules/storage/infrastructure/`
    `trash-purge.processor.ts`, `upload-cleanup.processor.ts` y `usage-reconcile.processor.ts`.
  - `feat/009-contratacion-pagos-y-facturas`: `apps/api/src/modules/billing/application/invoice-retrier.ts`,
    `apps/api/src/modules/billing/application/subscription-reconciler.service.ts` y
    `apps/api/src/modules/billing/presentation/account-verified.listener.ts` (un `@OnEvent` del `api`).
  - `spec/010-renovacion-vencimiento-y-cambio-de-plan` (plan §2 y §5, planificado):
    `apps/api/src/modules/billing/application/renewal-runner.ts` (escribe como el dueño de cada cuenta, `createActor(id, CLIENT)`).
  - `spec/015-tiempo-real` (plan, *handshake*): `apps/api/src/modules/realtime/application/connection-admission.service.ts`.
  - 012 PR-B: `apps/api/src/modules/storage/application/shared-version-upload.service.ts`.
  
  Como 009, 010 y 015 entran antes que el PR-B, la lista se fija en el PR-B con lo que haya en `main` en ese momento. Cada alta
  en la lista (p. ej. la edición del Editor en 016) enmienda este ADR.
- Enmienda ADR-0005 («Worker»): actuar como el dueño de un recurso después de autorizar a otra persona también se
  permite en el `api`, solo en `SharedVersionUploadService`.
- Enmienda la regla 4 de ADR-0029: RN-11 se aplica con `limitsFor(owner)` dentro del ámbito delegado; el «sin fabricar un
  actor ajeno» y su criterio de error se reemplazan por esta regla. Se aplica en la rama de la 010 antes del PR-B de 012.

## Consecuencias

- Positivas: el DAG sigue acíclico y lo verifica el lint; «qué ve el actor» sigue teniendo una sola definición, ahora
  compartida por las dos barreras; la suspensión no borra datos; la versión del Editor reutiliza el ciclo de 005/014 sin
  tocar `billing` ni la RLS de escritura; 013, 016, 018 y 020 heredan lo compartido sin trabajo propio.
- Negativas / deuda aceptada:
  - Una función `SECURITY DEFINER` por consulta de nodos (dos veces cuando también la evalúa la política) y sus políticas
    del definidor, que dejan al rol que migra leer todo lo vivo de `archivo` y `carpeta`.
  - `access` se acopla también al esquema de `usuario`, sin que el lint lo vea.
  - Una arista más (`sharing → identity`) y un punto del `api` que escribe como otra cuenta.
  - Diagramas a redibujar: M3a (función, `ownedNodes`, `IGrantRepository` como lector SQL), M3b (sin `AccessGrant`,
    servicios de lista y «Compartido conmigo», dependencia de `identity`), M2 (`NodeSummaryReader`,
    `SharedVersionUploadService`, delegación), M1 (`ShareRecipientDirectory`), T2 (política compartida) y el E-R
    (`comparticion.propietario_id`, `actualizado_en`, `carga.iniciada_por`); DF-71, PD-109.
- Cómo sabremos si fue un error: si un listado supera el p95 de RNF-01 (300 ms) por la función según k6 (PD-111); si otro
  servicio necesita actuar como otra cuenta tras autorizar a un tercero (un segundo caso como `SharedVersionUploadService`); si `access` necesita leer otra columna de
  `usuario`; si la auditoría de seguridad encuentra una escritura del Editor fuera de la versión; o si la RLS y
  `accessibleNodes` divergen y `sharing-rls.iso-spec.ts` no lo detecta.

## Verificación

`test/isolation/sharing.iso-spec.ts` y `sharing-rls.iso-spec.ts` (como `nimbo_app` sin `WHERE`: B lee lo compartido y no puede
escribir nodos, versiones ni comparticiones de A; sin actor, 0 filas; `PUBLIC` no ejecuta la función; dueño sin `SUPERUSER`;
suspender y reactivar); `accessible-nodes.int-spec.ts` con `EXPLAIN` (sin `Seq Scan` sobre `archivo` ni `carpeta`);
`boundaries.spec.ts`, `module-graph.spec.ts` y `rls.spec.ts` con sus *fixtures*; `shared-version-upload.service.spec.ts`
(autoriza antes de delegar, autor y auditoría del Editor).
