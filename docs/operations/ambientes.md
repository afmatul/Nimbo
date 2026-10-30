# Ambientes y configuración

> Spec 000 (CA-3, CA-18, CA-29). Fuente única de las variables: `apps/api/src/shared/infrastructure/config/env.schema.ts`
> (api y worker) y `apps/web/src/env.ts` (web). `pnpm env:check` comprueba que `.env.example` las cubra todas.

## 1. Ambientes

| Ambiente | `NODE_ENV` | `APP_ENV` | Dónde corre | Compose |
|---|---|---|---|---|
| Local | `development` | `local` | Apps en el host con `pnpm dev`; dependencias en Docker | `compose.yml` + `compose.override.yml` (automático) |
| Pruebas (`int`, `isolation`, CI) | `test` | `test` | Jest + Testcontainers (mismas imágenes que compose) | ninguno: contenedores efímeros por corrida |
| Staging | `production` | `staging` | Droplet, todo en contenedores | `compose.yml` + `compose.staging.yml` (`COMPOSE_FILE` en el `.env` del servidor; PR-5) |
| Producción (Fase 4) | `production` | `production` | Igual que staging con otros hosts | `compose.yml` + `compose.staging.yml` (D-4) |

`NODE_ENV` es el modo de Node y de las librerías (`production` desactiva ayudas de desarrollo); `APP_ENV` es el
ambiente lógico de Nimbo: aparece en la página de estado y en las bitácoras `api.started`/`worker.started`
(la cabecera `x-nimbo-version` lleva `APP_VERSION`, no `APP_ENV`). Una misma imagen sirve para todos los
ambientes: se comporta según el `.env` inyectado, sin reconstruir (CA-29).

## 2. Variables

Leyenda: **api**/**worker** (general)/**web** = el proceso la valida al arrancar; **compose** = solo la usa `compose*.yml`.
El schema de `worker-optimizer` y sus consumidores están separados debajo de la tabla; validar no equivale a inyectar.
Secreto = nunca en el repositorio, vacío en `.env.example` de staging, redactado en bitácoras (`SECRET_KEYS`).

| Variable | api | worker | web | compose | Secreto | Default | Notas |
|---|---|---|---|---|---|---|---|
| `NODE_ENV` | ✓ | ✓ | (Next) | | | — | `development` \| `test` \| `production` |
| `APP_ENV` | ✓ | ✓ | ✓ | | | — | `local` \| `test` \| `staging` \| `production` |
| `APP_VERSION` | ✓ | ✓ | | ✓ | | `dev` | `sha-<short>` en imágenes publicadas; cabecera `x-nimbo-version` (CA-31) |
| `PORT` | ✓ | | ✓ | | | api `3000`, web `3002` | Traefik local enruta `/api` → 3000 y `/` → 3002 |
| `WORKER_PORT` | ✓ | ✓ | | | | `3001` | Salud interna del worker; **nunca** en `ports:` (CA-23) |
| `WORKER_OPTIMIZER_PORT` | | | | | | `3003` | Solo valida `worker-optimizer`: salud interna; **nunca** en `ports:` |
| `LOG_LEVEL` | ✓ | ✓ | | | | — | `trace` … `fatal` |
| `DATABASE_URL` | ✓ | ✓ | | | (contiene contraseña) | — | Postgres con pgvector, **como `nimbo_app`** (003): local `postgres://nimbo_app:nimbo_app@localhost:5432/nimbo`. Con el dueño o un superusuario la app no arranca (`db.role_rejected`, §4) |
| `DATABASE_MIGRATION_URL` | | | | | (contiene contraseña) | — | Solo migraciones (`migrationEnvSchema`: `data-source.cli.ts`, `migrate.ts`); dueño de las tablas, local `postgres://nimbo:nimbo@localhost:5432/nimbo`. No cae a `DATABASE_URL` si falta (`config.invalid`). En staging, solo en el entorno del paso de migración (PD-43, provisional) |
| `NIMBO_APP_DB_PASSWORD` | | | | ✓ | ✓ | — | Contraseña de `nimbo_app`: inicializa el rol y Compose la interpola en `DATABASE_URL` del optimizador; nunca se inyecta allí como clave auxiliar |
| `REDIS_URL` | ✓ | ✓ | | | | — | BullMQ y caché |
| `MINIO_ENDPOINT` | ✓ | ✓ | | | | — | API S3 (puerto 9000); la consola 9001 no la usa la app |
| `MINIO_ACCESS_KEY` | ✓ | ✓ | | | ✓ | — | Una sola definición compartida por `api` y `worker` (005); el worker aborta partes y borra objetos |
| `MINIO_SECRET_KEY` | ✓ | ✓ | | | ✓ | — | Ídem |
| `MINIO_BUCKET` | ✓ | ✓ | | ✓ | | `nimbo` | Creado con versionado por `infra/minio/init.sh` |
| `MINIO_REGION` | ✓ | ✓ | | | | `us-east-1` | Nominal, lo exige el SDK |
| `MINIO_PUBLIC_ENDPOINT` | ✓ | | | | | `http://localhost:9000` | Host contra el que el `api` firma URLs (005); staging `https://s3.staging.nimbo.me`. Nunca un prefijo de ruta |
| `UPLOAD_PART_SIZE_BYTES` / `UPLOAD_MULTIPART_THRESHOLD_BYTES` | ✓ | | | | | 8 MiB / 16 MiB | Parte ≥ 5 MiB; umbral ≥ parte (005 D-1) |
| `UPLOAD_URL_TTL_SECONDS` | ✓ | | | | | `3600` | TTL entre 60 y 86400 s |
| `RATE_LIMIT_UPLOAD_INIT_PER_MINUTE` / `RATE_LIMIT_DOWNLOAD_URL_PER_MINUTE` | ✓ | | | | | `300` / `120` | Por usuario (005 RN-16) |
| `RATE_LIMIT_VERSION_RESTORE_PER_MINUTE` | ✓ | | | | | `30` | Restauraciones de versiones por usuario (014 plan §5) |
| `UPLOAD_CLEANUP_INTERVAL_MINUTES` / `UPLOAD_CLEANUP_BATCH_SIZE` | | ✓ | | | | `10` / `100` | Barrido de cargas vencidas; lote 1–1000 |
| `WEB_PUBLIC_URL` | ✓ | | | | | — | Base de los enlaces de los correos (`/verificar-correo#token=…`); `https` obligatorio en staging y producción (001 CA-20) |
| `CORS_ORIGIN` | ✓ | | | ✓ | | — | Orígenes permitidos, separados por comas (local: `http://localhost,http://localhost:3002`); compose los pasa también a `MINIO_API_CORS_ALLOW_ORIGIN` (005, nunca `*`) |
| `SMTP_HOST` | | ✓ | | | | — | Local: `localhost` (Mailpit); perfil `apps`: `mailpit`; staging: `smtp.resend.com` |
| `SMTP_PORT` | | ✓ | | | | — | Mailpit `1025`; Resend `465` |
| `SMTP_TLS` | | ✓ | | | | — | `none` | `starttls` | `implicit`; `none` prohibido en staging y producción |
| `SMTP_USER` | | ✓ | | | | — | Opcional; obligatoria si hay `SMTP_PASSWORD` (Resend: `resend`) |
| `SMTP_PASSWORD` | | ✓ | | | ✓ | — | Solo la valida y consume el general (ADR-0018); `worker-optimizer` no la recibe. Los otros servicios conservan `env_file` |
| `MAIL_FROM` | | ✓ | | | | — | `Nimbo <no-responder@nimbo.me>` |
| `API_INTERNAL_URL` | | | ✓ | | | — | `web` llama a la API solo desde el servidor (sin `NEXT_PUBLIC_`) |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | | | | ✓ | contraseña | — | Dueño de las tablas; deben coincidir con `DATABASE_MIGRATION_URL` |
| `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | | | | ✓ | contraseña | — | En local coinciden con `MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY` |
| `IMAGE_TAG`, `DOMAIN`, `WEB_HOST`, `API_HOST`, `DOCS_HOST`, `S3_HOST` | | | | ✓ | | `latest`, … | Solo staging (Traefik por host) |
| `LETSENCRYPT_EMAIL`, `ACME_CA_SERVER` | | | | ✓ | | — | TLS en staging |
| `ONLYOFFICE_JWT_SECRET` | ✓ | | | ✓ | ✓ | — | Perfil `onlyoffice` y `api` (016): firma la configuración del editor, sus avisos y los enlaces de contenido. Opcional en el `api`; en staging y producción ≥ 32 caracteres y nunca el de `.env.example` |
| `ONLYOFFICE_PUBLIC_URL` / `ONLYOFFICE_INTERNAL_URL` | ✓ | | | | | — | 016: desde donde el navegador carga el editor / desde donde el `api` consulta su salud y descarga lo guardado. Opcionales: sin ellas abrir responde `EDITING_UNAVAILABLE` (CA-15) |
| `EDITING_CALLBACK_BASE_URL` | ✓ | | | | | — | 016: cómo llega ONLYOFFICE al `api` (contenido y aviso de guardado); en local `http://host.docker.internal:3000`. Opcional, como las anteriores |
| `EDITING_MAX_DOC_BYTES` | ✓ | | | | | `52428800` | 016 RN-10: tope editable (50 MB a validar en staging); por encima, solo lectura |
| `INDEXING_MAX_ATTEMPTS` | ✓ | ✓ | | | | `3` | 019 RN-6: intentos de un trabajo de indexación, con espera creciente, antes de `fallido`. Una sola definición: el `api` encola y el `worker` decide cuándo se agotaron |
| `RATE_LIMIT_INDEX_RETRY_PER_MINUTE` | ✓ | | | | | `10` | 019 CA-13: «Reintentar» la indexación, por usuario |
| `INDEXING_MAX_FILE_BYTES` | | ✓ | | | | `52428800` | 019 RN-7 (DF-37): tope indexable (50 MiB, no varía por plan); por encima, `no_indexable/demasiado_grande` |
| `INDEX_RECONCILE_INTERVAL_MINUTES` / `INDEX_RECONCILE_BATCH_SIZE` | | ✓ | | | | `1440` / `100` | 019 RN-12: conciliación que encola archivos sin indexar o atascados; lote 1–1000 |
| `GHOSTSCRIPT_BIN` | | ✓ | | | | `gs` | 019 D-1: ejecutable de Ghostscript para el texto de los PDF; en Windows, `gswin64c` |
| `GEMINI_API_KEY` | | ✓ | | | ✓ | — | 019 RN-9: clave de embeddings; solo la valida y consume el general, nunca el navegador. `env_file` no limita su inyección física. Sin ella: `fallido/proveedor_no_disponible` (RNF-09) |
| `GEMINI_EMBEDDING_MODEL` | | ✓ | | | | `gemini-embedding-001` | 019 (ADR-0007): modelo de embeddings, vectorizado a 768 dimensiones (ADR-0003) |
| `OPTIMIZER_MAX_FILE_BYTES` | ✓ | | | | | `40000000` | 021 RN-8, CA-5: tope de bytes optimizable (40 MB, medido en el spike de ADR-0037, plan §6 B); por encima, `no_disponible(tamano)` |
| `OPTIMIZER_MAX_ATTEMPTS` | ✓ | | | | | `3` | Solo el `api`: intentos al encolar y caducidad; el consumidor usa `job.opts.attempts` |
| `OPTIMIZER_TIMEOUT_MS` | ✓ | | | | | `100000` | Definición compartida por el `api` (caducidad: intentos × 3 × tiempo + 5 min) y `worker-optimizer` (sharp); no la valida el general |
| `OPTIMIZER_POLL_INTERVAL_MS` | ✓ | | | | | `3000` | 021 RN-10: cada cuánto la ficha vuelve a consultar una optimización en curso (`pollAfterMs`) |
| `RATE_LIMIT_OPTIMIZER_PER_MINUTE` | ✓ | | | | | `10` | 021 RNF-07: calcular y optimizar, por cuenta |
| `OPTIMIZER_MAX_PIXELS` | | | | | | `36000000` | Solo valida `worker-optimizer`: píxeles decodificados; por encima, `no_disponible(pixeles)` (021 RN-8, CA-5) |
| `OPTIMIZER_MIN_SAVED_PERCENT` / `OPTIMIZER_MIN_SAVED_BYTES` | | | | | | `20` / `1000000` | Solo valida `worker-optimizer`: se exigen ambos umbrales; porcentaje 1–99 (021 RN-2) |
| `OPTIMIZER_JPEG_QUALITY` | | | | | | `80` | Solo valida `worker-optimizer`: calidad JPEG con mozjpeg, 1–100 (ADR-0037) |
| `API_MEM_LIMIT`, `WORKER_MEM_LIMIT`, `WORKER_OPTIMIZER_MEM_LIMIT` | | | | ✓ | | `768m` | Staging; en demos con ONLYOFFICE solo `API_MEM_LIMIT` baja a `512m` (R-6). Los dos `worker` quedan en 768m con `memswap_limit` igual (sin swap del contenedor; ADR-0038) |
| `MALLOC_ARENA_MAX` | | | | | | `2` | Runtime glibc de ambos workers, no Zod: fijada en la imagen (ADR-0038); limita arenas y memoria retenida |
| `COMPOSE_FILE` | | | | ✓ | | — | Solo staging: `compose.yml:compose.staging.yml` |

Cada raíz publica en `ENV` el objeto que validó con su schema; `SharedModule` consume solo la base común y
`MinioConfigModule` las cinco claves de MinIO. Ambos workers necesitan MinIO; el general no valida ninguna clave `OPTIMIZER_*`.

### Entorno del optimizador: catálogo, inyección, schema y consumo (PD-140)

- **A. Catálogo:** `.env.example` reúne las variables de todos los procesos; CA-19 de 000 exige completitud del catálogo,
  no entregar todas las claves a cada proceso. No hay enmienda ni excepción de CA.
- **B. Inyección física mínima implementada y aprobada:** Matul/Adrián aprobó la parte 4 el 2026-10-28 después de `7f9285ff`.
  `worker-optimizer` declara solo `environment`, sin `env_file`; recibe las 17 claves del schema. PD-140 está cerrado.
  Los `ENV` de imagen (p. ej. `MALLOC_ARENA_MAX` y `GHOSTSCRIPT_BIN`) y las variables del sistema no son claves del servicio.
- **C. Schema mínimo implementado:** `workerOptimizerEnvSchema` declara exactamente las 17 claves de la tabla siguiente.
- **D. Consumo real:** `workerBaseImports` compone la base común y MinIO; `OptimizerWorkerModule` transforma solo
  los parámetros de imagen y ahorro. Los intentos no forman parte de este schema: vienen guardados en cada job por la API.

Compose construye `DATABASE_URL` con rol `nimbo_app`, host `postgres:5432`, `POSTGRES_DB` y la contraseña de aplicación
`NIMBO_APP_DB_PASSWORD`: estos auxiliares de interpolación no se inyectan como claves del optimizador. Redis apunta a
`redis:6379` y MinIO a `http://minio:9000`, con `MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY` de aplicación, sin credenciales root.
El base y el perfil local comparten esa red. No existe aún `compose.staging.yml`; cuando se añada, la prueba también
resolverá ese override. `scripts/optimizer-compose.spec.ts` compara los nombres efectivos con el schema, no con otra lista manual.

| Variable validada | Módulo → consumidor |
|---|---|
| `NODE_ENV` | Nest/Express → `defaultConfiguration` de Express (modo del servidor) |
| `APP_ENV` | Bootstrap → `worker.started.appEnv` |
| `APP_VERSION` | Bootstrap → `worker.started.version` |
| `LOG_LEVEL` | `SharedModule` → logger Pino |
| `DATABASE_URL` | `SharedModule` → `buildDataSourceOptions` → TypeORM |
| `REDIS_URL` | `SharedModule` y salud → BullMQ, cliente Redis y `RedisHealthIndicator` |
| `MINIO_ENDPOINT` | `MinioConfigModule` → provider de objetos → cliente S3 interno |
| `MINIO_ACCESS_KEY` | `MinioConfigModule` → provider de objetos → credenciales S3 |
| `MINIO_SECRET_KEY` | `MinioConfigModule` → provider de objetos → credenciales S3 |
| `MINIO_BUCKET` | `MinioConfigModule` → provider de objetos → bucket del adaptador |
| `MINIO_REGION` | `MinioConfigModule` → provider de objetos → región S3 |
| `OPTIMIZER_TIMEOUT_MS` | `OptimizerWorkerModule` → `ImageOptimizer` e `ImageIntegrityValidator` |
| `OPTIMIZER_MAX_PIXELS` | `OptimizerWorkerModule` → runner, optimizador y validador |
| `OPTIMIZER_MIN_SAVED_PERCENT` | `OptimizerWorkerModule` → runner → `SavingsEstimate` |
| `OPTIMIZER_MIN_SAVED_BYTES` | `OptimizerWorkerModule` → runner → `SavingsEstimate` |
| `OPTIMIZER_JPEG_QUALITY` | `OptimizerWorkerModule` → `ImageOptimizer` → mozjpeg |
| `WORKER_OPTIMIZER_PORT` | Entry point → `app.listen`; healthcheck → puerto de la sonda |

## 3. Compose: base y diferencias por ambiente (CA-3)

`compose.yml` es el **mismo archivo base** en local y staging. Las diferencias viven solo en los overrides y se
limitan a lo que CA-3 permite:

| Aspecto | `compose.override.yml` (local) | `compose.staging.yml` (staging, PR-5) |
|---|---|---|
| Apps | Corren en el host con `pnpm dev` (R-4); `build` bajo el perfil opcional `apps` | Imágenes precompiladas `ghcr.io/afmatul/nimbo-*:${IMAGE_TAG}`; sin `build` |
| Puertos publicados | Postgres `5432`, Redis `6379`, MinIO `9000`/`9001`, Traefik `8080`, Mailpit `8025`/`1025` | Solo Traefik `80`/`443`; Postgres/Redis/MinIO sin `ports:` |
| Traefik | `traefik.local.yml` sin TLS; `local-routes.yml` enruta `/` → host:3002 y `/api` → host:3000; `/docs` por etiquetas; MinIO por el puerto 9000 (sin router `/s3`: el `stripprefix` rompe la firma, 005 R-6) | `traefik.staging.yml` con Let's Encrypt; enrutadores por `Host()`; `s3.staging` definido pero deshabilitado hasta 005 |
| Volúmenes | Nombrados (`postgres_data`, `minio_data`, …) | Nombrados con ruta persistente del Droplet |
| Extras | Mailpit (correo de desarrollo) | Cabeceras seguras (`secure-headers`), límites de memoria |

Imágenes (idénticas en compose y en Testcontainers): `pgvector/pgvector:pg17`, `redis:7-alpine`,
`pgsty/silo` + `pgsty/mc` en `RELEASE.2026-09-16T00-00-00Z` (fork compatible de MinIO; Docker Hub dejó de servir
`minio/minio` y Quay, los tags fijados, ADR-0025), `traefik:v3`,
`axllent/mailpit:v1.31.3` (compose local y Testcontainers),
`onlyoffice/documentserver` (perfil `onlyoffice`, apagado por defecto).

## 3b. Correo (spec 001, ADR-0018)

- **Local**: Mailpit recibe todo el correo. Bandeja web en <http://localhost:8025>; SMTP en `localhost:1025`, sin TLS
  (`SMTP_TLS=none`). Con el perfil `apps`, `compose.override.yml` le pasa al `worker` `SMTP_HOST=mailpit` y
  `SMTP_PORT=1025`, porque dentro de la red de compose Mailpit no está en `localhost`.
- **Por proceso**: el `api` solo encola en la cola `mail` y valida `WEB_PUBLIC_URL` y `CORS_ORIGIN`; el `worker`
  entrega por SMTP y valida `SMTP_*` y `MAIL_FROM`. `SMTP_PASSWORD` es secreta, se declara solo en el esquema del
  `worker`, se redacta en las bitácoras y no la consumen el `api` ni el optimizador. El optimizador tampoco la recibe;
  el `api` conserva su inyección compartida por `env_file` (§2).
- **Staging (al montarlo, D-12)**: SMTP de Resend por protocolo, no por su SDK: `SMTP_HOST=smtp.resend.com`,
  `SMTP_PORT=465`, `SMTP_TLS=implicit`, `SMTP_USER=resend` y la clave de API de Resend como `SMTP_PASSWORD`, con SPF y
  DKIM de `nimbo.me` verificados. La clave vive solo en GitHub Environments y en el `.env` del Droplet.
- **Degradación**: un SMTP caído no afecta la salud del `worker` ni las respuestas del `api`; la cola reintenta 5 veces
  (~2,5 min) y al agotar registra `mail.failed` (ver `apps/api/src/modules/notifications/README.md`).

## 3c. Ghostscript (spec 019, D-1, ADR-0033)

El `worker` lee el texto de los PDF con Ghostscript (`txtwrite`) en un proceso aparte, sin shell, con tiempo límite y en
un directorio temporal propio que se borra al terminar. El `api` no lo necesita. Sin Ghostscript, la indexación de los
PDF falla y se reintenta; el resto de los tipos y del sistema siguen igual.

- **Linux (CI, Debian/Ubuntu)**: `sudo apt-get install -y ghostscript`; el binario es `gs` (valor por defecto de
  `GHOSTSCRIPT_BIN`). CI lo instala antes de `pnpm test:int` (`.github/workflows/ci.yml`).
- **Imagen `nimbo-worker`** (ADR-0038, PD-128): `apps/worker/Dockerfile` lo instala por `apt` sobre `node:22.23.3-trixie-slim` (Debian 13: la versión de Trixie al
  construir la imagen, con parches de seguridad que Debian 12 no tiene; el build comprueba `gs --version`)
  y fija `GHOSTSCRIPT_BIN=gs`. La base Trixie, sharp 0.35.5/libvips 8.18.7, Ghostscript de Trixie y arenas 2 están
  aceptados por Matul/Adrián desde el 2026-10-28, después de `7f9285ff`; C + glibc mantiene su aprobación del 2026-10-27.
  Ghostscript se incluye en la imagen compartida por 019/futuro 021b: no participa en 021 JPEG/PNG.
- **macOS**: `brew install ghostscript`; también queda como `gs`.
- **Windows**: instalar la versión de 64 bits de <https://ghostscript.com/releases/gsdnld.html> y poner en `.env` la ruta
  completa de `gswin64c.exe` (la de consola, no `gswin64.exe`), p. ej.
  `GHOSTSCRIPT_BIN=C:\Program Files\gs\gs10.08.0\bin\gswin64c.exe`, o agregar esa carpeta `bin` al `PATH` y usar
  `GHOSTSCRIPT_BIN=gswin64c`.
- **Comprobar**: `gs --version` (o `gswin64c --version`) imprime la versión.
- **Pruebas**: `test/int/intelligence/pdf-extraction.int-spec.ts` usa `GHOSTSCRIPT_BIN` del entorno de la terminal (las
  pruebas no leen `.env`; si falta, prueba `gs` o, en Windows, `gswin64c`). En CI es obligatoria; en una máquina sin
  Ghostscript se omite y lo dice el resumen de Jest.
- **Imagen del `worker`**: existe desde 021 T-10 (PD-128 cerrado); CI todavía no la construye (PD-142).

## 4. Arranque y salud

### Requisito de arranque

`api` y `worker` validan el entorno **antes** de crear la aplicación (CA-18): si falta o es inválida una variable,
escriben una sola línea JSON `{"event":"config.invalid","issues":[…]}` en stderr y salen con código `1`, sin abrir
puertos. Las issues nombran la variable y el motivo, nunca el valor (`` `DATABASE_URL` es obligatoria ``,
`` `PORT` debe ser un entero entre 1 y 65535 ``). `web` hace lo mismo en `instrumentation.ts`.

Con el entorno válido, el proceso **no termina de arrancar** hasta que Postgres y Redis respondan: TypeORM reintenta
`retryAttempts: 10` cada `retryDelay: 3000` ms (30 s) y luego falla; compose lo garantiza con
`depends_on: condition: service_healthy` y `restart: unless-stopped`.

### Roles de base de datos (003, ADR-0005)

Hay dos roles. El **dueño** de las tablas (`POSTGRES_USER`, `DATABASE_MIGRATION_URL`) solo migra. **`nimbo_app`**
(`DATABASE_URL`) es el rol con el que corren `api` y `worker`: sin superusuario, sin `BYPASSRLS`, sin `CREATE` en
`public` y sin ser dueño de ninguna tabla, para que las políticas de RLS (desde 005) sí lo frenen. Sus permisos los da
la migración `conceder-permisos-nimbo-app` (`usuario` y `token_cuenta` sin `DELETE`, `migracion` sin permisos; las
tablas nuevas reciben `SELECT/INSERT/UPDATE/DELETE` por privilegios por defecto).

**Un solo rol dueño en todos los ambientes (005, ADR-0021).** `archivo`, `version_archivo` y `carga` tienen RLS
forzada. La función `carga_expiradas` (`SECURITY DEFINER`, la usa el barrido de cargas vencidas del `worker`) se
apoya en la política `carga_mantenimiento`, creada `TO CURRENT_USER`: queda atada al rol que corrió la migración.
Por eso todas las migraciones corren siempre con el mismo `DATABASE_MIGRATION_URL`; cambiar el rol dueño exige una
migración nueva que recree esa política. Con un dueño superusuario (local y pruebas `int`) la política es inerte.

Al arrancar, `DatabaseRoleCheck` consulta el rol de la conexión. Si es superusuario, tiene `BYPASSRLS` o es dueño de
alguna tabla de `public` (también por pertenencia a otro rol), registra `db.role_rejected` (`fatal`, solo tres
booleanos, sin URL) y el proceso termina antes de abrir el puerto: «La API debe conectarse como nimbo_app; revisa
DATABASE_URL y ejecuta pnpm db:app-role». Aplica en todos los ambientes, incluidas las pruebas.

El rol lo crea `infra/postgres/init/10-nimbo-app.sh` (idempotente), no una migración, porque su contraseña es un
secreto:

- **Volumen nuevo**: el entrypoint de Postgres ejecuta el script al inicializar (compose lo monta en
  `/docker-entrypoint-initdb.d/`).
- **Volumen existente** (el script de inicio no se vuelve a ejecutar) o cambio de contraseña:
  1. agregar `NIMBO_APP_DB_PASSWORD`, `DATABASE_URL` de `nimbo_app` y `DATABASE_MIGRATION_URL` al `.env` (ver
     `.env.example`);
  2. `pnpm db:app-role` (con el servicio `postgres` en marcha; se puede repetir sin error);
  3. `pnpm --filter api migration:run`.
- **Staging**: el paso de despliegue ejecuta el script de rol y luego las migraciones con `DATABASE_MIGRATION_URL`.
- **Pruebas**: Testcontainers monta el mismo script; el arnés migra con el dueño y conecta la app como `nimbo_app`.

### `live` vs `ready`

| Endpoint | Consulta dependencias | Significado | Respuesta |
|---|---|---|---|
| `GET /api/v1/health/live` (api), `GET /health/live` (worker) | No | El proceso ya arrancado sigue vivo, aunque sus dependencias caigan después | `200 { "status": "ok" }` en < 100 ms (CA-20) |
| `GET /api/v1/health/ready` (api) | Postgres (`SELECT 1`), Redis (`PING`), MinIO (`HeadBucket`) | Puede atender tráfico | `200 { "status": "ok", "checks": { "postgres": "up", "redis": "up", "minio": "up" } }` en < 2 s; `503` con el mismo cuerpo y `"down"` en lo que falle (CA-21, CA-22) |
| `GET /health/ready` (worker) | Solo Redis | Puede consumir colas | `200`/`503` con `checks: { "redis": … }` |

Cada indicador tiene 1,5 s de límite; un rechazo o una espera excesiva cuenta como `down`. El cuerpo nunca revela
hosts, puertos, credenciales ni mensajes de error; el detalle queda en la bitácora `health.ready` (solo cuando hay
`error`). Ambos endpoints son públicos y sin autenticación (RN-5).

### Salud del worker

El worker escucha en `WORKER_PORT` (3001) **sin prefijo `/api/v1`** porque no es API pública y ese puerto
**nunca se publica** en ningún compose (CA-23). El `HEALTHCHECK` de la imagen ejecuta `node dist/healthcheck.js`,
que consulta `http://127.0.0.1:${WORKER_PORT}/health/ready` y sale con `1` si no responde `200`; con
`--interval=20s --timeout=5s --retries=2 --start-period=30s` el contenedor pasa a no sano en menos de 60 s.

`worker-optimizer` (ADR-0038) usa la misma imagen con `node dist/worker-optimizer.main.js` y escucha en
`WORKER_OPTIMIZER_PORT` (3003), tampoco publicado. Compose sobrescribe su `healthcheck` con
`node dist/healthcheck.js WORKER_OPTIMIZER_PORT` (el argumento es el nombre de la variable que lleva el puerto). En
local, `pnpm dev` arranca los dos procesos (`apps/worker`: `dev:worker` y `dev:worker-optimizer` de `api`).
`worker-optimizer` valida solo su entorno (`workerOptimizerEnvSchema`, PD-140): un SMTP o un Gemini mal configurados no
le impiden arrancar.

Cierre: los dos procesos atienden SIGTERM; `WorkerDrainModule` cierra cada `Worker` de BullMQ esperando su trabajo activo
antes de que cierren la base de datos y Redis, y compose usa `init: true`; `stop_grace_period` es 90 s en el `worker` general y 330 s en `worker-optimizer`. Un arranque fallido
(base de datos o Redis inalcanzables) escribe una sola línea `{"event":"worker.start_failed","process":…,"errorClass":…}`
en stderr, sin el mensaje del error, y sale con `1`.

## 5. Bitácoras

JSON por línea (Pino). Toda línea lleva `correlationId` (de la cabecera `x-correlation-id` o generado) y, en el
worker, `jobId`. Campos redactados en cualquier nivel (`[REDACTED]`): `password`, `passwordHash`, `token`,
`accessToken`, `refreshToken`, `authorization`, `cookie`, `secret`, `apiKey`, `fileName`, `nombre`, `content`,
`prompt`, los de 001 (`email`, `correo`, `fullName`, `to`, `html`, `text`) y las claves de `SECRET_KEYS`. Eventos de 000: `api.started`, `worker.started`, `worker.start_failed` (021), `config.invalid`,
`http.request`, `http.domain_error`, `http.unhandled_error`, `health.ready`, `queue.enqueued`, `job.started`,
`job.completed`, `migration.run`, `migration.revert`. Eventos de correo (001): `mail.enqueued`, `mail.sent`,
`mail.retry_scheduled`, `mail.failed` y `mail.duplicate_skipped`, solo con `tag`, `recipientId`, `jobId`,
`attemptsMade` y códigos de error; nunca el destinatario, el asunto, el cuerpo ni el mensaje del error. De 003:
`db.role_rejected`. `DATABASE_URL` y `DATABASE_MIGRATION_URL` se redactan como URL de conexión.
