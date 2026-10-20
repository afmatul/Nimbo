# Plan 012 — Compartición y accesos

> Spec: `./spec.md` · Estado del plan: **Propuesto** (`architect`: Aprobado con cambios, 2026-10-17; pendiente de Adrián, §8)
> Obligatorio y ≤ 250 líneas. Dice **qué** archivos se tocan y **qué** se espera de cada uno; no es el código en
> prosa (sin cuerpos de funciones ni pseudocódigo). Lo aprueba Adrián antes de escribir código.

## 1. Resumen técnico
- **Una sola regla de «qué ve el actor»** (DF-32, ADR-0005, ADR-0011): la función SQL `nodos_compartidos()` (`STABLE`,
  `SECURITY DEFINER`, sin parámetros: lee el actor de la sesión) devuelve las comparticiones directas y heredadas por
  `carpeta.ruta` del actor `CLIENT`, sin papelera (RN-9), con propietario y destinatario `activa` (RN-10) y una fila por nodo
  con el nivel de mayor precedencia (RN-6). La usan `accessibleNodes(actor)` (barrera 1: propiedad `UNION ALL` la función, sin
  agrupar, porque son disjuntas) y las políticas RLS de lectura (barrera 2). Sin duplicar la regla en TypeScript y en SQL.
- **Escritura solo del propietario**: `access` exporta `ownedNodes(actor)` (la rama de propiedad de hoy) y `storage` la usa en
  todo lo que muta o es «Mis archivos» (crear, subir, renombrar, mover, papelera, historial, restaurar, cuota, raíz). Las
  políticas RLS de escritura no cambian (solo el dueño); `version_archivo_cliente` se ajusta para no heredar la lectura ampliada.
- **`sharing` (M3b)** escribe `comparticion` y orquesta: tasa → permiso (`PermissionResolver`, `Action.SHARE`) → solo lectura
  del propietario (010) → destinatario (fachada de `identity`) → `UserShare` → auditoría en la misma transacción.
- **Nueva versión del Editor** (CA-13, CA-14) vive en `storage` (dueño del ciclo de versiones, DF-17): autoriza al Editor con
  `PermissionResolver.can(…, CREATE_VERSION)` y ejecuta la carga de 005/014 **en el ámbito del propietario** (cuota, máximo,
  retención y `readOnly` del plan del propietario por los puertos de siempre), con el Editor como autor (D-3).
- **Web**: «Compartido conmigo» (lista y carpeta), diálogo «Compartir» desde el menú ⋮ y «Subir nueva versión» del Editor.

## 2. Módulos, archivos y diseño
Dueño entre corchetes cuando el archivo es ajeno (§7.6): se pide permiso archivo por archivo.

| Módulo / capa | Archivo (nuevo o cambiado) | Responsabilidad |
|---|---|---|
| access [Adrián] | `infrastructure/sql/accessible-nodes.ts` (cambia) | `accessibleNodes(actor)`: propiedad `UNION ALL nodos_compartidos()`, sin `GROUP BY`: la función ya da una fila por nodo con el nivel de mayor precedencia (RN-6) y las ramas son disjuntas (`ck_comparticion_no_propia`), así la de propiedad conserva sus índices. `ownedNodes(actor)` (nuevo): la rama de propiedad actual. Roles internos: conjunto vacío en las dos (CA-25) |
| access [Adrián] | `application/permission-resolver.ts`, `application/i-grant-reader.port.ts` (nuevo), `infrastructure/sql/sql-grant-reader.ts` (nuevo) | `inheritedGrants(actor, node)` (nombre de M3a) → comparticiones de las carpetas superiores de un nodo **propio** (CA-6), por `carpeta.ruta`; `IGrantRepository` del diagrama como lector SQL (V.2 b) |
| access [Adrián] | `index.ts`, `index.spec.ts`, `README.md` | Exporta `ownedNodes`, `NodeRef`, `InheritedGrant`; README: rama de comparticiones hecha |
| sharing/domain | `user-share.ts`, `share-level.ts`, `access-list.ts`, `errors/*.ts` (nuevos) | `UserShare` (`grant` rechaza Propietario y a uno mismo, DF-31; `changeLevel`); `ShareLevel` = `EDITOR \| VIEWER` (subconjunto de `AccessLevel`); `AccessList` (VO: fila del dueño primero, directas, heredadas agrupadas por carpeta, CA-6); errores de §4 |
| sharing/application | `sharing.service.ts` (nuevo) | `share`, `changeLevel`, `revokeGrant`, `leave` (nombres de M3b + DF-78). Cada uno en `withActor`; la solo lectura, solo con `WritableAccountPolicy` de `storage/index.ts` (ADR-0032 regla 2: nadie más lee `readOnly`); `recordInTransaction` antes del cambio en `leave` (la política de §3 exige el acceso vigente) |
| sharing/application | `access-list.service.ts`, `shared-with-me.service.ts` (nuevos) | `listAccess(actor, node)` (solo dueño, CA-6/CA-9) y `list(actor, page)` (CA-10). SRP: el servicio de escritura no crece a 10 dependencias |
| sharing/application | `ports/i-share.repository.port.ts` (nuevo), `sharing-config.ts` | `IShareRepository` (V.2 b): `insert`, `findOwnedById`, `findReceivedById`, `updateLevel`, `delete`, `listDirect(node)`, `pageReceived(actor, cursor)`; un solo agregado: dividirlo daría tres puertos con una implementación; tope de tasa |
| sharing/infrastructure | `persistence/comparticion.orm-entity.ts`, `typeorm-share.repository.ts`, `received-share-cursor.ts` (nuevos) | SQL con `requireActorScope`; `pageReceived` une `accessibleNodes(actor)` **en la consulta** (sin filtrar después) y ordena `creado_en DESC, id DESC` |
| sharing/presentation | `sharing.controller.ts`, `*.response.ts`, `sharing-validation.ts` (nuevos) | Rutas de §4, `@Roles(Role.CLIENT)`; mapeo por lista blanca (esquemas `strict`) |
| sharing | `sharing.module.ts`, `index.ts`, `README.md` | Solo exporta el módulo (nadie lo consume, ADR-0010) |
| identity [Adrián] | `application/share-recipient-directory.ts` (nuevo); `ports/i-account-directory.repository.port.ts`, `typeorm-account-directory.repository.ts`, `identity-readers.module.ts` (009), `index.ts` (cambian) | Fachada concreta (DF-04): `findShareable(actor, email)` → `ClientIdentity \| null` (solo `CLIENT`, verificada, `activa`; los cuatro fallos dan `null`, CA-2) y `contactsOf(actor, ids)` → `ReadonlyMap<id, ClientIdentity>` (incluye suspendidas, CA-23). Requiere D-1 |
| storage [Adrián] | `ports/i-node.repository.port.ts`, `persistence/typeorm-node.repository.ts` | `findOwnedFile`/`findOwnedFolder` (nuevos); `findTakenNames`, `findTakenFolderNames`, `maxSubtreeDepth`, `findLiveFileByName` y todos los `UPDATE` pasan a `ownedNodes`; `listContents` de la raíz con `ownedNodes` (CA-10) y de una carpeta con `accessibleNodes`; nivel efectivo por fila; `breadcrumbs` con `accessibleNodes` (CA-11: corta en la carpeta compartida) |
| storage [Adrián] | `file.service.ts`, `folder.service.ts`, `upload.service.ts`, `upload-target.ts`, `version-history.service.ts`, `version-restore.service.ts` | Mutaciones, carpeta destino, historial, restauración y descarga de **versiones anteriores** usan `findOwned*` (CA-15 → `404 STORAGE_NODE_NOT_FOUND`, D-5). Descarga de la actual, `contents` y vista previa (017) siguen con `findAccessible*` (CA-12) |
| storage [Adrián] | `persistence/typeorm-trash.repository.ts`, `typeorm-space.repository.ts` | Lo vivo que se manda a la papelera y el medidor con `ownedNodes` (CA-10, CA-22). `typeorm-quick-access.repository.ts` sigue con `accessibleNodes` (CA-17) y devuelve el nivel |
| storage [Adrián] | `application/node-summary-reader.ts` (nuevo, fachada), `index.ts`, `storage.module.ts` | `NodeSummaryReader.summariesOf(actor, refs)` → `ReadonlyMap<id, NodeSummary>`, solo nodos que el actor ve (`accessibleNodes` en la consulta), en la transacción del llamador; para lo ajeno `folderId`/`parentId` = `null` (§5 de la spec). Clase concreta (DF-04) |
| storage [Adrián] (PR-B) | `application/shared-version-upload.service.ts`, `presentation/shared-versions.controller.ts` (nuevos) | `init/resume/complete/cancel(editor, fileId, …)`: en `withActor(editor)` `can(CREATE_VERSION)` (Lector → `403`, sin acceso → `404`) y el propietario del archivo; luego **un único** `createActor(ownerId, CLIENT)` y `UploadService` en modo «reemplazar por id» con la delegación `{ owner, author: editor }`: `owner` para RLS, cuota, límites y retención; `author` para la tasa, `iniciada_por` y la auditoría: `file.upload_completed` (modo reemplazo) y `file.version_pruned` con actor = Editor y afectado = propietario, sin eventos a nombre del dueño. Traduce cuota, máximo y solo lectura a errores sin `details` (CA-14). Repite la autorización en cada paso y `resume/complete/cancel` exigen `iniciada_por` = Editor y el `fileId` de la carga |
| storage [Adrián] (PR-B) | `upload.service.ts`, `upload-registrar.ts`, `upload-target.ts`, `domain/upload-session.ts`, `carga.orm-entity.ts`, `typeorm-upload-session.repository.ts` | Modo «reemplazar el archivo X» (sin nombre ni carpeta); `UploadSession.startedBy` → `carga.iniciada_por`; la versión toma `creado_por` de ahí; `onPrune: 'ask'` responde `409 STORAGE_VERSION_WOULD_PRUNE` con `VersionRetention` (DRY con 014) |
| audit [Adrián] | `audit-action.ts`, `audit-catalog.ts` (+ specs) | `share.granted`, `share.level_changed`, `share.revoked`, `share.left`: recurso `file`/`folder`, atributos `recipientId` (UUID), `level`, `previousLevel`; afectado = propietario (RN-12). Sin nombres ni correos (CA-26) |
| shared [Adrián] | `env.schema.ts`, `.env.example`; `infrastructure/persistence/cursor-tuple.ts` (nuevo, D-7) | `SHARING_RATE_LIMIT_PER_WINDOW` (20) y `SHARING_RATE_LIMIT_WINDOW_SECONDS` (900) (`pnpm env:check`); codificador de cursor común (tercera copia, Art. VI.2) |
| config [Adrián] | `packages/config/eslint/boundaries.js` + *fixtures* | `sharing → shared, access, storage, audit, identity` (D-1); *fixture* negativo `sharing-imports-identity-internals.ts` |
| api | `app.module.ts` | Registra `SharingModule` |
| contracts | `src/sharing/` (nuevo); `src/storage/{folder-schemas,quick-access-schemas,schemas,error-codes}.ts` [Adrián] | Esquemas de §4, `SHARING_*`; `accessLevel` en nodos, carpeta abierta y accesos rápidos; `STORAGE_LEVEL_FORBIDDEN`, `STORAGE_SHARED_VERSION_UNAVAILABLE`, `STORAGE_VERSION_WOULD_PRUNE` |
| migraciones | tres (§3) | — |

- **Puertos nuevos**: `IShareRepository` (V.2 b) y `IGrantRepository` → `SqlGrantReader` (ya en M3a; V.2 b). Entre módulos,
  **ninguna interfaz**: `ShareRecipientDirectory` y `NodeSummaryReader` son fachadas concretas (DF-04), sin ciclo ni segunda
  implementación. **Sin `AccessGrant` abstracta** (V.2 e: hoy solo existe `UserShare`; `PublicLink` lo decide 013).
- **Firmas públicas fijadas** (las consumen otros módulos): `accessibleNodes(actor)` y `ownedNodes(actor)` →
  `AccessibleNodesFragment` (columnas `nodo_id, tipo_nodo, nivel`); `PermissionResolver.inheritedGrants(actor, node: NodeRef)` →
  `Promise<readonly InheritedGrant[]>` (`{ shareId, recipientId, level, sourceFolderId, grantedAt }`);
  `NodeRef = { type: 'file' \| 'folder'; id }`; las dos fachadas de la tabla.
- **Dependencias nuevas**: `sharing → identity` (D-1, enmienda ADR-0010). `sharing → storage, access, audit` ya existen.
  `storage → access` ya existe. `access` lee además `usuario.estado`, solo dentro de `nodos_compartidos()` (D-2, DF-78).
- **Frontend**: `app/(app)/(cliente)/compartido/page.tsx` y `compartido/carpeta/[folderId]/page.tsx` (+ `loading`/`error`);
  `features/sharing/` (`api.ts`, `routes.ts`, hooks `use-access-list`, `use-shared-with-me`, `use-share-actions`; componentes
  `share-dialog`, `access-list`, `access-row` (nivel al elegir, CA-7), `shared-with-me`, `shared-folder-view`, `shared-row-menu`,
  `leave-share-dialog`, `shared-version-upload`). `app-layout.tsx`: «Compartidos» → «Compartido conmigo», `href: '/compartido'`.
  Reutiliza `StateView`, `ConfirmDestructiveDialog` («Quitar acceso», «Salir»), `FileTypeChip`, `UploadProgress`, `LoadMore`,
  `NodeTable`, `FolderBreadcrumbs` (raíz «Compartido conmigo»), `upload-manager` (con las rutas del Editor) y avisos `sonner`.
  [Adrián] `file-row-menu.tsx`/`folder-row-menu.tsx` (ítem «Compartir»), `my-files.tsx` (monta el diálogo),
  `quick-access-section.tsx` (lo compartido abre en `/compartido`). Mensajes: `lib/error-catalog.ts`, con variantes del Editor.

## 3. Datos
```sql
-- 1) AAAAMMDDHHmmss-crear-comparticion (timestamp posterior a las de 009/010 en main)
CREATE TABLE comparticion (
  id uuid PRIMARY KEY,
  propietario_id  uuid NOT NULL REFERENCES usuario(id),           -- desnormalizado: RLS, suspensión y lista sin unir nodos (DF-78)
  destinatario_id uuid NOT NULL REFERENCES usuario(id),
  archivo_id uuid REFERENCES archivo(id) ON DELETE CASCADE,       -- CA-21: la purga las borra; la papelera no (RN-9)
  carpeta_id uuid REFERENCES carpeta(id) ON DELETE CASCADE,
  nivel varchar(10) NOT NULL, creado_en timestamptz NOT NULL, actualizado_en timestamptz NOT NULL,
  CONSTRAINT ck_comparticion_un_nodo CHECK ((archivo_id IS NULL) <> (carpeta_id IS NULL)),   -- ADR-0011 A, RN-3
  CONSTRAINT ck_comparticion_nivel CHECK (nivel IN ('EDITOR', 'VIEWER')),                    -- DF-31, RN-1
  CONSTRAINT ck_comparticion_no_propia CHECK (destinatario_id <> propietario_id),
  CONSTRAINT uq_comparticion_archivo UNIQUE (archivo_id, destinatario_id),                  -- CA-4; sirve al CASCADE
  CONSTRAINT uq_comparticion_carpeta UNIQUE (carpeta_id, destinatario_id));
CREATE INDEX idx_comparticion_recibidas ON comparticion (destinatario_id, creado_en DESC, id DESC);  -- CA-10 y la función
-- RLS ENABLE + FORCE. comparticion_propietario (ALL): CLIENT y propietario_id = actor; WITH CHECK además exige el nodo vivo
--   con propietario_id = actor. comparticion_destinatario (SELECT) y comparticion_salida (DELETE): destinatario_id = actor.
--   Sin políticas para roles internos. comparticion_lectura_definidor FOR SELECT TO CURRENT_USER (la usa la función).
-- 2) AAAAMMDDHHmmss-nodos-compartidos-y-rls-de-lectura
-- nodos_compartidos() RETURNS TABLE (tipo_nodo text, nodo_id uuid, nivel text, propietario_id uuid)
--   STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp, nombres con public.; vacío salvo role = 'CLIENT' (NULL cierra);
--   una fila por nodo (RN-6). Directas vivas de nimbo_actor_id() + heredadas: carpetas vivas con el mismo propietario_id y ruta
--   en rango ~>=~/~<~ (un LIKE con patrón de columna no usa idx_carpeta_ruta) y archivos vivos por (propietario_id, carpeta_id); u.estado = 'activa' en ambos.
--   REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO nimbo_app. Políticas *_lectura_definidor TO CURRENT_USER en archivo y carpeta
--   (vivos) como las de ADR-0021: el dueño de la función también está bajo FORCE.
CREATE POLICY archivo_compartido ON archivo FOR SELECT TO nimbo_app USING (nimbo_actor_role() = 'CLIENT'
  AND id IN (SELECT nodo_id FROM nodos_compartidos() WHERE tipo_nodo = 'archivo'));   -- igual carpeta_compartida
-- version_archivo_cliente se recrea con a.propietario_id = nimbo_actor_id(): hoy solo exige el archivo visible y,
--   con la lectura ampliada, daría INSERT/UPDATE/DELETE de versiones ajenas.
-- version_archivo_actual_compartida FOR SELECT: CLIENT y la fila es la version_actual_id de un archivo visible ajeno
--   (sin versiones anteriores: CA-15).
-- evento_auditoria_alta_compartida FOR INSERT: CLIENT a nombre propio, solo share.left, file.upload_completed (reemplazo) y
--   file.version_pruned; recurso file/folder y afectado = propietario según nodos_compartidos() (CA-26; CA-13, 014 CA-19).
-- 3) AAAAMMDDHHmmss-carga-iniciada-por (PR-B)
ALTER TABLE carga ADD COLUMN iniciada_por uuid REFERENCES usuario(id);  -- NULL = el propietario; sin UPDATE de respaldo
```
- Columnas contra el E-R (PDF): se verifican en la tarea de la migración; `propietario_id`, `actualizado_en` y
  `carga.iniciada_por` van a DF-78 y al redibujo (PD-124).
- Índices: `idx_carpeta_ruta` (prefijo, ya existe), `idx_archivo_carpeta_creado` (archivos de las heredadas) y los de arriba.
  Una prueba de integración mira el `EXPLAIN` de la función, del listado y de la política (sin `Seq Scan` sobre `archivo` ni `carpeta`).
- `down` en orden inverso: columna de `carga`; políticas nuevas y `version_archivo_cliente` original; función y políticas del
  definidor; tabla. Probado con `up → down → up` en `migrations.int-spec.ts`.

## 4. Contratos
| Método | Ruta | Rol | Request → Respuesta | Errores (`code`) |
|---|---|---|---|---|
| POST | `/shares` | CLIENT | `{ node: { type, id }, email, level }` → `201 AccessEntry` (`shareId`, `person { name, email }`, `level`, `sharedAt`) | `400 SHARING_INVALID_INPUT` (`fields`), `403 SHARING_FORBIDDEN`, `403 STORAGE_ACCOUNT_READ_ONLY`, `404 SHARING_NOT_FOUND`, `409 SHARING_ALREADY_SHARED`, `422 SHARING_RECIPIENT_UNAVAILABLE`, `422 SHARING_OWN_ACCOUNT`, `429` (D-6) |
| GET | `/shares/nodes/:nodeType/:nodeId` | CLIENT | → `AccessList { owner, direct: AccessEntry[], inherited: { folder: FolderRef, entries }[] }` | `403 SHARING_FORBIDDEN`, `404 SHARING_NOT_FOUND` |
| PATCH | `/shares/:shareId` | CLIENT | `{ level }` → `AccessEntry` (misma `sharedAt`, CA-7) | `403 SHARING_FORBIDDEN`, `403 STORAGE_ACCOUNT_READ_ONLY` (solo a Editor), `404` |
| DELETE | `/shares/:shareId` | CLIENT | → `204` (también en solo lectura, RN-14) | `403`, `404` |
| GET | `/shares/received?cursor&limit` | CLIENT | → `{ items: ReceivedShare[] (shareId, node { type, id, name, kind? }, ownerName, level efectivo, sharedAt), nextCursor }` | `400 SHARING_INVALID_INPUT` (cursor) |
| DELETE | `/shares/received/:shareId` | CLIENT | → `204` (salir; solo directas, CA-16) | `404 SHARING_NOT_FOUND` (también si está sin efecto: papelera o suspensión) |
| GET | `/folders/contents`, `/quick-access` (existen) | CLIENT | suman `accessLevel`; carpeta compartida abierta con migas desde ella (CA-11) | sin cambios |
| POST | `/files/:fileId/shared-versions` (PR-B) | CLIENT | `{ sizeBytes, onPrune: 'ask' \| 'accept' }` → `InitUploadResponse` | `403 STORAGE_LEVEL_FORBIDDEN`, `403 STORAGE_SHARED_VERSION_UNAVAILABLE`, `404 STORAGE_NODE_NOT_FOUND`, `409 STORAGE_VERSION_WOULD_PRUNE`, `422 STORAGE_QUOTA_EXCEEDED` / `STORAGE_FILE_TOO_LARGE` **sin** `details`, `429` |
| POST · DELETE | `/files/:fileId/shared-versions/:uploadId/{resume,complete}` · `…/:uploadId` | CLIENT | como 005; `complete` → `{ file }` | los de 005 y 014 (`STORAGE_INVALID_FILE_TYPE` tal cual); `404` si se perdió el acceso |

- `:nodeType` ∈ `files|folders` (`quickAccessNodePathSchema`, DRY). Un id que no es UUID es el mismo `404`. Roles internos:
  `403 SHARED_FORBIDDEN`; sin token `401` (CA-25). Orden de `POST /shares`: tasa → forma → permiso → solo lectura →
  destinatario (CA-2) → propio (CA-3) → duplicado (CA-4): un suspendido con acceso previo recibe el error genérico.
- Sin eventos de dominio ni Socket.IO (YAGNI: nadie los consume en 012).

## 5. Seguridad y operación
- `actor` primero en todo servicio; `withActor` en cada caso de uso. Lecturas de nodos: `accessibleNodes`/`ownedNodes` dentro
  de la consulta; `comparticion` se filtra por `propietario_id`/`destinatario_id` = actor y por RLS. Las fachadas de
  `identity` y `storage` enriquecen filas ya autorizadas (nombres), no autorizan.
- **Ámbito del propietario (D-3)**: solo `SharedVersionUploadService` fabrica el actor del propietario, tras `can(CREATE_VERSION)`
  del Editor en la misma petición, con el `fileId` fijado en la carga y `iniciada_por` = Editor. Una regla `no-restricted-syntax` en
  `eslint/rls.js` (+ *fixture*) admite `createActor` solo en una **lista cerrada por archivo** con los llamadores en `main` al hacer
  el PR-B: `jwt-auth.guard.ts`, los procesadores de `storage`, `billing` de 009 (`invoice-retrier.ts`, `subscription-reconciler.service.ts`,
  `account-verified.listener.ts`) y de 010 (`renewal-runner.ts`, planificado), el *handshake* de 015 (`realtime/application/connection-admission.service.ts`,
  planificado) y este servicio, el único que actúa como otra cuenta tras autorizar a un tercero (ADR-0033).
- Enumeración: tasa por cuenta antes de resolver el correo (CA-5); cuatro fallos con el mismo cuerpo (CA-2).
- Auditoría con `recordInTransaction` (si no se guarda, no hay cambio); la del Editor (`file.upload_completed` en modo reemplazo
  y `file.version_pruned`) con `record` tras el commit, desde `author`: actor = Editor, afectado = propietario. Bitácoras (Pino): `share.granted|level_changed|revoked|left` con `shareId`, `nodeId`,
  `recipientId`; `share.rate_limited`. Nunca nombres, correos ni URLs (`email` ya se redacta; verificar `REDACTED_FIELDS`).
- Sin métricas nuevas (022). `nodos_compartidos()` entra en la lista de `architecture.md` §6 y en la revisión de ADR-0021 §3.

## 6. Estrategia de pruebas (por riesgo)
| CA | Nivel | Archivo |
|---|---|---|
| DF-31, CA-3, RN-3, CA-6 (agrupación, fila del dueño) | unit | `sharing/domain/user-share.spec.ts`, `access-list.spec.ts` |
| CA-1…CA-5, CA-7, RN-14 (matriz de solo lectura), orden de comprobaciones | unit | `sharing.service.spec.ts` |
| CA-13, CA-14 (autoriza antes de delegar, errores sin `details`, Lector `403`) | unit | `storage/application/shared-version-upload.service.spec.ts` |
| RN-5, RN-6, RN-9, RN-10, CA-18…CA-20, roles internos vacíos, `EXPLAIN` | int | `test/int/access/accessible-nodes.int-spec.ts` (amplía): directa, heredada, mover dentro/fuera, papelera, suspensión |
| CA-1…CA-5 | int | `test/int/sharing/share.int-spec.ts` (feliz; los cuatro casos de CA-2 con cuerpos idénticos; `429` con `Retry-After`) |
| CA-6, CA-7, CA-8, CA-9, CA-16 | int | `access-list.int-spec.ts`, `share-lifecycle.int-spec.ts` (feliz + error principal por ruta) |
| CA-10, CA-11, CA-12, CA-17 | int | `shared-with-me.int-spec.ts` (paginación, migas, descarga firmada, accesos rápidos) |
| CA-13, CA-14, CA-28 | int (MinIO) | `test/int/storage/shared-versions.int-spec.ts` (espacio del dueño, autor, poda, tipo; acceso perdido a mitad) |
| CA-15 (tabla de rutas de escritura de `storage` × Lector/Editor; ADR-0032 regla 3) | int | `test/int/storage/owner-only-routes.int-spec.ts` |
| CA-21, CA-22, CA-26 | int | `shares-trash.int-spec.ts` (restaurar vuelve, purga borra), `sharing-audit.int-spec.ts` (sin nombres ni correos) |
| CA-24, CA-8, CA-15, CA-21, CA-23, CA-25 | **iso** (bloqueante) | `test/isolation/sharing.iso-spec.ts` (A/B/C casi idénticos; `404` idénticos; suspender y reactivar; tres roles internos) |
| Segunda barrera | **iso** | `test/isolation/sharing-rls.iso-spec.ts` (como `nimbo_app` sin `WHERE`: B lee lo compartido y no puede `UPDATE`/`DELETE` nodos ni versiones de A, ni ver versiones anteriores, ni escribir `comparticion` de A; sin actor 0 filas; `PUBLIC` no ejecuta la función; dueño sin `SUPERUSER`) |
| Migraciones y `down` | int | `migrations.int-spec.ts` (amplía) |
| CA-27 y estados de §6 | web | `share-dialog.spec.tsx` (14), `shared-with-me.spec.tsx` + `shared-folder-view.spec.tsx` + `shared-version-upload.spec.tsx` (17 entre las tres), `app-layout.spec.tsx`; axe a 360 y 1440 |
| Recorrido de la demo | e2e (tarea humana) | compartir, abrir como B, subir versión como Editor, quitar acceso |

## 7. Riesgos y coherencia con el diseño
**7.1 Riesgos.** (R-1) *Fuga por `storage`*: hoy todo nodo de `accessibleNodes` es «propio»; se mitiga con `ownedNodes` por
defecto en el repositorio, `findAccessible*` solo donde se lee, y la tabla de rutas de CA-15. (R-2) *RLS ampliada*:
`version_archivo_cliente` heredaría escritura; se recrea en la misma migración y lo prueba `sharing-rls.iso-spec.ts`;
`acceso_rapido_cliente` se amplía a propósito (CA-17).
(R-3) *Costo*: la función no se puede insertar en línea (`SECURITY DEFINER`) y calcula todo lo compartido del actor por
consulta; con índices, `EXPLAIN` en int y k6 en 023 (PD-125). Sale de inmediato si el actor no tiene ninguna compartición
(primera comprobación), para no pagarla en cada lectura protegida por RLS. (R-4) *Delegación*: un error antes de delegar escribiría como el
dueño; un solo punto, `fileId` fijo, revalidación por paso y prueba unitaria del orden. (R-5) *Conflictos* con 010 y 017 en los
mismos servicios de `storage` (§7.5).

**7.2 Decisiones** (Fátima, 2026-10-17; D-1, D-2 y D-3 las revisa el `architect`):
- **D-1** `sharing → identity` solo por `identity/index.ts`, fachada concreta `ShareRecipientDirectory` en `IdentityReadersModule`
  (009), como `backoffice → identity`; enmienda ADR-0010. Descartado un puerto en `shared` o declarado por `sharing`: regla de
  negocio en `shared` o arista `identity → sharing`. La arista sirve también a PD-20 (hasher de 013): se decide una vez en ADR-0033.
- **D-2** `access` lee `usuario.estado` solo dentro de `nodos_compartidos()` (DF-78). Descartada una marca en `comparticion`:
  `identity` escribiría una tabla ajena.
- **D-3** Ámbito delegado del propietario, un solo punto (§5): cuota, límites y `readOnly` salen de `limitsFor(owner)` sin tocar
  la RLS de escritura ni `billing`. Descartada la RLS de escritura para el Editor: la RLS no limita columnas y obligaba a cuota
  por cuenta ajena, un método nuevo de `billing` y la poda en el `worker`.
- **D-4** El Editor ante la solo lectura del propietario: `403 STORAGE_SHARED_VERSION_UNAVAILABLE`, «No puedes subir versiones a
  este archivo por ahora.» (neutro: no revela la causa). Lo confirma Juan Marcos, junto con que el mensaje de 010 CA-13 cubra compartir y subir a Editor.
- **D-5** Lo que solo hace el dueño responde `404 STORAGE_NODE_NOT_FOUND` idéntico (spec CA-15); `403` solo en compartir (CA-9) y
  en la versión del Lector (`STORAGE_LEVEL_FORBIDDEN`). Descartado un `403` general: suma una consulta y un oráculo.
- **D-6** Tasa: 20 intentos por 15 min y cuenta, con `SHARED_TOO_MANY_REQUESTS` y `RateLimitExceededError` de 009
  (ya en `main`); si al integrar cambia el prefijo, `SHARING_TOO_MANY_REQUESTS` se suma a PD-93 de 009.
- **D-7** El codificador de cursor (tercera copia) se extrae a `shared/…/cursor-tuple.ts`; `storage` y `audit` migran en el 20 % (PD-126).
- **D-8** La carpeta compartida usa `GET /folders/contents` con `accessLevel` (DRY), sin ruta propia en `sharing`.
- **D-9** El afectado del evento de la versión del Editor es el propietario (spec CA-13 y RN-12; política de §3).
- **D-10** La tarea de RN-14 espera a 010 T-06 en `main` (`WritableAccountPolicy`, `PlanLimits.readOnly`).

**7.3 Desviaciones (DF-78**; DF-69 es de 009, DF-70 a DF-76 son de 016 y la 010 reserva DF-77): `SharingController` suma
`changeLevel`, `leave`, `listReceived` y la lista se llama `listAccess`; `AccessListService` y `SharedWithMeService`; sin
`AccessGrant`; `comparticion.propietario_id` y `actualizado_en`; `nodos_compartidos()` y lectura de `usuario.estado` por
`access`; `ownedNodes`; `IGrantRepository` como lector SQL; en M2 `findOwned*`, `NodeSummaryReader`, `SharedVersionUploadService`,
`carga.iniciada_por` y la delegación; política de auditoría compartida; arista `sharing → identity`. Se cierran **DF-31**
(dominio y `CHECK`), **DF-40** (ADR-0011, pendiente de la confirmación de Adrián) y **DF-32** (rama de comparticiones).

**7.4 Pendientes y ADR.** PD-124 redibujar M3a, M3b, M2, T2 y el E-R (DF-78); si D-6 no reutiliza, `SHARING_TOO_MANY_REQUESTS`
se suma a PD-93 (009); PD-125 medir con k6 `nodos_compartidos()` en listados, RLS y búsqueda (023); PD-126 migrar los cursores de
`storage` y `audit` a `shared`; PD-127 que 013 reutilice `nodos_compartidos()`/suspensión (PD-20 lo decide ADR-0033). Se
actualizan PD-78 (012 cubierto) y PD-123; PD-128 (enmiendas de 014 y 006) ya está resuelto (2026-10-17). **ADR-0033** (Propuesto, redactado
por el `architect` el 2026-10-17; renumerado a 0033 porque la 015 tomó el 0030 al entrar en `main`): arista `sharing → identity`, función `nodos_compartidos()` y
ámbito delegado. **Enmienda ADR-0010** (aristas de `sharing`), **ADR-0005** (actuar como el dueño, ahora también en el `api`) y
la **regla 4 de ADR-0032** (010, «sin fabricar un actor ajeno»).

**7.5 Integración con otras ramas.** Orden preferido, no condición (el PR-A no depende de la 017): **009 → 017 → 012 PR-A → 010 → 012 PR-B** (o 010 antes de PR-B).
- *009* (Juan Marcos): trae `IdentityReadersModule`, `RateLimitExceededError` y cambios en `identity/index.ts`,
  `i-account-directory.repository.port.ts`, `typeorm-account-directory.repository.ts`, `storage/index.ts`, `storage.module.ts`,
  `shared/index.ts`, `env.schema.ts`, `boundaries.js`, `app.module.ts`, `error-catalog.ts`. Su PD-105 se publicó antes: 012 usa PD-128.
- *010* (Borrador): `PlanLimits.readOnly`, `WritableAccountPolicy` y `STORAGE_ACCOUNT_READ_ONLY` en los mismos servicios que
  toca la T de `ownedNodes` (`upload`, `folder`, `file`, `version-restore`, `trash`). Quien entre segundo rebasa; la tabla de
  rutas de ADR-0032 regla 3 suma las de `sharing` y la de versión del Editor.
- *017* (Abel): `AccessibleFileUrlIssuer` (solo la versión actual, `findAccessible*`), *slot* `firstAction` en `file-row-menu.tsx`,
  `node-rows.tsx`, `my-files.tsx`, `routes.ts`, `storage/index.ts` y `error-codes.ts`. Mockups: PD-106. La 012 lo espera para
  no pisar esos archivos, pero su PR-A funciona igual sin la 017 (mientras 017 no entre segundo, rebasa).
- *015* (Adrián): documentos (`architecture.md`) y `createActor` en el *handshake* de `realtime`: entra en la lista de §5.

**7.6 Archivos ajenos** (permiso uno por uno). **Adrián**: lo marcado [Adrián] en §2, la política de `evento_auditoria`, `.env.example`, `rls.js`, `boundaries.js` y web `features/storage/` (menús, `my-files`, accesos rápidos, `upload-manager`, `load-more`). **Juan Marcos**: nada de `billing` (solo D-4 y el texto de 010 CA-13). Convivencia: `app.module.ts`, `app-layout.tsx`, `lib/error-catalog.ts`, migraciones.

**7.7 Tamaño y PR** (Fátima, 2026-10-17; revisión del PR #61, 2026-10-20). Unos 10 días (PR-A ≈ 6, PR-B ≈ 4), más que los
≤ 3 de `workflow.md` §4.1: una spec y dos PR, excepción que **Adrián debe aceptar**. **PR-A**: toda la API salvo la versión del
Editor. **PR-B**: versión del Editor + migración 3, RN-14 con 010 y toda la web. `/review` llega con PR-B. Con T-01 partida en
dos (M-3 de la revisión) son 13 tareas, una más de las 12 de `workflow.md` §1: entra en la misma excepción.

**7.8 Spec ajustada** (2026-10-17): CA-15 (`404`, D-5), CA-13 y RN-12 (afectado, D-9), CA-11 (sin carpetas superiores), CA-28 (acceso perdido con la carga en curso) y las enmiendas de PD-128 (014 RN-7/CA-15, 006 CA-27).

## 8. Aprobación
- `architect` (2026-10-17): **Aprobado con cambios**. DAG intacto con `sharing → identity`; D-1, D-2 y D-3 validadas en ADR-0033.
  Aplicados aquí: (1) precedencia dentro de `nodos_compartidos()` y `UNION ALL` sin agrupar (§1, §2); (2) función con `public.`,
  cierre con `NULL`, `propietario_id` en las uniones y rango de `ruta` (§3); (3) delegación `{ owner, author }`: tasa, autor y
  un solo evento del Editor, `iniciada_por` en cada paso (§2, PR-B); (4) regla de lint concreta para `createActor` (§5);
  (5) alta de auditoría compartida solo para `share.left` y el reemplazo de 014 (§3); (6) salir de lo que está sin efecto da
  `404` (§4); (7) solo lectura con `WritableAccountPolicy` (§2). Condiciones antes de las tareas: (8) Adrián acepta ADR-0011
  (DF-40) y ADR-0033, y DF-31 pasa a `Aceptado`; (9) la tarea de `ownedNodes` clasifica **todos** los `findAccessible*` de
  `storage` (17 hoy, con `version-pruner.ts`, `upload-registrar.ts` y la carpeta padre al restaurar en `trash.service.ts`);
  (10) la regla 4 de ADR-0032 se enmienda en la rama de 010 antes del PR-B.
  Cambios posteriores al veredicto (revisión de la rama, 2026-10-17), revisados por el architect: auditoría del Editor con `file.upload_completed` (reemplazo)
  y `file.version_pruned` (actor = Editor, afectado = propietario) y su alta en `evento_auditoria_alta_compartida`; código neutro `STORAGE_SHARED_VERSION_UNAVAILABLE`; lista cerrada de `createActor`.
- Revisión del PR #61 (2026-10-18) y ajustes de Fátima (2026-10-20): B-1 resuelto al_traer `main` (009, 015 y 016) y renumeración (ADR-0033, DF-78, PD-123 a PD-128); M-3 con T-01 partida en dos (13 tareas); M-4 aclarando que la 017 es orden preferido, no condición; menores con D-6 al día (009 ya está en `main`), la salida rápida de `nodos_compartidos()` (R-3) y el plan en 250 líneas.
- Adrián (2026-10-17): aprueba spec y mockups; pide PD-128 antes del plan (hecho), decidir `sharing → identity` con PD-20 de una
  vez (ADR-0033), aceptar ADR-0011 y abrir el DF; RN-14 detrás de 010; PD-123 antes de la UI. Pendiente: plan y tareas
  (D-1 a D-10, dos PR de §7.7, permisos de §7.6) y aceptar ADR-0033, con la confirmación de M-1 (ADR-0011, enmiendas de 014 y 006)
  y la aprobación de los cambios de spec de M-2 (CA-15, CA-28, CA-11, CA-13 y RN-12).
