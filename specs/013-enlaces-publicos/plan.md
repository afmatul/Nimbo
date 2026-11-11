# Plan 013 — Enlaces públicos (API)

> Spec: `./spec.md` · Estado del plan: Aprobado (2026-10-31, Adrián, PR #87)
> Obligatorio y ≤ 250 líneas. Dice **qué** archivos se tocan y **qué** se espera de cada uno; no es el código en
> prosa (sin cuerpos de funciones ni pseudocódigo). Lo aprueba Adrián antes de escribir código.

## 1. Resumen técnico
- En `sharing` (M3b) nacen dos casos de uso, separados por SRP: `PublicLinkService` (propietario, con `actor`:
  `createLink`, `currentLink`, `revokeLink`) y `PublicLinkAccessService` (visitante, sin sesión: `openLink`,
  `downloadLink`). Dominio `PublicLink` y tabla `enlace_publico` (DF-09: `id uuid`, `token_hash` único). Sin tabla de
  intentos (DF-86): el bloqueo vive en Redis y lo «registrado» de RNF-08 es la bitácora `password_failed` y la
  auditoría `public_link.locked`. La autorización del propietario **no se duplica**: `PermissionResolver.can(actor,
  fileId, Action.CREATE_PUBLIC_LINK)` (ya existe en `access`), y un nivel que no alcanza es el 404 de lo inexistente.
- **Riesgo central (D-1, ADR-0039):** el visitante no tiene `Actor` y la base tiene RLS `FORCE`. El camino es explícito
  y mínimo: (1) la función `SECURITY DEFINER` `enlace_por_token(token_hash)` devuelve **solo** los tres ids de la fila
  no revocada y no vencida de ese hash (`enlace_id, archivo_id, propietario_id`), con la lista de ADR-0021 («solo
  identificadores»); (2) todo lo demás, incluida la relectura de `clave_hash` y `vence_en`, corre en
  `withActor(createActor(propietario_id, CLIENT))` con RLS normal. Enlace, archivo y propietario salen de esa fila; la
  petición pública solo trae `token` y `password` (M-4). Papelera, suspensión y vencimiento dan el mismo `null`.
- `storage` expone una fachada nueva, `LinkedFileGateway` (patrón `EditableFileGateway`), para leer el archivo propio
  y vivo y firmar su versión vigente sin auditar como descarga del dueño ni gastar su límite de `FileService`.
- Contraseña con Argon2id reutilizando `IPasswordHasher`; bloqueo por enlace + red reutilizando `IAttemptLockout`
  (002). Ambos viven hoy en `identity`, y `sharing → identity` sería un ciclo (ya existe `identity → sharing`, DF-84):
  **D-2** los mueve a `shared` sin cambio de comportamiento en un **PR previo** (§7, D-3). Sin `ISecretCipher` ni
  `AccessGrant`.
- El token viaja en el fragmento de la URL y del navegador a la API en el **cuerpo** (`POST`): nunca en la ruta, así
  `logger.options.ts` no cambia (ya quita la consulta y no registra cuerpos; `token` y `password` ya se redactan). Las
  líneas de negocio y la auditoría no llevan token, contraseña, IP, nombre de archivo ni correo (como 002 CA-18); la
  línea técnica `http.request` de `shared` conserva la IP como en todas las rutas y sirve para investigar abusos (RNF-08).

## 2. Módulos, archivos y diseño
| Módulo / capa | Archivo (nuevo o cambiado) | Responsabilidad |
|---|---|---|
| contracts | `packages/contracts/src/sharing.ts` | `createPublicLinkSchema` (`fileId`, `expiresInDays` ∈ 1\|7\|30 con 7 por omisión, `password` opcional de 8 a 128), `publicLinkQuerySchema`, `publicLinkSummarySchema`, `createdPublicLinkSchema` (`{ link, url }`), `publicLinkOpenSchema` (`{ token }`) y `publicLinkDownloadSchema` (`{ token, password? }`), ambos `.strict()`, `publicLinkDetailsSchema` (reusa `byteCount`) y reutiliza `downloadUrlSchema`; códigos `SHARING_LINK_NOT_FOUND`, `SHARING_LINK_UNAVAILABLE`, `SHARING_LINK_PASSWORD_INVALID`; constante `PUBLIC_LINK_EXPIRY_OPTIONS` (1, 7, 30) |
| contracts | `packages/contracts/src/audit/parameters.ts` (+ `schemas.spec.ts`) | `AUDIT_TRIGGERS` suma `'public_link'` (M-2); `audit-event-response.ts` ya lo devuelve por `isTrigger` |
| datos | `migrations/20261102100000-crear-enlace-publico.ts` | `enlace_publico`, índices, RLS, permisos y `enlace_por_token()` (§3), con `down` |
| shared (T1, D-2, **PR previo**) | `domain/password-hash.vo.ts`, `application/security/i-password-hasher.port.ts`, `infrastructure/security/argon2id.hasher.ts`, `application/rate-limit/i-attempt-lockout.port.ts`, `infrastructure/rate-limit/redis-attempt-lockout.ts` (movidos desde `identity` con sus `.spec.ts`; `password-hash.int-spec.ts` y `redis-attempt-lockout.int-spec.ts` pasan a `test/int/shared/`), `shared.module.ts`, `index.ts`, `README.md` | Mismo código y pruebas; `SharedModule` (global) provee `I_PASSWORD_HASHER` e `I_ATTEMPT_LOCKOUT`; el README copia la regla 8 de `architecture.md` §3. Sin dependencia nueva (`argon2`, ADR-0017) |
| shared (013) | `infrastructure/config/env.schema.ts`, `.env.example` | Variables `PUBLIC_LINK_*` (§5): el límite por red con T-06 y las del bloqueo con T-08 |
| identity (M1) | PR previo: `identity.module.ts`, los importadores de los cinco archivos movidos y `README.md`. 013: `infrastructure/adapters/sharee-directory.adapter.ts` | Solo cambian rutas de import y deja de proveer los dos tokens; el adaptador implementa `activeDisplayName` |
| sharing/domain | `public-link.ts`, `link-token.ts`, `limit-network.ts`, `errors/*.ts` | `PublicLink.create`/`rehydrate`/`toSnapshot`, `statusAt(now)` y `requiresPassword`; `LinkToken` (32 bytes `base64url`, `hashOf` SHA-256, `isWellFormed`); `limitNetworkOf(ip)`: función pura que da la red de los límites (IPv4 /32, IPv6 /64, RN-7), sin clase (un solo comportamiento sin estado, Art. V); `PublicLinkNotFoundError` (404), `PublicLinkUnavailableError` (404), `PublicLinkPasswordInvalidError` (403) |
| sharing/application | `public-link.service.ts`, `public-link-access.service.ts`, `public-link-records.ts`, `ports/i-public-link.repository.port.ts`, `ports/i-public-link-resolver.port.ts`, `ports/i-sharee-directory.port.ts`, `sharing-config.ts` | Casos de uso de §1; `public-link-records.ts` arma eventos y bitácoras de los dos (DRY, como `share-records.ts`); `IShareeDirectory` suma `activeDisplayName(userId)` |
| sharing/infra | `enlace-publico.orm-entity.ts`, `typeorm-public-link.repository.ts`, `sql-public-link-resolver.ts` | Repositorio con `requireActorScope`: `findCurrent`, `findAvailable(actor, linkId)` (no revocado ni vencido; da `clave_hash` y `vence_en` al visitante, ADR-0039), `replace` (serializa por archivo con `pg_advisory_xact_lock`, como `IAdminRosterRepository`; revoca el anterior e inserta con `INSERT … SELECT` sobre `ownedNodes`, devuelve el revocado o `null`; dos `POST` simultáneos nunca dan 500 por el índice único parcial), `revoke`. Resolver sin actor: solo llama `enlace_por_token()` |
| sharing/presentation | `public-links.controller.ts`, `public-link-access.controller.ts`, `sharing.module.ts` | Propietario `@Roles(Role.CLIENT)`; visitante `@Public()`, cuerpo validado con el esquema `.strict()` y la fábrica `PublicLinkUnavailableError` (§4); ambos con `no-store`; el visitante además `Referrer-Policy: no-referrer` y la IP de `req.ip` (`trust proxy`, 001) |
| storage (M2) | `application/linked-file.gateway.ts`, `application/current-version-download.ts`, `file.service.ts`, `index.ts`, `storage.module.ts` | Fachada `LinkedFileGateway`; la firma de la versión vigente (clave, nombre, `DOWNLOAD_URL_TTL_SECONDS`) se extrae de `FileService` a `current-version-download.ts` y la usan los dos (DRY, RNF-06) |
| audit (T2) | `application/audit-action.ts` (enum `AuditAction`), `application/audit-catalog.ts` | `PUBLIC_LINK_CREATED` (`expiresInDays` ∈ 1\|7\|30, `protection` ∈ `password`\|`none`), `PUBLIC_LINK_REVOKED` (`reason` ∈ `revoked`\|`replaced`), `PUBLIC_LINK_DOWNLOADED` y `PUBLIC_LINK_LOCKED` (`trigger: AUDIT_TRIGGERS`, siempre `public_link`); listas cerradas, recurso `file` |

**Fachadas que consume `sharing` (tipos de retorno fijados):**
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
separado por ISP como `IExpiredUploadScanner`, `architecture.md` §6 punto 6; V.2 b). Ninguno entre módulos.
**Dependencias nuevas entre módulos:** ninguna (`sharing → storage`, `access`, `audit`, `shared` ya existen).

**Servicios (≤ 30 líneas y ≤ 3 parámetros por función; los pasos son métodos privados):**
- `createLink(actor, command)`: límite por propietario → `can` + `findOwnedFile` (404) → `assertWritable` (403) → hash
  de la contraseña fuera de la transacción → `replace` + `public_link.revoked` (`replaced`, si había) + `public_link.created`
  en la misma transacción (`recordInTransaction`) → devuelve `{ link, token }`; el controlador arma la URL con
  `WEB_PUBLIC_URL` + `/enlace#<token>` (la ruta web la fija 013b).
- `currentLink(actor, fileId)` → `PublicLinkSummary | null`; `revokeLink(actor, linkId)` (sin `WritableAccountPolicy`).
- `openLink({ token, ip })` y `downloadLink({ token, ip, password })` (sin ningún id en la entrada) comparten un paso
  privado `resolveAvailable`: límite por IP → `isWellFormed` → `enlace_por_token(hash)` → `activeDisplayName` →
  `withActor(dueño)` + `findAvailable(enlace_id)` + `findOwnedFile(archivo_id)`, todo con los ids de la fila; cualquier
  `null` es `PublicLinkUnavailableError`. `downloadLink` sigue con la contraseña (§5) → `issueDownload` →
  `public_link.downloaded` con `record` (mejor esfuerzo, como `FileService`).
- `public_link.downloaded` y `public_link.locked` se insertan con el actor derivado (`actor_id` = propietario, «en
  nombre de»; pasan por `evento_auditoria_alta` sin política nueva) y con `trigger: 'public_link'`. Siguen en el filtro
  «Yo» de «Mi actividad», pero el `trigger` los distingue y la 013b los muestra como «Alguien con el enlace» (CA-18,
  ADR-0039 regla 5), como `node.purged` con `trigger: 'scheduled'`.

## 3. Datos
Migración `20261102100000-crear-enlace-publico` (solo `enlace_publico`; DF-86):
- **Columnas:** `id` uuid (PK; el token no es la clave, DF-09); `archivo_id` uuid no nulo, FK a `archivo` con
  `ON DELETE CASCADE` (solo archivos); `propietario_id` uuid no nulo, FK a `usuario` (para RLS); `token_hash` char(64)
  no nulo con el `CHECK` hexadecimal de `token_cuenta` (SHA-256 del token); `clave_hash` text nulo (PHC Argon2id, DF-10);
  `vence_en`, `creado_en` (por omisión `now()`) y `revocado_en` nulo, todos `timestamptz`.
- **Restricciones e índices:** `CHECK vence_en > creado_en`; único `token_hash`; único parcial `archivo_id` donde
  `revocado_en` es nulo (RN-3).
- **RLS** (`ENABLE` + `FORCE`): política del propietario para `nimbo_app` (`CLIENT` y `propietario_id` = actor; en
  `WITH CHECK` además el archivo es del actor, como `comparticion_propietario`; «vivo» lo exige el `INSERT … SELECT` sobre
  `ownedNodes`, así revocar con el archivo en la papelera no choca). Política de la función, `enlace_publico_por_token`,
  solo `SELECT`, del dueño de las tablas (`TO CURRENT_USER`), para filas no revocadas y no vencidas. Roles internos sin
  políticas.
- **Permisos:** `nimbo_app` sin `UPDATE`, `DELETE` ni `TRUNCATE` en la tabla y con `UPDATE` solo de la columna
  `revocado_en`; las filas se suman a la matriz de `database-roles.iso-spec.ts` (`shared/README.md`).
- **Función** `enlace_por_token(p_token_hash char(64))`: `sql`, `STABLE`, `SECURITY DEFINER`, `search_path` cerrado
  (`pg_catalog, pg_temp`) y tabla con esquema. Devuelve 0 o 1 fila `(enlace_id, archivo_id, propietario_id)`, con el
  filtro completo en su cuerpo (hash igual, no revocado, `vence_en > now()`); la política es la segunda barrera. El
  parámetro es `char(64)` como la columna, para que el índice único sirva la búsqueda. `REVOKE` de `PUBLIC` y `EXECUTE`
  solo para `nimbo_app`. No lee `archivo` ni `usuario`: papelera y suspensión las resuelven `LinkedFileGateway` e
  `IShareeDirectory` (sin excepción nueva a «cada módulo es dueño de sus tablas»).
- Revocar marca `revocado_en` (no borra); la purga del archivo borra el enlace en cascada.
- `down`: función, políticas, índices y tabla en orden inverso; prueba `up → down → up` con dueño `NOSUPERUSER`.

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
Rutas del propietario: otros roles `403` `SHARED_FORBIDDEN`, sin token `401`. `403` y no `401` para la contraseña:
`401` es «sin sesión» en toda la API. Sin eventos de dominio ni Socket.IO (YAGNI).

**Cuerpos públicos (M-4, D-4):** solo `token` y `password`, con `.strict()`. Todo cuerpo que no cumple el esquema
(falta `token`, token mal formado, tipo erróneo o **un campo de más**, p. ej. `fileId` u `ownerId`) es el mismo `404`
`SHARING_LINK_UNAVAILABLE` con el mismo cuerpo que CA-11, no un `422`: la fábrica del `ZodValidationPipe` devuelve
`PublicLinkUnavailableError`. Así hay una sola regla para la ruta pública y ninguna respuesta enseña qué campos existen.

## 5. Seguridad y operación
- **Propietario:** `actor` primero; `withActor` + `requireActorScope`; `can(CREATE_PUBLIC_LINK)` y `ownedNodes` en la
  consulta; RLS de segunda barrera. Límite `sharing:link:<propietario>` con `SHARING_RATE_LIMIT_PER_MINUTE` (S-8).
- **Visitante** (excepción a «todo servicio recibe `actor`», constitución Art. IX.2, `architecture.md` §6 punto 11,
  ADR-0039): el actor derivado del dueño solo existe dentro de `PublicLinkAccessService`, se crea después de
  `activeDisplayName` y solo se usa con el enlace y el archivo que da la función (ADR-0039 regla 3).
- **Contraseña (CA-12, CA-13):** si el enlace la pide y no llega → `403` que no cuenta para el bloqueo ni se registra.
  Con contraseña: `IAttemptLockout.reserveAttempt` con clave `sharing:link-fail:<enlaceId>:<sha256(red)>` (no
  `allowed` → `429`), `verify`; acierto → `clear`; fallo → bitácora `password_failed` (`linkId`, sin IP) y, si
  `engagedLock`, `public_link.locked` una sola vez.
- **Variables** (`env.schema.ts`, `.env.example`, `pnpm env:check`): `PUBLIC_LINK_MAX_FAILURES` (5),
  `PUBLIC_LINK_FAILURE_WINDOW_MINUTES` (15), `PUBLIC_LINK_LOCK_MINUTES` (15), `PUBLIC_LINK_RATE_LIMIT_PER_MINUTE` (30, por
  red en las rutas públicas, clave `sharing:link-ip:<sha256(red)>`). `red` = `limitNetworkOf(ip)` (IPv4 /32, IPv6 /64:
  rotar dentro de un /64 no evade el bloqueo, RN-7); en Redis va con hash y caduca con la ventana. Ninguna tabla guarda
  la IP ni la red (S-3).
- **Bitácoras:** `{ event: 'public_link.created' | 'revoked' | 'downloaded' | 'password_failed' | 'locked' | 'unavailable', linkId?, fileId? }`;
  nunca token, contraseña, IP, nombre de archivo ni correo (la IP solo en `http.request`, §1). **Auditoría:** CA-15 y
  CA-18 con `targetUserId` = propietario; los fallos sueltos no se auditan. **Métricas:** ninguna.
- `test/int/shared/route-declarations.int-spec.ts`: la lista cerrada de rutas públicas (003 CA-3) suma las dos de §4.

## 6. Estrategia de pruebas (por riesgo)
Cada tarea de lógica empieza por su prueba en rojo. Sin repetir un CA en tres capas.

| CA | Nivel | Archivo |
|---|---|---|
| CA-2, CA-4, CA-7 (estado), S-4, RN-7 | unit | `sharing/domain/public-link.spec.ts`, `link-token.spec.ts`, `limit-network.spec.ts` (IPv4 /32, IPv6 /64, IPv4 mapeada en IPv6) |
| CA-11 (orden), CA-12, CA-13 | unit | `sharing/application/public-link-access.service.spec.ts` (`FixedClock`, dobles de puertos; sin contraseña no reserva intento) |
| CA-1, 3 a 8, 15, 16, 18 | int | `test/int/sharing/public-links.int-spec.ts` (feliz por ruta y un caso por CA de error: CA-3 carpeta y Editor, CA-5 solo lectura, CA-6 `429`, CA-16 rol interno `403` y sin token `401`; Postgres y Redis reales) |
| CA-9 a 14, 18 | int | `test/int/sharing/public-link-access.int-spec.ts` (papelera y restauración, suspensión y reactivación, purga, solo lectura, bloqueo por red con `X-Forwarded-For`: dos IPv6 del mismo /64 lo comparten y otra red no; `trigger: public_link` en «Mi actividad») |
| CA-17, CA-11, CA-16 | iso | `test/isolation/public-links.iso-spec.ts`: HTTP A/B/C/anónimo, el token de A no da otro archivo, B no ve ni revoca, Editor no genera, internos sin filas; **ids en el cuerpo** (A con dos archivos, enlace del primero: un cuerpo con `fileId`/`ownerId` del segundo da el `404` de CA-11 y nunca lo sirve; con solo el token se sirve el primero); SQL con dueño `NOSUPERUSER`: sin actor 0 filas, la función da una fila de 3 columnas solo para su hash y ninguna para revocados o vencidos, `PUBLIC` no la ejecuta, función y política son del dueño (`pg_proc`, `pg_policies`), falla al quitar `enlace_publico_por_token`; `database-roles.iso-spec.ts`: sin `DELETE` y `UPDATE` solo de `revocado_en` |
| D-2 (PR previo) | unit + int | las `.spec.ts` y las dos `int-spec` movidas, y las suites de `identity` sin cambiar aserciones, en verde |
| migración | int | `test/int/sharing/migrations.int-spec.ts` (`up → down → up`, dueño `NOSUPERUSER`) |

## 7. Riesgos y coherencia con el diseño
- **R-1 Camino sin actor** (alto): una función amplia o un id tomado de la petición abriría la base. Mitigación: función
  de 0 o 1 fila por hash con 3 ids, `REVOKE FROM PUBLIC`, cuerpos públicos `.strict()` sin ids, enlace, archivo y
  propietario solo desde la fila, prueba de ids en el cuerpo, `security-auditor`.
- **R-2 Oráculo de disponibilidad:** un solo error y cuerpo para todos los motivos de CA-11 (inexistente, mal formado,
  revocado, reemplazado, vencido, en la papelera, propietario suspendido, purgado) y el cuerpo inválido de §4; prueba de
  igualdad de respuestas. **Oráculo de tiempo, aceptado:** inexistente, revocado, reemplazado y vencido siguen el mismo
  camino (la función no devuelve fila); papelera, suspensión y purga hacen algo más de trabajo, pero solo informan de un
  token que quien pregunta ya tiene (256 bits, no se adivina), y no hay nada que enumerar.
- **R-3 Fuerza bruta y CPU de Argon2:** límite por red antes de resolver el token y bloqueo por enlace + red antes de
  verificar. Memoria acotada: 19 MiB por verificación y como mucho 4 a la vez (hilos de libuv), ~76 MiB; cabe junto a ONLYOFFICE.

**Decisiones del `architect` (2026-10-30) y de la auditoría de Adrián en el PR #87 (2026-10-31):**
- **D-1 Visitante sin actor → (a), ADR-0039.** Función `SECURITY DEFINER` de identificadores + `withActor` del dueño:
  es el patrón de ADR-0021 y no toca `withActor`, `Role` ni las políticas de `archivo`, `version_archivo` o
  `evento_auditoria`. Descartadas: (b) GUC anónima (cambia `withActor` y tres tablas de contenido, SEC-5), (c) rol
  `VISITOR` (cambia la matriz de roles de toda la API), (d) tabla sin RLS (contra ADR-0005 y CA-17).
- **D-2 `IPasswordHasher` e `IAttemptLockout` → (a), mover a `shared`.** Capacidades técnicas sin reglas de negocio
  ni tablas que aíslan Argon2 y Redis (Art. V.2 a); `architecture.md` §3 regla 8 (dos consumidores entre los que el DAG
  no admite arista; la 013 es su primer caso), sin tocar ADR-0010 y sin ADR propio. (b) haría de `identity` proveedor de
  criptografía con dos puertos y dos adaptadores que solo delegan y obligaría a `sharing` a manejar el hash como texto,
  sin la redacción de `PasswordHash`; (c) cierra un ciclo; (d) duplica la política de Argon2 de ADR-0017 (Art. VI.1).
  Las claves y los valores de `LockoutPolicy` se quedan en cada consumidor.
- **D-3 División de PR (M-3, Fátima).** **PR-0** `refactor(shared): …` desde `main`, hecho por Fátima: solo T-01, sin
  cambio de comportamiento (Art. I.4, refactor sin spec). **PR de la 013**: T-02 a T-10, en `feat/013-enlaces-publicos`
  rebasada sobre `main` cuando PR-0 se integre.
- **D-4 Cuerpos públicos sin ids (M-4, Fátima).** `.strict()` y un campo de más da el `404` de CA-11 (§4): un `422`
  genérico no revelaría el estado del token (la validación corre antes de buscarlo), pero partiría la regla de «todo
  cuerpo inválido es el mismo `404`» y enseñaría la forma del cuerpo. Un cuerpo inválido no pasa por el límite por red
  (el `ZodValidationPipe` corre antes del servicio): no consulta la base ni Argon2, así que no hace falta.
- **D-5 Sin `intento_acceso` (m-2, Fátima).** RNF-08 («registrados») se cumple con `password_failed` y
  `public_link.locked`; el límite lo lleva Redis. Una tabla sin lector ni retención sería YAGNI.
- **D-6 `trigger: 'public_link'` (M-2, Fátima).** Reusa `AUDIT_TRIGGERS` y `isTrigger` en lugar de un campo nuevo.
- **Revisados sin cambios:** `LinkedFileGateway` (una fachada por consumidor; usa `findOwnedLiveFile`, no
  `findAccessibleById`, porque el dueño ve también lo que le compartieron); `current-version-download.ts` (la URL de 5
  minutos con descarga forzada es una regla de seguridad, RNF-06: DRY de conocimiento, Art. VI.1); sin `AccessGrant`
  (DF-84); `enlace_publico` solo con `archivo_id` (no necesita el `CHECK` de exclusividad de ADR-0011).

**Desviaciones de los diagramas** (`design-findings.md`):
- **DF-09** y **DF-10**: pasan a «Aceptado (plan 013)» al aprobarse; RNF-08 debe decir «almacenadas con hash».
- **DF-84** (actualizado): `AccessGrant` abstracta **no se crea** (Art. V.2).
- **DF-86**: `enlace_publico` sin `carpeta_id`, con `revocado_en`, `propietario_id` (RLS) y un índice único parcial;
  `intento_acceso` del E-R **no se crea**; `PublicLinkService` partido en dos; `IPublicLinkRepository`,
  `IPublicLinkResolver`, `LinkedFileGateway` (M2) e `IShareeDirectory.activeDisplayName`; `LinkToken` es la segunda copia
  de `OpaqueToken` de `identity` (Art. VI.2: se extrae a la tercera, PD-155).
- **Pendientes:** PD-155 nuevo; al integrar se cierran PD-20 (por PR-0), la parte de 013
  de PD-78 (CA-11) y de PD-121 (CA-5).
- **ADR:** ADR-0039 (D-1), se acepta con la aprobación del PR #87; con él se actualizan en el mismo PR la constitución
  Art. IX.2 y `CLAUDE.md`. D-2 sin ADR.
- **Ya actualizados:** `architecture.md` §3 (fila `shared` y regla 8), §5, §6 puntos 2, 10 y 11 y §10;
  `design-model.md` M1, M2, M3b, T1 y §4; constitución Art. IX.2; `CLAUDE.md`. **En el código** (asignados en
  `tasks.md`): READMEs de `shared` (regla 8) e `identity` (T-01); `design-model.md` T2 (las cuatro acciones) y README
  de `sharing` (T-09); redibujar M3b, M2, M1, T1 y el E-R al cerrar la fase (DF-86).

## 8. Aprobación
- `architect`: **Aprobado con cambios** (2026-10-30). Cambios aplicados: (1) `enlace_por_token(char(64))` devuelve solo
  `(enlace_id, archivo_id, propietario_id)` y la clave y el vencimiento se releen con RLS del dueño (`findAvailable`);
  (2) `WITH CHECK` del propietario solo exige la propiedad del archivo; (3) `token_hash` con `CHECK` hexadecimal;
  (4) `nimbo_app` sin `DELETE` y con `UPDATE` solo de `revocado_en`, en la matriz de `database-roles.iso-spec.ts`;
  (5) `replace` serializa por archivo con `pg_advisory_xact_lock`; (6) auditoría del visitante con el actor derivado y
  `trigger`; (7) D-1 a D-6 decididas (§7). Auditoría de Adrián en el PR #87 (2026-10-31): M-1 a M-4, m-1 a m-4 y m-6
  aplicados. ADR-0039 pasa a `Aceptado` con la aprobación del PR; si Adrián lo rechaza, el plan vuelve al `architect`.
- Dueños de módulo: cambios en `shared`, `identity`, `storage`, `audit`, `contracts/audit` y
  `test/int/shared/route-declarations.int-spec.ts` (de Adrián), en los archivos de §2 — autorizados por Adrián al dar inicio a la implementación (PR #87, 2026-10-31; spec P-4)
- Adrián: **Aprobado** (2026-10-31, PR #87), con la condición de que el actor derivado del dueño solo exista dentro de `PublicLinkAccessService` y que las acciones del visitante se sigan distinguiendo como tales (`trigger: 'public_link'`, CA-18). Implementación: T-01 como PR previo y luego T-02 a T-10.
