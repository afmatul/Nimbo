# Plan 005 — Carga y descarga de archivos

> Spec: `./spec.md` · Estado del plan: **Aprobado** (por el `architect` en la segunda pasada y confirmado por Adrián, 2026-09-28: ver §11; DF-51 resuelto con la opción A el 2026-09-28: `storage` declara `IPlanLimitsProvider` y `PlanLimits`; solo falta que 006a entregue la implementación, mientras tanto un doble de prueba)
> Alineado el 2026-09-28 con los planes aprobados de 001, 002 y 003 (ADR-0017 a ADR-0020) y con las decisiones del usuario de esa fecha. Con los 15 cambios de §11.4 aplicados (2026-09-28); segunda pasada del `architect` hecha (§11). ADR de apoyo: 0021 (enmienda ADR-0005), 0011, 0012 y la adenda de 0015 (`@aws-sdk/s3-request-presigner`); DF-59 y DF-60 (aceptados).

## 1. Resumen técnico

Los bytes **nunca pasan por la API** (DF-16): el navegador sube y baja directo de MinIO con URLs prefirmadas (SigV4) que
la API emite después de validar plan, cuota y nombre. El servidor decide el modo al iniciar: por debajo de un umbral de
configuración la carga es **simple** (un `PUT` prefirmado); por encima es **por partes** (multipart de S3, una URL por
parte, reanudable con `listParts`). La respuesta del inicio trae `mode`, y con eso el cliente sabe si una pausa
«se reiniciará al reanudar» (D-2). La cuota se reserva al iniciar como una fila `carga` activa; la decisión de cuota se
serializa con `SELECT … FOR UPDATE` sobre la fila del usuario, y el espacio solo se suma a `usuario.espacio_usado` en la
transacción que registra `archivo` + `version_archivo(origen=carga)` (RN-10, DF-38). Al completar, el servidor **lista
él mismo las partes** (no confía en ETags del cliente), completa el multipart, valida tamaño real y tipo real con un
`MagicBytesDetector` propio (sin dependencia) y, si algo falla, **elimina todas las versiones del objeto** (el bucket
tiene versionado) y deja la carga `rechazada`. El nombre repetido lo resuelve el **servidor**: sugiere «(n)» en el
inicio (409) y lo fija de forma definitiva, en la transacción de completar, serializado por el `FOR UPDATE` de la fila del
usuario (D-4). Todo servicio corre dentro de `ITransactionRunner.withActor(actor, …)` (003) y sus repositorios toman el
`EntityManager` de `TransactionContext.requireActorScope(actor)`, así que sin actor no hay filas. La limpieza de las
24 h es un trabajo repetible de BullMQ en el `worker`; como el `worker` usa `nimbo_app` sin actor, aplica la **opción B
de DF-52 (decidida)**: una función `SECURITY DEFINER` mínima que devuelve solo `(id, propietario_id)` de cargas **vencidas** (el llamador no puede adelantar el
reloj) y después `withActor(createActor(propietario, CLIENT), …)` por dueño (D-6, ADR-0021). La descarga (`POST /files/{id}/download-url`)
resuelve el archivo con `accessibleNodes(actor)` en la consulta y devuelve una URL de 300 s a un solo objeto, con
`Content-Disposition: attachment` firmado y emitida contra el **host público de MinIO**, distinto del de web y API.
Esta spec escribe además la rama de propiedad de `accessibleNodes` y las políticas RLS de `archivo`,
`version_archivo` y `carga`. `storage` **declara** `IPlanLimitsProvider`, `PlanLimits` e `I_PLAN_LIMITS_PROVIDER` en `storage/application/plan-limits.ts`
(DF-51, opción A, decidida por Fátima el 2026-09-28; `editing` lo reutiliza); `billing` (006a) lo implementa importándolo de
`storage/index.ts` y desaparece la arista `storage → billing` (§6, «Puertos declarados»).

## 2. Verificación contra la constitución

| Artículo | Cumple | Nota |
|---|---|---|
| I Spec manda | ☑ | Cada decisión cita el CA/RN que resuelve. Los ajustes técnicos que el plan pidió a la spec se aplicaron en su Registro de cambios (2026-09-28); lo que es de producto está en §10b. |
| III Pruebas primero | ☑ con reserva | Toda la lógica nace con prueba unitaria roja. Reserva operativa: **Docker no funciona hoy**; `test:int`, `test:isolation` y la demo del 30/09 necesitan Postgres, Redis y MinIO reales (§8, R-1). |
| IV SOLID | ☑ | `UploadService` (ciclo de la carga), `QuotaService` (¿cabe?), `FileService` (descarga y listado), `MagicBytesDetector` (solo detecta), `QuotaPolicy` y `FileName` en dominio. `IObjectStorage` se segrega por lo que `storage` necesita; el barrido sin actor vive en un puerto propio (`IExpiredUploadScanner`), no en el repositorio que usan los servicios con `actor`. |
| V YAGNI — abstracciones nuevas | ☑ | Puertos del diagrama: `IObjectStorage` (regla a), `IFileTypeDetector` (regla a: detector sustituible), `INodeRepository` (regla b), `IPlanLimitsProvider` (declarado por `storage`, DF-51 opción A), `IAuditLogger`, `IRateLimiter` (001), `IClock` (000). **Nuevos**: `IUploadSessionRepository` e `IQuotaRepository` (regla b) e `IExpiredUploadScanner` (regla b y seguridad: es el único acceso sin actor; solo lo inyecta `UploadCleanupProcessor`). Sin `pg_advisory_xact_lock`: el `FOR UPDATE` de la fila de `usuario` ya serializa. Sin `IIdGenerator`, `IMetrics`, `IEventBus` ni `IUploadQueue`. `FileVersionCreated` no se emite (sin consumidor hasta 019, D-16). `plan-limits.ts` (§6) **declara** el puerto `IPlanLimitsProvider` (regla a: `billing` es su implementación sustituible; regla b: dos consumidores, `storage` y `editing`). |
| VI DRY | ☑ | Límites solo vía `IPlanLimitsProvider`; «qué ve el actor» solo vía `accessibleNodes`; **`Actor` solo con `createActor`**; ninguna escritura de `app.actor_*` (solo `withActor`); políticas RLS con `nimbo_actor_id()`/`nimbo_actor_role()` de 003; validación con esquemas zod de `contracts` (ADR-0020) y errores de campo con `fields` de 001; catálogo `extensión → tipo/MIME` en un solo archivo de dominio; `formatBytes` en `contracts` para API y web. |
| VIII Fronteras | ☑ con una excepción decidida | `storage → shared, access, audit, realtime` (**sin `billing`**). **Excepción decidida (2026-09-28)**: `storage` escribe `usuario.espacio_usado` (tabla de `identity`) solo mediante `IQuotaRepository.addUsedBytes` (D-5, **DF-59**, aceptado); no es una arista. **DF-51 resuelto (opción A, Fátima, 2026-09-28)**: `storage` declara `IPlanLimitsProvider`/`PlanLimits`, `billing → storage` lo implementa y se elimina `storage → billing`; `boundaries.js` prohíbe que `storage` importe `billing` en cualquier archivo (§3b). |
| IX Seguridad | ☑ | Todo servicio recibe `actor` (`@CurrentActor()` de 003). Los archivos se consultan con `accessibleNodes(actor)`; las cargas (que no son nodos) con `propietario_id = actor.id` **y** RLS; en ambos casos sin filtrar después. Roles internos: `403 SHARED_FORBIDDEN` por `RolesGuard`, y sin filas por RLS. 404 idéntico para lo ajeno; UUID v4 no predecibles; clave de objeto opaca solo en `version_archivo`/`carga`; URL de 300 s a un objeto desde origen aislado; límite de tasa por `IRateLimiter`. |
| X Operabilidad | ☑ parcial | Bitácoras con `correlationId` (§7). Las métricas se declaran y se instrumentan con 022 (`prom-client` y `/metrics` no existen; decidido, §10b-R). |
| XI Integridad | ☑ | `complete` idempotente; `archivo` + `version_archivo` + `espacio_usado` en una transacción; una versión solo existe con el objeto íntegro; compare-and-set sobre `carga.estado` entre completar, cancelar y limpiar. |
| XII Degradación | ☑ | Ni indexación ni optimizador ni ONLYOFFICE participan. Si el `worker` cae, las cargas vencidas siguen reservando cuota hasta que el vencimiento se aplica de forma perezosa (la reserva **ignora** las vencidas, D-5). |

## 3. Coherencia con los diagramas

| Diagrama | Clases / tablas usadas | ¿Se aparta del diagrama? | Acción |
|---|---|---|---|
| Clases M2 (`design-model.md` §3) | `FileService`, `UploadService`, `QuotaService`, `IObjectStorage`, `IFileTypeDetector`, `INodeRepository`, `IPlanLimitsProvider`, `StorageNode`/`File`, `FileVersion`, `UploadSession` | **Sí** (registrado como **DF-60**, aceptado): (a) `FilesController.uploadPart` desaparece (DF-16) y `initUpload`/`completeUpload` pasan a un `UploadsController` (SRP); (b) `IObjectStorage` gana firmas de URL prefirmada, `listParts`, `getRange`, `headObject` y `purgeObject`; (c) tres puertos de repositorio nuevos (`IUploadSessionRepository`, `IQuotaRepository`, `IExpiredUploadScanner`); (d) `FileVersionCreated` no se emite (D-16) | `architect`: redibujar M2 (PD-46); `design-model.md` ya refleja lo anterior |
| Clases M3a | `accessibleNodes(actor)` → `AccessibleNodesFragment { sql, parameters }` (003) | no: solo se completa la **rama de propiedad** (003 §6.11, D-1) | ninguna |
| Clases T2 `audit` | `IAuditLogger` | **Sí** (DF-60): 004 llega después de 005, así que 005 **declara** el puerto en `audit`, el catálogo cerrado `AuditAction` y un adaptador provisional sobre Pino (D-11) | 004 sustituye el binding y amplía el catálogo; la firma (`AuditRecord`) la fijó el `architect` (§6, D-11) |
| Clases T1 `shared` | `Actor`, `createActor`, `DomainError` (+`fields` de 001), `TooManyRequestsError` (001), `IRateLimiter` (001), `IClock`, `ITransactionRunner.withActor` (003) | **Sí, aditivo** (DF-60): `ErrorResponse.details` opcional y estricto (D-12); campos nuevos en `REDACTED_FIELDS`; `MINIO_*` definido una vez y compuesto por ambos esquemas (`apiEnvSchema` y `workerEnvSchema`) | `design-model.md` T1 ya lo refleja |
| E-R | `archivo`, `version_archivo`, `carga`, `usuario.espacio_usado` | **Sí** (DF-60): solo las columnas que 005 usa (DF-33 parcial); `carga` guarda `archivo_id` y `version_id` reservados (sin FK, §4); sin `carpeta_id` (006), `checksum` ni `tipo_mime` (§4, cambio 15); **RLS también en `carga`** | redibujar E-R (PD-46) y DF-33 |
| Arquitectura §3/§5 | `storage → shared, access, audit, realtime` | **Sí**: DF-51 resuelto (opción A): se elimina `storage → billing` y `billing → storage` implementa el puerto; y **frontera de `usuario`** (D-5, DF-59, excepción decidida) | `architect` |
| Arquitectura §6 | RLS en `archivo` y `version_archivo`; worker sin `BYPASSRLS` | **Sí**: extiende a `carga` y fija la función `SECURITY DEFINER` (DF-52, opción B decidida) | **ADR-0021** (enmienda ADR-0005, Propuesto) |
| Arquitectura §7.1 | Pasos 1–5 | **Sí**: el paso 4 no emite evento (D-16) y lista las partes en servidor (D-8); el paso 2 devuelve todas las URLs de partes al iniciar y `resume` las renueva | actualizar §7.1 |
| Arquitectura §8 | Colas | **Sí**: cola nueva `upload-cleanup` (repetible, 3 reintentos, idempotente por CAS) | agregar fila |

Hallazgos `DF-xx`:

- **Cierra**: DF-16 (D-10), DF-38 (D-14; conciliación nocturna diferida a 007), DF-06 (bigint en todas las columnas de bytes), DF-33 parcial (`archivo`, `version_archivo`, `carga`), DF-32 (rama de propiedad), **DF-52** (opción B, D-6, ADR-0021, decidida el 2026-09-28) y PD-19 para `upload-cleanup`.
- **Registra (aceptados)**: **DF-59** (excepción `usuario.espacio_usado`, D-5) y **DF-60** (desvíos de 005 en M2, T1, T2 y E-R).
- **Resuelto**: **DF-51** (`IPlanLimitsProvider`), opción A elegida por Fátima el 2026-09-28: `storage` declara el puerto y `PlanLimits`; el `architect` lo cierra en `design-findings.md`.
- **Se siguen los E-R vigentes**: DF-40/**ADR-0011** (dos tablas `archivo`/`carpeta` con `CHECK`) y **ADR-0012** (DF-17/18; versiones por composición con `origen`), ambos Propuestos y alineados con esto (§10).
- **Depende de**: DF-01 (`actor` primero, ya aplicado en 003), DF-58 (resuelto: progreso local), DF-41 (token del botón: `primary`), PD-31 (`INodeMetadataReader` llega con 011).
- **No los toca**: DF-17 (restauración: 014), DF-15 resto, DF-18/19.

## 3b. Módulos afectados

| Módulo | Cambio | Capa(s) |
|---|---|---|
| `storage` (M2) | `UploadSession`, `File`, `FileVersion`, `FileName`, `FileKind` + catálogo, `QuotaPolicy`, errores; `UploadService`, `QuotaService`, `FileService`; puertos y repositorios (incl. `IExpiredUploadScanner`); `plan-limits.ts`; `MinioStorageAdapter`; `MagicBytesDetector`; `UploadCleanupProcessor` + registro del programa repetible; `UploadsController`, `FilesController`; `StorageModule` (api) y `StorageWorkerModule` (worker; `apps/worker` lo importa **solo** desde `storage/index.ts`) | domain, application, infrastructure, presentation |
| `access` (M3a) | Rama de propiedad de `accessibleNodes(actor)` para `CLIENT` (sustituye el conjunto vacío de 003); SQL de lectura sobre `archivo` sin importar `storage` (ADR-0010) | infrastructure |
| `audit` (T2) | 005 crea el módulo mínimo: `IAuditLogger` + `I_AUDIT_LOGGER` (puerto que 004 mantiene), catálogo cerrado `AuditAction`, `LogAuditLogger` (provisional, **no exportado** por `audit/index.ts`), `AuditModule`; 004 solo cambia el binding | application, infrastructure |
| `shared` (T1) | `ErrorResponse.details`; `REDACTED_FIELDS` (+`url`, `uploadUrl`, `claveObjeto`, `objectKey`, `uploadId`, `signature`, `suggestedName`, `name`, `nombre`, `fileName`); definición única de `MINIO_*` compuesta por `workerEnvSchema` y `apiEnvSchema` (+variables de carga); el filtro de errores no registra `details`. **Ya vienen de 001/003 y no se tocan**: `TooManyRequestsError`, `Retry-After`, `fields`, `ZodValidationPipe`, `IRateLimiter`, `ITransactionRunner`, guards | domain, presentation, infrastructure |
| Reglas de fronteras (`boundaries.js`, PD-24) | `storage` → `shared`, `access`, `audit`, `realtime` (**sin `billing`**, DF-51 opción A); `billing` → `storage` (importa el puerto de `storage/index.ts`); `access` → `shared`; `audit` → `shared`. *Fixtures* negativos `storage-imports-identity.ts` (la excepción de `espacio_usado` no es arista) y `storage-imports-billing.ts` (ningún archivo de `storage` importa `billing`). Si PD-24 no está integrado al implementar, las reglas entran en el mismo PR de 005 y se registra en `pendientes.md` | config de lint |
| `billing` (M4) | **No se toca en 005**: 006a implementa `IPlanLimitsProvider` importándolo de `storage/index.ts`; el enlace de `I_PLAN_LIMITS_PROVIDER` vive en la raíz de composición (`AppModule`) | — |
| `apps/worker` | `WorkerModule` importa `MinioConfigModule` y `StorageWorkerModule` | composición |
| `packages/contracts` | carpeta `storage/` (esquemas zod, códigos de error y `reason`, `format-bytes.ts`, parámetros); `error.ts` con `details` | contratos |
| `apps/web` | `features/storage/` (API vía `session/auth-fetch.ts` de 002, `UploadManager`, hooks, panel, explorador mínimo), `components/nimbo/upload-progress.tsx`, componentes shadcn `alert-dialog`, `checkbox` y `dropdown-menu` (los tres cubiertos por la adenda de ADR-0015: primitivas Radix), entradas `STORAGE_*` en `lib/error-catalog.ts` (001), `app/(app)/(cliente)/archivos/page.tsx` (sustituye el marcador de 003-PR-F) y el proveedor de cargas en `app/(app)/(cliente)/layout.tsx` | presentación |
| Infra | `compose.yml` (CORS de MinIO), `.env.example`, `pnpm env:check`, router `s3.` de Traefik en staging, retirar el router local `/s3` | config |

Dependencias nuevas entre módulos: **ninguna** respecto de `architecture.md` §3; por DF-51 (opción A) **se elimina** `storage → billing` y `billing → storage` (ya existente) implementa el puerto; la escritura de `usuario.espacio_usado` es una excepción a la propiedad de tablas, no una arista de importación (`storage` no importa `identity`).

Dependencias externas nuevas: `@aws-sdk/s3-request-presigner` (misma familia y versión exacta que `@aws-sdk/client-s3`, ya usado por 000; cubierta por la adenda de ADR-0015, sin ADR aparte). **`class-validator` y `class-transformer` no se agregan**: ADR-0020 los sustituye por zod y `ZodValidationPipe` (001).

## 4. Modelo de datos

Cuatro migraciones, una por cambio lógico, todas con `down`, escritas a mano (ADR-0002) en `apps/api/src/migrations/`. Numeración: **posterior** a las de 001 (`20260928100000/100100`), 003 (`20260928110000/110100`) y 002 (`20260929100000/100100`); si alguna cambia, se reajusta. Bytes siempre `bigint`; identificadores `uuid`; fechas de negocio escritas por la aplicación con `IClock`.

```sql
-- 20260930100000-agregar-espacio-usado-a-usuario.ts   (001 §4 la difiere a esta spec; DF-38)
ALTER TABLE usuario ADD COLUMN espacio_usado bigint NOT NULL DEFAULT 0;
ALTER TABLE usuario ADD CONSTRAINT ck_usuario_espacio_usado CHECK (espacio_usado >= 0);
-- down: DROP CONSTRAINT ck_usuario_espacio_usado; DROP COLUMN espacio_usado;

-- 20260930100100-crear-archivo-y-version-archivo.ts
CREATE TABLE archivo (
  id                uuid PRIMARY KEY,
  propietario_id    uuid NOT NULL REFERENCES usuario(id),
  nombre            varchar(255) NOT NULL,
  tipo              varchar(10)  NOT NULL CHECK (tipo IN ('docx','pdf','texto','xlsx','pptx','imagen','otro')),
  -- sin tipo_mime (cambio 15a): ningún consumidor de 005 lo lee (la descarga fuerza application/octet-stream y FileSummary solo
  -- expone `kind`); el catálogo de dominio conserva el MIME y 017 (vista previa) agrega la columna si lo necesita
  tamano_bytes      bigint NOT NULL CHECK (tamano_bytes > 0),        -- de la versión actual (denormalizado, DF-33)
  version_actual_id uuid NOT NULL,                                   -- FK diferida (ciclo con version_archivo)
  creado_en         timestamptz NOT NULL,
  actualizado_en    timestamptz NOT NULL,
  eliminado_en      timestamptz                                      -- papelera (006); CA-6 la excluye del nombre repetido
);
CREATE TABLE version_archivo (
  id            uuid PRIMARY KEY,
  archivo_id    uuid NOT NULL REFERENCES archivo(id) ON DELETE CASCADE,
  origen        varchar(12) NOT NULL CHECK (origen IN ('carga','edicion','restauracion','optimizacion')),
  clave_objeto  varchar(200) NOT NULL UNIQUE,                        -- 'u/<propietario>/<archivo>/<version>'; nunca sale de la API
  tamano_bytes  bigint NOT NULL CHECK (tamano_bytes > 0),
  creado_por    uuid NOT NULL REFERENCES usuario(id),
  creada_en     timestamptz NOT NULL
);
ALTER TABLE archivo ADD CONSTRAINT fk_archivo_version_actual
  FOREIGN KEY (version_actual_id) REFERENCES version_archivo(id) DEFERRABLE INITIALLY DEFERRED;
CREATE UNIQUE INDEX uq_archivo_propietario_nombre ON archivo (propietario_id, lower(nombre)) WHERE eliminado_en IS NULL;
CREATE INDEX idx_archivo_propietario_creado ON archivo (propietario_id, creado_en DESC, id DESC) WHERE eliminado_en IS NULL;
CREATE INDEX idx_version_archivo_archivo ON version_archivo (archivo_id, creada_en DESC);
-- down: DROP TABLE version_archivo CASCADE; DROP TABLE archivo;  (pierde solo datos de desarrollo; RNF-10 se prueba con BD vacía)

-- 20260930100200-crear-carga.ts
CREATE TABLE carga (
  id                 uuid PRIMARY KEY,
  propietario_id     uuid NOT NULL REFERENCES usuario(id),
  nombre             varchar(255) NOT NULL,                          -- pedido por el cliente; nunca en bitácoras
  conservar_ambos    boolean NOT NULL DEFAULT false,
  tamano_bytes       bigint NOT NULL CHECK (tamano_bytes > 0),       -- declarado = reserva de cuota (RN-13)
  modo               varchar(10) NOT NULL CHECK (modo IN ('simple','por_partes')),
  estado             varchar(10) NOT NULL DEFAULT 'activa'
                       CHECK (estado IN ('activa','completada','rechazada','cancelada','expirada')),
  motivo_rechazo     varchar(14) CHECK (motivo_rechazo IN ('tamano','tipo_invalido')),  -- el conjunto de motivos se exporta una sola vez desde contracts/storage
  archivo_id         uuid NOT NULL,                                  -- id reservado del futuro archivo (clave de objeto final desde el inicio); SIN FK a propósito
  version_id         uuid NOT NULL,                                  -- id reservado de la versión; SIN FK (ver «Detalles»)
  clave_objeto       varchar(200) NOT NULL,
  upload_id          varchar(200),                                   -- id del multipart de S3; nunca sale de la API
  partes_totales     integer CHECK (partes_totales > 0),
  tamano_parte_bytes bigint CHECK (tamano_parte_bytes > 0),
  expira_en          timestamptz NOT NULL,                           -- creada_en + 24 h (constante de dominio, RN-7)
  creada_en          timestamptz NOT NULL,
  actualizada_en     timestamptz NOT NULL,
  finalizada_en      timestamptz,
  CONSTRAINT ck_carga_partes  CHECK ((modo = 'por_partes') = (upload_id IS NOT NULL AND partes_totales IS NOT NULL AND tamano_parte_bytes IS NOT NULL)),
  CONSTRAINT ck_carga_rechazo CHECK ((estado = 'rechazada') = (motivo_rechazo IS NOT NULL))
);
CREATE INDEX idx_carga_propietario_activa ON carga (propietario_id) WHERE estado = 'activa';   -- suma de reservas
CREATE INDEX idx_carga_activa_expira      ON carga (expira_en)      WHERE estado = 'activa';   -- barrido de 24 h
-- down: DROP TABLE carga

-- 20260930100300-politicas-rls-archivo-version-carga.ts   (003 §6.11; ADR-0005; extiende a `carga`)
-- Usa nimbo_actor_id() y nimbo_actor_role() de 003 (migración 20260928110100); el rol interno nunca ve filas de version_archivo.
ALTER TABLE archivo ENABLE ROW LEVEL SECURITY;         ALTER TABLE archivo FORCE ROW LEVEL SECURITY;
ALTER TABLE version_archivo ENABLE ROW LEVEL SECURITY; ALTER TABLE version_archivo FORCE ROW LEVEL SECURITY;
ALTER TABLE carga ENABLE ROW LEVEL SECURITY;           ALTER TABLE carga FORCE ROW LEVEL SECURITY;

CREATE POLICY archivo_cliente ON archivo TO nimbo_app
  USING      (nimbo_actor_role() = 'CLIENT' AND propietario_id = nimbo_actor_id())
  WITH CHECK (nimbo_actor_role() = 'CLIENT' AND propietario_id = nimbo_actor_id());
CREATE POLICY archivo_metadatos_internos ON archivo FOR SELECT TO nimbo_app
  USING (nimbo_actor_role() IN ('ADMIN','SUPPORT'));       -- OPERATOR: ninguna fila; la restauración de Soporte (UPDATE) llega con 011
CREATE POLICY version_archivo_cliente ON version_archivo TO nimbo_app
  USING      (nimbo_actor_role() = 'CLIENT' AND EXISTS (SELECT 1 FROM archivo a WHERE a.id = version_archivo.archivo_id))
  WITH CHECK (nimbo_actor_role() = 'CLIENT' AND EXISTS (SELECT 1 FROM archivo a WHERE a.id = version_archivo.archivo_id));
                                                           -- sin política para roles internos: no reciben filas con clave_objeto
CREATE POLICY carga_cliente ON carga TO nimbo_app
  USING      (nimbo_actor_role() = 'CLIENT' AND propietario_id = nimbo_actor_id())
  WITH CHECK (nimbo_actor_role() = 'CLIENT' AND propietario_id = nimbo_actor_id());

-- DF-52, opción B (decidida; ADR-0021): FORCE también somete al dueño de la tabla, y `SECURITY DEFINER` ejecuta como el dueño,
-- así que la función necesita su propia política, atada al rol que migra (`CURRENT_USER` en el momento de crearla).
-- Un superusuario ignora RLS aunque haya FORCE: ahí la política es inerte (ver §8, storage-maintenance.iso-spec.ts).
CREATE POLICY carga_mantenimiento ON carga FOR SELECT TO CURRENT_USER USING (estado = 'activa');
CREATE FUNCTION carga_expiradas(p_ahora timestamptz, p_limite integer)
  RETURNS TABLE (id uuid, propietario_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS
  $$ SELECT c.id, c.propietario_id FROM public.carga c
     WHERE c.estado = 'activa' AND c.expira_en <= LEAST(p_ahora, now())      -- el llamador no puede mirar al futuro
     ORDER BY c.expira_en LIMIT LEAST(GREATEST(p_limite, 0), 1000) $$;       -- tope de filas
REVOKE ALL ON FUNCTION carga_expiradas(timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION carga_expiradas(timestamptz, integer) TO nimbo_app;
-- down: DROP FUNCTION carga_expiradas; DROP POLICY (todas, incluida carga_mantenimiento);
--       ALTER TABLE … NO FORCE ROW LEVEL SECURITY, DISABLE ROW LEVEL SECURITY (las tres tablas)
```

- **Permisos**: `nimbo_app` recibe `SELECT/INSERT/UPDATE/DELETE` sobre las tablas nuevas por los `ALTER DEFAULT PRIVILEGES` de 003 (DT-11), porque estas migraciones son posteriores a `20260928110000` y las corre el mismo rol dueño; `usuario` ya concede `UPDATE` a `nimbo_app` (003 revoca solo `DELETE`). `migrations.int-spec.ts` lo comprueba; no hace falta `GRANT` explícito.
- **Índices**: los de arriba; `uq_archivo_propietario_nombre` es la garantía de datos del nombre repetido (sin distinguir mayúsculas, sin papelera). Cada consulta de listado y de nombre se revisa con `EXPLAIN` (consecuencia de ADR-0005; 003 §4 deja estos índices a 005).
- **RLS**: como arriba. Alcance de lo que expone `carga_expiradas`: solo pares `(carga_id, propietario_id)` de cargas activas vencidas, sin nombre, clave ni `upload_id`; `nimbo_app` sin actor sigue viendo **0 filas** de `carga` por consulta directa (la política `carga_mantenimiento` es para el dueño, no para `nimbo_app`). Solo devuelve cargas **vencidas** y como máximo 1000 filas: `carga_expiradas(now() + interval '1 year', 1000)` no revela cargas aún vigentes. Una API comprometida podría enumerar UUID de usuarios con cargas vencidas no limpiadas; se acepta y está documentado en **ADR-0021** (§3 de su decisión).
- **Rol dueño**: todas las migraciones corren con el mismo rol en todos los ambientes (`DATABASE_MIGRATION_URL`, 003) porque `TO CURRENT_USER` se fija al crear la política; cambiarlo exige una migración nueva y así lo dice `docs/operations/ambientes.md` (tarea de documentación). Con un dueño **superusuario** (local y CI de 003) la política `carga_mantenimiento` es inerte: por eso `storage-maintenance.iso-spec.ts` corre con dueño `NOSUPERUSER` (§8).
- **Fixtures de aislamiento** (D-18): `.withFiles()` y `.withUploads()` insertan **como `nimbo_app` dentro de `withActor`**, no como dueño: con `FORCE` y un dueño sin superusuario, el `INSERT` del dueño sobre `archivo`, `version_archivo` y `carga` falla por no tener política.
- **Migración reversible**: cada `down` deshace exactamente su `up` en orden inverso; `pnpm --filter api migration:revert` ×4 y `run` ×4 sobre BD vacía son parte de `apps/api/test/int/storage/migrations.int-spec.ts`.
- **Detalles**: `lower(nombre)` depende de la colación (`pgvector/pgvector:pg17` usa `en_US.utf8`; se prueba con «Ñ»/«ñ»). `estado` y `modo` con `CHECK` (no enum de Postgres). No hay `carpeta_id` (RN-4, 006), `tipo_mime` (017) ni `checksum`/`estado_indexacion` (YAGNI: 014/019). `ck_carga_rechazo` se mantiene: `motivo_rechazo` solo existe en cargas `rechazada`. **`carga.archivo_id` y `carga.version_id` no tienen FK**: son ids reservados, y hasta completar no existe fila de `archivo` ni de `version_archivo` a la que apuntar (una FK exigiría crearlas antes y reintroduciría el ciclo con `archivo.version_actual_id`); la integridad la dan el `UNIQUE(clave_objeto)` de `version_archivo` y el CAS de `carga.estado`.

Formato de la clave de objeto: `u/{propietario_id}/{archivo_id}/{version_id}` (solo UUID; jamás el nombre). Se fija al iniciar, de modo que las partes se suben **directo a la clave final**.

## 5. Contratos

### HTTP

Prefijo `/api/v1`. Todas las rutas `@Roles(Role.CLIENT)` de 003 (CA-17: cualquier rol interno → `403 SHARED_FORBIDDEN`; sin token → `401 SHARED_UNAUTHENTICATED`, ambos de `RolesGuard`/`JwtAuthGuard`) y reciben el actor con `@CurrentActor()`. Cuerpo de error `{ code, message, correlationId, fields?, details? }`: `fields` (de 001) para el campo en falla; `details` (nuevo, aditivo) para cifras, `suggestedName` y `reason`. Validación con esquemas zod de `contracts/storage` y `new ZodValidationPipe(schema, storageValidationError)` (ADR-0020). Los `:id` que no son UUID responden lo mismo que uno inexistente (404 del propio recurso), no `422`, para que CA-16 no tenga oráculo. Tamaños en JSON: entero seguro (`number`); en dominio y BD, `bigint` (D-13).

| Método | Ruta | Rol | Request | Respuesta | Errores |
|---|---|---|---|---|---|
| POST | `/uploads` | CLIENT | `{ name: string, sizeBytes: int, onConflict?: 'ask' \| 'keep_both' }` estricto (por defecto `ask`) | `201` unión por `mode`: **simple** `{ uploadId, mode:'simple', name, expiresAt, upload:{ url, method:'PUT', expiresAt } }`; **partes** `{ uploadId, mode:'multipart', name, expiresAt, partSizeBytes, totalParts, parts:[{ partNumber, url }], urlsExpireAt }`. `name` es el nombre con el que se guardará **según lo visto al iniciar** (definitivo solo al completar, D-4) | `400 STORAGE_INVALID_UPLOAD_REQUEST` (`fields`; ver nota) · `409 STORAGE_NAME_CONFLICT` (`details.suggestedName`; solo con `onConflict='ask'`) · `422 STORAGE_FILE_TOO_LARGE` (`details.sizeBytes`, `maxBytes`) · `422 STORAGE_QUOTA_EXCEEDED` (`details.missingBytes`) · `422 STORAGE_EMPTY_FILE` · `429 STORAGE_TOO_MANY_REQUESTS` + `Retry-After` |
| POST | `/uploads/:uploadId/resume` | CLIENT | — | `200` `{ uploadId, mode, expiresAt, completedParts:[{ partNumber, sizeBytes }], pending: …mismo bloque de URLs que el inicio pero solo de partes faltantes (o la URL única si es simple) }` | `404 STORAGE_UPLOAD_NOT_FOUND` (ajena, inexistente, cancelada, completada o rechazada) · `410 STORAGE_UPLOAD_EXPIRED` |
| POST | `/uploads/:uploadId/complete` | CLIENT | — | `200` `{ file: FileSummary }` (idempotente: repetirlo tras completar devuelve el mismo archivo) | `404 STORAGE_UPLOAD_NOT_FOUND` · `409 STORAGE_UPLOAD_INCOMPLETE` (sigue reanudable) · `410 STORAGE_UPLOAD_EXPIRED` · `422 STORAGE_EMPTY_FILE` · `422 STORAGE_FILE_TOO_LARGE` · `422 STORAGE_UPLOAD_SIZE_MISMATCH` (CA-5) · `422 STORAGE_INVALID_FILE_TYPE` (`details.reason`: `signature` \| `executable` \| `text`; `details.extension`) |
| DELETE | `/uploads/:uploadId` | CLIENT | — | `204` (cancela: aborta partes u objeto, libera la reserva) | `404 STORAGE_UPLOAD_NOT_FOUND` (el cliente lo trata como éxito si ya la había cancelado) |
| GET | `/files?cursor&limit` | CLIENT | `limit` 1–100 (50; fuera de rango se ajusta) | `200` `{ items: FileSummary[], nextCursor: string \| null }`; raíz, sin papelera, `creado_en DESC, id DESC`, cursor opaco | `400 STORAGE_INVALID_QUERY` (cursor malformado, `fields`) |
| POST | `/files/:fileId/download-url` | CLIENT | — | `200` `{ url, expiresAt }` (300 s) | `404 STORAGE_NODE_NOT_FOUND` (ajeno o inexistente) · `429 STORAGE_TOO_MANY_REQUESTS` |

`FileSummary = { id, name, sizeBytes, kind: 'docx'|'pdf'|'texto'|'xlsx'|'pptx'|'imagen'|'otro', createdAt }`. «Pausar» **no** es una operación de servidor: es local del cliente y la reserva sigue viva hasta `expira_en`. El límite de tasa (CA-19) actúa **antes** de resolver el archivo, en `POST /uploads` y `POST /files/:id/download-url`.

**Nota sobre el `400` de `STORAGE_INVALID_UPLOAD_REQUEST` y `STORAGE_INVALID_QUERY`**: decisión de Adrián (2026-09-28): CA-7 usa `400` (la convención de 001 usa `422` para entrada inválida, pero el módulo `storage` mantiene **un único estado de validación**). Por eso `STORAGE_INVALID_UPLOAD_REQUEST` y `STORAGE_INVALID_QUERY` responden `400` con `fields`. `InvalidInputError` de `shared` (422) no se toca: `InvalidUploadRequestError` y `InvalidQueryError` extienden `DomainError` y declaran `status = 400` (`DomainError` deja `status` abstracto; no se crea una base nueva por esto). `STORAGE_EMPTY_FILE` sigue en `422`. `fields[].reason` sale de un conjunto cerrado en `contracts/storage/error-codes.ts`: `REQUIRED`, `INVALID_NAME`, `NAME_TOO_LONG`, `INVALID_SIZE`, `UNKNOWN_FIELD`, `INVALID_CURSOR`.

Errores de dominio (clases en `storage/domain/errors/`, con su `status`): `InvalidUploadRequestError` e `InvalidQueryError` (`DomainError`, `status = 400`); `EmptyFileError`, `FileTooLargeError`, `QuotaExceededError`, `UploadSizeMismatchError` (`InvalidInputError`, 422); `NameConflictError` (`ConflictError`, 409, con `suggestedName`); `UploadIncompleteError` (`ConflictError`, 409); `UploadNotFoundError`, `NodeNotFoundError` (`NotFoundError`, 404); `UploadExpiredError` (410, base propia); `InvalidFileTypeError` (`InvalidInputError`); `StorageTooManyRequestsError extends TooManyRequestsError` (001). Mensajes en español con acción correctiva; el servidor los arma con `formatBytes` y el catálogo de `web` (`lib/error-catalog.ts`) los reproduce con `details` (Art. VI.3). `STORAGE_UPLOAD_SIZE_MISMATCH` = «El archivo cambió durante la carga. Vuelve a subirlo.» (texto aprobado por Adrián, 2026-09-28; sin parámetros, idéntico en servidor y catálogo). `ErrorResponse.details` es un objeto plano `string | number | boolean` que `errorResponseSchema` valida de forma estricta; **el filtro de errores no registra `details`** (`suggestedName` es un nombre de archivo: CA-20).

### Eventos

| Evento | Productor | Consumidores | Payload |
|---|---|---|---|
| Cola BullMQ `upload-cleanup` (job repetible cada `UPLOAD_CLEANUP_INTERVAL_MINUTES`) | `UploadCleanupScheduler` (worker, al arrancar, `upsertJobScheduler`) | `UploadCleanupProcessor` (worker) | `{ correlationId }`. Idempotente por compare-and-set de `carga.estado`; 3 reintentos con espera exponencial (arquitectura §8) |
| `FileVersionCreated` / `FileUploaded` | — | — | **No se emiten en 005** (D-16): 019 los añade con `IIndexQueue` (DF-51) |
| Auditoría `IAuditLogger.record` | `UploadService`, `FileService` | `LogAuditLogger` (provisional) → `AuditService` (004) | `AuditRecord` (§6, D-11); acciones del catálogo cerrado `AuditAction`: `file.upload_completed`, `file.upload_rejected` (+`reason`), `file.download_url_issued`; `actor`, `targetUserId` (= actor), `resourceId` (UUID de `archivo` o `carga`), `attributes` (`sizeBytes`, `mode`); **sin** nombre, URL, clave ni firmas. `occurredAt` y `correlationId` los pone el adaptador. Mejor esfuerzo, después del commit |

### Tiempo real

Ninguno. El progreso se mide en el navegador (DF-58, RN-3).

### Configuración (`.env.example`, esquemas zod de `shared`, `pnpm env:check`)

| Variable | Proceso | Defecto | Notas |
|---|---|---|---|
| `MINIO_PUBLIC_ENDPOINT` | api | `http://localhost:9000` (local) · `https://s3.staging.nimbo.me` | Host contra el que se **firman** las URLs. Distinto de `MINIO_ENDPOINT` (interno) y del de web/API. No puede ser un prefijo de ruta (Traefik `stripprefix` invalidaría la firma; R-6) |
| `UPLOAD_PART_SIZE_BYTES` | api | `8388608` (8 MiB) | Mínimo 5 MiB (regla de S3) |
| `UPLOAD_MULTIPART_THRESHOLD_BYTES` | api | `16777216` (16 MiB) | ≥ `UPLOAD_PART_SIZE_BYTES` (refinamiento zod): toda carga por partes tiene ≥ 2 partes |
| `UPLOAD_URL_TTL_SECONDS` | api | `3600` | Vigencia de las URLs de carga (60–86400); `resume` las renueva |
| `RATE_LIMIT_UPLOAD_INIT_PER_MINUTE` | api | `300` | RN-16, D-3 |
| `RATE_LIMIT_DOWNLOAD_URL_PER_MINUTE` | api | `120` | RN-16, D-3 |
| `UPLOAD_CLEANUP_INTERVAL_MINUTES` / `UPLOAD_CLEANUP_BATCH_SIZE` | worker | `10` / `100` | El lote se acota además a 1000 por la función SQL |
| `UPLOAD_COMPLETE_TIMEOUT_SECONDS` | api | `900` | Tiempo máximo de `POST /uploads/:id/complete` (validar un `.txt`/`.md` de GB lee todo el objeto por la API, cambio 9). Traefik lo fija en el `respondingTimeouts` del entrypoint (`readTimeout`/`writeTimeout` ≥ 900 s; el `idleTimeout` no aplica a una petición en curso); a verificar en el spike y en 023. Salida documentada en R-9 |
| `MINIO_*` (5 variables actuales) | **api y worker** | — | **Decidido**: una sola definición compartida; `apiEnvSchema` y `workerEnvSchema` la componen (la regla de 001, «cada secreto en `apiEnvSchema` **o** `workerEnvSchema`», ya admite que esté en ambos). Caso nuevo en `env.schema.spec.ts`: «un secreto declarado en ambos esquemas pasa si las definiciones coinciden». El worker las necesita para abortar partes y borrar objetos; **`MINIO_PUBLIC_ENDPOINT` va solo en `apiEnvSchema`** (solo la API firma). Riesgo aceptado: la credencial raíz de MinIO queda en dos procesos (R-13) |
| CORS del contenedor `minio` (`MINIO_API_CORS_ALLOW_ORIGIN`) | compose | origen de la web | Sin comodín; no hace falta exponer `ETag` porque el servidor lista las partes |

Constantes de dominio (reglas, no configuración): vigencia de la carga 24 h (RN-7), URL de descarga **300 s** (RNF-06), nombre ≤ 255 caracteres, página de listado 50/100. Los parámetros compartidos con `web` (concurrencia 2 archivos × 4 partes, reintentos) van en `contracts/storage/parameters.ts` solo si `web` los necesita; si no, en `upload-config.ts` de `web`.

## 6. Diseño de componentes

### Casos de uso y servicios (`actor` primero)

- `UploadService`: `init(actor, request)`, `resume(actor, uploadId)`, `complete(actor, uploadId)`, `cancel(actor, uploadId)`, `expire(actor, uploadId)` (lo usan `resume`/`complete` al detectar vencimiento y el trabajo de limpieza). Cada método abre `ITransactionRunner.withActor(actor, …)` donde toca datos.
- `QuotaService`: `assertCanUpload(actor, declaredBytes, limits)` → lanza `FileTooLargeError` o `QuotaExceededError`. Se ejecuta **dentro** de la transacción de `init`, después de `IQuotaRepository.lockAndReadUsage(actor, now)`.
- `FileService`: `list(actor, page)`, `getDownloadUrl(actor, fileId)`. Si el registro de auditoría de `download-url` falla, se registra el error y **se entrega la URL** (mismo criterio que `complete`).
- Trabajo: `UploadCleanupProcessor` (`concurrency: 1`; `attempts: 3` con espera exponencial; fase 1: `IExpiredUploadScanner.listExpiredIds(ahora, lote)` → `carga_expiradas(ahora, lote)` con `ITransactionRunner.run` —la función no toca datos bajo RLS—; fase 2: por cada fila, `withActor(createActor(propietario_id, Role.CLIENT), () => uploadService.expire(actor, id))`; un error por fila se registra y no frena el lote; el trabajo falla al final si hubo errores, para activar los reintentos y la alerta «trabajo reintentado 3 veces»).

### Flujos (orden y transacciones)

**`init`**: limitar tasa (`IRateLimiter.consume('storage:upload-init:' + actor.id, [{ limit, windowSeconds: 60 }])`; si `allowed=false` ⇒ `StorageTooManyRequestsError(retryAfterSeconds)`) → validar forma (esquema zod) y `FileName` → `size == 0` ⇒ 422 → `IPlanLimitsProvider.limitsFor(actor)` **fuera** de la transacción → `withActor`: `IQuotaRepository.lockAndReadUsage` (`SELECT espacio_usado FROM usuario WHERE id=$1 FOR UPDATE` + suma de `carga` activas no vencidas con `IClock`) → `QuotaPolicy` (máximo por archivo primero, luego cuota; `faltan = usado + reservado + declarado − cuota`) → nombre repetido con `onConflict='ask'` ⇒ 409 con `suggestedName` → decidir modo por umbral → si es por partes, `IObjectStorage.createMultipart` → insertar `carga` (esa fila **es** la reserva) → firmar URLs (cómputo local). Si algo falla tras crear el multipart, se aborta en el `catch`. **`createMultipart` es una llamada de red dentro de la transacción con `FOR UPDATE` sobre `usuario`** (solo en cargas por partes): el cliente S3 **interno** fija `connectTimeout` de 2 s y `requestTimeout` de 10 s (constantes de `MinioStorageAdapter`), para que un MinIO lento no retenga la fila del usuario ni una conexión del pool más de ese tiempo.

**`complete`** (fuera de transacción hasta el final, con compare-and-set):
1. Cargar `carga` (RLS ⇒ ajena = inexistente = 404). `completada` ⇒ devolver el archivo (idempotencia). `expirada` o `expira_en ≤ ahora` ⇒ `expire` + 410. `cancelada`/`rechazada` ⇒ 404.
   Dos `complete` simultáneos (doble clic) siguen el mismo camino y son idempotentes (CAS y `UNIQUE(clave_objeto)`).
2. Por partes: `listParts` (paginado) ⇒ todas presentes con su tamaño (todas = `tamano_parte_bytes` salvo la última) o `409 INCOMPLETE`. **Recuperación**: si `listParts` responde `NoSuchUpload` (el proceso murió después de `completeMultipart` y antes del paso 5, o hubo un doble clic), `headObject(clave_objeto)`: si el objeto **existe** se continúa en los pasos 4 y 5; si no existe, `404 STORAGE_UPLOAD_NOT_FOUND` (carga no `activa`) o `409 STORAGE_UPLOAD_INCOMPLETE` (sigue `activa` sin objeto). La suma real se compara antes de completar: `> declarado` o `> máximo del plan` ⇒ `abortMultipart` + `rechazada(tamano)` (no existe objeto que borrar). Simple: `headObject` (ausente ⇒ 409); tamaño 0 ⇒ `rechazada(tamano)` + 422 `STORAGE_EMPTY_FILE`; `> declarado`/`> máximo` ⇒ `purgeObject` + `rechazada(tamano)`.
3. `completeMultipart(partes de listParts)`.
4. `IFileTypeDetector.detect(reader, extension)`. Falla ⇒ `purgeObject` + `rechazada(tipo_invalido)` + 422. Para `.txt`/`.md` **lee todo el objeto a través de la API** (streaming, 4 MiB por bloque): con 1–2 GB, `complete` dura minutos. Tiempo máximo de la petición: `UPLOAD_COMPLETE_TIMEOUT_SECONDS` (§5), aplicado en la API y en Traefik para esa ruta; el cliente no vence antes (su `fetch` de `complete` espera un margen mayor) y la fila del panel muestra «completando» sin error por tiempo de espera.
5. `withActor` en una transacción: `IQuotaRepository.lockUsage(actor)` (`SELECT espacio_usado … FOR UPDATE`; serializa por propietario, incluido el cálculo del «(n)») → `UPDATE carga SET estado='completada', finalizada_en=$now WHERE id=$1 AND estado='activa'` (**CAS primero**: 0 filas ⇒ perdió contra cancelar/expirar ⇒ se revierte todo y responde 410/404; el objeto lo limpia quien ganó) → nombre final (`FileName.firstFree`, D-4) → `INSERT archivo` → `INSERT version_archivo` → `espacio_usado += tamaño real`. Sin `pg_advisory_xact_lock`: el `FOR UPDATE` ya cubre lo mismo; el índice único parcial es la red de seguridad.
6. Tras el commit: `IAuditLogger.record` (un fallo se registra como error y no revierte la carga: el archivo ya es válido).

**`cancel`/`expire`**: **CAS primero, borrar después** (Art. XI). (1) CAS `activa → cancelada|expirada`: con eso la reserva se libera (la suma solo cuenta `activa`) y `complete` ya no puede ganar (su CAS del paso 5 falla y revierte). (2) Borrado: `abortMultipart` (tolera `NoSuchUpload`) o `purgeObject` (idempotente), hasta 3 intentos en la misma petición o trabajo. Si el CAS de `cancel` pierde porque la carga ya está `completada`, responde como carga inexistente (404). El residuo posible —el proceso muere entre ambos pasos, o un `PUT` tardío recrea el objeto— es un **objeto huérfano sin `archivo` ni `version_archivo`**: no es fuga ni pérdida de datos, no cuenta en la cuota y queda aceptado y documentado en R-7 (007 puede barrer objetos sin `version_archivo`). Por eso `complete` y `cancel` en paralelo nunca dejan un `archivo` sin objeto (prueba en §8).

### Políticas y objetos de dominio

`QuotaPolicy` (puro: `check(limits, usage, declaredBytes)`), `FileName` (VO: NFC, recorte, 1–255 caracteres, sin `/`, `\`, NUL ni caracteres de control, ni `.`/`..`; `extension()`; `firstFree(taken)` → «base (n).ext», primer `n ≥ 1` libre, comparación en minúsculas; función pura), `FileKind` + `FILE_KIND_CATALOG` (extensión → tipo y MIME; una tabla), `ObjectKey`, `UploadSession` (máquina de estados: `activa → completada | rechazada | cancelada | expirada`; `isExpired(now)`; el vencimiento a 24 h es constante de dominio). El dominio no importa `@nimbo/contracts` (ADR-0008): los límites llegan como argumentos.

### Puertos

- `IObjectStorage` (regla a): `createMultipart`, `presignUploadPart({ key, uploadId, partNumber, contentLength, expiresInSeconds })`, `presignUploadObject({ key, contentLength, expiresInSeconds })`, `listParts`, `completeMultipart`, `abortMultipart`, `headObject`, `getRange(key, start, endInclusive)`, `purgeObject(key)` (borra **todas** las versiones y marcas de borrado: el bucket tiene versionado, `infra/minio/init.sh`), `presignDownload({ key, fileName, expiresInSeconds })` (con `response-content-disposition: attachment; filename*=UTF-8''…`, `response-content-type: application/octet-stream`, `response-cache-control: no-store`). `MinioStorageAdapter` usa dos `S3Client`: uno **interno** para operaciones (con `connectTimeout` 2 s y `requestTimeout` 10 s) y otro solo para **firmar** con `MINIO_PUBLIC_ENDPOINT` (la firma incluye el host; firmar es cómputo local).
- `IFileTypeDetector` (diagrama): `detect(reader: ByteReader, extension): Promise<DetectionResult>`, con `ByteReader = { size: number, read(offset, length): Promise<Buffer> }`. Devuelve `{ ok: true, kind, mime }` o `{ ok: false, reason: 'signature' | 'executable' | 'text' }`. `UploadService` lo alimenta con `getRange`.
- `INodeRepository` (diagrama; solo archivos por ahora): `findAccessibleById(actor, id)`, `listAccessible(actor, page)`, `findTakenNames(actor, candidates)`, `insertWithVersion(…)`. Toda consulta une el fragmento `accessibleNodes(actor)` (`qb.andWhere('archivo.id IN (SELECT nodo_id FROM (${f.sql}) accesibles)', f.parameters)`, parámetros `access_*`) y toma el `EntityManager` de `TransactionContext.requireActorScope(actor)`; no hay método sin actor.
- `IUploadSessionRepository` (nuevo, regla b): `insert`, `findOwned(actor, id)`, `transition(id, from, to, patch)` (CAS). Todos sus métodos toman el `EntityManager` de `requireActorScope`.
- `IExpiredUploadScanner` (nuevo, regla b y seguridad): `listExpiredIds(now, limit)` → `{ id, propietarioId }[]` (llama `carga_expiradas`). **Es el único acceso sin actor**; solo lo inyecta `UploadCleanupProcessor` y no se exporta desde `storage/index.ts`, de modo que ningún servicio con `actor` puede llamarlo.
- `IQuotaRepository` (nuevo, regla b): `lockUsage(actor)` (solo `SELECT espacio_usado … FOR UPDATE`; lo usa `complete`), `lockAndReadUsage(actor, now)` → `{ usedBytes, reservedBytes }` (`lockUsage` + suma de reservas; lo usa `init`), `addUsedBytes(actor, delta)`. **Único** punto de `storage` que toca `usuario`, y solo con `SELECT espacio_usado … FOR UPDATE` y `UPDATE usuario SET espacio_usado = espacio_usado + $1 WHERE id = $2` (excepción documentada, D-5). Una prueba (`quota.repository.int-spec.ts`) afirma que ninguna otra columna cambia.
- `IAuditLogger` (declarado por 005 en `audit`, D-11; firma `record(entry: AuditRecord): Promise<void>`) e `IRateLimiter`, `IClock`, `ITransactionRunner` (`shared`, 001/003). Contrato escrito en el puerto: «mejor esfuerzo, después del commit; el adaptador provisional no lanza», para que 004 no herede la semántica por accidente.

### Puertos declarados: `IPlanLimitsProvider` y `PlanLimits` (DF-51, opción A, resuelto 2026-09-28)

Fátima eligió la opción A. `storage/application/plan-limits.ts` **declara** `IPlanLimitsProvider` (`limitsFor(actor): Promise<PlanLimits>`), el tipo `PlanLimits` (aquí `maxFileBytes`, `storageQuotaBytes`; `editing` reutiliza el puerto; `PlanLimits` solo lleva límites de almacenamiento: si `editing` necesita otros límites, los pide por un puerto declarado por `billing` en lugar de ensanchar este tipo, ISP) y el token `I_PLAN_LIMITS_PROVIDER`; `storage/index.ts` los exporta. `QuotaService` los toma de ese archivo. `billing` (006a) implementa el puerto importándolo de `storage/index.ts` (arista `billing → storage`, ya existente) y se elimina `storage → billing`. El enlace del token vive en la **raíz de composición** (`AppModule`), no en `StorageModule`, para que `storage` no conozca a `billing`. `boundaries.js` prohíbe todo import de `billing` desde `storage` (§3b).

Único bloqueo restante: que 006a entregue la implementación (y el `plan` sembrado). Mientras tanto, `QuotaService` y sus pruebas usan un doble (`FakePlanLimitsProvider`, solo en `test/`; en código de producción **no** hay valores del catálogo, RN-1) y CA-3/CA-4 de integración se ejecutan con ese doble; su demostración con los valores reales del catálogo espera a 006a (R-3). La forma exacta de `PlanLimits` queda fijada aquí; 006a la respeta.

### `MagicBytesDetector` (implementación propia, sin dependencia)

Orden fijo: (1) **ejecutables primero, sea cual sea la extensión** (RN-15): `MZ` con `e_lfanew` (offset 0x3C) apuntando a `PE\0\0` dentro del archivo; `\x7FELF`; Mach-O `FEEDFACE/FEEDFACF/CEFAEDFE/CFFAEDFE` y universal `CAFEBABE` **solo si** el siguiente entero de 32 bits (big-endian) está entre 1 y 30, para no confundir clases Java → «No se permiten archivos ejecutables»; (2) por extensión del catálogo: `pdf` = `%PDF-` dentro de los primeros 1024 bytes; imágenes (`png`, `jpg`, `jpeg`, `gif`, `webp`) = su firma (PNG `89 50 4E 47 0D 0A 1A 0A`, JPEG `FF D8 FF`, GIF `GIF87a`/`GIF89a`, WebP `RIFF….WEBP`); `docx`/`xlsx`/`pptx` = ZIP (`PK\x03\x04`) con directorio central leído por rango (EOCD en los últimos 22–65 557 bytes, tope de 8 MiB para el directorio) que contenga `[Content_Types].xml` y `word/document.xml`, `xl/workbook.xml` o `ppt/presentation.xml` según el caso (no se descomprime nada); `txt`/`md` = UTF-8 estricto en streaming por bloques de 4 MiB con `TextDecoder({ fatal: true })`, BOM permitido, **sin bytes NUL** (D-9); (3) cualquier otra extensión = «otros»: sin firma. Un ZIP de ≥ 4 GiB o con Zip64 en el EOCD se rechaza como firma inválida (fuera del rango de los planes).

### Seguridad del diseño

Clave de objeto y `upload_id` jamás salen de la API ni entran a una bitácora; las URLs prefirmadas se devuelven solo en el cuerpo de la respuesta (el logger no registra cuerpos y `REDACTED_FIELDS` cubre los campos). `Content-Length` se **firma** en cada URL de carga (a verificar en el spike de §8; el tamaño real se valida igual al completar). Un objeto cargado nunca es alcanzable antes de completar: no hay `archivo` que lo referencie. Los roles internos no llegan (guard, RLS y `canReadContent=false`).

### Frontend (`apps/web`)

- Rutas: `app/(app)/(cliente)/archivos/page.tsx` («Mis archivos», raíz; `homePathFor(CLIENT)` de 003 apunta ahí). El proveedor cliente del panel de cargas vive en `app/(app)/(cliente)/layout.tsx` y mantiene las cargas entre navegaciones dentro de la pestaña; recargar las pierde (RN-7). Las llamadas al `api` usan `session/auth-fetch.ts` (002, agrega `Authorization: Bearer` y renueva ante `401`); los `PUT` a MinIO **no** llevan credenciales de la app.
- `features/storage/`: `api.ts` (contratos zod de `contracts/storage`), `upload/upload-manager.ts` (máquina de estados pura y probada con `XMLHttpRequest` y temporizadores falsos: `queued → starting → conflict? → uploading ↔ paused/offline → completing → done | rejected | cancelled | expired`), `upload/xhr-put.ts` (progreso por bytes, `abort`), `hooks/use-upload-manager.ts`, `components/` (`UploadPanel`, `NameConflictDialog`, `CancelUploadDialog`, `FileExplorer`, `UploadDropzone`, `FileRowMenu` —menú ⋮ por fila—, `ExplorerErrorState`).
- Comportamiento: 2 archivos y 4 partes simultáneas (constantes de `upload-config.ts`); reintento de parte con espera exponencial con jitter (5 intentos); al volver la red (`online`) o «Reanudar» llama `resume`; ante `403` de URL vencida vuelve a llamarlo; una **simple** pausada aborta el `PUT` y al reanudar empieza de cero, y su fila muestra «Se reiniciará al reanudar» porque `mode === 'simple'` (D-2). Velocidad = media móvil de 5 s. «Aplicar a los demás» es estado del cliente: reenvía `onConflict='keep_both'` o descarta. Un `429` deja la fila «en espera» con «Reintentar» siempre activo, sin cuenta regresiva.
- `components/nimbo/upload-progress.tsx` (nuevo); reutiliza `FileTypeChip`, `StateView`, `Button`, `Card`. shadcn a agregar: `alert-dialog`, `checkbox`, `dropdown-menu` (primitivas Radix, cubiertas por la adenda de ADR-0015 de la segunda pasada; ADR-0014 no nombra Radix). El aviso de error de descarga reutiliza el `Alert` existente. **Sin tokens nuevos**; sin colores a mano; foco inicial y textos según `mockups/storage/carga/README.md`.
- Catálogo de errores: entradas `STORAGE_*` en `lib/error-catalog.ts` (creado por 001-PR-4), con el texto de `STORAGE_UPLOAD_SIZE_MISMATCH` «El archivo cambió durante la carga. Vuelve a subirlo.».
- **Explorador de 005 (mínimo)**: lista de la raíz, «Subir archivos», arrastrar y soltar y «Descargar»; cuota y desglose son de 007. Estados (mockups en `docs/design/mockups/storage/explorador/`: `explorador--vacio`, `--cargando`, `--arrastre`, ya dibujados; `--acciones` y `--error` los agrega el `ui-designer` ahora, a integrar en §9 de la spec por Adrián):
  - **Menú ⋮ por fila** (`FileRowMenu`, `DropdownMenu` de shadcn/Radix, cubierto por la adenda de ADR-0015): «Descargar» es la **única** acción en 005 (renombrar, mover, compartir y eliminar llegan con 006 y posteriores; no se dibujan deshabilitadas). «Descargar» llama `POST /files/:id/download-url` y abre la URL devuelta (`window.location`/enlace sin `target` propio: la respuesta lleva `attachment`); si la URL tarda **más de 2 s**, el ítem «Descargar» queda **deshabilitado** con el texto «Preparando…» hasta que llegue la respuesta o falle. Si falla la emisión (`404 STORAGE_NODE_NOT_FOUND` o `429 STORAGE_TOO_MANY_REQUESTS`), se muestra un **`Alert` existente arriba de la lista** con el mensaje del catálogo de errores, sin quitar la fila; **no se usa toast** (queda como mejora futura, fuera de alcance; decisión de Adrián, 2026-09-28). Accesible por teclado (Enter/Espacio abren el menú; foco visible; `aria-label` «Acciones de {nombre}»).
  - **Estado de error del listado** (`ExplorerErrorState`, sobre `StateView`): si `GET /files` falla (red, `5xx`, `400 STORAGE_INVALID_QUERY`), se muestra la causa y la acción **«Reintentar»**, que repite la última petición (mismo cursor); **sin código de soporte visible** (no se muestra el `correlationId`); **«Subir archivos» sigue habilitado** en error; las cargas en curso del panel no se afectan. Cubierto por `file-explorer.spec.tsx` y jest-axe.
  - **Barra lateral**: en 005 **oculta «Carpetas» y el contador de la Papelera** hasta 006 (no se muestran entradas sin función).
  - **«Ver planes»**: no se muestra en el aviso de cuota hasta que exista la 008; sin constante `PLANS_PATH`. «Liberar espacio» lleva a Mis archivos hasta que exista 007.

## 7. Observabilidad

- **Bitácoras** (Pino, con `correlationId`; nunca nombre, URL, clave, `uploadId` de S3 ni firmas): `upload.initiated` (`uploadId` de la carga, `sizeBytes`, `mode`), `upload.resumed`, `upload.completed` (`fileId`, `sizeBytes`), `upload.rejected` (`reason`), `upload.cancelled`, `upload.expired`, `upload.rate_limited` (`operation`), `download.url_issued` (`fileId`), `upload.cleanup_run` (`scanned`, `expired`, `failed`), `upload.cleanup_failed` (por fila).
- **Métricas** (declaradas; se instrumentan con 022, decidido en §10b): `nimbo_storage_uploads_total{result}`, `nimbo_storage_upload_rejections_total{reason}`, `nimbo_storage_upload_bytes_total`, `nimbo_storage_download_urls_total`, `nimbo_storage_rate_limited_total{operation}`, `nimbo_storage_cleanup_duration_seconds`, `nimbo_storage_cleanup_failures_total`.
- **Alertas nuevas**: ninguna; el fallo repetido de `upload-cleanup` cae en «trabajo reintentado 3 veces». MinIO ya está en «caída de MinIO».

## 8. Estrategia de pruebas

> **Docker no funciona hoy.** Sin Docker no se pueden ejecutar `pnpm test:int`, `pnpm test:isolation` ni levantar Postgres, Redis y MinIO para la demo del 30/09. Estrategia: (1) toda la lógica nace con **pruebas unitarias sin Docker** (dominio, servicios con puertos falsos, detector con buffers en memoria, `UploadManager` con XHR falso, componentes con jest-axe) y `pnpm lint && pnpm typecheck` (que también compilan las suites `int`/`iso`); (2) las suites `int` e `iso` se escriben en el mismo PR y se **ejecutan en una máquina con Docker de otro integrante** o en el CI en cuanto exista (desde el 30/09, `workflow.md` §7.2); (3) `review.md` **no marca en verde** un CA de esos niveles hasta ver su ejecución real; (4) no se sustituye Postgres, Redis ni MinIO por mocks (Art. III.2). Convención: `it('CA-n: …')`. Playwright llega en la Fase 2 (PD-41): los «e2e» de 005 se cubren con pruebas de componentes con jest-axe y un guion de demo manual; no se crea `e2e/storage-upload.e2e.ts` ahora.

Rutas de `apps/api/test/int/storage/` (`*.int-spec.ts`) y `apps/api/test/isolation/storage.iso-spec.ts`, como en 001 y 003.

| Criterio | Sin Docker (unit / componente) | Requiere Docker (int / iso) |
|---|---|---|
| CA-1 carga simple | `storage/application/upload.service.spec.ts` | `uploads-simple.int-spec.ts` |
| CA-2 por partes íntegra | `upload-manager.spec.ts` (partes, reintentos) | `uploads-multipart.int-spec.ts` (MinIO real; SHA-256 de origen y destino) |
| CA-3 máximo por archivo | `storage/domain/quota-policy.spec.ts` | `uploads-limits.int-spec.ts` (con `FakePlanLimitsProvider` hasta que 006a entregue la implementación) |
| CA-4 cuota total (+ «Liberar espacio»; «Ver planes» oculto hasta 008) | `quota-policy.spec.ts`; componente del aviso (solo «Liberar espacio»; afirma que no hay «Ver planes») | `uploads-limits.int-spec.ts` |
| CA-5 tamaño real | `upload.service.spec.ts`; entrada del catálogo con el texto «El archivo cambió durante la carga. Vuelve a subirlo.» | `uploads-validation.int-spec.ts` (objeto ausente, sin `archivo`, sin `espacio_usado`) |
| CA-9/CA-22 carrera `complete` vs `cancel`/`expire` (Art. XI) | `upload.service.spec.ts` (CAS perdido revierte y no crea `archivo`) | `uploads-cancel.int-spec.ts` y `upload-cleanup.int-spec.ts`: `complete` y `cancel` (y `expire`) en paralelo con MinIO real; **nunca queda un `archivo` sin objeto**; a lo sumo un objeto huérfano sin `archivo` |
| Recuperación de `complete` (Art. XI) | `upload.service.spec.ts` (`NoSuchUpload` + `headObject` presente/ausente) | `uploads-multipart.int-spec.ts` (`completeMultipart` ya ejecutado, reintento y doble `complete` simultáneo: un solo archivo) |
| CA-6 nombre repetido | `storage/domain/file-name.vo.spec.ts` (mayúsculas, «Ñ», papelera); `name-conflict-dialog.spec.tsx` | `uploads-name-conflict.int-spec.ts` (409, `keep_both`, dos completados simultáneos, colación real) |
| CA-7 entrada inválida (`400`) / vacío (`422`) | `contracts/storage/schemas.spec.ts`, `file-name.vo.spec.ts`; `InvalidUploadRequestError`/`InvalidQueryError` con `status = 400` | `uploads-validation.int-spec.ts` (`400` con `fields`; `STORAGE_INVALID_QUERY` también `400`) |
| CA-8 reanudar | `features/storage/upload/upload-manager.spec.ts` (solo faltantes; simple desde cero; «Carga en espera») | `uploads-resume.int-spec.ts` |
| CA-9 24 h | `storage/domain/upload-session.spec.ts` (`FixedClock`) | `upload-cleanup.int-spec.ts` (job, `410`, worker sin actor) |
| CA-10 partes faltantes | — | `uploads-multipart.int-spec.ts` |
| CA-22 pausar/cancelar | `upload-manager.spec.ts` (0 % directo, >0 % confirma y pausa) | `uploads-cancel.int-spec.ts` |
| CA-11, CA-12, CA-24 tipo real | `storage/infrastructure/magic-bytes.detector.spec.ts` (matriz de firmas y ejecutables, incl. `CAFEBABE` de Java) | `uploads-file-type.int-spec.ts` (objeto purgado con bucket **versionado**) |
| CA-13 URL 300 s a un objeto | `file.service.spec.ts` (el servicio pide 300 s) | `minio-storage.adapter.int-spec.ts` (TTL de 2 s; URL de otra clave falla) |
| CA-14 origen aislado y descarga forzada | asserts de host y de atributos de cookies de 002 (host-only, `Path` restringido) | `download.int-spec.ts` (cabeceras reales; host ≠ host de web/API) |
| CA-15 descarga íntegra | — | `download.int-spec.ts` |
| CA-16 ajeno = inexistente; cierra 003 CA-10/11/14 | — | **`storage.iso-spec.ts`**: dos clientes casi idénticos, rol `nimbo_app`, `withActor`, `.withFiles(...)`; sin actor → 0 filas; quitar el `JOIN` y RLS sigue negando |
| CA-17 roles internos y sin token | — | `storage.iso-spec.ts` (todas las rutas, los 3 roles internos; 401 sin token) |
| CA-19 límite de tasa | `storage-rate-limit.spec.ts` (regla y clave con `IRateLimiter` falso) | `rate-limit.int-spec.ts` (Redis real, límites bajos, `Retry-After`) |
| CA-20 auditoría y bitácoras | `audit/infrastructure/log-audit-logger.spec.ts` (catálogo cerrado; el adaptador no lanza) | `audit-and-logs.int-spec.ts` (`LogSink`: ni nombre, ni URL, ni clave, ni firmas; ni `details` ni `suggestedName` de un `409` en la bitácora de errores) |
| CA-21 progreso, errores, menú ⋮ «Descargar», error del listado, 360/1440 px, axe | `upload-progress.spec.tsx`, `file-row-menu.spec.tsx` («Descargar» es la única acción; teclado; con la URL pendiente > 2 s (temporizadores falsos) el ítem queda deshabilitado con «Preparando…»; un `429`/`404` de emisión muestra el `Alert` sobre la lista y ningún toast), `file-explorer.spec.tsx` (error del listado con «Reintentar», sin `correlationId` visible y con «Subir archivos» habilitado; sin «Carpetas» ni contador de Papelera) + jest-axe (`a11y.spec.tsx`); revisión del `ui-designer` | — |
| CA-23 reserva concurrente | `quota-policy.spec.ts` | `uploads-quota-concurrency.int-spec.ts` (`Promise.all` de dos inicios con cuota para uno) |
| DF-52 mantenimiento sin actor (ADR-0021) | — | **`storage-maintenance.iso-spec.ts`**, con una base propia cuyo dueño es `NOSUPERUSER` (si un paso previo exige superusuario, p. ej. `CREATE EXTENSION`, lo hace un script de arranque de la suite): `nimbo_app` sin actor ve 0 filas de `carga`; `carga_expiradas` devuelve solo `(id, propietario_id)` de activas **vencidas**, ni nombre ni clave; `carga_expiradas(now() + interval '1 year', 1000)` **no** devuelve cargas vigentes; no expone `completada`; tope de 1000; solo `nimbo_app` la ejecuta (`PUBLIC` no). Afirma contra `pg_policies` y `pg_proc` que `carga_mantenimiento` es del dueño de `carga` y que la función tiene el mismo dueño. **Falla con mensaje explícito, no pasa en vacío, si el dueño es superusuario.** Es viable en el CI: el `globalSetup` de esa suite levanta su propio contenedor Postgres, y un script como superusuario crea el rol dueño `NOSUPERUSER`, la base a su nombre, `CREATE EXTENSION vector` y, si 003 lo necesita, `nimbo_app`; después migra con ese dueño. Si no está lista para el 30/09, la Definición de Hecho de 005 exige ejecutarla en staging con dueño no superusuario |
| Fragmento `accessibleNodes` contra el esquema real (cambio 13) | — | `access/infrastructure/sql/accessible-nodes.int-spec.ts`: ejecuta el fragmento contra las migraciones de 005, para que un cambio de columnas de `storage` rompa el CI |
| Fronteras (Art. VIII) | *fixtures* `storage-imports-identity.ts` y `storage-imports-billing.ts` (ningún import de `billing` desde `storage`) en `boundaries.js`; `apps/worker` importa `StorageWorkerModule` solo desde `storage/index.ts` | — |
| `MINIO_*` en dos esquemas | `env.schema.spec.ts`: un secreto declarado en ambos esquemas pasa si las definiciones coinciden; `MINIO_PUBLIC_ENDPOINT` solo en `apiEnvSchema` | — |
| Migraciones (RNF-10), permisos de `nimbo_app` e invariante `espacio_usado = Σ tamano_bytes` | — | `migrations.int-spec.ts`, `quota.repository.int-spec.ts` (ninguna otra columna de `usuario` cambia) |

**Spike** (≤ 1 día, `workflow.md` §4.5) en cuanto exista una máquina con Docker: ¿MinIO `RELEASE.2025-09-07` rechaza un `PUT` prefirmado con `Content-Length` distinto del firmado?, ¿honra `response-content-disposition`/`response-content-type` en el `GET` prefirmado?, ¿responde el `OPTIONS` de CORS con el origen configurado?, ¿limpia por sí solo los multipart obsoletos? El resultado se anota aquí; el código del spike se descarta. Si `Content-Length` no se puede firmar, la alternativa es *presigned POST* con `content-length-range`.

## 9. Riesgos y mitigaciones

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| R-1 **Docker no funciona**: `int`, `isolation`, la migración real y la demo no se ejecutan en esta máquina | Alta (hoy) | Alto: 005 toca aislamiento (bloqueante) y `Hecha` exige demostración en local (`workflow.md` §7.2) | §8: unit sin Docker + typecheck; ejecutar en la máquina con Docker de otro integrante o en el CI del 30/09; no marcar verde sin ejecución; el `security-auditor` no cierra sin `test:isolation` real. **La demo del 30/09 exige una máquina con Docker**: decisión del equipo |
| R-2 Comportamientos de MinIO no verificados (firma de `Content-Length`, `response-*`, CORS, versionado y borrado) | Media | Medio | Spike de §8 (necesita Docker); la validación de CA-5 y la limpieza siguen siendo la barrera |
| R-3 **Plazo y ruta crítica**: la 005 **completa** debe demostrarse el 30/09 (28/09 hoy) y depende de 001 PR-1 (`IRateLimiter`, `ITransactionRunner`, `TooManyRequestsError`, `ZodValidationPipe`, errores con `fields`), **003 PR-A/B/C** (guards, `createActor`, `withActor`, `requireActorScope`, `accessibleNodes`, rol `nimbo_app`), 002 PR-2 (tokens reales) y **006a** (implementación de `IPlanLimitsProvider`; el puerto ya lo declara `storage`, DF-51 resuelto), ninguna integrada hoy. Además, el dueño de 001, 002, 003 y 005 es la misma persona | Alta | Alto: sin 003 no hay `withActor` ni RLS; sin 006a no hay CA-3/CA-4 | Sin recortar alcance, orden por paquetes (`workflow.md` §4.8): **P0 sin dependencias, empieza ya**: `contracts/storage`, dominio (`FileName`, `QuotaPolicy`, `UploadSession`, catálogo), `MagicBytesDetector`, `UploadManager` y componentes de `web` (pueden tomarlos otros integrantes: decisión del equipo). **P1** tras 001 PR-1 + 003 PR-A/B/C: migraciones, repositorios, rama de propiedad, RLS, adaptador MinIO, `UploadService`/`FileService`, controladores, `audit` provisional. **P2** worker de limpieza. **P3** integración web tras 001 PR-4, 002 PR-5a y 003 PR-F. **Fátima entrega primero solo la implementación mínima de `IPlanLimitsProvider` de 006a** (y el `plan` sembrado); el puerto y `PlanLimits` ya los declara 005, y `QuotaService` avanza con el doble |
| R-4 Firmas de 001/002/003 cambian al implementar | Media | Bajo | Ya alineadas con los planes aprobados; los cambios se absorben en el PR afectado |
| R-5 Detección de firmas hecha a mano (OOXML, Mach-O/PE): falsos positivos o negativos | Media | Medio | Matriz con archivos reales generados en la propia suite (docx/xlsx/pptx mínimos, imágenes, ejecutables y `CAFEBABE` de Java); lecturas por rango sin descomprimir |
| R-6 Origen aislado (CA-14) | Baja | Medio | Las cookies de 002 son host-only (sin `Domain`) y con `Path=/api/v1/auth…`, así que ni en local (`localhost:9000` comparte jar por host, no por puerto) llegan a las rutas de MinIO; el access token va en memoria, no en cookie. Se prueba con el host de la URL y con los atributos de las cookies de 002. No usar la ruta `/s3` del override local (el `stripprefix` rompe la firma) |
| R-7 Objetos huérfanos: el proceso muere entre el CAS y el borrado de `cancel`/`expire`, o un `PUT` tardío recrea el objeto tras cancelar | Baja | Bajo: sin `archivo` que lo referencie, no es fuga ni pérdida y no cuenta en la cuota | **CAS primero, borrar después** (§6) con 3 intentos; se acepta y documenta el residuo; barrido de 24 h; MinIO limpia multipart obsoletos como respaldo (spike); 007 puede barrer objetos sin `version_archivo` |
| R-8 Bloqueo por fila de `usuario` serializa cargas concurrentes del mismo usuario; en cargas por partes `createMultipart` es una **llamada de red dentro** de la transacción con `FOR UPDATE` (no cómputo local) | Baja | Bajo | Firmar y `limitsFor` (fuera de la transacción) son locales; `connectTimeout` 2 s y `requestTimeout` 10 s en el cliente S3 interno acotan la retención de la fila y de la conexión del pool; solo aplica a cargas ≥ umbral; k6 en 023 |
| R-9 Validar `.txt`/`.md` grandes lee todo el objeto **a través de la API** en `complete`: con 1 GB o 2 GB dura **minutos** | Media (Equipo 1 GB, Institucional 2 GB) | Medio (latencia, conexión abierta) | Streaming con memoria constante (4 MiB); `UPLOAD_COMPLETE_TIMEOUT_SECONDS` = 900 en API y Traefik; el panel muestra «completando» sin vencer por tiempo de espera del cliente; medir en el spike y en 023; salida si es inaceptable: validar por muestra o mover la validación al `worker` (decisión de producto sobre RN-6) |
| R-10 DF-52 opción B: `SECURITY DEFINER` + `FORCE RLS` es fácil de configurar mal (la política del dueño se ata a `CURRENT_USER` de la migración; un dueño superusuario la vuelve inerte y la prueba pasaría en vacío) | Media | Alto | `storage-maintenance.iso-spec.ts` con dueño `NOSUPERUSER` y falla explícita si es superusuario; afirmaciones sobre `pg_policies`/`pg_proc`; función endurecida (`LEAST(p_ahora, now())`, tope 1000, `search_path = pg_catalog, pg_temp`, `REVOKE … FROM PUBLIC`); mismo rol migrador en todos los ambientes (`ambientes.md`); revisión del `security-auditor` (ADR-0021) |
| R-11 Excepción `usuario.espacio_usado` (DF-59): otro módulo podría copiar el patrón | Baja | Medio | Solo `IQuotaRepository`; prueba de columnas; *fixture* negativo `storage-imports-identity.ts`; documentada en `architecture.md`; otro módulo abre su propio DF y ADR |
| R-12 ONLYOFFICE, Gemini | n/a | — | No participan en 005 |
| R-13 Servidor de 8 GB; y la **credencial raíz de MinIO en dos procesos** (`api` y `worker`, D-6) | Baja | Bajo / Medio | La API nunca ve los bytes salvo en la validación (detector ≤ 8 MiB por lectura); credencial en dos procesos aceptada; una cuenta de servicio por proceso es endurecimiento de 022/staging |

## 10. Decisiones

**Decisiones técnicas de este plan** (las de producto o equipo están en §10b).

- **D-1 Umbral simple/por partes (RN-2)**: `UPLOAD_MULTIPART_THRESHOLD_BYTES = 16 MiB`, partes de 8 MiB (`UPLOAD_PART_SIZE_BYTES`). Por debajo de 2 partes el multipart no compensa; un archivo de 2 GiB son 256 partes (bajo el tope de 10 000 de S3). Se valida al arrancar: parte ≥ 5 MiB y umbral ≥ parte.
- **D-2 Cómo sabe el cliente si es simple**: lo decide y lo dice el servidor en `POST /uploads` (`mode`). «Se reiniciará al reanudar» sale de `mode === 'simple'` + estado pausado.
- **D-3 Límite de tasa (RN-16)**: por `actor.id`, ventana de 60 s, con `IRateLimiter.consume(clave, [{ limit, windowSeconds }])` de 001: **300** inicios/min y **120** URLs de descarga/min (configuración). Se aplican antes de resolver el recurso (sin oráculo). Se validan con k6 en 023.
- **D-4 Nombre repetido «(n)»**: lo calcula **el servidor**, en dos momentos. (a) En `init` con `onConflict='ask'`, un conflicto responde 409 con `details.suggestedName`; con `keep_both` continúa y devuelve el nombre previsto (informativo). (b) En `complete`, dentro de la transacción y serializado por el `FOR UPDATE` de la fila de `usuario` del propietario (`IQuotaRepository.lockUsage`; **sin** `pg_advisory_xact_lock`: dos mecanismos para lo mismo no dan garantía adicional), se calcula el **primer «(n)» libre** contra `archivo` sin papelera y sin distinguir mayúsculas; el índice único parcial es la red de seguridad. La segunda de dos cargas simultáneas se guarda con «(1)» sin preguntar. El cliente nunca calcula sufijos. Formato: «base (n).ext»; sin extensión: «base (n)».
- **D-5 Reserva de cuota y excepción sobre `usuario` (decidida 2026-09-28)**: la reserva es la **fila `carga` activa y no vencida**; no hay contador que se desincronice. La decisión se serializa con `FOR UPDATE` sobre la fila de `usuario`. `espacio_usado` (columna almacenada en `usuario`, siguiendo el E-R vigente y DF-38) solo cambia en la transacción de `complete`. **`storage` escribe solo esa columna** mediante `IQuotaRepository`; es una excepción documentada a «cada módulo es dueño de sus tablas», registrada como **DF-59** (aceptado) y en `architecture.md`. Se descartó la tabla propia `cuota_uso`.
- **D-6 Limpieza de 24 h (RN-7, CA-9) y DF-52 (decidida 2026-09-28)**: cola BullMQ `upload-cleanup` con `upsertJobScheduler` cada 10 min (sin `@nestjs/schedule`; una ejecución aunque haya varias instancias; reintentos; visible en el tablero del Operador). Opción **B** de DF-52: `carga_expiradas()` (`SECURITY DEFINER`, solo `(id, propietario_id)` de cargas **vencidas**, con tope) y luego `withActor(createActor(propietario, CLIENT))` por dueño, sin `BYPASSRLS` para `nimbo_app` (ADR-0005). RLS también en `carga`. Formalizada en **ADR-0021** (Propuesto; enmienda ADR-0005); prueba `storage-maintenance.iso-spec.ts` (§8). El barrido sin actor vive en `IExpiredUploadScanner`. El trabajo corre con `concurrency: 1`, `attempts: 3` y espera exponencial. El vencimiento se aplica también de forma perezosa en `resume` y `complete`; la reserva ignora las vencidas. El patrón queda fijado para la purga de 006.
- **D-7 Objeto en su clave final y borrado real**: las partes se suben a `u/{propietario}/{archivo}/{version}`. Como el bucket está versionado, `deleteObject` solo pondría una marca y **dejaría los bytes de un ejecutable rechazado**; `purgeObject` borra todas las versiones. 006 y 014 lo reutilizan.
- **D-8 `complete` no recibe ETags**: el servidor usa `listParts` como fuente de verdad (elimina la dependencia de exponer `ETag` por CORS y permite comprobar tamaños antes de completar).
- **D-9 Detección de firmas**: implementación propia (`MagicBytesDetector`), **sin dependencia nueva**. Se descarta `file-type` (ESM-only frente al build CJS de Nest, recorre el ZIP desde el inicio y no valida UTF-8). Decisiones técnicas del catálogo: «imagen» = `png`, `jpg`, `jpeg`, `gif`, `webp` (las demás extensiones, p. ej. `svg`, `bmp`, `heic`, son «otros» y se aceptan sin firma); `.txt`/`.md` con bytes NUL se tratan como no texto (un NUL indica binario). Ampliar formatos = una entrada del catálogo y una comprobación.
- **D-10 Cierre de DF-16**: URLs prefirmadas por parte y `listParts`; TTL de URLs de carga 1 h (`resume` las renueva); `POST /uploads` devuelve todas las URLs (CA-2). La URL de descarga vale **300 s** y lleva `attachment` firmado.
- **D-11 `IAuditLogger` provisional (decidida 2026-09-28: 004 llega después de 005)**: 005 **declara** el puerto en `modules/audit` (`i-audit-logger.port.ts`, `I_AUDIT_LOGGER`, exportado por `audit/index.ts`), un `LogAuditLogger` (Pino, `event: 'audit.record'`, atributos `string | number | boolean` y `redactDeep`) y `AuditModule`. Contrato: `record(entry: AuditRecord): Promise<void>` con `AuditRecord = { action: AuditAction; actor: Actor; targetUserId: string; resourceId?: string; attributes?: Readonly<Record<string, string | number | boolean>> }`. `AuditAction` es un **catálogo cerrado** declarado en `audit` (en 005: `file.upload_completed`, `file.upload_rejected`, `file.download_url_issued`; 004 lo amplía). `occurredAt` (con `IClock`) y `correlationId` (del contexto de `shared`) los pone el adaptador; no se pasan. El puerto documenta «mejor esfuerzo, después del commit; el adaptador provisional no lanza»; el fallo no revierte la carga ni impide entregar la URL de descarga (se registra como error). `audit/index.ts` exporta puerto, token y módulo, **nunca** `LogAuditLogger`. 004 cambia el binding a `AuditService` (`evento_auditoria`) sin tocar `storage`.
- **D-12 Errores**: `ErrorResponse` gana `details` opcional (objeto plano `string | number | boolean`; `errorResponseSchema` lo valida estricto), aditivo, para cifras, `suggestedName` y `reason`; el campo en falla de CA-7 usa el `fields` que ya trae 001. **`details.suggestedName` contiene un nombre de archivo**: el filtro de errores no registra `details` y `REDACTED_FIELDS` suma `suggestedName`, `name`, `nombre` y `fileName` (CA-20). `TooManyRequestsError`, `Retry-After`, `ZodValidationPipe` y `InvalidInputError` vienen de 001/000; 005 solo agrega las clases de `storage` y `DomainError.details`. Validación de entrada (CA-7): `400` (decisión de Adrián), ver §5.
- **D-13 Tamaños**: `bigint` en BD y dominio (transformer de TypeORM string↔`bigint`); `number` entero seguro en JSON (≤ 2 TB caben con holgura). Las propiedades ORM terminan en `Bytes` (regla de lint de DF-06).
- **D-14 Cierre de DF-38**: `usuario.espacio_usado` es un **atributo almacenado** actualizado en la misma transacción que crea `archivo` y `version_archivo`; 006 lo reduce al purgar y 014/021 lo ajustan. Invariante probada: `espacio_usado = Σ tamano_bytes` de versiones vivas. **La conciliación nocturna se difiere a 007** (decidido 2026-09-28), que define qué cuenta como «usado» y usará el mismo mecanismo de DF-52.
- **D-15 Listado mínimo**: `GET /files` (raíz) es necesario para CA-1 y «Descargar»; queda mínimo y 007 lo extiende. La spec lo declara en su «Enfoque técnico».
- **D-16 Sin evento de dominio ni métricas**: `FileVersionCreated` no tiene consumidor hasta 019 y `IIndexQueue` (DF-51) no está decidido. Las métricas (`prom-client`, `/metrics`) esperan a 022: adelantarlas agrega una dependencia sin ADR y toca 022.
- **D-17 Rama de propiedad de `accessibleNodes`** (003 §6.11): en `access/infrastructure/sql/accessible-nodes.ts`, para `CLIENT` devuelve `SELECT a.id AS nodo_id, 'archivo' AS tipo_nodo, 'OWNER' AS nivel FROM archivo a WHERE a.propietario_id = :access_actor_id AND a.eliminado_en IS NULL`; los roles internos siguen recibiendo el conjunto vacío tipado. `access` lee `archivo` por SQL, sin importar `storage` (ADR-0010). 012 agrega el `UNION ALL` de comparticiones.
- **D-18 Mundo de aislamiento (PD-44 de 003)**: 005 agrega `.withFiles(...)` al *builder* de `test/isolation/setup/isolation-world.ts` y `.withUploads(...)` para `carga`; ambos insertan **como `nimbo_app` dentro de `withActor`**, no como dueño (con `FORCE` y un dueño sin superusuario el `INSERT` del dueño falla por falta de política).
- **D-19 Sin Playwright ahora**: los flujos de UI se prueban con componentes + jest-axe y un guion manual hasta PD-41.

**ADR requeridos**

- **ADR-0021** «Mantenimiento sin actor bajo RLS: función `SECURITY DEFINER` mínima y RLS también en `carga`» (Propuesto; **enmienda ADR-0005**): cierra DF-52 con la opción B; fija `SECURITY DEFINER` mínima + `withActor` por dueño como patrón para 006 (purga) y 007 (conciliación); documenta el alcance de lo que expone la función y la enumeración aceptada.
- **ADR-0011** (dos tablas con `CHECK`, DF-40) y **ADR-0012** (versiones por composición con `origen`, DF-17/18): Propuestos, alineados con el E-R vigente. Este plan no depende de que se acepten.
- **Adenda de ADR-0015** (2026-09-28): `@aws-sdk/s3-request-presigner`, sin ADR aparte. `class-validator`/`class-transformer` **ya no aplican** (ADR-0020). Los componentes shadcn/Radix `alert-dialog`, `checkbox` y `dropdown-menu`: ADR-0014 no nombra Radix, así que los cubre una **adenda de ADR-0015** (primitivas Radix, 2026-09-28, segunda pasada del `architect`).
- **Ninguno por el detector** (implementación propia).

## 10b. Preguntas

**[ABIERTA] Bloqueantes**

Ninguna. Solo queda una dependencia de entrega (no una pregunta): que 006a entregue la implementación de `IPlanLimitsProvider`; mientras tanto, doble de prueba (§6, R-3).

**[ABIERTA] No bloqueantes**

Ninguna. Ninguna (ADR-0014 no cubre Radix: resuelto con la adenda de ADR-0015).

**[RESUELTA]**

- [RESUELTA] DF-51: opción A. `storage` declara `IPlanLimitsProvider` y `PlanLimits` (`editing` los reutiliza); `billing` (006a) los implementa importándolos de `storage`; se elimina `storage → billing` (2026-09-28, Fátima).
- [RESUELTA] UI de descarga: si falla la emisión de la URL (`429`/`404`) se muestra un `Alert` arriba de la lista (no toast); si tarda más de 2 s, «Descargar» queda deshabilitado con «Preparando…»; toast es mejora futura, fuera de alcance (2026-09-28, Adrián).
- [RESUELTA] Estado de error del listado: sin `correlationId` visible; «Subir archivos» sigue habilitado (2026-09-28, Adrián).

- [RESUELTA] «Ver planes» se oculta hasta que exista la 008; sin constante `PLANS_PATH` (2026-09-28, Adrián).
- [RESUELTA] Mockups del explorador: `vacio`, `cargando` y `arrastre` ya están dibujados; el `ui-designer` agrega `explorador--acciones` (menú ⋮ con «Descargar» como única acción) y `explorador--error` (falla el listado, con «Reintentar»); la compuerta `Lista` (`workflow.md` §2) queda cubierta por esa decisión explícita (2026-09-28, Adrián).
- [RESUELTA] Texto de `STORAGE_UPLOAD_SIZE_MISMATCH`: «El archivo cambió durante la carga. Vuelve a subirlo.» (2026-09-28, Adrián).
- [RESUELTA] CA-7 usa `400` (`STORAGE_INVALID_UPLOAD_REQUEST` y `STORAGE_INVALID_QUERY`), no `422` (2026-09-28, Adrián).
- [RESUELTA] La barra lateral de 005 oculta «Carpetas» y el contador de la Papelera hasta 006 (2026-09-28, Adrián).

- [RESUELTA] Contratos de 001–003: `IRateLimiter.consume(key, rules)`, `TooManyRequestsError`, `ZodValidationPipe`, `fields`, `ITransactionRunner.withActor`/`requireActorScope`, `@Roles`/`@CurrentActor`/`createActor`, `AccessibleNodesFragment`, roles de BD, funciones `nimbo_actor_*` y numeración de migraciones → alineados en §4–§6 (2026-09-28, planes aprobados de 001–003).
- [RESUELTA] `class-validator`/`class-transformer`: no se agregan; ADR-0020 → zod (2026-09-28, ADR-0020).
- [RESUELTA] DF-52: opción B con RLS en `carga`, función `SECURITY DEFINER` mínima y `withActor` por dueño; ADR nuevo que enmienda ADR-0005 y prueba en `test/isolation` (2026-09-28, usuario).
- [RESUELTA] `usuario.espacio_usado`: excepción documentada; `storage` escribe solo esa columna; se sigue el E-R vigente (2026-09-28, usuario).
- [RESUELTA] ADR-0011/0012: se sigue el E-R vigente; el `architect` los redacta como Propuestos alineados (2026-09-28, usuario).
- [RESUELTA] 004 llega después de 005: 005 declara `IAuditLogger` con adaptador provisional sobre Pino (2026-09-28, usuario).
- [RESUELTA] Conciliación nocturna de `espacio_usado`: diferida a 007 (2026-09-28, usuario).
- [RESUELTA] 30/09: la 005 completa debe ser demostrable; sin recortar alcance; riesgos R-1 y R-3 (2026-09-28, usuario).
- [RESUELTA] Extensiones de imagen, NUL en `.txt`, código de CA-5, listado mínimo `GET /files`, métricas diferidas a 022: decisiones técnicas en D-9, D-15 y D-16 (2026-09-28, planner).

## 10c. Cambios que este plan requiere en otros documentos

- **Spec 005**: ya aplicados en su Registro de cambios (2026-09-28): sección «Enfoque técnico», CA-16 sin «pausar», código de CA-5, listado mínimo declarado, dependencia de 004 reformulada; el `422` que se propuso para CA-7 **no prosperó** (CA-7 se quedó en `400`, decisión de Adrián). Sin cambio de comportamiento de producto. Tras la revisión del `architect` y las decisiones de Adrián (2026-09-28): menú ⋮ con «Descargar», estado de error del listado, barra lateral sin «Carpetas» ni contador de Papelera (CA-21) y §12 sin preguntas de mockups; §9 de la spec la integra Adrián con el `ui-designer`.
- **`architecture.md`** (`architect`): §3/§5 según DF-51 opción A (quitar `storage → billing`; `billing → storage`) y **excepción de `usuario.espacio_usado`** (D-5, DF-59); §6 (RLS en `carga`, `carga_expiradas`, `carga_mantenimiento`; ADR-0021); §7.1 (URLs de partes al iniciar, `resume`, lista de partes en servidor, recuperación de `complete`, sin evento); §8 (cola `upload-cleanup`).
- **`design-findings.md`**: DF-16, DF-38 y DF-52 cerrados; DF-33 parcial; DF-59 y DF-60 ya registrados (aceptados); DF-51 resuelto (opción A) para `IPlanLimitsProvider`: el `architect` lo cierra.
- **`design-model.md`/diagramas**: `design-model.md` ya refleja M2/T1/T2/E-R (DF-60); falta redibujar M2, T1, T2 y el E-R (PD-46). Actualizar la fila `File` → `archivo` (sin `tipo_mime`, cambio 15a).
- **`pendientes.md`**: PD-19 a `Resuelto` con ADR-0021; PD-44 (mundo de aislamiento) cubierto por D-18; PD-31 sigue abierto; si PD-24 no está integrado, registrar ahí las reglas de `boundaries.js` de 005.
- **`docs/operations/ambientes.md`**: el rol que migra es el mismo en todos los ambientes y cambiarlo exige una migración nueva (cambio 6d).
- **`docs/adr/`**: ADR-0021 (enmienda ADR-0005), ADR-0011 y ADR-0012 como Propuestos; adenda de ADR-0015.
- **`.env.example`, `compose.yml`, `infra/traefik`**: variables de §5, CORS de MinIO, router `s3.` con `X-Content-Type-Options: nosniff` cuando exista `compose.staging.yml`, y retirar el router local `/s3` del override.
- **Spec 007**: conciliación nocturna de `espacio_usado` (D-14). **Spec 004**: cambiar el binding de `I_AUDIT_LOGGER` y mantener la firma de D-11.

## 11. Aprobación de arquitectura

> Sección escrita por el subagente `architect`.
- **Veredicto final: Aprobado** (2026-09-28, segunda pasada). Los 15 cambios de §11.4 están aplicados en el cuerpo (§11.6), DF-51 quedó
  resuelto con la opción A y no hay cambios bloqueantes; los ajustes menores de la segunda pasada los aplicó el `architect` (§11.6). La spec puede
  pasar a `Lista` cuando Adrián integre §9 de la spec con los mockups del explorador. Las suites `int`/`iso` no se ejecutan hoy (Docker): R-1.
- Veredicto de la primera pasada (histórico): **Aprobado con cambios** (2026-09-28). Los cambios 1 a 4 son de forma y de alineación con las decisiones del
  usuario del 2026-09-28; los cambios 5 a 15 son estructurales pero acotados. Con los 15 aplicados en el cuerpo del plan,
  el `planner` pide la re-lectura y la spec puede pasar a `Lista`. Hasta entonces el `developer` puede empezar el paquete
  P0 de §9 R-3 (`contracts/storage`, dominio, `MagicBytesDetector`, `UploadManager`), que no depende de ningún cambio.
- Observaciones:

### 11.1 Los doce puntos de la revisión

| # | Punto | Resultado |
|---|---|---|
| 1 | Fronteras | ☑ con una excepción decidida. Cada responsabilidad cae donde dice `architecture.md` §3: `storage` (nodos, cargas, cuota), `access` (rama de propiedad de `accessibleNodes`, solo SQL de lectura: regla 3 y ADR-0010), `audit` (puerto). `storage` escribe `usuario.espacio_usado` sin importar `identity`: es una excepción a «cada módulo es dueño de sus tablas», no una arista (DF-59). Falta el `boundaries.js` (cambio 13) |
| 2 | Grafo | ☑ con un punto abierto. `storage → shared, access, audit, billing, realtime` no añade aristas nuevas. `storage → billing` sigue siendo el ciclo de DF-51; esta aprobación **no lo ratifica** (§11.3) |
| 3 | Capas | ☑ Dominio sin Nest/TypeORM/SDK (`FileName`, `QuotaPolicy`, `UploadSession`, catálogo); ORM y SDK solo en `infrastructure`; los dos controladores delegan. El dominio no importa `@nimbo/contracts` (ADR-0008) |
| 4 | YAGNI | ☑ con dos ajustes: sin `pg_advisory_xact_lock` (cambio 8) y `tipo_mime` solo si el E-R lo trae (cambio 15). No hay `IEventBus`, `IMetrics`, `IIdGenerator` ni eventos sin consumidor (D-16): bien |
| 5 | DRY | ☑ `plan-limits.ts`, `accessibleNodes`, `createActor`, `withActor`, `nimbo_actor_*`, `fields` de 001, `formatBytes` en `contracts`. El esquema de `MINIO_*` debe definirse una vez (cambio 11) |
| 6 | SOLID | ☑ con un ajuste: el barrido sin actor sale de `IUploadSessionRepository` a un puerto propio (cambio 10) |
| 7 | Seguridad estructural | ☑ `actor` primero, `accessibleNodes` en la consulta, RLS en `archivo`, `version_archivo` y `carga`, sin ruta a objetos para roles internos. Ver cambios 5, 6 y 12 |
| 8 | Integridad | ✘ dos huecos reales: la carrera «cancelar/expirar contra completar» puede dejar un `archivo` sin objeto (cambio 5) y falta el camino de recuperación cuando `completeMultipart` ya ocurrió (cambio 9) |
| 9 | Degradación | ☑ Ni indexación, optimizador ni ONLYOFFICE participan. Si el `worker` cae, el vencimiento perezoso y la reserva que ignora las vencidas mantienen la cuota correcta |
| 10 | Recursos | ☑ con reservas: concurrencia 1 de `upload-cleanup` y tiempo de `complete` para `.txt`/`.md` de GB (cambios 14 y 9). La API no ve los bytes salvo en la validación (≤ 8 MiB por lectura) |
| 11 | Datos | ☑ `bigint`, `uuid`, `timestamptz`, `CHECK` en vez de enum; índices para cada consulta (`EXPLAIN` exigido). `down` real en las cuatro migraciones |
| 12 | Coherencia con diagramas | ☑ El plan declara sus desvíos (§3). El `architect` registra DF-59 y DF-60 y cierra DF-16, DF-38 y DF-52. DF-51 sigue `Abierto` (§11.3) |

### 11.2 Los siete puntos pedidos

1. **Política `carga_mantenimiento TO CURRENT_USER` y rol dueño.** Es correcta como diseño: `FORCE` somete también al dueño y
   `SECURITY DEFINER` ejecuta como el dueño de la función, que es el rol que migra. Dos trampas:
   (a) **un superusuario ignora RLS incluso con `FORCE`**: en local y en el CI de 003 el dueño es el superusuario del contenedor
   (`getConnectionUri()`), donde la política es inerte, así que `storage-maintenance.iso-spec.ts` pasaría aunque la política
   estuviera mal; en staging, con un dueño sin `SUPERUSER`, la política es lo que hace funcionar la función;
   (b) `TO CURRENT_USER` se fija al crear la política: todas las migraciones deben correr con el mismo rol en todo ambiente
   (003 ya lo garantiza con `DATABASE_MIGRATION_URL`). Cambio 6.
2. **Qué expone `carga_expiradas`.** Solo `(id, propietario_id)` de cargas activas, sin nombre, clave ni `upload_id`; bien. Pero
   `p_ahora` lo elige quien llama: `carga_expiradas(now() + '100 years', 1000000)` enumera **todas** las cargas activas, no
   solo las vencidas, y `p_limite` no tiene tope. Además `search_path = pg_catalog, public` con `SECURITY DEFINER` debe
   cerrarse. Cambio 7.
3. **`IAuditLogger` y `audit` mínimo.** La firma de D-11 es aceptable, con ajustes: la acción sale de un catálogo cerrado
   declarado en `audit` (tres entradas de 005; 004 lo amplía), `correlationId` lo toma el adaptador del contexto de `shared` (no se
   pasa), y el contrato debe decir por escrito que el registro es de mejor esfuerzo, posterior al commit, para que 004 no
   herede la semántica por accidente. `audit/index.ts` exporta puerto, token y módulo, nunca `LogAuditLogger`. Cambio 12.
4. **`MINIO_SECRET_KEY` en los dos esquemas.** La regla de 001 (§6.10: «cada secreto en `apiEnvSchema` **o** en
   `workerEnvSchema`») es inclusiva y ya lo admite; el plan no debe dejarlo condicionado a que «la prueba lo prohíba».
   Se define `MINIO_*` una sola vez y ambos esquemas lo componen (`apiEnvSchema.merge(workerEnvSchema)` del arnés exige
   definiciones idénticas). El worker no necesita `MINIO_PUBLIC_ENDPOINT` (solo la API firma). Riesgo aceptado: la credencial
   raíz de MinIO queda en dos procesos; una cuenta de servicio por proceso es endurecimiento de 022/staging. Cambio 11.
5. **`ErrorResponse.details` junto a `fields`.** Aditivo y sin solapamiento (`fields` para el campo en falla; `details` para cifras,
   `suggestedName`, `reason`). Riesgo: `details.suggestedName` **contiene un nombre de archivo**; si el filtro registra el
   error, CA-20 se rompe. Cambio 12.
6. **Frontera `access` → SQL de `archivo`.** Permitida por `architecture.md` §3 regla 3 y ADR-0010; el SQL vive en
   `access/infrastructure/sql/accessible-nodes.ts` sin importar `storage`. La duplicación de la regla de propiedad entre el
   fragmento y la política RLS es la que ADR-0005 ya previó (extraer función `STABLE` cuando 012 la repita). Se exige una
   prueba que ejecute el fragmento contra el esquema real, para que un cambio de columnas de `storage` rompa el CI y no la
   producción. Cambio 13.
7. **`boundaries.js`.** El plan no lo menciona. Con la excepción de `espacio_usado` y el archivo `plan-limits.ts` como única
   puerta hacia `billing`, las reglas deben quedar escritas y con *fixtures* negativos. Cambio 13.

### 11.3 DF-51: ¿basta `plan-limits.ts` para aprobar?

**Sí, con dos correcciones y una condición.** El aislamiento es una técnica válida: 005 no crea la arista `storage → billing`
(ya está en `architecture.md` §3), no la cierra, y el código de `storage` queda idéntico en las tres opciones salvo en el punto
de cableado. Pero el plan afirma en §1 que la decisión de Fátima «cambia únicamente ese import», y §6 dice lo contrario:
en B `StorageModule` importa `BillingModule`, y en A el enlace del token vive en la raíz de composición. El radio real son
**dos archivos** (`plan-limits.ts` y `storage.module.ts`); el plan debe decirlo (cambio 3).
Condición: (i) la aprobación no ratifica la arista `storage → billing`; (ii) las tareas de cableado del token en `StorageModule`
y CA-3/CA-4 de integración quedan bloqueadas hasta que 006a cierre DF-51; el resto de 005 avanza con `FakePlanLimitsProvider`
(solo en `test/`); (iii) el `developer` no puede importar `billing` desde ningún otro archivo de `storage` (regla del cambio 13).
Nota de riesgo, no decisión: la opción A (que `storage` declare el puerto) es la que menos toca y la única que desbloquea la 005
sin esperar a 006a, porque 005 declararía el puerto y 006a lo implementaría; conviene que Fátima lo sepa al decidir, por la
ruta crítica del 30/09 (R-3).

### 11.4 Cambios requeridos (numerados, para el `planner`)

**Alineación con las decisiones del usuario (2026-09-28)**

1. **CA-7 se queda en `400` (no `422`).** Corregir §5 (tabla de `POST /uploads` y de `GET /files`, la «Nota sobre el `422`»), la lista
   de errores de dominio y §10c («`422` en CA-7»). `STORAGE_INVALID_UPLOAD_REQUEST` responde `400` con `fields`; también
   `STORAGE_INVALID_QUERY`, para que el módulo tenga un único estado de validación. `InvalidInputError` de `shared` es 422 y no
   se toca: `InvalidUploadRequestError` declara `status = 400` (o usa la clase de 400 de `shared` si existe; no crear una base
   nueva por esto). `STORAGE_EMPTY_FILE` sigue en `422`. Quitar la frase «lo confirma Adrián al aprobarla».
2. **«Ver planes» se oculta hasta que exista 008.** Corregir la fila CA-4 de §8 (solo «Liberar espacio» en el componente del
   aviso), eliminar la constante `PLANS_PATH` propuesta y pasar la pregunta 2 de §10b a `[RESUELTA]`.
3. **Aclarar el radio de DF-51** (ver §11.3): reemplazar en §1 «cambia únicamente ese import» por «cambian `plan-limits.ts` y
   el enlace del token en `storage.module.ts`», y en §2 (Art. VIII) y §3b decir que la aprobación no ratifica `storage → billing`.
4. **Cerrar las preguntas 3 y 4 de §10b**: texto de `STORAGE_UPLOAD_SIZE_MISMATCH` = «El archivo cambió durante la carga. Vuelve a
   subirlo.» (sustituye la propuesta del plan; el servidor y `lib/error-catalog.ts` lo reproducen sin parámetros) y los estados
   `vacio`, `cargando` y `arrastre` del explorador los dibuja el `ui-designer` ahora (pasan a `[RESUELTA]`; la compuerta `Lista`
   de `workflow.md` §2 queda cubierta por la decisión explícita). Mantener abierta solo DF-51. (La spec §12 aún conserva una
   línea `[ABIERTA]` de mockups y la fila del 2026-09-28 del registro dice «`400` → `422`»: las corrige quien mantiene la spec.)

**Estructurales**

5. **Carrera cancelar/expirar contra completar (Art. XI).** «Borrar primero, CAS después» permite que `cancel` o `expire`
   purguen el objeto de la clave final mientras `complete` está a punto de confirmar: el CAS de `complete` gana (la carga sigue
   `activa`) y queda un `archivo` sin objeto. Invertir el orden: **CAS primero** (`activa → cancelada|expirada`; con eso la
   reserva se libera y `complete` ya no puede ganar) y **borrar después** (`abortMultipart` tolerante a `NoSuchUpload`,
   `purgeObject` idempotente, hasta 3 intentos en la misma petición o trabajo). El residuo, si el proceso muere entre ambos pasos o un
   `PUT` tardío recrea el objeto, es un objeto huérfano sin `archivo` que lo referencie: no es fuga ni pérdida, no cuenta en la cuota, y
   se acepta y documenta en R-7 (007 puede barrer objetos sin `version_archivo`). Añadir a `upload-cleanup.int-spec.ts` y
   `uploads-cancel.int-spec.ts` la prueba de la carrera (`complete` y `cancel` en paralelo: nunca `archivo` sin objeto).
6. **RLS de `carga` y el rol dueño** (§11.2.1): (a) el `storage-maintenance.iso-spec.ts` debe fallar con mensaje explícito, no pasar
   en vacío, si el dueño es superusuario; correr esa suite con una base propia cuyo dueño sea `NOSUPERUSER` (si algún paso previo
   exige superusuario, p. ej. `CREATE EXTENSION`, dejarlo a un script de arranque de esa suite); si no es viable, la Definición de
   Hecho de 005 exige ejecutar la prueba en staging con dueño no superusuario; (b) afirmar en la misma suite, contra `pg_policies` y
   `pg_proc`, que la política `carga_mantenimiento` es del dueño de `carga` y que la función tiene el mismo dueño; (c) las
   fixtures de `.withFiles()` y `.withUploads()` (D-18) insertan **como `nimbo_app` dentro de `withActor`**, no como dueño: con
   `FORCE` y un dueño sin superusuario, el `INSERT` del dueño sobre estas tablas falla por no tener política; (d) `docs/operations/ambientes.md`
   dice que el rol que migra es el mismo en todos los ambientes y que cambiarlo exige una migración nueva.
7. **Endurecer `carga_expiradas`** (§11.2.2): `WHERE … c.expira_en <= LEAST(p_ahora, now())` (el llamador no puede mirar al
   futuro; las pruebas siembran `expira_en` en el pasado), `LIMIT LEAST(GREATEST(p_limite, 0), 1000)`,
   `SET search_path = pg_catalog, pg_temp` y tabla calificada `public.carga`. Ajustar la prueba: `carga_expiradas(now() + interval '1 year', 1000)`
   no devuelve cargas aún vigentes. El ADR-0021 documenta el alcance de la enumeración aceptada.
8. **Quitar `pg_advisory_xact_lock`** de `complete` (§6, paso 5 y D-4): `lockAndReadUsage` ya toma `FOR UPDATE` sobre la fila de
   `usuario` del propietario en esa misma transacción, que serializa el cálculo del «(n)» por propietario. Dos mecanismos para lo mismo
   son complejidad sin garantía adicional; el índice único parcial sigue como red de seguridad. `complete` no necesita la suma de
   reservas: si `lockAndReadUsage` la calcula siempre, dividirlo (`lockUsage` para `complete`, lectura completa para `init`).
9. **Recuperación de `complete`** (Art. XI, idempotencia): si `completeMultipart` ya se ejecutó y el proceso murió antes del paso 5, el
   reintento hace `listParts` sobre un `upload_id` inexistente. Especificar: ante `NoSuchUpload`, `headObject(clave_objeto)`; si el objeto
   existe se continúa en los pasos 4 y 5 (idempotentes por CAS y por `UNIQUE(clave_objeto)`), y si no, `404`/`409`. Dos `complete`
   simultáneos (doble clic) caen en la misma ruta. Además, precisar que la validación de `.txt`/`.md` lee todo el objeto **a través de la API**:
   con 1 GB o 2 GB, `complete` dura minutos. Actualizar R-9 con esa cifra, fijar el tiempo máximo de la petición (Traefik y API) y que la
   fila del panel muestre «completando» sin vencer por tiempo de espera del cliente.
10. **Segregar el barrido sin actor** (SOLID, seguridad): `listExpiredIds` sale de `IUploadSessionRepository` a un puerto propio
    (`IExpiredUploadScanner`), que solo inyecta `UploadCleanupProcessor`. Así ningún servicio con `actor` puede llamar a la única consulta
    sin actor. No se exporta desde `storage/index.ts`.
11. **`MINIO_*` en los dos procesos** (§11.2.4): sustituir la nota condicional de §5 por la decisión: una sola definición compartida,
    ambos esquemas la componen, caso nuevo en `env.schema.spec.ts` («un secreto declarado en ambos esquemas pasa si las definiciones
    coinciden»), y `MINIO_PUBLIC_ENDPOINT` solo en `apiEnvSchema`. Añadir a R-11 o R-13 el riesgo de la credencial raíz en dos procesos.
12. **`IAuditLogger` y `details`** (§11.2.3 y §11.2.5): (a) firma: `record(entry: AuditRecord)` con `AuditRecord = { action: AuditAction; actor: Actor;
    targetUserId: string; resourceId?: string; attributes?: Readonly<Record<string, string | number | boolean>> }`; `AuditAction` es un catálogo
    cerrado en `audit` (`file.upload_completed`, `file.upload_rejected`, `file.download_url_issued`); `occurredAt` y `correlationId` los pone el adaptador;
    (b) el puerto documenta «mejor esfuerzo, después del commit; el adaptador provisional no lanza», y `download-url` decide explícitamente qué
    hace si el registro falla (propuesta: registrar el error y entregar la URL, como en `complete`); (c) `audit/index.ts` no exporta
    `LogAuditLogger`; (d) el filtro de errores **no registra `details`**, y `REDACTED_FIELDS` suma `suggestedName`, `name`, `nombre`, `fileName` (además de los
    ya listados); (e) `errorResponseSchema` valida `details` como objeto plano de `string | number | boolean`, estricto.
13. **Fronteras y `boundaries.js`** (§11.2.6 y §11.2.7): agregar a §3b una fila y a las tareas: reglas de `boundaries.js` (`storage` → `shared`, `access`,
    `audit`, `realtime`, `billing`; `access` → `shared`; `audit` → `shared`); *fixtures* negativos `storage-imports-identity.ts` (la
    excepción de `espacio_usado` no es una arista) y `storage-imports-billing-outside-plan-limits.ts` (solo `storage/application/plan-limits.ts`
    puede importar `billing` o su sustituto); `apps/worker` importa `StorageWorkerModule` únicamente desde `storage/index.ts`. Si PD-24 no está integrado
    cuando se implemente, las reglas se agregan en el mismo PR de 005 y se registra en `pendientes.md`. Añadir `access/infrastructure/sql/accessible-nodes.int-spec.ts`:
    ejecuta el fragmento contra el esquema real de las migraciones de 005.
14. **Recursos y trabajo repetible** (Art. X, XII): fijar `concurrency: 1` en `UploadCleanupProcessor` y `attempts: 3` con espera exponencial; fijar tiempos de espera
    del cliente S3 **interno** (`connectTimeout` 2 s, `requestTimeout` 10 s). Corregir R-8: `createMultipart` es una llamada de red **dentro** de
    la transacción con `FOR UPDATE` sobre `usuario` (§6, `init`), no «cómputo local»; sin esos tiempos, un MinIO lento retiene la fila del usuario y una
    conexión del pool. Solo ocurre en cargas por partes (≥ umbral).
15. **Detalles de datos**: (a) `archivo.tipo_mime`: confirmar contra el E-R vigente; si el E-R no la trae o ningún consumidor de 005 la lee
    (la descarga fuerza `application/octet-stream` y `FileSummary` solo expone `kind`), quitarla y agregarla con 017; si la trae, registrarlo en DF-60; (b) `ck_carga_rechazo`
    impide `motivo_rechazo` en cargas no rechazadas: mantenerlo, y que `contracts/storage` exporte el conjunto de motivos una vez; (c) `carga.archivo_id` y `version_id`
    reservados sin FK: declarar en el plan que no hay integridad referencial hasta completar y por qué (evita el ciclo con `archivo`).

### 11.5 Riesgos arquitectónicos a vigilar

- **R-1/R-3 (Docker y ruta crítica)**: las suites `int` e `iso` no corren hoy en esta máquina; una spec que toca RLS no se cierra sin `test:isolation` real (Art. III y IX).
- **DF-52 opción B** es el patrón que reutilizan 006 (purga) y 007 (conciliación): cualquier función `SECURITY DEFINER` nueva pasa por el mismo control (ADR-0021).
- **Excepción `espacio_usado`**: vigilar que otro módulo no copie el patrón (DF-59); la prueba de columnas y la regla del cambio 13 la sostienen.
- **`accessible-nodes.ts` con SQL sobre tablas ajenas** crece con 012 (comparticiones): al segundo `UNION ALL`, extraer la función SQL `STABLE` de ADR-0005.
- **Objetos huérfanos** (cambio 5) y **credencial raíz de MinIO en dos procesos** (cambio 11): aceptados y documentados; revisar en 022.
- **Validación de `.txt`/`.md` grandes** dentro de `complete` (cambio 9): si el spike o k6 de 023 muestran latencias inaceptables, la salida es validar por muestra o mover la validación al `worker` (decisión de producto sobre RN-6).
- **Plazo del 30/09**: el paquete P1 de §9 R-3 depende de 001 PR-1 y 003 PR-A/B/C; si 003 se atrasa, no hay `withActor` ni RLS y la 005 no puede demostrarse completa. No se autoriza recortar el aislamiento para cumplir el plazo.

Cambios de §11.4 aplicados por el planner (2026-09-28): 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15.

### 11.6 Segunda pasada (2026-09-28)

**Verificación de los 15 cambios contra el cuerpo**: todos aplicados. 1 (`400`, §5 tabla y nota; `status = 400` en `DomainError`) · 2 (sin «Ver planes» ni `PLANS_PATH`, §8 CA-4, §6) · 3 y DF-51 (§1, §2, §3b, §6: opción A) · 4 (texto de CA-5; §10b) · 5 (CAS primero, §6 `cancel`/`expire`, R-7, pruebas de la carrera) · 6 (§4 «Rol dueño» y fixtures, §8 DF-52, ambientes.md en §10c) · 7 (`carga_expiradas` endurecida en §4) · 8 (sin `pg_advisory_xact_lock`, `lockUsage`/`lockAndReadUsage`) · 9 (recuperación con `headObject`, R-9, `UPLOAD_COMPLETE_TIMEOUT_SECONDS`) · 10 (`IExpiredUploadScanner`) · 11 (`MINIO_*` compartido, R-13) · 12 (`AuditRecord`, `AuditAction`, `details` fuera de bitácora) · 13 (`boundaries.js`, `accessible-nodes.int-spec.ts`; el fixture `storage-imports-billing-outside-plan-limits.ts` se sustituyó por `storage-imports-billing.ts` porque con la opción A `storage` no importa `billing` en ningún archivo) · 14 (`concurrency: 1`, `attempts: 3`, timeouts del cliente S3 interno, R-8) · 15 (`tipo_mime` quitado; `ck_carga_rechazo`; `archivo_id`/`version_id` sin FK explicado). El plan es coherente con la spec (CA-1 a CA-24, mismos códigos y estados).

**Los ocho puntos que dejó el planner**:

1. **Paso 5 de `complete` (CAS antes de crear el `archivo`) y 404 del `cancel` que pierde**: correcto. Todo va en una transacción bajo `FOR UPDATE` de `usuario`: si el CAS pierde (0 filas) se revierte y no hay `archivo`; si gana, `cancel`/`expire` ya no pueden pasar su propio CAS. `cancel` sobre una carga ya `completada` responde 404 (igual que ajena o inexistente, sin oráculo) y el cliente lo trata como éxito solo si ya la había cancelado; aceptable. Sin cambios.
2. **900 s con Traefik**: aceptable como cota, no como diseño ideal. Una petición en curso no la corta `idleTimeout`; sí `readTimeout`/`writeTimeout` del entrypoint, que hay que fijar en ≥ 900 s (aplicado en §5). A 100 MB/s un `.txt` de 2 GB se lee en ~20 s, así que 900 s es holgado. La salida ya está en R-9 (validar por muestra o mover al `worker`); no se adelanta (YAGNI).
3. **Suite `NOSUPERUSER`**: viable en el CI con un contenedor Postgres propio y un script de arranque como superusuario (rol dueño, base, `CREATE EXTENSION vector`, `nimbo_app` si 003 lo requiere); descrito en §8. La ejecución en staging queda solo como salida si no está lista el 30/09.
4. **Quitar `archivo.tipo_mime`**: confirmado. Sin consumidor en 005 (la descarga fuerza `application/octet-stream`, `FileSummary` expone `kind`). `design-model.md` §5 ajustado y DF-60 lo dice.
5. **`dropdown-menu`**: ADR-0014 **no** cubre Radix (habla de «componentes estilo shadcn/ui» y `apps/web` solo tiene `class-variance-authority` y `lucide-react`); tampoco `alert-dialog` ni `checkbox`, contra lo que decía el plan. Se agregó una **adenda a ADR-0015** que autoriza las primitivas Radix para los tres.
6. **Fixtures de aislamiento**: `apps/api/test/isolation/setup/isolation-world.ts` aún no existe (solo `placeholder.iso-spec.ts`); se compara con el plan de 003 §6.7, que ya reserva `.withFiles(...)`. Diferencia a declarar: 003 dice que las cuentas se insertan «con el rol dueño»; 005 inserta `archivo`, `version_archivo` y `carga` como `nimbo_app` dentro de `withActor` (necesario con `FORCE` y dueño no superusuario). Es coherente porque las cuentas (`usuario`) siguen entrando como dueño; PD-44 lo cubre.
7. **DF-51 e `IIndexQueue`**: la opción A resuelve solo `IPlanLimitsProvider`. `IIndexQueue` e `IAgentQuota` siguen abiertos en **PD-18** (propuesta ya escrita en DF-51: `storage` declara `IIndexQueue`, `intelligence` lo implementa; se cierra en el plan de 019). 005 no lo necesita (D-16).
8. **`PlanLimits` en `editing`**: «por composición» era ambiguo. Se fija que `PlanLimits` solo lleva límites de almacenamiento y que `editing` pide cualquier otro límite por un puerto que declare `billing` (`editing → billing` ya existe), sin ensanchar el tipo de `storage` (ISP). Además el `PlanLimits` de dominio de `billing` (`Plan`) es otro tipo: se mapea al implementar.

**Cambios menores aplicados por el `architect`**: §5 (Traefik `respondingTimeouts`), §8 (viabilidad de la suite `NOSUPERUSER`), §6 (`PlanLimits` solo de almacenamiento), §1, §3b, §6, §10 y §10b (Radix → adenda de ADR-0015), encabezado.

**Sigue abierto (no bloquea)**: (a) 006a debe entregar la implementación de `IPlanLimitsProvider`; hasta entonces `FakePlanLimitsProvider` (R-3); (b) redibujar M2, M4, T1, T2 y el E-R (PD-46); (c) spike de MinIO, `test:int`/`test:isolation` con Docker real (R-1, R-2); (d) 003 §6.7 debería mencionar que las tablas de 005 se siembran como `nimbo_app`; (e) `boundaries.js` (PD-24/PD-47); (f) PD-18 parcial (`IIndexQueue`, `IAgentQuota`).

ADRs: adenda a `docs/adr/0015-dependencias-de-fundaciones.md` (Radix). ADR-0021, 0011 y 0012 siguen Propuestos (el equipo los acepta; este plan no depende de ello).
