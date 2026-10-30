# Plan 012 — Compartición y accesos (API)

> Spec: `./spec.md` · Estado del plan: Propuesto
> Obligatorio y ≤ 250 líneas. Dice **qué** archivos se tocan y **qué** se espera de cada uno; no es el código en
> prosa (sin cuerpos de funciones ni pseudocódigo). Lo aprueba Adrián antes de escribir código.

## 1. Resumen técnico
- Módulo nuevo `sharing` (M3b, Fátima): `SharingController` → `SharingService` (`share`, `listAccess`, `revoke`) →
  `IShareRepository` → tabla `comparticion`. Dominio: `UserShare` y `AccessList` (value object). `AccessGrant`
  (abstracta) no se crea hasta que la 013 aporte `PublicLink` (Art. V.2: sin segundo uso).
- La autorización **no se duplica**: `SharingService` pregunta a `PermissionResolver.can(actor, nodeId, Action.SHARE | VIEW_ACCESS_LIST)`
  (003) dentro de `withActor`; un nivel que no alcanza responde como inexistente (404, 003 D-6).
- `access` completa lo que dejó previsto: `accessibleNodes(actor)` pasa a ser propios ∪ compartidos (directos y
  heredados por `carpeta.ruta`) con su `nivel`, y nace `ownedNodes(actor)` (la propiedad viva de hoy). La regla de
  «qué se comparte conmigo» vive **una vez**, en la función SQL `nodos_compartidos()`, que usan el fragmento de
  `access` y las políticas RLS (ADR-0005: función `STABLE` versionada al repetirse la regla).
- Riesgo principal: hoy `storage` asume que `accessibleNodes` = «mío» y no consulta `PermissionResolver`. Al ampliarlo,
  toda escritura y todo destino pasan a `ownedNodes` (T-03) **antes** de abrir las lecturas al destinatario (T-04).
- El correo del destinatario se resuelve con un puerto que declara `sharing` e implementa `identity` (patrón
  `IUserDirectory`, DF-74); `sharing` no importa `identity` (ADR-0010).
- Auditoría con `recordInTransaction` (3 acciones nuevas). Sin eventos de dominio, métricas ni tiempo real.

## 2. Módulos, archivos y diseño
| Módulo / capa | Archivo (nuevo o cambiado) | Responsabilidad |
|---|---|---|
| contracts | `packages/contracts/src/sharing.ts` (+ export en `index.ts`) | `shareRequestSchema` (`nodeType`, `nodeId`, `email`, `level` ∈ `VIEWER`\|`EDITOR`), `accessEntrySchema`, `accessListSchema`, códigos `SHARING_*` |
| datos | `migrations/20261101100000-crear-comparticion.ts` | Tabla, índices, RLS de `comparticion`, función `nodos_compartidos()` (§3) |
| datos | `migrations/20261101100100-politicas-rls-nodos-compartidos.ts` | Políticas `SELECT` para el destinatario en `archivo`, `carpeta`, `version_archivo`; Editor en `sesion_edicion`/`participacion` (PD-108) |
| access (M3a) | `infrastructure/sql/accessible-nodes.ts`, `index.ts` | Rama compartida en `accessibleNodes` (llama `nodos_compartidos()`); `ownedNodes` nuevo y exportado; `ownedTrashedNodes`/`ownedFiles` sin cambio |
| sharing/domain | `user-share.ts`, `access-list.ts`, `errors/*.ts` | `UserShare.grant(level)` rechaza `OWNER` (DF-31) y `changeLevel`; `AccessList` agrupa `direct` e `inherited`; `SharingInvalidLevelError` (422), `RecipientNotFoundError` (422), `CannotShareWithSelfError` (422), `ShareNotFoundError` (404) |
| sharing/application | `sharing.service.ts`, `ports/i-share.repository.port.ts`, `ports/i-sharee-directory.port.ts` | Casos de uso con `actor` primero; límite con `IRateLimiter`, solo lectura con `WritableAccountPolicy`, auditoría con `IAuditLogger.recordInTransaction`. Puertos: ver abajo |
| sharing/infra | `comparticion.orm-entity.ts`, `typeorm-share.repository.ts` | `insert/upsert`, `delete`, `findById`, `listDirect`, `listInherited` (unión por `carpeta.ruta`); todo con `requireActorScope` |
| sharing/presentation | `sharing.controller.ts`, `sharing.module.ts`, `index.ts`; `app.module.ts`, `.env.example` y esquema de entorno | Tres rutas `@Roles(Role.CLIENT)` con `Cache-Control: no-store`; el módulo enlaza el puerto; variables `SHARING_RATE_*` (`pnpm env:check`) |
| identity (M1) | `infrastructure/adapters/sharee-directory.adapter.ts`, `index.ts`, `apps/api/src/sharee-directory-binding.module.ts` | Implementa `IShareeDirectory` importándolo de `sharing/index.ts`; el enlace vive en la raíz de composición como `UserDirectoryBindingModule` |
| audit (T2) | `application/audit-catalog.ts` (+ enum `AuditAction`) | `SHARE_GRANTED`, `SHARE_LEVEL_CHANGED`, `SHARE_REVOKED`: tipo de recurso por `nodeType`, atributos `nodeType` y `level` |
| storage (M2) | `typeorm-node.repository.ts`, `typeorm-trash.repository.ts`, `i-node.repository.port.ts`, `index.ts` | Escrituras y destinos a `ownedNodes`; `findOwnedFolder` nuevo; lecturas del destinatario abiertas; `index.ts` exporta `WritableAccountPolicy` (PD-121) |

11 filas. **Puertos nuevos:** `IShareRepository` (interno de `sharing`, adaptador TypeORM: el repositorio de cada módulo, `architecture.md` §5) y
`IShareeDirectory` (`findClientByEmail(email)` y `displayNames(ids)`; lo exige la frontera `sharing`/`identity`: Art. V.2(b), sin él
habría `sharing → identity`, prohibido por ADR-0010 y PD-20). Segundo adaptador: ninguno; se justifica por la frontera, no por polimorfismo.

**Dependencias nuevas entre módulos:** `sharing → access`, `storage`, `audit` (ya permitidas); `identity → sharing` (solo
para implementar el puerto; mismo patrón que `identity → editing`, sin ciclos: `sharing` no importa `identity`). Ambas
requieren al `architect` (§8) y actualizar `architecture.md` §3 y §5.

**Consumidores de `accessibleNodes` en `storage` y otros (decisión por cada uno):**
- *Se abren al destinatario (siguen con `accessibleNodes`):* `findAccessibleById` (ficha y descarga), `findAccessibleFolder`,
  `listContents` con `folderId` ≠ raíz, `breadcrumbs` (solo antepasados accesibles: no filtra carpetas por encima), `IndexableFileGateway` y `chunk-sql` (agente),
  `EditableFileGateway.find/openContent` (016), `IndexStatusService` y el acceso rápido (fijar un compartido es válido; se poda al revocar).
- *Pasan a `ownedNodes` (solo propietario):* `listContents` de la raíz (si no, un archivo compartido de la raíz del dueño
  aparecería en «Mis archivos» del destinatario), `findLiveFileByName`, `findTakenNames`, `findTakenFolderNames`,
  `maxSubtreeDepth`, `insertWithVersion`, `insertFolder`, `renameFile/Folder`, `moveFile`, `moveFolderSubtree`,
  `updateCurrentVersion` (conserva la rama `ownedFiles`), la eliminación a la papelera, y el historial/restauración de
  `typeorm-version.repository` (014 RN-7). El destino de subir/mover/crear usa `findOwnedFolder`.
- *Ya filtran `propietario_id`:* resumen de espacio (007) y purga de originales (014b); no cambian.
- Frontend: nada (012b).

## 3. Datos
```sql
CREATE TABLE comparticion (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  propietario_id  uuid NOT NULL REFERENCES usuario(id),
  destinatario_id uuid NOT NULL REFERENCES usuario(id),
  archivo_id      uuid REFERENCES archivo(id) ON DELETE CASCADE,
  carpeta_id      uuid REFERENCES carpeta(id) ON DELETE CASCADE,
  nivel           varchar(8)  NOT NULL,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_en  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_comparticion_nivel     CHECK (nivel IN ('EDITOR', 'VIEWER')),            -- DF-31: sin OWNER
  CONSTRAINT ck_comparticion_nodo      CHECK ((archivo_id IS NULL) <> (carpeta_id IS NULL)), -- ADR-0011
  CONSTRAINT ck_comparticion_distinto  CHECK (destinatario_id <> propietario_id)
);
CREATE UNIQUE INDEX uq_comparticion_archivo_destinatario ON comparticion (archivo_id, destinatario_id) WHERE archivo_id IS NOT NULL;
CREATE UNIQUE INDEX uq_comparticion_carpeta_destinatario ON comparticion (carpeta_id, destinatario_id) WHERE carpeta_id IS NOT NULL;
CREATE INDEX idx_comparticion_destinatario ON comparticion (destinatario_id);
ALTER TABLE comparticion ENABLE ROW LEVEL SECURITY;  ALTER TABLE comparticion FORCE ROW LEVEL SECURITY;
CREATE POLICY comparticion_propietario  ON comparticion TO nimbo_app  -- ALL: CLIENT y propietario_id = nimbo_actor_id()
CREATE POLICY comparticion_destinatario ON comparticion FOR SELECT TO nimbo_app  -- CLIENT y destinatario_id = nimbo_actor_id()
-- nodos_compartidos(): SIN parámetros (el actor sale de nimbo_actor_id(), no se puede consultar a otra cuenta)
CREATE FUNCTION nodos_compartidos() RETURNS TABLE (nodo_id uuid, tipo_nodo text, nivel text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$ ... $$;
REVOKE ALL ON FUNCTION nodos_compartidos() FROM PUBLIC;  GRANT EXECUTE ON FUNCTION nodos_compartidos() TO nimbo_app;
```
- La función devuelve vacío si el rol no es `CLIENT`. Une: (a) los accesos directos del actor; (b) archivos y carpetas
  bajo carpetas compartidas, por prefijo de `carpeta.ruta` (`idx_carpeta_ruta`); con el nivel más alto por nodo; solo si
  el nodo está vivo (`eliminado_en IS NULL`; eliminar una carpeta marca su subárbol, 006) y la cuenta propietaria está
  `activa` (`usuario.estado`, CA-17). `SECURITY DEFINER` sigue el patrón de `carga_expiradas` (dueño sometido a `FORCE`:
  política acotada `TO CURRENT_USER`); la revisión del `security-auditor` es obligatoria.
- Migración B: `archivo_compartido` y `carpeta_compartida` (`FOR SELECT`, `id IN (SELECT nodo_id FROM nodos_compartidos() WHERE tipo_nodo = …)`);
  `version_archivo_compartida` (`FOR SELECT`, solo la versión vigente del archivo compartido: el destinatario nunca lee
  versiones antiguas); `sesion_edicion_compartida` y `participacion_compartida` para el Editor (`nivel = 'EDITOR'`; las
  operaciones exactas las fija la prueba de T-09). Los roles internos siguen sin política.
- `down`: A borra índices, políticas, función y tabla; B borra sus políticas. Orden inverso al de `up`; prueba `up → down → up` con dueño `NOSUPERUSER`.

## 4. Contratos
| Método | Ruta | Rol | Request → Respuesta | Errores (`code`) |
|---|---|---|---|---|
| POST | `/api/v1/shares` | CLIENT | `{ nodeType: 'file'\|'folder', nodeId, email, level }` → `201` entrada nueva, `200` nivel cambiado o igual | `422` `SHARING_INVALID_LEVEL`, `SHARING_RECIPIENT_NOT_FOUND`, `SHARING_CANNOT_SHARE_WITH_SELF`, validación con `fields`; `404` `STORAGE_NODE_NOT_FOUND`; `403` `STORAGE_ACCOUNT_READ_ONLY`; `429` `SHARED_TOO_MANY_REQUESTS` |
| GET | `/api/v1/shares?nodeType&nodeId` | CLIENT | → `{ entries: AccessEntry[] }` | `404` `STORAGE_NODE_NOT_FOUND`; `422` consulta inválida |
| DELETE | `/api/v1/shares/:shareId` | CLIENT | → `204` | `404` `SHARING_SHARE_NOT_FOUND` (ajeno, inexistente o ya revocado) |

`AccessEntry` = `{ shareId \| null, grantee: { id, displayName, email }, level, origin: 'direct'\|'inherited', inheritedFrom: { folderId, folderName } \| null, createdAt }`.
Las tres rutas: `@Roles(Role.CLIENT)` (otros roles `403` `SHARED_FORBIDDEN`, sin token `401`), `Cache-Control: no-store`
(llevan correos). El correo viaja en el cuerpo, nunca en la URL. Sin eventos de dominio ni Socket.IO: no hay consumidor (YAGNI).

## 5. Seguridad y operación
- `actor` primero en `share`, `listAccess` y `revoke`. Cada caso de uso corre en `ITransactionRunner.withActor`; el
  repositorio usa `requireActorScope` (sin `withActor` lanza). La autorización es `PermissionResolver.can` más
  `accessibleNodes`/`ownedNodes` **dentro de la consulta**; RLS es la segunda barrera.
- Orden de `share`: límite de tasa (clave `sharing:share:<propietario>`, antes de buscar el correo) → nodo y permiso
  (404 uniforme) → solo lectura (solo si crea o sube a `EDITOR`) → destinatario → upsert + auditoría en la misma
  transacción. Los cuatro motivos de CA-3 se comparan en un solo punto para dar el mismo cuerpo y evitar diferencias de tiempo observables.
- Bitácoras: `{ event: 'sharing.granted' | 'sharing.level_changed' | 'sharing.revoked', shareId, nodeId, level }`;
  nunca correo, nombre ni el cuerpo de la petición. Auditoría: CA-19, con `targetUserId` = propietario.
- Métricas: ninguna (la spec no declara). Sin cambios en `configureHttpApp`: el `no-store` va en el controlador.

## 6. Estrategia de pruebas (por riesgo)
Cada tarea de lógica empieza por su prueba en rojo. Sin repetir un CA en tres capas.

| CA | Nivel | Archivo |
|---|---|---|
| CA-2, CA-5 (regla) | unit | `sharing/domain/user-share.spec.ts` (`OWNER` rechazado, cambio de nivel) |
| CA-3, CA-6, CA-7 (orden y unificación de motivos) | unit | `sharing/application/sharing.service.spec.ts` |
| CA-1, 3 a 7, 9 a 11, 19, 20 | int | `test/int/sharing/shares.int-spec.ts` (por endpoint: feliz + error principal; Postgres real) |
| CA-8, 13, 17 (herencia, nivel mayor, papelera, suspensión) | int | `test/int/access/accessible-nodes-shared.int-spec.ts` (SQL real y `EXPLAIN` con el índice de `ruta`) |
| CA-12, 13, 14 | int | `test/int/storage/shared-access.int-spec.ts` (destinatario: ficha, descarga, contenido, migas; lista de escrituras de `storage` con Lector y Editor → 404) |
| CA-15 | int | `test/int/editing/shared-editing.int-spec.ts` (Editor abre y guarda; Lector en solo lectura; revocación) |
| CA-16 | iso | casos nuevos en `test/isolation/agent.iso-spec.ts` (cierra PD-134 CA-5) |
| CA-18 | int | en `shares.int-spec.ts` (purga borra, papelera conserva) |
| CA-21, CA-14, CA-17, CA-3 | iso | `test/isolation/sharing.iso-spec.ts`: A/B/C, RLS sin filtro en la consulta, rutas de escritura como Lector/Editor, internos sin filas, `nodos_compartidos()` no admite otra cuenta, sin diferencia observable entre motivos de CA-3 |
| migración | int | `migrations.int-spec.ts` (`up → down → up`, dueño `NOSUPERUSER`) |

Pruebas existentes que **deben seguir en verde** sin cambio: las suites de `storage`, `access` y `editing` (el cambio a
`ownedNodes` es de comportamiento neutro para el propietario). Aislamiento: `pnpm test:isolation` es bloqueante.

## 7. Riesgos y coherencia con el diseño
- **R-1 Escrituras abiertas por error** (alto): un Editor o Lector renombra, mueve, borra o sube a lo ajeno. Mitigación: T-03
  antes que T-04, `ownedNodes` por defecto en escrituras y destinos, y la prueba que recorre todas las rutas de escritura de `storage`.
- **R-2 Mezcla en «Mis archivos»:** lo compartido en la raíz del dueño aparecería en la raíz del destinatario; `listContents(raíz)` usa `ownedNodes` (CA-12).
- **R-3 Rendimiento (RNF-01):** `nodos_compartidos()` entra en cada consulta del destinatario. Mitigación: función `STABLE` sin
  parámetros (subconsulta no correlacionada), `EXPLAIN` en T-02; si no alcanza, se materializa en un plan nuevo.
- **R-4 `SECURITY DEFINER` + `FORCE RLS`:** error de política = fuga entre cuentas; revisión del `security-auditor` y la suite de T-10.
- **R-5 Enumeración de cuentas:** mensaje único, límite por propietario y prueba de igualdad de respuestas (patrón `identity-enumeration.iso-spec.ts`).
- **R-6 Tamaño:** 11 filas y cuatro módulos de Adrián; si T-03 o T-09 exceden el día, se avisa y se parte en 012c, sin abrir alcance.
- **Desviaciones de los diagramas** (se anotan en `design-findings.md`):
  - **DF-31** pasa a `Aceptado (plan 012)`: `OWNER` no se asigna (`CHECK`, contrato y dominio).
  - **DF-84 nuevo**: `IShareeDirectory` declarado por `sharing` e implementado por `identity`; `AccessGrant` abstracta diferida a la 013; sin `PublicLinkService` aún; `listAccess` no paginado (convención: S-3).
  - **DF-85 nuevo**: `accessibleNodes` = propios ∪ compartidos y `ownedNodes` para escrituras; `nodos_compartidos()` lee `usuario.estado` (excepción acotada y documentada de `access`, `architecture.md` §3 regla 3).
- **Pendientes** (`pendientes.md`): se **cierran** PD-108 (RLS del Editor), PD-134 (CA-5 de la 020) y la parte de PD-121 que toca compartir
  (013 y 021 siguen); **PD-109** cambia de alcance (no hay evento: la revocación se detecta en la verificación de la 016, S-6);
  **PD-78** queda a medias (013 aplica los enlaces); **PD-123** sigue abierto (aviso de indexación a quienes comparten);
  **PD-20** no se cierra (una enmienda `sharing → identity` lo resolvería y evitaría el puerto: lo discutible). Nuevos: **PD-137** (tercera copia
  de «raíz de composición que enlaza un puerto»: extraer al 20 % de refactor, Art. VI.2), **PD-138** (sin RF: aviso al destinatario, su actividad, «Compartidos conmigo» y «Salir»),
  **PD-139** (historial de versiones para Editor/Lector), **PD-140** (Editor que sube versión por carga y el código neutro `STORAGE_SHARED_VERSION_UNAVAILABLE` de 010 RN-6).
- **ADR requeridos:** ninguno. La enmienda a ADR-0010 solo haría falta si se prefiere `sharing → identity` (alternativa descartada aquí por PD-20 y por no abrir una arista de negocio hacia `identity`).
- Documentos a actualizar en el PR: `architecture.md` §3, §5 y §6; `design-model.md` (M3a, M3b, M1, T2, §4 mapeo); READMEs de `sharing` y `access`.

## 8. Aprobación
- `architect` (puerto nuevo entre módulos, arista `identity → sharing` y lectura de `usuario.estado` en la función): aceptado por Adrián como tech lead (2026-10-30); sin pasada del subagente
- Dueños de módulo: cambios en `access`, `storage`, `identity` y `audit` (de Adrián) — autorizados por Adrián, dueño de los módulos, a Fátima (2026-10-30; spec P-3)
- Adrián: Aprobado (2026-10-30)
