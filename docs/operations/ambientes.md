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

Leyenda: **api**/**worker**/**web** = el proceso la valida al arrancar; **compose** = solo la usa `compose*.yml`.
Secreto = nunca en el repositorio, vacío en `.env.example` de staging, redactado en bitácoras (`SECRET_KEYS`).

| Variable | api | worker | web | compose | Secreto | Default | Notas |
|---|---|---|---|---|---|---|---|
| `NODE_ENV` | ✓ | ✓ | (Next) | | | — | `development` \| `test` \| `production` |
| `APP_ENV` | ✓ | ✓ | ✓ | | | — | `local` \| `test` \| `staging` \| `production` |
| `APP_VERSION` | ✓ | ✓ | | ✓ | | `dev` | `sha-<short>` en imágenes publicadas; cabecera `x-nimbo-version` (CA-31) |
| `PORT` | ✓ | | ✓ | | | api `3000`, web `3002` | Traefik local enruta `/api` → 3000 y `/` → 3002 |
| `WORKER_PORT` | ✓ | ✓ | | | | `3001` | Salud interna del worker; **nunca** en `ports:` (CA-23) |
| `LOG_LEVEL` | ✓ | ✓ | | | | — | `trace` … `fatal` |
| `DATABASE_URL` | ✓ | ✓ | | | (contiene contraseña) | — | Postgres con pgvector, **como `nimbo_app`** (003): local `postgres://nimbo_app:nimbo_app@localhost:5432/nimbo`. Con el dueño o un superusuario la app no arranca (`db.role_rejected`, §4) |
| `DATABASE_MIGRATION_URL` | | | | | (contiene contraseña) | — | Solo migraciones (`migrationEnvSchema`: `data-source.cli.ts`, `migrate.ts`); dueño de las tablas, local `postgres://nimbo:nimbo@localhost:5432/nimbo`. No cae a `DATABASE_URL` si falta (`config.invalid`). En staging, solo en el entorno del paso de migración (PD-43, provisional) |
| `NIMBO_APP_DB_PASSWORD` | | | | ✓ | ✓ | — | Contraseña de `nimbo_app` que fija `infra/postgres/init/10-nimbo-app.sh`; debe coincidir con `DATABASE_URL`. No la lee ninguna app |
| `REDIS_URL` | ✓ | ✓ | | | | — | BullMQ y caché |
| `MINIO_ENDPOINT` | ✓ | ✓ | | | | — | API S3 (puerto 9000); la consola 9001 no la usa la app |
| `MINIO_ACCESS_KEY` | ✓ | ✓ | | | ✓ | — | Una sola definición compartida por `api` y `worker` (005); el worker aborta partes y borra objetos |
| `MINIO_SECRET_KEY` | ✓ | ✓ | | | ✓ | — | Ídem |
| `MINIO_BUCKET` | ✓ | ✓ | | ✓ | | `nimbo` | Creado con versionado por `infra/minio/init.sh` |
| `MINIO_REGION` | ✓ | ✓ | | | | `us-east-1` | Nominal, lo exige el SDK |
| `MINIO_PUBLIC_ENDPOINT` | ✓ | | | | | `http://localhost:9000` | Host contra el que el `api` firma URLs (005); staging `https://s3.staging.nimbo.me`. Nunca un prefijo de ruta |
| `UPLOAD_PART_SIZE_BYTES` / `UPLOAD_MULTIPART_THRESHOLD_BYTES` | ✓ | | | | | 8 MiB / 16 MiB | Parte ≥ 5 MiB; umbral ≥ parte (005 D-1) |
| `UPLOAD_URL_TTL_SECONDS` / `UPLOAD_COMPLETE_TIMEOUT_SECONDS` | ✓ | | | | | `3600` / `900` | TTL entre 60 y 86400 s |
| `RATE_LIMIT_UPLOAD_INIT_PER_MINUTE` / `RATE_LIMIT_DOWNLOAD_URL_PER_MINUTE` | ✓ | | | | | `300` / `120` | Por usuario (005 RN-16) |
| `UPLOAD_CLEANUP_INTERVAL_MINUTES` / `UPLOAD_CLEANUP_BATCH_SIZE` | | ✓ | | | | `10` / `100` | Barrido de cargas vencidas; lote 1–1000 |
| `WEB_PUBLIC_URL` | ✓ | | | | | — | Base de los enlaces de los correos (`/verificar-correo#token=…`); `https` obligatorio en staging y producción (001 CA-20) |
| `CORS_ORIGIN` | ✓ | | | ✓ | | — | Orígenes permitidos, separados por comas (local: `http://localhost,http://localhost:3002`); compose los pasa también a `MINIO_API_CORS_ALLOW_ORIGIN` (005, nunca `*`) |
| `SMTP_HOST` | | ✓ | | | | — | Local: `localhost` (Mailpit); perfil `apps`: `mailpit`; staging: `smtp.resend.com` |
| `SMTP_PORT` | | ✓ | | | | — | Mailpit `1025`; Resend `465` |
| `SMTP_TLS` | | ✓ | | | | — | `none` | `starttls` | `implicit`; `none` prohibido en staging y producción |
| `SMTP_USER` | | ✓ | | | | — | Opcional; obligatoria si hay `SMTP_PASSWORD` (Resend: `resend`) |
| `SMTP_PASSWORD` | | ✓ | | | ✓ | — | **Solo** el worker la declara y la recibe; el `api` no tiene credenciales de correo (ADR-0018) |
| `MAIL_FROM` | | ✓ | | | | — | `Nimbo <no-responder@nimbo.me>` |
| `API_INTERNAL_URL` | | | ✓ | | | — | `web` llama a la API solo desde el servidor (sin `NEXT_PUBLIC_`) |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | | | | ✓ | contraseña | — | Dueño de las tablas; deben coincidir con `DATABASE_MIGRATION_URL` |
| `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | | | | ✓ | contraseña | — | En local coinciden con `MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY` |
| `IMAGE_TAG`, `DOMAIN`, `WEB_HOST`, `API_HOST`, `DOCS_HOST`, `S3_HOST` | | | | ✓ | | `latest`, … | Solo staging (Traefik por host) |
| `LETSENCRYPT_EMAIL`, `ACME_CA_SERVER` | | | | ✓ | | — | TLS en staging |
| `ONLYOFFICE_JWT_SECRET` | | | | ✓ | ✓ | — | Perfil `onlyoffice`; `api` lo valida en 016 |
| `API_MEM_LIMIT`, `WORKER_MEM_LIMIT` | | | | ✓ | | `768m` | Staging; bajar a `512m` en demos con ONLYOFFICE (R-6) |
| `COMPOSE_FILE` | | | | ✓ | | — | Solo staging: `compose.yml:compose.staging.yml` |

El worker **no** exige `MINIO_*` en 000 (`workerEnvSchema`); cuando los procesadores de 019/021 necesiten MinIO se
añaden al esquema del worker. `SharedModule` provee bajo `ENV` el contrato más completo que el entorno satisface.

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
  `worker`, se redacta en las bitácoras de ambos procesos y nunca se le entrega al `api`.
- **Staging (al montarlo, D-12)**: SMTP de Resend por protocolo, no por su SDK: `SMTP_HOST=smtp.resend.com`,
  `SMTP_PORT=465`, `SMTP_TLS=implicit`, `SMTP_USER=resend` y la clave de API de Resend como `SMTP_PASSWORD`, con SPF y
  DKIM de `nimbo.me` verificados. La clave vive solo en GitHub Environments y en el `.env` del Droplet.
- **Degradación**: un SMTP caído no afecta la salud del `worker` ni las respuestas del `api`; la cola reintenta 5 veces
  (~2,5 min) y al agotar registra `mail.failed` (ver `apps/api/src/modules/notifications/README.md`).

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

## 5. Bitácoras

JSON por línea (Pino). Toda línea lleva `correlationId` (de la cabecera `x-correlation-id` o generado) y, en el
worker, `jobId`. Campos redactados en cualquier nivel (`[REDACTED]`): `password`, `passwordHash`, `token`,
`accessToken`, `refreshToken`, `authorization`, `cookie`, `secret`, `apiKey`, `fileName`, `nombre`, `content`,
`prompt`, los de 001 (`email`, `correo`, `fullName`, `to`, `html`, `text`) y las claves de `SECRET_KEYS`. Eventos de 000: `api.started`, `worker.started`, `config.invalid`,
`http.request`, `http.domain_error`, `http.unhandled_error`, `health.ready`, `queue.enqueued`, `job.started`,
`job.completed`, `migration.run`, `migration.revert`. Eventos de correo (001): `mail.enqueued`, `mail.sent`,
`mail.retry_scheduled`, `mail.failed` y `mail.duplicate_skipped`, solo con `tag`, `recipientId`, `jobId`,
`attemptsMade` y códigos de error; nunca el destinatario, el asunto, el cuerpo ni el mensaje del error. De 003:
`db.role_rejected`. `DATABASE_URL` y `DATABASE_MIGRATION_URL` se redactan como URL de conexión.
