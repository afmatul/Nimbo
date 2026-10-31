# Plan 013 — Enlaces públicos (API)

> Spec: `./spec.md` · Estado del plan: Propuesto
> Obligatorio y ≤ 250 líneas. Dice **qué** archivos se tocan y **qué** se espera de cada uno; no es el código en
> prosa (sin cuerpos de funciones ni pseudocódigo). Lo aprueba Adrián antes de escribir código.

## 1. Resumen técnico
- En `sharing` (M3b) nacen dos casos de uso, separados por SRP: `PublicLinkService` (propietario, con `actor`:
  `createLink`, `currentLink`, `revokeLink`) y `PublicLinkAccessService` (visitante, sin sesión: `openLink`,
  `downloadLink`). Dominio `PublicLink` y tabla `enlace_publico` (DF-09: `id uuid`, `token_hash` único) más
  `intento_acceso` (RNF-08). La autorización del propietario **no se duplica**: `PermissionResolver.can(actor, fileId,
  Action.CREATE_PUBLIC_LINK)` (ya existe en `access`), y un nivel que no alcanza es el 404 de lo inexistente (003 D-6).
- **Riesgo central (D-1, ADR-0039 propuesto):** el visitante no tiene `Actor` y la base tiene RLS `FORCE`. El camino es
  explícito y mínimo: (1) una función `SECURITY DEFINER` `enlace_por_token(token_hash)` devuelve **solo** los tres
  ids de la fila no revocada y no vencida de ese hash (`enlace_id, archivo_id, propietario_id`), con la lista de
  ADR-0021 («solo identificadores»); (2) todo lo demás, incluida la relectura de `clave_hash` y `vence_en`, corre en
  `withActor(createActor(propietario_id, CLIENT))` con RLS normal, y enlace y archivo salen de esa fila, nunca de la
  petición. Papelera, suspensión y vencimiento dan el mismo `null`.
- `storage` expone una fachada nueva, `LinkedFileGateway` (patrón `EditableFileGateway`), para leer el archivo propio
  y vivo y firmar su versión vigente sin auditar como descarga del dueño ni gastar su límite de `FileService`.
- Contraseña con Argon2id reutilizando `IPasswordHasher`; bloqueo por enlace + IP reutilizando `IAttemptLockout`
  (002). Ambos viven hoy en `identity`, y `sharing → identity` sería un ciclo (ya existe `identity → sharing`, DF-84):
  **D-2** (decidida por el `architect`, §7): se mueven a `shared` sin cambio de comportamiento. Sin `ISecretCipher` ni
  `AccessGrant` (§7).
- El token viaja en el fragmento de la URL y del navegador a la API en el **cuerpo** (`POST`): nunca en la ruta, así
  `logger.options.ts` no cambia (ya quita la consulta y no registra cuerpos; `token` y `password` ya se redactan). Las
  líneas de negocio y la auditoría no llevan token, contraseña, IP, nombre de archivo ni correo (como 002 CA-18); la
  línea técnica `http.request` de `shared` conserva la IP como en todas las rutas y sirve para investigar abusos (RNF-08).

## 2. Módulos, archivos y diseño
| Módulo / capa | Archivo (nuevo o cambiado) | Responsabilidad |
|---|---|---|
| contracts | `packages/contracts/src/sharing.ts` | `createPublicLinkSchema` (`fileId`, `expiresInDays` ∈ 1\|7\|30 con 7 por omisión, `password` opcional de 8 a 128), `publicLinkQuerySchema`, `publicLinkSummarySchema`, `createdPublicLinkSchema` (`{ link, url }`), `publicLinkTokenSchema`, `publicLinkDownloadSchema`, `publicLinkDetailsSchema` (reusa `byteCount`) y reutiliza `downloadUrlSchema`; códigos `SHARING_LINK_NOT_FOUND`, `SHARING_LINK_UNAVAILABLE`, `SHARING_LINK_PASSWORD_INVALID`; constante `PUBLIC_LINK_EXPIRY_OPTIONS` (1, 7, 30) |
| datos | `migrations/20261102100000-crear-enlace-publico.ts` | `enlace_publico`, `intento_acceso`, índices, RLS y `enlace_por_token()` (§3), con `down` |
| shared (T1, D-2) | `domain/password-hash.vo.ts`, `application/security/i-password-hasher.port.ts`, `infrastructure/security/argon2id.hasher.ts`, `application/rate-limit/i-attempt-lockout.port.ts`, `infrastructure/rate-limit/redis-attempt-lockout.ts` (movidos desde `identity` con sus `.spec.ts`; `password-hash.int-spec.ts` y `redis-attempt-lockout.int-spec.ts` pasan de `test/int/identity/` a `test/int/shared/`), `shared.module.ts`, `index.ts`, `infrastructure/config/env.schema.ts`, `README.md` | Mismo código y pruebas; `SharedModule` (global) provee `I_PASSWORD_HASHER` e `I_ATTEMPT_LOCKOUT`; variables `PUBLIC_LINK_*` (§5); el README copia la regla 8 de `architecture.md` §3 (qué entra en `shared`). Sin dependencia nueva: `argon2` ya está (ADR-0017) |
| identity (M1) | `identity.module.ts` y los importadores de los cinco archivos movidos; `infrastructure/adapters/sharee-directory.adapter.ts`; `README.md` | Solo cambian rutas de import y deja de proveer los dos tokens; el adaptador implementa `activeDisplayName` |
| sharing/domain | `public-link.ts`, `link-token.ts`, `network-prefix.ts`, `errors/*.ts` | `PublicLink.create`/`rehydrate`/`toSnapshot`, `statusAt(now)` y `requiresPassword`; `LinkToken` (32 bytes `base64url`, `hashOf` SHA-256, `isWellFormed`); `NetworkPrefix` (`forRecord(ip)`: /24 o /48 para `intento_acceso`, S-3; `forLimit(ip)`: /32 o /64 para las claves de Redis, RN-7); `PublicLinkNotFoundError` (404), `PublicLinkUnavailableError` (404), `PublicLinkPasswordInvalidError` (403) |
| sharing/application | `public-link.service.ts`, `public-link-access.service.ts`, `public-link-records.ts`, `ports/i-public-link.repository.port.ts`, `ports/i-public-link-resolver.port.ts`, `ports/i-sharee-directory.port.ts`, `sharing-config.ts` | Casos de uso de §1; `public-link-records.ts` arma eventos y bitácoras de los dos (DRY, como `share-records.ts`); `IShareeDirectory` suma `activeDisplayName(userId)` |
| sharing/infra | `enlace-publico.orm-entity.ts`, `typeorm-public-link.repository.ts`, `sql-public-link-resolver.ts` | Repositorio con `requireActorScope`: `findCurrent`, `findAvailable(actor, linkId)` (no revocado ni vencido; da `clave_hash` y `vence_en` al visitante, ADR-0039), `replace` (serializa por archivo con `pg_advisory_xact_lock`, como `IAdminRosterRepository`; revoca el anterior e inserta con `INSERT … SELECT` sobre `ownedNodes`, devuelve el revocado o `null`; dos `POST` simultáneos nunca dan 500 por `uq_enlace_publico_archivo_activo`), `revoke`, `recordFailedAttempt` (sin `RETURNING`: `intento_acceso` no tiene `SELECT`). Resolver sin actor: solo llama `enlace_por_token()` |
| sharing/presentation | `public-links.controller.ts`, `public-link-access.controller.ts`, `sharing.module.ts`, `.env.example` | Propietario `@Roles(Role.CLIENT)`; visitante `@Public()`; ambos con `no-store`; el visitante además `Referrer-Policy: no-referrer` y la IP de `req.ip` (`trust proxy`, 001) |
| storage (M2) | `application/linked-file.gateway.ts`, `application/current-version-download.ts`, `file.service.ts`, `index.ts`, `storage.module.ts` | Fachada `LinkedFileGateway`; la firma de la versión vigente (clave, nombre, `DOWNLOAD_URL_TTL_SECONDS`) se extrae de `FileService` a `current-version-download.ts` y la usan los dos (DRY, RNF-06) |
| audit (T2) | `application/audit-action.ts` (enum `AuditAction`), `application/audit-catalog.ts` | `PUBLIC_LINK_CREATED` (`expiresInDays` ∈ 1\|7\|30, `protection` ∈ `password`\|`none`, listas cerradas), `PUBLIC_LINK_REVOKED` (`reason` ∈ `revoked`\|`replaced`), `PUBLIC_LINK_DOWNLOADED`, `PUBLIC_LINK_LOCKED`; recurso `file` |

10 filas. **Fachadas que consume `sharing` (tipos de retorno fijados):**
- `LinkedFileGateway.findOwnedFile(actor, fileId): Promise<LinkedFile | null>` con `LinkedFile = { id: string; name: string; sizeBytes: bigint }`
  (propio y vivo por `findOwnedLiveFile`; una carpeta, ajeno o en la papelera es `null`).
- `LinkedFileGateway.issueDownload(actor, fileId): Promise<DownloadUrl | null>` con `DownloadUrl = { url: string; expiresAt: Date }`
  (tipo que ya exporta `file.service.ts`; sin auditar ni límite: los pone `sharing`).
- `IShareeDirectory.activeDisplayName(userId): Promise<string | null>`: el nombre visible si es `CLIENT` activo y
  verificado (mismo filtro que `findClientByEmail`); `null` en otro caso (CA-11, suspensión).
- Tras D-2, `IPasswordHasher` (`hash(plain): Promise<PasswordHash>`, `verify(hash, plain): Promise<boolean>`) e
  `IAttemptLockout` (`check(key)`, `recordFailure(key, policy)`, `reserveAttempt(key, policy)`, `clear(key)`) **sin
  cambio de firma**, importados de `shared`; la 013 usa `reserveAttempt` y `clear`.

**Puertos nuevos:** `IPublicLinkRepository` (repositorio, Art. V.2 b) e `IPublicLinkResolver` (único acceso sin actor,
separado por ISP como `IExpiredUploadScanner`, §6 punto 6 de `architecture.md`; V.2 b). Ninguno entre módulos.
**Dependencias nuevas entre módulos:** ninguna (`sharing → storage`, `access`, `audit`, `shared` ya existen).

**Servicios (≤ 30 líneas y ≤ 3 parámetros por función; los pasos son métodos privados):**
- `createLink(actor, command)`: límite por propietario → `can` + `findOwnedFile` (404) → `assertWritable` (403) → hash
  de la contraseña fuera de la transacción → `replace` + `public_link.revoked` (`replaced`, si había) + `public_link.created`
  en la misma transacción (`recordInTransaction`) → devuelve `{ link, token }`; el controlador arma la URL con
  `WEB_PUBLIC_URL` + `/enlace#<token>` (la ruta web la fija 013b).
- `currentLink(actor, fileId)` → `PublicLinkSummary | null`; `revokeLink(actor, linkId)` (sin `WritableAccountPolicy`).
- `openLink({ token, ip })` y `downloadLink({ token, ip, password })` comparten un paso privado `resolveAvailable`:
  límite por IP → `isWellFormed` → `enlace_por_token(hash)` → `activeDisplayName` → `withActor(dueño)` +
  `findAvailable(enlace_id)` + `findOwnedFile(archivo_id)`, ids de la fila de la función; cualquier `null` es
  `PublicLinkUnavailableError`. `downloadLink` sigue con la contraseña (§5) → `issueDownload` →
  `public_link.downloaded` con `record` (mejor esfuerzo, como `FileService`). El actor de `public_link.downloaded` y
  `public_link.locked` es el derivado (`actor_id` = propietario, «en nombre de»; pasa por `evento_auditoria_alta` sin
  política nueva). Caen en el filtro «Yo» de «Mi actividad» (`actor_id = usuario_afectado_id`), como la purga programada
  con `trigger`; la 013b solo cambia el rótulo a «Alguien con el enlace» (ADR-0039 regla 5).

## 3. Datos
```sql
CREATE TABLE enlace_publico (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),                  -- DF-09: el token no es la PK
  archivo_id      uuid NOT NULL REFERENCES archivo(id) ON DELETE CASCADE,      -- solo archivos (DF-86)
  propietario_id  uuid NOT NULL REFERENCES usuario(id),
  token_hash      char(64) NOT NULL CHECK (token_hash ~ '^[0-9a-f]{64}$'),     -- SHA-256 hex (como token_cuenta)
  clave_hash      text,                                                        -- PHC Argon2id o NULL (DF-10)
  vence_en        timestamptz NOT NULL,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  revocado_en     timestamptz,
  CONSTRAINT ck_enlace_publico_vence CHECK (vence_en > creado_en)
);
CREATE UNIQUE INDEX uq_enlace_publico_token_hash ON enlace_publico (token_hash);
CREATE UNIQUE INDEX uq_enlace_publico_archivo_activo ON enlace_publico (archivo_id) WHERE revocado_en IS NULL; -- RN-3
CREATE TABLE intento_acceso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enlace_id uuid NOT NULL REFERENCES enlace_publico(id) ON DELETE CASCADE,
  propietario_id uuid NOT NULL REFERENCES usuario(id),
  red_origen cidr NOT NULL,                                                    -- /24 o /48 (S-3); nunca la IP
  ocurrido_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_intento_acceso_enlace ON intento_acceso (enlace_id, ocurrido_en);
-- ENABLE + FORCE RLS en las dos tablas
CREATE POLICY enlace_publico_propietario ON enlace_publico TO nimbo_app  -- ALL: CLIENT y propietario_id = nimbo_actor_id();
  -- WITH CHECK: además el archivo es del actor (como comparticion_propietario; «vivo» lo exige el INSERT … SELECT
  -- sobre ownedNodes, así revocar el enlace de un archivo en la papelera no choca con la política)
REVOKE UPDATE, DELETE, TRUNCATE ON enlace_publico FROM nimbo_app;  GRANT UPDATE (revocado_en) ON enlace_publico TO nimbo_app;
REVOKE SELECT, UPDATE, DELETE, TRUNCATE ON intento_acceso FROM nimbo_app;
CREATE POLICY intento_acceso_alta ON intento_acceso FOR INSERT TO nimbo_app  -- CLIENT, propietario_id = actor y el enlace es suyo
CREATE POLICY enlace_publico_por_token ON enlace_publico FOR SELECT TO CURRENT_USER USING (revocado_en IS NULL AND vence_en > now());
CREATE FUNCTION enlace_por_token(p_token_hash char(64))   -- char(64) como la columna: el índice único sirve la búsqueda
  RETURNS TABLE (enlace_id uuid, archivo_id uuid, propietario_id uuid)  -- solo ids (ADR-0021, ADR-0039)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$ ... $$;  -- 0 o 1 fila
  -- FROM public.enlace_publico WHERE token_hash = p_token_hash AND revocado_en IS NULL AND vence_en > now()
  -- (el filtro completo va en la función; la política enlace_publico_por_token es la segunda barrera)
REVOKE ALL ON FUNCTION enlace_por_token(char) FROM PUBLIC;  GRANT EXECUTE ON FUNCTION enlace_por_token(char) TO nimbo_app;
```
- `intento_acceso` es solo adición para `nimbo_app` (su lector es PD-145); de `enlace_publico` la API solo cambia
  `revocado_en` y nunca borra; los `REVOKE`/`GRANT` se suman a la matriz de `database-roles.iso-spec.ts` (`shared/README.md`). Roles internos sin políticas
  en las dos tablas. La función no lee `archivo` ni `usuario`: papelera y suspensión las
  resuelven la fachada de `storage` y `IShareeDirectory` (sin excepción nueva a «cada módulo es dueño de sus tablas»).
- Revocar marca `revocado_en` (no borra: los intentos conservan su enlace); la purga del archivo borra en cascada.
- `down`: función, políticas, índices y tablas en orden inverso; prueba `up → down → up` con dueño `NOSUPERUSER`.

## 4. Contratos
| Método | Ruta | Rol | Request → Respuesta | Errores (`code`) |
|---|---|---|---|---|
| POST | `/api/v1/public-links` | CLIENT | `{ fileId, expiresInDays?, password? }` → `201 { link: PublicLinkSummary, url }` | `422` `SHARING_INVALID_REQUEST` (`fields`); `404` `STORAGE_NODE_NOT_FOUND`; `403` `STORAGE_ACCOUNT_READ_ONLY`; `429` `SHARED_TOO_MANY_REQUESTS` |
| GET | `/api/v1/public-links?fileId` | CLIENT | → `200 { link: PublicLinkSummary \| null }` | `404` `STORAGE_NODE_NOT_FOUND`; `422` `SHARING_INVALID_REQUEST` (consulta inválida) |
| DELETE | `/api/v1/public-links/:linkId` | CLIENT | → `204` | `404` `SHARING_LINK_NOT_FOUND` (ajeno, inexistente, ya revocado o no UUID) |
| POST | `/api/v1/public-links/open` | público | `{ token }` → `200 PublicLinkDetails` | `404` `SHARING_LINK_UNAVAILABLE`; `429` `SHARED_TOO_MANY_REQUESTS` |
| POST | `/api/v1/public-links/download` | público | `{ token, password? }` → `200 { url, expiresAt }` | `404` `SHARING_LINK_UNAVAILABLE`; `403` `SHARING_LINK_PASSWORD_INVALID`; `429` `SHARED_TOO_MANY_REQUESTS` (`Retry-After`) |

`PublicLinkSummary` = `{ id, fileId, expiresAt, hasPassword, status: 'active' | 'expired', createdAt }` (nunca token ni URL).
`PublicLinkDetails` = `{ name, sizeBytes, sharedBy: { displayName }, expiresAt, requiresPassword }`.
Rutas del propietario: otros roles `403` `SHARED_FORBIDDEN`, sin token `401`. Públicas: un cuerpo inválido o un token mal
formado es el mismo `404` (CA-11), no un `422`. `403` y no `401` para la contraseña: `401` es «sin sesión» en toda la API.
Sin eventos de dominio ni Socket.IO (YAGNI).

## 5. Seguridad y operación
- **Propietario:** `actor` primero; `withActor` + `requireActorScope`; `can(CREATE_PUBLIC_LINK)` y `ownedNodes` en la
  consulta; RLS de segunda barrera. Límite `sharing:link:<propietario>` con `SHARING_RATE_LIMIT_PER_MINUTE` (S-8).
- **Visitante** (excepción a «todo servicio recibe `actor`», `architecture.md` §6 punto 11 nuevo, ADR-0039): el actor
  derivado del dueño solo existe dentro de `PublicLinkAccessService`, se crea después de `activeDisplayName` y solo
  se usa con el enlace y el archivo que da la función (ADR-0039 regla 3).
- **Contraseña (CA-12, CA-13):** sin contraseña → `403` sin contar. Con contraseña: `IAttemptLockout.reserveAttempt`
  con clave `sharing:link-fail:<enlaceId>:<sha256(red)>` (no `allowed` → `429`), `verify`; acierto → `clear`; fallo →
  `intento_acceso` (`withActor` del dueño) y, si `engagedLock`, `public_link.locked` una sola vez.
- **Variables** (`env.schema.ts`, `.env.example`, `pnpm env:check`): `PUBLIC_LINK_MAX_FAILURES` (5),
  `PUBLIC_LINK_FAILURE_WINDOW_MINUTES` (15), `PUBLIC_LINK_LOCK_MINUTES` (15), `PUBLIC_LINK_RATE_LIMIT_PER_MINUTE` (30, por
  IP en las rutas públicas, clave `sharing:link-ip:<sha256(red)>`). `red` = `NetworkPrefix.forLimit(ip)` (IPv4 /32, IPv6
  /64: rotar dentro de un /64 no evade el bloqueo, RN-7); en Redis va con hash y caduca con la ventana.
- **Bitácoras:** `{ event: 'public_link.created' | 'revoked' | 'downloaded' | 'password_failed' | 'locked' | 'unavailable', linkId?, fileId? }`;
  nunca token, contraseña, IP, nombre de archivo ni correo (la IP solo en `http.request`, §1). **Auditoría:** CA-15 con
  `targetUserId` = propietario; los fallos sueltos no se auditan. **Métricas:** ninguna.
- `test/int/shared/route-declarations.int-spec.ts`: la lista cerrada de rutas públicas (003 CA-3) suma las dos de §4.

## 6. Estrategia de pruebas (por riesgo)
Cada tarea de lógica empieza por su prueba en rojo. Sin repetir un CA en tres capas.

| CA | Nivel | Archivo |
|---|---|---|
| CA-2, CA-4, CA-7 (estado), S-4 | unit | `sharing/domain/public-link.spec.ts`, `link-token.spec.ts`, `network-prefix.spec.ts` |
| CA-11 (orden), CA-12, CA-13 | unit | `sharing/application/public-link-access.service.spec.ts` (`FixedClock`, dobles de puertos) |
| CA-1, 3 a 8, 15, 16 | int | `test/int/sharing/public-links.int-spec.ts` (feliz por ruta y un caso por CA de error: CA-3 carpeta y Editor, CA-5 solo lectura, CA-6 `429`, CA-16 rol interno `403` y sin token `401`; Postgres y Redis reales) |
| CA-9 a 14 | int | `test/int/sharing/public-link-access.int-spec.ts` (papelera y restauración, suspensión y reactivación, purga, solo lectura, bloqueo por IP con `X-Forwarded-For`) |
| CA-17, CA-11, CA-16 | iso | `test/isolation/public-links.iso-spec.ts` (HTTP: A/B/C/anónimo, token de A no da otro archivo, B no ve ni revoca, Editor no genera, internos sin filas) y casos SQL con dueño `NOSUPERUSER`: sin actor 0 filas, la función devuelve una fila con 3 columnas solo para su hash, no devuelve revocados ni vencidos, `PUBLIC` no la ejecuta, función y política son del dueño (`pg_proc`, `pg_policies`), la prueba falla al quitar `enlace_publico_por_token`, `intento_acceso` sin lectura y `enlace_publico` sin `DELETE` y con `UPDATE` solo de `revocado_en` (`database-roles.iso-spec.ts`) |
| D-2 | unit + int | las `.spec.ts` y las dos `int-spec` movidas, y las suites de `identity` sin cambiar aserciones, en verde |
| migración | int | `test/int/sharing/migrations.int-spec.ts` (`up → down → up`, dueño `NOSUPERUSER`) |

## 7. Riesgos y coherencia con el diseño
- **R-1 Camino sin actor** (alto): una función amplia o un `archivo_id` tomado de la petición abriría la base. Mitigación:
  función de 0 o 1 fila por hash con 3 ids, `REVOKE FROM PUBLIC`, enlace y archivo solo desde la fila, `security-auditor`.
- **R-2 Oráculo de disponibilidad:** un solo error y cuerpo para todos los motivos de CA-11 (inexistente, mal formado,
  revocado, reemplazado, vencido, en la papelera, propietario suspendido, purgado) y el cuerpo inválido de §4; prueba de
  igualdad de respuestas.
- **R-3 Fuerza bruta y CPU de Argon2:** límite por IP antes de resolver el token y bloqueo por enlace + IP antes de verificar.
  Memoria acotada: 19 MiB por verificación y como mucho 4 a la vez (hilos de libuv), ~76 MiB; cabe junto a ONLYOFFICE.
- **R-4 Tamaño:** D-2 toca muchos imports de `identity`. Si Adrián prefiere, T-01 sale antes como PR de refactor sin
  spec (Art. I.4); el objetivo sigue siendo un PR para la 013.

**Decisiones del `architect` (2026-10-30):**
- **D-1 Visitante sin actor → (a), ADR-0039 (Propuesto).** Función `SECURITY DEFINER` de identificadores + `withActor`
  del dueño: es el patrón de ADR-0021 que el equipo ya revisó y no toca `withActor`, `Role` ni las políticas de
  `archivo`, `version_archivo` o `evento_auditoria`. Descartadas: (b) GUC anónima (cambia `withActor` y tres tablas de
  contenido, SEC-5), (c) rol `VISITOR` (cambia la matriz de roles de toda la API), (d) tabla sin RLS (contra ADR-0005
  y CA-17). Cambio respecto de la propuesta: la función devuelve 3 ids, no `clave_hash` ni `vence_en`.
- **D-2 `IPasswordHasher` e `IAttemptLockout` → (a), mover a `shared`.** Son capacidades técnicas sin reglas de
  negocio ni tablas que aíslan Argon2 y Redis (Art. V.2 a); la regla de `shared` queda precisada en
  `architecture.md` §3 regla 8 (dos consumidores entre los que el DAG no admite arista; la 013 es su primer caso), sin tocar ADR-0010 (no hay
  arista nueva) y sin ADR propio. (b) haría de `identity` proveedor de criptografía con dos puertos y dos adaptadores
  que solo delegan (Art. V.2: abstracciones sin decisión propia) y obligaría a `sharing` a manejar el hash como texto,
  sin la redacción de `PasswordHash` en bitácoras (CA-15); el enlace no sería una cuarta copia (cabría en
  `ShareeDirectoryBindingModule`), pero eso no compensa lo anterior. (c) cierra un ciclo; (d) duplica la política de
  Argon2 de ADR-0017 (Art. VI.1: es conocimiento, no texto). Las claves y los valores de `LockoutPolicy` se quedan en cada consumidor.
- **Revisados sin cambios:** `LinkedFileGateway` (una fachada por consumidor, como `EditableFileGateway` e
  `IndexableFileGateway`; usa `findOwnedLiveFile`, no `findAccessibleById`, porque el dueño ve también lo que le
  compartieron); `current-version-download.ts` (la URL de 5 minutos a la versión vigente con descarga forzada es una
  regla de seguridad, RNF-06: DRY de conocimiento con dos usos, Art. VI.1); sin `AccessGrant` (DF-84);
  `enlace_publico` solo con `archivo_id` (DF-86: ADR-0011 rige donde un registro puede apuntar a archivo **o** carpeta;
  aquí la spec lo limita a archivos, así que no hay exclusividad que validar).

**Desviaciones de los diagramas** (`design-findings.md`):
- **DF-09** y **DF-10**: propuestos como «Aceptado (plan 013)» al aprobarse; RNF-08 debe decir «almacenadas con hash».
- **DF-84** (actualizado): `AccessGrant` abstracta **no se crea** (Art. V.2): `UserShare` y `PublicLink` no comparten
  comportamiento (niveles y cambio de nivel frente a vencimiento, contraseña y token) ni un consumidor los trata igual.
- **DF-86 nuevo**: `enlace_publico` sin `carpeta_id` (solo archivos; se aparta del E-R en esta tabla y no necesita el `CHECK` de ADR-0011),
  con `revocado_en`, `propietario_id` (RLS) y un índice único parcial; `intento_acceso` con `red_origen cidr`;
  `PublicLinkService` partido en `PublicLinkService` y `PublicLinkAccessService`; `IPublicLinkRepository`,
  `IPublicLinkResolver`, `LinkedFileGateway` (M2) e `IShareeDirectory.activeDisplayName`; `LinkToken` es la segunda copia
  de `OpaqueToken` de `identity` (Art. VI.2: se extrae a la tercera, PD-146).
- **Pendientes:** PD-145 nuevo (lector y retención de `intento_acceso`, candidato 022b); PD-146 nuevo (token opaco a
  `shared` a la tercera copia); al integrar se cierran PD-20 (por D-2), la parte de 013 de PD-78 (CA-11) y de PD-121 (CA-5).
- **ADR:** ADR-0039 (D-1), redactado por el `architect` (`Propuesto`; lo acepta Adrián al aprobar este plan). D-2 sin ADR.
- **Ya actualizados por el `architect`** (2026-10-30): `architecture.md` §3 (fila `shared` y regla 8), §5
  (`IPasswordHasher`, `IAttemptLockout`, repositorios de `sharing`), §6 puntos 2, 10 y 11 y §10; `design-model.md` M1,
  M2, M3b, T1 y §4. **En el PR** (asignados en `tasks.md`): READMEs de `shared` (regla 8) e `identity` (T-01);
  `design-model.md` T2 (las cuatro acciones) y README de `sharing` (T-09); redibujar M3b, M2, M1, T1 y el E-R al cerrar la fase (DF-86).

## 8. Aprobación
- `architect`: **Aprobado con cambios** (2026-10-30). Cambios ya aplicados en este plan: (1) `enlace_por_token(char(64))`
  devuelve solo `(enlace_id, archivo_id, propietario_id)` y la clave y el vencimiento se releen con RLS del dueño
  (`findAvailable`); (2) `WITH CHECK` del propietario solo exige la propiedad del archivo (revocar con el archivo en la
  papelera no falla); (3) `token_hash` con `CHECK` hexadecimal y `red_origen` `NOT NULL`; (4) `REVOKE` de `UPDATE`/`DELETE` en
  `enlace_publico` con `GRANT UPDATE (revocado_en)`, y de lectura y cambios en `intento_acceso`, en la matriz de `database-roles.iso-spec.ts`;
  (5) `replace` serializa por archivo con `pg_advisory_xact_lock`; (6) auditoría del visitante con el actor derivado
  («en nombre de»); (7) D-1 y D-2 decididas (§7), ADR-0039 redactado y documentos de diseño actualizados. Condición:
  ADR-0039 pasa a `Aceptado` con la aprobación de Adrián; si lo rechaza, este plan vuelve al `architect`.
- Dueños de módulo: cambios en `shared`, `identity`, `storage`, `audit` y `test/int/shared/route-declarations.int-spec.ts`
  (de Adrián), en los archivos de §2 — pendiente (spec P-4)
- Adrián: pendiente
