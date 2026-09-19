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
| `DATABASE_URL` | ✓ | ✓ | | | (contiene contraseña) | — | Postgres con pgvector |
| `REDIS_URL` | ✓ | ✓ | | | | — | BullMQ y caché |
| `MINIO_ENDPOINT` | ✓ | | | | | — | API S3 (puerto 9000); la consola 9001 no la usa la app |
| `MINIO_ACCESS_KEY` | ✓ | | | | ✓ | — | |
| `MINIO_SECRET_KEY` | ✓ | | | | ✓ | — | |
| `MINIO_BUCKET` | ✓ | | | ✓ | | `nimbo` | Creado con versionado por `infra/minio/init.sh` |
| `MINIO_REGION` | ✓ | | | | | `us-east-1` | Nominal, lo exige el SDK |
| `API_INTERNAL_URL` | | | ✓ | | | — | `web` llama a la API solo desde el servidor (sin `NEXT_PUBLIC_`) |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | | | | ✓ | contraseña | — | Deben coincidir con `DATABASE_URL` |
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
| Traefik | `traefik.local.yml` sin TLS; `local-routes.yml` enruta `/` → host:3002 y `/api` → host:3000; `/docs` y `/s3` por etiquetas | `traefik.staging.yml` con Let's Encrypt; enrutadores por `Host()`; `s3.staging` definido pero deshabilitado hasta 005 |
| Volúmenes | Nombrados (`postgres_data`, `minio_data`, …) | Nombrados con ruta persistente del Droplet |
| Extras | Mailpit (correo de desarrollo) | Cabeceras seguras (`secure-headers`), límites de memoria |

Imágenes (idénticas en compose y en Testcontainers): `pgvector/pgvector:pg17`, `redis:7-alpine`,
`quay.io/minio/minio` + `quay.io/minio/mc` (Docker Hub dejó de servir `minio/minio`), `traefik:v3`,
`onlyoffice/documentserver` (perfil `onlyoffice`, apagado por defecto).

## 4. Arranque y salud

### Requisito de arranque

`api` y `worker` validan el entorno **antes** de crear la aplicación (CA-18): si falta o es inválida una variable,
escriben una sola línea JSON `{"event":"config.invalid","issues":[…]}` en stderr y salen con código `1`, sin abrir
puertos. Las issues nombran la variable y el motivo, nunca el valor (`` `DATABASE_URL` es obligatoria ``,
`` `PORT` debe ser un entero entre 1 y 65535 ``). `web` hace lo mismo en `instrumentation.ts`.

Con el entorno válido, el proceso **no termina de arrancar** hasta que Postgres y Redis respondan: TypeORM reintenta
`retryAttempts: 10` cada `retryDelay: 3000` ms (30 s) y luego falla; compose lo garantiza con
`depends_on: condition: service_healthy` y `restart: unless-stopped`.

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
`prompt` y las claves de `SECRET_KEYS`. Eventos de 000: `api.started`, `worker.started`, `config.invalid`,
`http.request`, `http.domain_error`, `http.unhandled_error`, `health.ready`, `queue.enqueued`, `job.started`,
`job.completed`, `migration.run`, `migration.revert`.
