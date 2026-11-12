# Despliegue en Deploya

> Demo pública de Nimbo en [Deploya](https://deploya.larasolutions.dev): un contenedor por proyecto, construido con
> `docker build -f <rutaDockerfile> .` desde la raíz del repo y publicado en `https://<subdominio>.deploya.larasolutions.dev`.
> No reemplaza a staging (`ambientes.md`): no hay ONLYOFFICE, Prometheus, Grafana ni respaldos.

## 1. Cómo encaja Nimbo en el contrato de Deploya

| Deploya | Nimbo |
|---|---|
| Un contenedor por proyecto, en su propia red | 4 proyectos: `nimbo-api`, `nimbo-worker`, `nimbo-optimizer`, `nimbo` (web) |
| Inyecta `PORT` y da por sana la app si `GET` responde < 500 | Cada imagen escucha en el puerto de su proyecto (tabla del §3) |
| `--cap-drop ALL`, `no-new-privileges`, sin volúmenes | Las imágenes corren como `node`, sin escribir en disco salvo la caché de Next |
| Pro: 1 GB de memoria y 1 vCPU | Medido en la §6 |
| `comandoInicio` reemplaza solo el `CMD`, nunca el `ENTRYPOINT` | El optimizer usa la imagen del worker con otro `CMD` |
| Recursos de datos (Postgres, Redis, S3) que se comparten entre proyectos | Los crea `nimbo-api` y los comparte con worker y optimizer |
| Variables inyectadas (`DATABASE_URL`, `REDIS_URL`, `S3_*`, `DEPLOYA_*`); las del usuario ganan | El entrypoint las traduce a las de Nimbo (§2) |

## 2. El entrypoint (`apps/api/deploya-entrypoint.sh`)

Lo usan las imágenes del api y del worker. Sin ninguna variable `DEPLOYA_*` (compose, staging) solo ejecuta el comando.
Dentro de Deploya:

1. `node dist/scripts/print-deploya-env.js` traduce, sin pisar lo que defina el usuario:
   - `S3_*` → `MINIO_ENDPOINT`, `MINIO_PUBLIC_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`, `MINIO_REGION`;
   - `DEPLOYA_POSTGRES_URL` (el dueño `deploya`) → `DATABASE_MIGRATION_URL`;
   - `DATABASE_URL` inyectada (el dueño) → la misma URL con el rol `nimbo_app` y `NIMBO_APP_DB_PASSWORD`. Con el dueño
     la app no arranca (`DatabaseRoleCheck`, ADR-0005).

   Imprime líneas `export CLAVE='valor'` con comillas simples de `sh`: una contraseña con `'`, `$`, comillas o
   espacios llega intacta al `eval` (`deploya-env.spec.ts`). En stderr deja solo los **nombres** definidos.
2. Solo en el api (`--migrate`): `ensure-app-role.js` crea o actualiza `nimbo_app` sin privilegios (lo mismo que
   `infra/postgres/init/10-nimbo-app.sh`) y `migrate.js run` aplica las migraciones como el dueño. Si algo falla, el
   contenedor sale y Deploya lo marca caído.
3. `exec` del `CMD` (o del `comandoInicio`).

`NIMBO_APP_DB_PASSWORD` es la única contraseña que se inventa: va igual en api, worker y optimizer.

## 3. Pasos

### 3.1 Antes de empezar

1. Hacer público el repositorio `afmatul/Nimbo` (o dar acceso a Deploya), en la rama que se va a desplegar.
2. Generar los secretos: `openssl rand -base64 48 | tr -d '\n=+/'` para `JWT_ACCESS_SECRET` (≥ 43 caracteres) y
   `NIMBO_APP_DB_PASSWORD`.
3. Tener a mano un SMTP con TLS (el worker lo exige en `APP_ENV=staging`) y, si se quiere el agente, una
   `GEMINI_API_KEY`.

### 3.2 Crear los proyectos (plan Pro)

| Proyecto | Dockerfile | Puerto | Comando de inicio | Plantilla |
|---|---|---|---|---|
| `nimbo-api` | `apps/api/Dockerfile` | 3000 | — | `infra/deploya/api.env` |
| `nimbo-worker` | `apps/worker/Dockerfile` | 3001 | — | `infra/deploya/worker.env` |
| `nimbo-optimizer` | `apps/worker/Dockerfile` | 3003 | `node dist/worker-optimizer.main.js` | `infra/deploya/optimizer.env` |
| `nimbo` (web) | `apps/web/Dockerfile` | 3002 | — | `infra/deploya/web.env` |

Los subdominios son los de las plantillas: la web en `nimbo.deploya.larasolutions.dev` y el api en
`nimbo-api.deploya.larasolutions.dev`. Si cambian, se corrigen `WEB_PUBLIC_URL` y `CORS_ORIGIN` (api) y
`API_INTERNAL_URL` y `API_PUBLIC_URL` (web).

### 3.3 Recursos de datos

En la pestaña **Datos** de `nimbo-api`:

1. Crear **postgres** (pgvector), **redis** y **s3**. Deploya crea el bucket `app` con versionado.
2. Compartir los tres con `nimbo-worker` y `nimbo-optimizer`. La web no usa ninguno.
3. Opcional: la regla de ciclo de vida de `infra/minio/init.sh` (versiones no vigentes, 7 días) con
   `mc ilm import <alias>/app` contra el endpoint público del s3. Sin ella, las versiones viejas no expiran.

### 3.4 Variables

Pegar cada plantilla en su proyecto, reemplazando los `<…>`. Son solo las variables obligatorias de cada esquema
zod (`env.schema.ts`, `apps/web/src/env.ts`); el resto toma su valor por omisión. No hay que definir `DATABASE_URL`,
`REDIS_URL`, `S3_*` ni `MINIO_*`: las pone Deploya y las traduce el entrypoint. Cualquier variable de `.env.example`
se puede agregar después (máximo 150 por proyecto).

### 3.5 Desplegar en orden

1. **`nimbo-api`**: crea `nimbo_app`, migra y arranca. Comprobar `https://nimbo-api.deploya.larasolutions.dev/api/v1/health/ready` → 200.
2. **`nimbo-worker`**: necesita las migraciones aplicadas.
3. **`nimbo-optimizer`**.
4. **`nimbo`** (web): comprobar que `https://nimbo.deploya.larasolutions.dev/` responde 200.

El primer administrador se crea con `admin:bootstrap` desde una consola del contenedor del api, pasando por el
entrypoint (sin `--migrate`) para que traduzca las variables de Deploya:

```bash
sh /app/deploya-entrypoint.sh node dist/scripts/bootstrap-admin.js --name "Nombre" --email correo@dominio --employee-code EMP-001
```

Si Deploya no ofrece consola, se corre la misma imagen en local con las variables del proyecto.

## 4. Límites conocidos

- **Sin ONLYOFFICE**: las cuatro variables `ONLYOFFICE_*`/`EDITING_CALLBACK_BASE_URL` quedan sin definir. El api arranca
  normal y abrir el editor responde `EDITING_UNAVAILABLE` (503); el resto (subir, previsualizar, versiones,
  compartir) funciona. Verificado en la §6.
- **Sin agente ni indexación** si `GEMINI_API_KEY` queda vacía (RNF-09).
- **Sin Prometheus, Grafana, cAdvisor ni respaldos** (022, 022c). Las métricas del api (`METRICS_PORT`) no se publican.
- **Worker y optimizer públicos**: Deploya publica el puerto de todo proyecto, así que su salud
  (`/health/live`, `/health/ready`) queda en una URL pública. No exponen datos; su `GET /` responde 404, que Deploya
  cuenta como sano (< 500).
- **Healthcheck de la imagen del optimizer**: el `HEALTHCHECK` de `apps/worker/Dockerfile` consulta `WORKER_PORT`;
  `optimizer.env` lo fija en 3003 para que apunte al optimizer (que no lee esa variable).
- **Web y api en redes distintas**: el servidor de Next llama al api por su URL pública (`API_INTERNAL_URL`).
- **Cookies**: `APP_ENV=staging` las marca `Secure`; `SameSite=Strict` funciona porque web y api comparten sitio
  (`deploya.larasolutions.dev`).

## 5. Si algo falla

| Síntoma en los registros | Causa |
|---|---|
| `deploya.env` con `warnings` sobre `NIMBO_APP_DB_PASSWORD` | Falta la variable: `DATABASE_URL` queda con el dueño y la app no arranca |
| `db.role_rejected` | `DATABASE_URL` conecta con el dueño o un superusuario |
| `db.app_role_failed` | El api no pudo crear `nimbo_app` (credenciales del postgres o recurso no listo) |
| `config.invalid` con el nombre de una variable | Falta una obligatoria o no cumple su formato (nunca se imprime el valor) |
| El worker u optimizer no encuentran tablas | Se desplegaron antes que el api |

## 6. Prueba local que simula Deploya

Fecha: 2026-11-12. Imágenes construidas con `docker build --no-cache -f <Dockerfile> .`; Deploya simulado con una red
por proyecto, `pgvector/pgvector:pg17` (usuario `deploya`, base `app`), `redis:7-alpine` y
`pgsty/silo:RELEASE.2026-09-16T00-00-00Z` (bucket `app` con versionado), y cada app con
`--cap-drop ALL --security-opt no-new-privileges --memory 1g --cpus 1`, solo con las variables que inyecta Deploya
(contraseñas con `'`, `$`, `"` y espacios a propósito) y las plantillas.

| Imagen | Dockerfile | Build sin caché | Tamaño |
|---|---|---|---|
| `nimbo-api` | `apps/api/Dockerfile` | 65 s | 544 MB |
| `nimbo-worker` (worker y optimizer) | `apps/worker/Dockerfile` | 67 s | 656 MB |
| `nimbo-web` | `apps/web/Dockerfile` | 99 s | 436 MB |

Muy por debajo del límite de 20 min de Deploya, aunque su máquina de construcción sea más lenta que la de la prueba.

| Proyecto | Comprobación | Resultado | Memoria (`docker stats`) |
|---|---|---|---|
| `nimbo-api` | `nimbo_app` creado, 48 migraciones aplicadas, `GET /api/v1/health/ready` | 200 `{"postgres":"up","redis":"up","minio":"up"}` | 145 MiB / 1 GiB |
| `nimbo-worker` | `worker.started`, `GET /health/ready` (y `GET /` → 404) | 200 `{"redis":"up"}`, `healthy` | 83 MiB / 1 GiB |
| `nimbo-optimizer` | `worker.started` (`worker-optimizer`), `GET /health/ready` | 200 `{"redis":"up"}`, `healthy` | 76 MiB / 1 GiB |
| `nimbo` (web) | `GET /`, `/iniciar-sesion`, `/crear-contrasena` | 200, la portada muestra la API disponible | 69 MiB / 1 GiB |

También se comprobó:

- sin `ONLYOFFICE_*` el api arranca (`api.started`) sin avisos y monta las rutas de `editing`;
- el alta del primer administrador desde el contenedor del api, pasando por el entrypoint para que traduzca las
  variables: `sh /app/deploya-entrypoint.sh node dist/scripts/bootstrap-admin.js --name "…" --email … --employee-code …`
  → `admin.bootstrap.completed` (el correo de invitación lo envía el worker con el SMTP de `worker.env`).

Lo que la simulación no cubre: el proxy TLS de Deploya (WebSocket del canal en vivo, tamaño de cuerpo de las cargas,
que van directo al s3) y la CORS del s3 administrado para las cargas firmadas desde `nimbo.deploya.larasolutions.dev`.
