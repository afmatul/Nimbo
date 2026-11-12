# Despliegue en Deploya

> Demo pública de Nimbo en [Deploya](https://deploya.larasolutions.dev): un contenedor por proyecto, construido desde
> la raíz del repo y publicado en `https://<subdominio>.deploya.larasolutions.dev`. No reemplaza a staging
> (`ambientes.md`): no hay ONLYOFFICE, Prometheus, Grafana ni respaldos. Contrastada con el código de Deploya
> (`derekCmorales/deploya` @ `8e68889`) y probada con una simulación fiel (§6).

## 1. Cómo encaja Nimbo en Deploya

| Deploya (código) | Nimbo |
|---|---|
| Un contenedor por proyecto, en la red `deploya-p-<subdominio>` | 4 proyectos: `nimbo-api`, `nimbo-worker`, `nimbo-optimizer`, `nimbo` (web) |
| Construye con el builder clásico de Docker (sin BuildKit) y no filtra con `.dockerignore`; 20 min de límite | Los Dockerfiles no usan nada exclusivo de BuildKit; el contexto completo pesa unos 235 MB |
| El alta exige un `Dockerfile` en la raíz y despliega en el acto | El `Dockerfile` de la raíz es el del api; los otros cambian la ruta en Configuración |
| Inyecta `PORT`; sano si `GET /` responde < 500 antes de 60 s | api 404, worker 404, optimizer 404, web 200 (todos < 500), en 1 a 5 s |
| `--cap-drop ALL`, `no-new-privileges`, memoria y CPU del plan, sin volúmenes | Las imágenes corren como `node` y no escriben en disco salvo la caché de Next |
| `comandoInicio` reemplaza solo el `CMD`; se parte en argumentos, sin shell | El optimizer usa la imagen del worker con otro comando |
| Recursos de datos (Postgres, Redis, S3) compartibles entre proyectos del mismo usuario | Los crea `nimbo-api` y los comparte con worker y optimizer |
| Variables inyectadas; las del usuario ganan, salvo las `DEPLOYA_*` y `PORT` | El entrypoint las traduce a las de Nimbo (§2) |
| Sin consola ni `exec` en el contenedor | El primer administrador se crea con un comando de inicio temporal (§3.7) |

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
   contenedor sale y Deploya marca el despliegue fallido.
3. `exec` del `CMD` (o del `comandoInicio`).

## 3. Pasos

### 3.1 Antes de empezar

1. **Plan Pro** (o Business) con la suscripción activa: son 4 proyectos (Starter admite 3) y 3 recursos de datos.
   Pro da 1 GB y 1 vCPU por proyecto; Nimbo usa menos de 150 MB por proyecto.
2. **Repositorio público** `https://github.com/afmatul/Nimbo`: Deploya valida con la API pública de GitHub y clona
   sin credenciales.
3. **Un SMTP real con STARTTLS** (puerto 587), por ejemplo Gmail con contraseña de aplicación o Brevo. Es obligatorio:
   sin él no llega el enlace para que el primer administrador cree su contraseña, ni la verificación de correo de los
   clientes. `APP_ENV=staging` rechaza `SMTP_TLS=none`.
4. Generar dos secretos, cada uno con `openssl rand -base64 48 | tr -d '\n=+/'`:
   - `JWT_ACCESS_SECRET` (≥ 43 caracteres);
   - `NIMBO_APP_DB_PASSWORD` (la misma en api, worker y optimizer).
5. Opcional: `GEMINI_API_KEY` para el agente y la indexación.

### 3.2 Crear los cuatro proyectos

Con **Nuevo proyecto**, repositorio `https://github.com/afmatul/Nimbo` y rama `main`. El nombre fija el subdominio
(único en toda la plataforma):

| Nombre | Puerto interno en el alta | Subdominio |
|---|---|---|
| `nimbo-api` | 3000 (lo sugiere el `EXPOSE`) | `nimbo-api.deploya.larasolutions.dev` |
| `nimbo-worker` | 3001 | `nimbo-worker.deploya.larasolutions.dev` |
| `nimbo-optimizer` | 3003 | `nimbo-optimizer.deploya.larasolutions.dev` |
| `nimbo` | 3002 | `nimbo.deploya.larasolutions.dev` |

No pegar variables en el asistente. **El primer despliegue de los cuatro falla y es lo esperado**: todavía no tienen
recursos de datos ni variables, y los tres últimos construyen la imagen del api. Un proyecto cuyo último despliegue
falló no ocupa cupo del plan.

Si algún subdominio queda distinto, se corrigen `WEB_PUBLIC_URL` y `CORS_ORIGIN` (api) y `API_INTERNAL_URL` y
`API_PUBLIC_URL` (web).

### 3.3 Recursos de datos

En la pestaña **Datos** de `nimbo-api`:

1. Crear **PostgreSQL** (pgvector), **Redis** y **S3**. Deploya crea la extensión `vector` y el bucket `app` con
   versionado.
2. En cada uno de los tres, **Compartir con otro proyecto** → `nimbo-worker`; repetir con `nimbo-optimizer`. La web
   no usa ninguno.
3. Opcional: la regla de ciclo de vida de `infra/minio/init.sh` (versiones no vigentes, 7 días) con
   `mc ilm import <alias>/app` contra el endpoint público del S3. Sin ella, las versiones viejas no expiran.

Las variables de los recursos llegan al contenedor en el **próximo** despliegue.

### 3.4 Configuración de cada proyecto

Pestaña **Configuración** → **Contenedor** → **Guardar cambios** (aplican en el próximo despliegue):

| Proyecto | Ruta del Dockerfile | Puerto interno | Comando de inicio |
|---|---|---|---|
| `nimbo-api` | `Dockerfile` (sin cambios) | 3000 | vacío |
| `nimbo-worker` | `apps/worker/Dockerfile` | 3001 | vacío |
| `nimbo-optimizer` | `apps/worker/Dockerfile` | 3003 | `node dist/worker-optimizer.main.js` |
| `nimbo` | `apps/web/Dockerfile` | 3002 | vacío |

### 3.5 Variables

Pestaña **Variables** → **Pegar .env** de cada proyecto, con su plantilla:

| Proyecto | Plantilla | Qué reemplazar |
|---|---|---|
| `nimbo-api` | `infra/deploya/api.env` | `JWT_ACCESS_SECRET`, `NIMBO_APP_DB_PASSWORD` |
| `nimbo-worker` | `infra/deploya/worker.env` | `NIMBO_APP_DB_PASSWORD` y los cinco `SMTP_*`/`MAIL_FROM` |
| `nimbo-optimizer` | `infra/deploya/optimizer.env` | `NIMBO_APP_DB_PASSWORD` |
| `nimbo` | `infra/deploya/web.env` | nada |

Se pega el archivo entero: Deploya ignora las líneas `#`. Ningún `<…>` debe quedar. Un valor no puede llevar
` #` (espacio y almohadilla): Deploya lo toma como comentario y corta el valor. Guardar **sin** desplegar todavía.

Son solo las variables obligatorias de cada esquema zod (`env.schema.ts`, `apps/web/src/env.ts`); el resto toma su
valor por omisión. No hay que definir `DATABASE_URL`, `REDIS_URL`, `S3_*` ni `MINIO_*`: las pone Deploya y las traduce
el entrypoint. Cualquier variable de `.env.example` se puede agregar después (máximo 150 por proyecto; `PORT` no).

### 3.6 Desplegar en orden

Con **Desplegar** en cada proyecto, esperando que el anterior quede en línea:

1. **`nimbo-api`**: crea `nimbo_app`, migra y arranca. Abrir
   `https://nimbo-api.deploya.larasolutions.dev/api/v1/health/ready` → `{"status":"ok",…}`.
2. **`nimbo-worker`**: `https://nimbo-worker.deploya.larasolutions.dev/health/ready` → `{"status":"ok",…}`.
3. **`nimbo-optimizer`**: `https://nimbo-optimizer.deploya.larasolutions.dev/health/ready` → `{"status":"ok",…}`.
4. **`nimbo`**: `https://nimbo.deploya.larasolutions.dev/` muestra la portada con la API disponible.

### 3.7 Primer administrador

Deploya no ofrece consola, así que se usa un comando de inicio temporal en `nimbo-api`:

1. **Configuración** → **Comando de inicio** (cambiar nombre, correo y código):

   ```text
   sh -c "node dist/scripts/bootstrap-admin.js --name 'Nombre Apellido' --email correo@dominio --employee-code EMP-001; exec node dist/main.js"
   ```

2. **Guardar cambios** y **Desplegar**. En la bitácora aparece `admin.bootstrap.completed`.
3. Vaciar el **Comando de inicio**, **Guardar cambios** y **Desplegar** otra vez. Si se olvida no pasa nada: en cada
   arranque el script responde `IDENTITY_ADMIN_ALREADY_EXISTS` y el api arranca igual.
4. El worker envía la invitación por SMTP; el enlace lleva a `https://nimbo.deploya.larasolutions.dev/crear-contrasena`.

## 4. Límites conocidos

- **Sin ONLYOFFICE**: `ONLYOFFICE_*` y `EDITING_CALLBACK_BASE_URL` quedan sin definir. El api arranca normal y abrir el
  editor responde `EDITING_UNAVAILABLE` (503); subir, previsualizar, versiones y compartir funcionan.
- **Sin agente ni indexación** si `GEMINI_API_KEY` queda vacía (RNF-09).
- **Sin Prometheus, Grafana, cAdvisor ni respaldos** (022, 022c). Las métricas del api (`METRICS_PORT`) no se publican.
- **Worker y optimizer públicos**: Deploya publica todo proyecto, así que su salud queda en una URL pública. No
  exponen datos; su `GET /` responde 404, que Deploya cuenta como sano.
- **Imagen base desde `mirror.gcr.io`**: los tres Dockerfiles bajan `node:22.23.3-trixie-slim` del mirror de Google
  porque Docker Hub limita las descargas anónimas por IP (429) y el servidor de Deploya es compartido.
- **Web y api en redes distintas**: el servidor de Next llama al api por su URL pública (`API_INTERNAL_URL`).
- **Cookies**: `APP_ENV=staging` las marca `Secure`; `SameSite=Strict` funciona porque web y api comparten sitio.
- **CORS del S3**: Deploya no la configura y MinIO acepta cualquier origen; las cargas firmadas funcionan, pero el
  bucket no restringe orígenes como en compose.

## 5. Si algo falla

| Síntoma | Causa |
|---|---|
| El alta dice que no hay `Dockerfile` | La rama no tiene el `Dockerfile` en la raíz, o el repo no es público |
| El alta dice que GitHub no está disponible | Límite de la API pública de GitHub: esperar unos minutos |
| `429 Too Many Requests` al construir | Una imagen base sale de Docker Hub; los tres Dockerfiles deben usar `mirror.gcr.io` |
| El worker, el optimizer o la web construyen la imagen del api | Falta cambiar la «Ruta del Dockerfile» (§3.4) |
| `deploya.env` con `warnings` sobre `NIMBO_APP_DB_PASSWORD` | Falta la variable: `DATABASE_URL` queda con el dueño y la app no arranca |
| `db.role_rejected` | `DATABASE_URL` conecta con el dueño o un superusuario |
| `db.app_role_failed` | El api no pudo crear `nimbo_app` (recurso PostgreSQL no listo o no conectado) |
| `config.invalid` con el nombre de una variable | Falta una obligatoria o no cumple su formato (nunca se imprime el valor) |
| El worker u optimizer no encuentran tablas | Se desplegaron antes que el api |
| `mail.retry_scheduled` en el worker | El SMTP no responde o las credenciales están mal |

## 6. Prueba que simula Deploya

Fecha: 2026-11-12. Fiel al código de Deploya:

- **Construcción**: builder clásico (`DOCKER_BUILDKIT=0`), clon limpio de la rama y sin `.dockerignore`.
- **Recursos**: como `tipo-recurso-datos.ts`. PostgreSQL con usuario `deploya`, base `app`, contraseña de 32
  caracteres y URL `postgresql://`; Redis con `--requirepass`; S3 con el bucket `app` versionado.
- **Variables**: plantillas leídas con el parser real de «Pegar .env» (`parsearEnv`) y fusionadas con
  `fusionarVariables`.
- **Comando de inicio**: partido con `argumentosDeComando`.
- **Contenedores**: red `deploya-p-<sub>`, `--cap-drop ALL --security-opt no-new-privileges --memory 1g --cpus 1`.
- **Salud**: `GET /` cada segundo, hasta 60 s.

| Imagen | Dockerfile | Build (builder clásico, sin caché) | Tamaño |
|---|---|---|---|
| `nimbo-api` | `Dockerfile` | 159 s | 545 MB |
| `nimbo-worker` (worker y optimizer) | `apps/worker/Dockerfile` | 171 s | 658 MB |
| `nimbo-web` | `apps/web/Dockerfile` | 171 s | 437 MB |

| Proyecto | Salud de Deploya (`GET /`) | Comprobación propia | Memoria |
|---|---|---|---|
| `nimbo-api` | 404 en 4,3 s | `nimbo_app` creado, 48 migraciones, `/api/v1/health/ready` 200 (postgres, redis, minio `up`) | 87 MiB |
| `nimbo-worker` | 404 en 2,2 s | `worker.started`, `/health/ready` 200 | 85 MiB |
| `nimbo-optimizer` | 404 en 2,2 s | `worker.started` (`worker-optimizer`), `/health/ready` 200 | 78 MiB |
| `nimbo` | 200 en 1,3 s | `/` y `/iniciar-sesion` 200, la portada ve la API | 70 MiB |

El primer administrador con el comando de inicio de la §3.7 dio `admin.bootstrap.completed` y una fila `ADMIN` en
`usuario`. Al repetirlo responde `IDENTITY_ADMIN_ALREADY_EXISTS` y el api arranca igual. Las migraciones de un segundo
despliegue no aplican nada (`applied: []`).

Lo que la simulación no cubre: el TLS y el proxy reales de Deploya (WebSocket del canal en vivo y los 60 s de
`readTimeout` de Traefik en cargas lentas) y la entrega real de correo.
