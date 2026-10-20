# Tareas 012 — Compartición y accesos

> Spec: `./spec.md` · Plan: `./plan.md` (`architect`: Aprobado con cambios, 2026-10-17)
> **Sujeto a la aprobación del plan por Adrián** (spec, plan y tareas en el mismo PR, como la 015); la spec sigue en
> `Borrador` hasta entonces.
> 13 tareas verticales, de medio día a un día, un commit cada una (`feat(<modulo>): … [012 T-xx]`). Cada tarea deja algo
> probado de punta a punta y lista sus CA. Sin tareas de «cierre»: el PR integrado lo es. Toda tarea de lógica empieza por
> su prueba (rojo → verde → refactor); las pruebas son las de plan §6. Son 13, una más de las 12 de `workflow.md` §1, por la
> partición de T-01 que pidió la revisión del PR #61 (M-3): entra en la misma excepción que las dos PR de §7.7.
> **Dos PR, una spec** (Fátima, 2026-10-17; excepción a `workflow.md` §4.1 que Adrián debe aceptar): **PR-A** = T-01 a T-07
> (toda la API salvo la versión del Editor) en `feat/012-comparticion-y-accesos`; **PR-B** = T-08 a T-13 (versión del
> Editor, RN-14 y web). `/review 012` llega con el PR-B.
> **Compuertas antes de T-01** (condición 8 del `architect`): Adrián acepta ADR-0011 y ADR-0033 y DF-31 pasa a `Aceptado`
> (PD-128, las enmiendas de 014 y 006, ya resueltas el 2026-10-17, pendientes de la confirmación de M-1). **Antes de T-09**
> (condición 10, D-10): la regla 4 de ADR-0032 enmendada en la rama de 010, 010 T-06 en `main` y el código y mensaje de D-4
> acordados con Juan Marcos.
> **Antes de toda tarea de UI (T-10, T-11 y T-12)**: estados de solo lectura dibujados en los mockups (PD-123).
> **Solo lectura (RN-14)**: los errores de solo lectura de CA-1, CA-7 y CA-14 y los permisos de RN-14 están **solo en T-09**,
> al final del PR-B; T-04, T-05 y T-08 no los incluyen.
> **Permisos** (plan §7.6): cada archivo marcado [Adrián] se pide a Adrián antes de la tarea; `billing` no se toca.
> **Orden de ramas** (plan §7.5): 009 → 017 → 012 PR-A → 010 → 012 PR-B (la 017 es orden preferido, no condición). Funciones
> ≤ 30 líneas y ≤ 3 parámetros; sin interfaces fuera de las del plan (Art. V.2).

## PR-A — API (sin la versión del Editor)

- [ ] **T-01** Datos: tabla `comparticion`, función `nodos_compartidos()` y RLS de lectura (migraciones 1–2) — *1 día*
  - Qué: contratos base `packages/contracts/src/sharing/` (`ShareLevel`, `NodeRef`, `accessLevel`, códigos `SHARING_*`);
    migración `…-crear-comparticion` (tabla, `CHECK`, únicas, `idx_comparticion_recibidas`, RLS de `comparticion`) y
    `…-nodos-compartidos-y-rls-de-lectura` (`nodos_compartidos()` con la salida rápida cuando el actor no tiene
    comparticiones, políticas del definidor, `archivo_compartido`, `carpeta_compartida`, `version_archivo_cliente` recreada
    con `propietario_id`, `version_archivo_actual_compartida`, `evento_auditoria_alta_compartida` solo para `share.left`,
    `file.upload_completed` (reemplazo) y `file.version_pruned`), con `down`; columnas contra el E-R.
  - Pruebas primero: `migrations.int-spec.ts` (`up → down → up`, dueño sin `SUPERUSER`); `nodos-compartidos.int-spec.ts`
    (directa, heredada, mover dentro y fuera, directa que no cambia al mover, mayor nivel gana, papelera y restaurar,
    suspender y reactivar a cada parte, roles internos vacíos, `EXPLAIN` sin `Seq Scan` en `archivo`/`carpeta`);
    **`test/isolation/sharing-rls.iso-spec.ts`**, en rojo antes de crear las políticas (segunda barrera, como `nimbo_app` y
    sin `WHERE`: B lee lo compartido y no hace `UPDATE`/`DELETE` de nodos ni de versiones de A, no ve versiones anteriores ni
    escribe `comparticion` de A; sin actor, 0 filas; `PUBLIC` no ejecuta `nodos_compartidos()`; dueño sin `SUPERUSER`;
    quitar el `JOIN` de un repositorio y la base sigue negando).
  - CA: CA-18, CA-19, CA-20, CA-21 (efecto de la papelera), CA-23 (efecto de la suspensión), CA-24 (segunda barrera) —
    RN-5, RN-6, RN-9, RN-10, RNF-05.
  - Archivos: `apps/api/src/migrations/…` (timestamp posterior a 009/010 en `main`); `packages/contracts/src/sharing/`;
    `apps/api/test/isolation/sharing-rls.iso-spec.ts`; `apps/api/test/int/access/nodos-compartidos.int-spec.ts` (nuevo).
  - Ramas: ninguna dependencia; va en el **mismo PR** que T-03 (sin T-03, `storage` trataría lo compartido como propio).
  - Hecho: las migraciones suben y bajan y la función responde lo que dice el plan §3.

- [ ] **T-02** Regla de acceso compartido en `access` (`accessibleNodes`, `ownedNodes`, `inheritedGrants`) — *1 día*
  - Qué: `accessibleNodes` = propiedad `UNION ALL nodos_compartidos()`; `ownedNodes` (la rama de propiedad);
    `inheritedGrants` + `IGrantRepository` → `SqlGrantReader`; `index.ts` exporta `ownedNodes`, `NodeRef`, `InheritedGrant`.
  - Pruebas primero: `accessible-nodes.int-spec.ts` (directa, heredada, mover dentro y fuera, mayor nivel gana, papelera y
    restaurar, suspender y reactivar a cada parte, roles internos vacíos, `EXPLAIN` sin `Seq Scan` en `archivo`/`carpeta`);
    `sql-grant-reader.int-spec.ts`; `access-policies.spec.ts` sin cambios.
  - CA: CA-18, CA-19, CA-20, CA-24 — RN-5, RN-6, RNF-05.
  - Archivos: `access/{infrastructure/sql/accessible-nodes.ts, infrastructure/sql/sql-grant-reader.ts,
    application/permission-resolver.ts, application/i-grant-reader.port.ts, access.module.ts, index.ts, index.spec.ts,
    README.md}` [Adrián].
  - Ramas: ninguna dependencia; en el **mismo PR** que T-01 y T-03.
  - Hecho: `accessibleNodes` y `ownedNodes` devuelven lo que dice el plan §1 y `pnpm test:int` sigue verde en `storage`.

- [ ] **T-03** Escritura solo del propietario en `storage` (`ownedNodes`, condición 9) — *1 día*
  - Qué: `findOwnedFile`/`findOwnedFolder` en `INodeRepository`; en `TypeOrmNodeRepository`, `ownedNodes` en nombres
    ocupados, profundidad, `findLiveFileByName`, todo `UPDATE` y la raíz de `listContents`; `accessibleNodes` + nivel en
    carpetas no raíz y `breadcrumbs` (cortan en la carpeta compartida); `typeorm-trash` y `typeorm-space` con `ownedNodes`;
    accesos rápidos con nivel. `accessLevel` en `folder-schemas`, `quick-access-schemas` y nodos; `folderId`/`parentId`
    nulos en lo ajeno; `NodeSummaryReader` exportado.
  - Clasificación de los **17 `findAccessible*` de `storage/application`** (14 llamadas y 3 declaraciones):

    | Llamada | Pasa a | Por qué |
    |---|---|---|
    | `folder.service.ts:129` (`requireFolder`) | se separa: `findOwnedFolder` en crear/renombrar/mover y `findAccessibleFolder` en `contents` | CA-15 · CA-11 |
    | `file.service.ts:170` (`requireFile`) | `findOwnedFile` en renombrar/mover; la versión actual de la descarga sigue con `findAccessibleById` (en 017: `AccessibleFileUrlIssuer`) | CA-15 · CA-12 |
    | `file.service.ts:178` (destino de mover) | `findOwnedFolder` | CA-15 |
    | `quick-access.service.ts:79` | sigue con `findAccessibleNode` | CA-17 |
    | `trash.service.ts:107`, `:121` | `findOwnedFile` / `findOwnedFolder` | CA-15, CA-22 |
    | `trash.service.ts:260` (carpeta padre al restaurar) | `findOwnedFolder` | CA-22 |
    | `upload.service.ts:249` (carpeta destino) | `findOwnedFolder` | CA-15 |
    | `upload.service.ts:329` (`completedFile`) | `findOwnedFile` (en PR-B corre como el dueño) | CA-15 |
    | `upload-registrar.ts:121`, `:134` | `findOwnedFile` / `findOwnedFolder` | CA-15 |
    | `version-pruner.ts:61` | `findOwnedFile` | CA-15 |
    | `version-restore.service.ts:106` | `findOwnedFile` | CA-15 |
    | `version-history.service.ts:56` | `findOwnedFile` (historial y versiones anteriores) | CA-15 |
    | declaraciones en `i-node.repository.port.ts:35`, `:42` e `i-quick-access.repository.port.ts:40` | se quedan; se suman `findOwned*` | — |

  - Pruebas primero: `owner-only-routes.int-spec.ts` (tabla de cada ruta de escritura de `storage` × Lector y Editor: `404
    STORAGE_NODE_NOT_FOUND` idéntico y nada cambia; una ruta nueva sin clasificar hace fallar la prueba); casos nuevos en
    `folders.int-spec.ts` (B abre la carpeta compartida: migas desde ella, nivel por fila, sin `parentId` superior; la raíz
    de B no muestra nada de A); `quick-access.int-spec.ts` (fijar y abrir lo compartido; desaparece al perder el acceso);
    `node-summary-reader.int-spec.ts`; los unitarios de cada servicio cambiado.
  - CA: CA-10 (fuera de «Mis archivos», papelera y medidor), CA-11, CA-12, CA-15, CA-17, CA-22.
  - Archivos [Adrián]: `storage/application/{folder,file,trash,upload,version-history,version-restore}.service.ts`,
    `upload-registrar.ts`, `upload-target.ts`, `version-pruner.ts`, `node-summary-reader.ts` (nuevo),
    `ports/i-node.repository.port.ts`, `infrastructure/persistence/typeorm-{node,trash,space,quick-access}.repository.ts`,
    `storage/{index,storage.module}.ts`, `presentation/folders.controller.ts`, `quick-access.controller.ts`;
    `packages/contracts/src/storage/{folder-schemas,quick-access-schemas,schemas}.ts`.
  - Ramas: **choca con 017** (`file.service.ts`, `storage/index.ts`, `storage.module.ts`): hacerla con 017 ya en `main`.
    **Choca con 010** (`upload`, `folder`, `file`, `version-restore`, `trash`): quien entre segundo rebasa.
  - Hecho: no queda ningún `findAccessible*` sin clasificar en `storage/application`, y `pnpm test:int` de `storage` está en verde.

- [ ] **T-04** Compartir (`POST /shares`) con destinatario por `identity` — *1 día*
  - Qué: `ShareRecipientDirectory` (`findShareable`, `contactsOf`) en `IdentityReadersModule`, con
    `findShareableClientByEmail` y `findClientsByIds` en el repositorio; `UserShare` (sin Propietario ni uno mismo, DF-31),
    `ShareLevel`, errores; `IShareRepository` → `TypeOrmShareRepository`; `SharingService.share` en el orden de plan §4
    (tasa → forma → permiso `Action.SHARE` → destinatario → propio → duplicado) con `recordInTransaction(share.granted)`;
    `SharingController`, `SharingModule`, registro en `app.module.ts`; `SHARING_RATE_LIMIT_*` en el entorno; tasa con
    `SHARED_TOO_MANY_REQUESTS` (D-6); acciones `share.*` en el catálogo de auditoría; `boundaries.js` con
    `sharing → identity` y su *fixture*.
  - Pruebas primero: `user-share.spec.ts`, `sharing.service.spec.ts` (orden de comprobaciones; suspendido con acceso previo →
    error genérico); `share-recipient-directory.spec.ts`; `share.int-spec.ts` (feliz; los cuatro casos de CA-2 con el mismo
    cuerpo salvo `correlationId`; propio; mal formado y Propietario con `400` y el campo; duplicado; `429` con
    `Retry-After`; los tres roles internos `403 SHARED_FORBIDDEN`; sin token `401`); `boundaries.spec.ts`.
  - CA: CA-1 (sin la solo lectura, que va en T-09), CA-2, CA-3, CA-4, CA-5, CA-25 (rutas de compartir), CA-26 (`share.granted`).
  - Archivos: `sharing/**` (nuevos); [Adrián] `identity/application/share-recipient-directory.ts`,
    `ports/i-account-directory.repository.port.ts`, `typeorm-account-directory.repository.ts`, `identity-readers.module.ts`,
    `identity/index.ts` (+ `index.spec.ts`), `audit/application/{audit-action,audit-catalog}.ts` (+ specs),
    `shared/infrastructure/config/env.schema.ts`, `.env.example`, `packages/config/eslint/boundaries.js` + *fixtures*;
    convivencia: `apps/api/src/app.module.ts`.
  - Ramas: **necesita 009 en `main`** (`IdentityReadersModule`, `RateLimitExceededError`; los dos tocan `identity/index.ts`,
    el repositorio de cuentas, `env.schema.ts`, `boundaries.js` y `app.module.ts`). Si 009 se atrasa, usar
    `SHARING_TOO_MANY_REQUESTS` y sumarlo a PD-93 (009).
  - Hecho: `pnpm env:check`, lint de fronteras e integración en verde.

- [ ] **T-05** Lista de accesos, cambiar nivel, quitar y salir — *1 día*
  - Qué: `AccessList` (VO) y `AccessListService.listAccess` (directas + `inheritedGrants`, agrupadas por carpeta, nombres con
    `contactsOf` y `NodeSummaryReader`); `SharingService.changeLevel`, `revokeGrant` y `leave` (en `leave`, el evento va
    antes del borrado; salir de algo sin efecto da `404`); rutas `GET /shares/nodes/:nodeType/:nodeId`,
    `PATCH`/`DELETE /shares/:shareId` y `DELETE /shares/received/:shareId`; eventos `share.level_changed`, `share.revoked`,
    `share.left` (afectado: el propietario).
  - Pruebas primero: `access-list.spec.ts` (fila «(tú)» primero, heredadas por carpeta); `sharing.service.spec.ts` (se
    amplía); `access-list.int-spec.ts` (dueño ve directas y heredadas; Editor y Lector `403` sin datos; ajeno `404`
    idéntico); `share-lifecycle.int-spec.ts` (cambiar sin cambiar la fecha; quitar: B pierde el recurso y lo que heredaba;
    salir de una directa sí, de una heredada `404`); `sharing-audit.int-spec.ts` (cuatro eventos con actor, afectado, tipo,
    UUID del recurso y del destinatario, nivel y `correlationId`; sin nombres, correos ni contenido en eventos ni bitácoras).
  - CA: CA-6, CA-7 (sin la solo lectura), CA-8, CA-9, CA-16, CA-23 (la lista muestra igual al suspendido y deja quitarlo),
    CA-26.
  - Archivos: `sharing/**`; [Adrián] `storage/application/node-summary-reader.ts` (solo si T-03 no lo dejó completo).
  - Ramas: ninguna nueva. Depende: T-01, T-02, T-03, T-04.
  - Hecho: las cuatro rutas pasan su caso feliz y su error principal.

- [ ] **T-06** «Compartido conmigo» (`GET /shares/received`) y ciclo de papelera — *1 día*
  - Qué: `cursor-tuple.ts` en `shared` (D-7, tercera copia); `received-share-cursor.ts`; `pageReceived` con
    `accessibleNodes(actor)` **dentro de la consulta** (`creado_en DESC, id DESC`, nivel efectivo); `SharedWithMeService.list`
    (nombre del propietario con `contactsOf` y nodo con `NodeSummaryReader`); respuesta `ReceivedShare` `strict`.
  - Pruebas primero: `cursor-tuple.spec.ts`; `received-share-cursor.spec.ts`; `shared-with-me.int-spec.ts` (más reciente
    primero, «Cargar más», cursor ajeno `400`, nivel efectivo, descarga firmada de 5 min a un objeto como Lector y Editor);
    `shares-trash.int-spec.ts` (mandar a la papelera → `404` idéntico; restaurar → mismo nivel; purgar → comparticiones
    borradas; B no ve, no restaura ni purga desde la papelera de A).
  - CA: CA-10, CA-12, CA-17 (salen de «Accesos rápidos» al perder el acceso), CA-21, CA-22.
  - Archivos: `sharing/**`; [Adrián] `shared/infrastructure/persistence/cursor-tuple.ts` (+ spec), `shared/index.ts`.
  - Ramas: `shared/index.ts` también lo toca 009 (rebase). Depende: T-01, T-02, T-03, T-04.
  - Hecho: integración en verde.

- [ ] **T-07** Aislamiento y documentación del diseño (con el `security-auditor`) — *1 día*
  - Qué:
    - `sharing.iso-spec.ts`, con A (propietario), B (destinatario) y C (ajeno) con contenido casi idéntico: C pide lo de A y B
      pide hermanos, carpetas superiores y recursos no compartidos, todo con `404` idéntico. Además: lo que pierde B al
      quitarle el acceso, las escrituras de `storage` como Lector y Editor, papelera y purga, suspender y reactivar a A y a B,
      y los tres roles internos con `403` y `accessibleNodes` vacío. (`sharing-rls.iso-spec.ts` ya está en T-01.)
    - Documentos (lista del `architect`): **DF-78** en `design-findings.md` y cierre de DF-31 y DF-32 (DF-40, que se acepta
      con el plan); `design-model.md` (M3a, M3b, T2, mapeo de `comparticion`); `architecture.md` §3 (arista y excepción de
      `usuario.estado`), §5 y §6 (`nodos_compartidos()` en la lista de funciones); `pendientes.md`: **PD-124, PD-125, PD-126**
      (migrar los cursores de `storage` y `audit`) **y PD-127**, y actualización de PD-78 y PD-123 (PD-128 ya resuelto).
  - Pruebas primero: `sharing.iso-spec.ts`, escrita antes de cerrar las rutas de T-03 a T-06 que cubre y vista en rojo con
    un fragmento sin la rama de comparticiones.
  - CA: CA-24, CA-8, CA-15, CA-21, CA-22, CA-23, CA-25 — RNF-05.
  - Archivos: `apps/api/test/isolation/sharing.iso-spec.ts`, `test/isolation/setup/isolation-world.ts` (se
    amplía con comparticiones) [Adrián]; `docs/sdd/{design-findings,design-model,architecture,pendientes}.md` (los de
    `architecture.md` los aplica el `architect`).
  - Ramas: ninguna. Depende: T-01 a T-06.
  - Hecho: `pnpm test:isolation` en verde y la sección «Seguridad» del `security-auditor` sin bloqueantes para el PR-A.

## PR-B — Versión del Editor, RN-14 y web

- [ ] **T-08** Nueva versión del Editor en el ámbito del propietario (migración 3) — *1 día*
  - Qué: migración `…-carga-iniciada-por` con `down`; `UploadSession.startedBy` y modo «reemplazar el archivo X»;
    `SharedVersionUploadService` (`can(CREATE_VERSION)` del Editor → **un único** `createActor(ownerId, CLIENT)` →
    `UploadService` con `{ owner, author }`; revalida en cada paso; exige `iniciada_por` y `fileId`; errores sin `details`;
    `onPrune: 'ask'` → `409 STORAGE_VERSION_WOULD_PRUNE`); `SharedVersionsController` (`/files/:fileId/shared-versions…`); auditoría
    desde `author`: `file.upload_completed` (modo reemplazo) y `file.version_pruned`, ambos con actor = Editor y afectado =
    propietario; regla `no-restricted-syntax` en `eslint/rls.js` + *fixture* con la **lista cerrada por archivo** de los
    llamadores de `createActor` en `main` al hacer el PR-B: `jwt-auth.guard.ts`, los procesadores de `storage`, los tres de
    `billing` (009: `invoice-retrier.ts`, `subscription-reconciler.service.ts`, `account-verified.listener.ts`),
    `billing/application/renewal-runner.ts` (010), `realtime/application/connection-admission.service.ts` (015) y `shared-version-upload.service.ts` (el único que actúa
    como otra cuenta tras autorizar a un tercero); códigos `STORAGE_LEVEL_FORBIDDEN`, `STORAGE_VERSION_WOULD_PRUNE`; DF-78 suma la delegación
    y `carga.iniciada_por` en `design-model.md` (M2).
  - Pruebas primero: `shared-version-upload.service.spec.ts` (autoriza antes de delegar, Lector `403`, sin acceso `404`,
    cuota y máximo sin `details`); `shared-versions.int-spec.ts` con MinIO (espacio en la cuenta del dueño, autor Editor,
    mismo `id` y nombre, poda y aviso, tipo inválido con los mensajes de 005, acceso perdido a mitad → `404` sin cambios,
    los dos eventos con el propietario como afectado); *fixture* de lint; `migrations.int-spec.ts`.
  - CA: CA-13, CA-14 (cuota, máximo y tipo; la solo lectura va en T-09), CA-15 (versión del Lector), CA-28.
  - Archivos [Adrián]: `storage/application/{shared-version-upload.service,upload.service,upload-registrar,upload-target}.ts`,
    `storage/domain/upload-session.ts`, `infrastructure/persistence/{carga.orm-entity,typeorm-upload-session.repository}.ts`,
    `presentation/shared-versions.controller.ts`, `storage.module.ts`; `packages/contracts/src/storage/error-codes.ts`;
    `packages/config/eslint/rls.js` + *fixture*; `apps/api/src/migrations/…`.
  - Ramas: **choca con 010** (`upload.service.ts`) y con 017 (`error-codes.ts`); la lista de lint depende de lo que 009,
    010 y 015 tengan en `main`. Depende: PR-A integrado.
  - Hecho: integración e iso de `storage` en verde; el lint falla con un `createActor` fuera de la lista cerrada.

- [ ] **T-09** Solo lectura del propietario (RN-14) — *medio día* — **espera la condición 10**
  - Qué: `SharingService.share` y `changeLevel` (solo de Lector a Editor) con `WritableAccountPolicy` de `storage/index.ts`;
    quitar, bajar a Lector y salir siguen permitidos; `SharedVersionUploadService` traduce la solo lectura del dueño a
    `403 STORAGE_SHARED_VERSION_UNAVAILABLE` con «No puedes subir versiones a este archivo por ahora.» (D-4, neutro; lo
    confirma Juan Marcos); la tabla de rutas de ADR-0032 regla 3 (010) suma las de
    `sharing` y la del Editor.
  - Pruebas primero: matriz de RN-14 en `sharing.service.spec.ts`; integración con el doble de `IPlanLimitsProvider` en modo
    solo lectura (`share.int-spec.ts`, `share-lifecycle.int-spec.ts`, `shared-versions.int-spec.ts`); `read-only.int-spec.ts` de 010.
  - CA: CA-1, CA-7, CA-8, CA-14, CA-16 (casos de solo lectura).
  - Archivos: `sharing/application/sharing.service.ts`; [Adrián] `storage/application/shared-version-upload.service.ts`,
    `contracts/src/storage/error-codes.ts`, `apps/api/test/int/storage/read-only.int-spec.ts` (de 010).
  - Ramas: **necesita 010 T-06 en `main`** (`PlanLimits.readOnly`, `WritableAccountPolicy`, `STORAGE_ACCOUNT_READ_ONLY`) y la
    regla 4 de ADR-0032 enmendada, y el código y el mensaje de D-4 acordados con Juan Marcos. Es la última tarea de API del
    PR-B. Depende: T-05, T-08.
  - Hecho: los siete casos de RN-14 en verde (compartir, a Editor y versión rechazados; quitar, a Lector y salir permitidos;
    ver y descargar sin cambio).

- [ ] **T-10** Web: diálogo «Compartir» y lista de accesos — *1 día*
  - Qué: `features/sharing/` (`api.ts`, `routes.ts`, `use-access-list`, `use-share-actions`, `share-dialog`, `access-list`,
    `access-row` con el nivel al elegir y sin «Guardar», «Quitar» con `ConfirmDestructiveDialog` «Quitar acceso» y « y lo que
    contiene» solo en carpetas, «Gestionar en «{carpeta}»» en las heredadas); ítem «Compartir» en los menús ⋮ de
    «Mis archivos»; mensajes en `lib/error-catalog.ts`; estado de solo lectura según PD-123.
  - Pruebas primero: `share-dialog.spec.tsx` (los 14 estados del mockup `sharing/compartir/` y los de solo lectura;
    mensajes literales de CA-2 a CA-5; axe a 360 y 1440), `access-row.spec.tsx`.
  - CA: CA-1 a CA-9 (interfaz), CA-27.
  - Archivos: `apps/web/src/features/sharing/**`; [Adrián] `features/storage/components/{file-row-menu,folder-row-menu,
    my-files}.tsx`; convivencia: `apps/web/src/lib/error-catalog.ts`.
  - Ramas: **choca con 017** (`file-row-menu.tsx`, con su *slot* `firstAction`, y `my-files.tsx`) y con 009/010/017 en
    `error-catalog.ts`. Compuerta: PD-123. Depende: PR-A; T-09 para los estados de solo lectura.
  - Hecho: pruebas de componente y axe en verde; coincide con el mockup.

- [ ] **T-11** Web: «Compartido conmigo», carpeta compartida y salir — *1 día*
  - Qué: rótulo «Compartidos» → **«Compartido conmigo»** (`href: '/compartido'`) en `app-layout.tsx`; rutas
    `app/(app)/(cliente)/compartido/page.tsx` y `compartido/carpeta/[folderId]/page.tsx` (+ `loading`/`error`); `shared-with-me`
    (lista, `LoadMore`, vacío y error con `StateView`), `shared-folder-view` (`NodeTable`, `FolderBreadcrumbs` con raíz
    «Compartido conmigo»), `shared-row-menu` (Lector y Editor), `leave-share-dialog`, «ya no disponible» con «Volver a
    Compartido conmigo»; `quick-access-section.tsx` abre lo compartido en `/compartido`.
  - Pruebas primero: `shared-with-me.spec.tsx`, `shared-folder-view.spec.tsx`, `leave-share-dialog.spec.tsx` (estados del
    mockup `sharing/compartido-conmigo/`, salvo los de versión, que van en T-12), `app-layout.spec.tsx` (rótulo y
    `aria-current`); axe a 360 y 1440.
  - CA: CA-10, CA-11, CA-12, CA-16, CA-17, CA-27.
  - Archivos: `features/sharing/**`, `app/(app)/(cliente)/compartido/**`; convivencia: `components/nimbo/app-layout.tsx`
    (+ spec); [Adrián] `features/storage/components/{quick-access-section,load-more}.tsx` (`LoadMore` se reutiliza o se mueve
    a `components/nimbo/`).
  - Ramas: 017 toca `quick-access-section.tsx` y `routes.ts`. Compuerta: PD-123. Depende: T-10 (`api.ts`).
  - Hecho: pruebas de componente y axe en verde.

- [ ] **T-12** Web: «Subir nueva versión» del Editor — *medio día*
  - Qué: `shared-version-upload` con `upload-manager` apuntando a `/files/:fileId/shared-versions`; aviso «Se eliminará la
    versión más antigua para guardar esta.» ante el `409`; mensajes de CA-14 por causa (sin datos del plan del propietario) y
    el de solo lectura de D-4; versión subida y error con «Reintentar».
  - Pruebas primero: `shared-version-upload.spec.tsx` (menú del Editor, subiendo, subida, aviso de poda, error de espacio,
    tamaño, tipo y solo lectura, acceso perdido); axe.
  - CA: CA-13, CA-14, CA-28, CA-27.
  - Archivos: `features/sharing/components/shared-version-upload.tsx`; [Adrián] `features/storage/upload/upload-manager.ts`;
    convivencia: `lib/error-catalog.ts`.
  - Ramas: Compuerta: PD-123. Depende: T-08, T-09, T-11.
  - Hecho: pruebas de componente y axe en verde.

- [ ] **T-13** **(humana)** Recorrido de la demo en local y nota en el PR-B — *medio día*
  - A comparte una carpeta con B como Lector y un archivo como Editor. B los ve en «Compartido conmigo», navega, descarga y
    sube una versión. C no ve nada. A cambia el nivel, quita el acceso y B pierde el recurso. Se comprueban la suspensión, la
    papelera y la solo lectura de A.
  - CA: los visibles (CA-1, CA-6 a CA-8, CA-10 a CA-13, CA-16, CA-21, CA-23).

## Trazabilidad CA → tarea
| CA | Tareas | CA | Tareas | CA | Tareas | CA | Tareas |
|---|---|---|---|---|---|---|---|
| CA-1 | T-04, T-09, T-10 | CA-8 | T-05, T-07, T-09, T-10 | CA-15 | T-03, T-07, T-08 | CA-22 | T-03, T-06, T-07 |
| CA-2 | T-04, T-10 | CA-9 | T-05, T-10 | CA-16 | T-05, T-09, T-11 | CA-23 | T-01, T-05, T-07 |
| CA-3 | T-04, T-10 | CA-10 | T-03, T-06, T-11 | CA-17 | T-03, T-06, T-11 | CA-24 | T-01, T-02, T-07 |
| CA-4 | T-04, T-10 | CA-11 | T-03, T-11 | CA-18 | T-01, T-02 | CA-25 | T-04, T-07 |
| CA-5 | T-04, T-10 | CA-12 | T-03, T-06, T-11 | CA-19 | T-01, T-02 | CA-26 | T-04, T-05 |
| CA-6 | T-05, T-10 | CA-13 | T-08, T-12 | CA-20 | T-01, T-02 | CA-27 | T-10, T-11, T-12 |
| CA-7 | T-05, T-09, T-10 | CA-14 | T-08, T-09, T-12 | CA-21 | T-01, T-06, T-07 | CA-28 | T-08, T-12 |

## Notas del developer
- Estimación: unos 10 días (7 en el PR-A y 4 en el PR-B, contando la demo), como plan §7.7. Si pasa del doble, avisar a
  Adrián (`workflow.md` §4.3) antes de seguir.
- `carga.iniciada_por` solo entra en el PR-B; hasta entonces `completedFile` usa `findOwnedFile` y se comporta igual para el dueño.
- PR-A no depende de 010: si 010 integra primero, T-03 rebasa sobre sus cambios en los mismos servicios.
- <Desviaciones (con enlace al registro de cambios de la spec), DF o pendientes que surjan.>
