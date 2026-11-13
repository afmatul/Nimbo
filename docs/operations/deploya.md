# Despliegue en Deploya

> Demo pública de Nimbo en [Deploya](https://deploya.larasolutions.dev): un contenedor por proyecto, construido desde
> la raíz del repo y publicado en `https://<subdominio>.deploya.larasolutions.dev`. No reemplaza a staging
> (`ambientes.md`): no hay Prometheus, Grafana ni respaldos. Contrastada con el código de Deploya
> (`derekCmorales/deploya` @ `8e68889`) y probada con una simulación fiel (§6).

## 1. Cómo encaja Nimbo en Deploya

| Deploya (código) | Nimbo |
|---|---|
| Un contenedor por proyecto, en la red `deploya-p-<subdominio>` | 5 proyectos: `nimbo-api`, `nimbo-worker`, `nimbo-optimizer`, `nimbo` (web) y `nimbo-docs` (ONLYOFFICE, opcional) |
| Construye con el builder clásico de Docker (sin BuildKit) y no filtra con `.dockerignore`; 20 min de límite | Los Dockerfiles no usan nada exclusivo de BuildKit; el contexto completo pesa unos 235 MB |
| El alta exige un `Dockerfile` en la raíz (hasta [derekCmorales/deploya#74](https://github.com/derekCmorales/deploya/pull/74)) y despliega en el acto | El `Dockerfile` de la raíz es el del api; los otros eligen su ruta en el alta (#74) o en Configuración |
| Inyecta `PORT`; sano si `GET /` responde < 500 antes de 60 s | api 404, worker 404, optimizer 404, web 200 (todos < 500), en 1 a 5 s |
| `--cap-drop ALL`, `no-new-privileges`, memoria y CPU del plan, sin volúmenes | Las imágenes corren como `node` (ONLYOFFICE como `ds`) y no escriben en disco salvo cachés efímeras |
| `comandoInicio` reemplaza solo el `CMD`; se parte en argumentos, sin shell | El optimizer usa la imagen del worker con otro comando |
| Recursos de datos (Postgres, Redis, S3) compartibles entre proyectos del mismo usuario | Los crea `nimbo-api` y los comparte con worker y optimizer |
| Variables inyectadas; las del usuario ganan, salvo las `DEPLOYA_*` y `PORT` | El entrypoint las traduce a las de Nimbo (§2) |
| Sin consola ni `exec` en el contenedor | El primer administrador se crea con un comando de inicio temporal (§3.8) |

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
   contenedor sale y Deploya marca el despliegue fallido. Después, con `SEED_ON_START=true`, `seed.js` siembra los datos
   de demostración (cuentas `*@demo.nimbo.me` con la contraseña `SEED_DEMO_PASSWORD`: cuota casi llena y llena con un
   plan desactivado de 5 MB, suscripción vencida en solo lectura, cambio de plan programado, cuenta sin verificar y
   suspendida, Administrador, Soporte y Operador, nombres unicode y de 255 caracteres, carpetas al máximo de
   profundidad, comparticiones con dos niveles y enlaces públicos activo y vencido). Es idempotente (busca por correo,
   `slug` y ruta de nombres; lo que existe no se toca) y, si falla, el contenedor arranca igual y el siguiente arranque
   lo reintenta. En local: `pnpm seed`. Los archivos sembrados no se indexan solos: `pnpm --filter api index:reconcile`.
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

Los nombres entre «» y en **negrita** son los textos exactos de la interfaz de Deploya. Cada proyecto tiene arriba
las pestañas **Resumen · Despliegues · Métricas · Bitácoras · Variables · Datos · Configuración** y el botón
**Desplegar**.

### 3.2 Cómo se crea un proyecto (asistente de 3 pasos)

**Proyectos** → **Nuevo proyecto**:

1. **Paso 1 · Repositorio**:
   1. «URL del repositorio»: `https://github.com/afmatul/Nimbo`.
   2. «Rama»: `main`.
   3. Si aparece el campo «Ruta del Dockerfile» ([derekCmorales/deploya#74](https://github.com/derekCmorales/deploya/pull/74)), escribir la ruta de la tabla de cada proyecto.
   4. **Continuar**. Aparece «Accesible», la tarjeta «Dockerfile encontrado» y dos campos nuevos:
      «Nombre del proyecto» y «Puerto interno».
   5. Escribir el nombre y el puerto de la tabla. Revisar que la «URL:» debajo del nombre sea la esperada.
   6. **Continuar**.
2. **Paso 2 · Variables** (opcional): dejarlo vacío y **Continuar**. Las variables se pegan después, con
   **Pegar .env**.
3. **Revisar**: **Desplegar**.

**Ese primer despliegue falla y es lo esperado**: el proyecto todavía no tiene recursos de datos ni variables. Un
proyecto cuyo último despliegue falló no ocupa cupo del plan. Se arregla con los pasos siguientes y **Desplegar**.

| Proyecto | «Nombre del proyecto» | «Puerto interno» | «Ruta del Dockerfile» | «Comando de inicio (opcional)» | Plantilla |
|---|---|---|---|---|---|
| api | `nimbo-api` | `3000` | `Dockerfile` | vacío | `infra/deploya/api.env` |
| worker | `nimbo-worker` | `3001` | `apps/worker/Dockerfile` | vacío | `infra/deploya/worker.env` |
| optimizer | `nimbo-optimizer` | `3003` | `apps/worker/Dockerfile` | `node dist/worker-optimizer.main.js` | `infra/deploya/optimizer.env` |
| web | `nimbo` | `3002` | `apps/web/Dockerfile` | vacío | `infra/deploya/web.env` |
| ONLYOFFICE | `nimbo-docs` | `8080` | `infra/deploya/onlyoffice/Dockerfile` | vacío | `infra/deploya/docs.env` |

Sin #74, el asistente solo acepta el `Dockerfile` de la raíz (el del api) y no muestra el campo de la ruta: se crea
igual y la ruta se corrige en **Configuración** (§3.3). Si algún subdominio queda distinto de la tabla, se corrigen
`WEB_PUBLIC_URL` y `CORS_ORIGIN` (api) y `API_INTERNAL_URL` y `API_PUBLIC_URL` (web).

### 3.3 Pasos comunes de un proyecto ya creado

- **Configurar el contenedor**: pestaña **Configuración** → sección «Contenedor» → llenar «Ruta del Dockerfile»,
  «Puerto interno» y «Comando de inicio (opcional)» con la tabla → **Guardar cambios**. Aparece «Cambios guardados ·
  Aplican en el próximo despliegue».
- **Pegar las variables**:
  1. Pestaña **Variables** → **Pegar .env**.
  2. En «Contenido del .env», pegar la plantilla entera con cada `<…>` ya reemplazado. Las líneas `#` se ignoran.
     Ningún valor puede llevar ` #` (espacio y almohadilla): Deploya lo toma como comentario.
  3. **Agregar al borrador** → **Guardar y desplegar** (o **Guardar** si todavía falta algo).
- **Comprobar**: pestaña **Despliegues** → el último debe quedar sano. Si falla, pestaña **Bitácoras** (§5).

### 3.4 `nimbo-api` (primero)

1. Crearlo (§3.2) con nombre `nimbo-api` y puerto `3000`. La ruta es `Dockerfile`, la de la raíz, así que no hay
   que cambiarla.
2. Pestaña **Datos**: en «PostgreSQL 17 + pgvector», «Redis 7» y «Almacenamiento S3», **Agregar**. Deploya crea la
   extensión `vector` y el bucket `app` con versionado.
3. **Pegar las variables** de `infra/deploya/api.env` (§3.3) con `JWT_ACCESS_SECRET` y `NIMBO_APP_DB_PASSWORD` →
   **Guardar y desplegar**.
4. Comprobar: `https://nimbo-api.deploya.larasolutions.dev/api/v1/health/ready` → `{"status":"ok",…}`.

### 3.5 `nimbo-worker`

1. Crearlo (§3.2) con nombre `nimbo-worker` y puerto `3001`.
2. En **`nimbo-api`** → pestaña **Datos**: en cada uno de los tres recursos, **Compartir con otro proyecto** →
   «Proyecto»: `nimbo-worker` → **Compartir**.
3. En `nimbo-worker` → **Configuración** (§3.3): «Ruta del Dockerfile» `apps/worker/Dockerfile`, «Puerto interno»
   `3001` → **Guardar cambios**.
4. **Pegar las variables** de `infra/deploya/worker.env`, con la misma `NIMBO_APP_DB_PASSWORD` del api y el SMTP →
   **Guardar y desplegar**.
5. Comprobar: `https://nimbo-worker.deploya.larasolutions.dev/health/ready` → `{"status":"ok",…}`.

### 3.6 `nimbo-optimizer`

1. Crearlo (§3.2) con nombre `nimbo-optimizer` y puerto `3003`.
2. En **`nimbo-api`** → **Datos**: **Compartir con otro proyecto** → `nimbo-optimizer` → **Compartir**, en los tres
   recursos.
3. **Configuración**: «Ruta del Dockerfile» `apps/worker/Dockerfile`, «Puerto interno» `3003`, «Comando de inicio
   (opcional)» `node dist/worker-optimizer.main.js` → **Guardar cambios**.
4. **Pegar las variables** de `infra/deploya/optimizer.env` → **Guardar y desplegar**.
5. Comprobar: `https://nimbo-optimizer.deploya.larasolutions.dev/health/ready` → `{"status":"ok",…}`.

### 3.7 `nimbo` (web, último)

1. Crearlo (§3.2) con nombre `nimbo` y puerto `3002`.
2. **Configuración**: «Ruta del Dockerfile» `apps/web/Dockerfile`, «Puerto interno» `3002` → **Guardar cambios**.
   No necesita recursos de datos.
3. **Pegar las variables** de `infra/deploya/web.env`, que no tiene nada que reemplazar → **Guardar y desplegar**.
4. Comprobar: `https://nimbo.deploya.larasolutions.dev/` muestra la portada con la API disponible.

### 3.8 Primer administrador

Deploya no ofrece consola, así que se usa un comando de inicio temporal en `nimbo-api`:

1. **Configuración** → «Comando de inicio (opcional)» (cambiar nombre, correo y código):

   ```text
   sh -c "node dist/scripts/bootstrap-admin.js --name 'Nombre Apellido' --email correo@dominio --employee-code EMP-001; exec node dist/main.js"
   ```

2. **Guardar cambios** → **Desplegar**. En **Bitácoras** aparece `admin.bootstrap.completed`.
3. Vaciar el «Comando de inicio (opcional)» → **Guardar cambios** → **Desplegar**. Si se olvida no pasa nada: en
   cada arranque el script responde `IDENTITY_ADMIN_ALREADY_EXISTS` y el api arranca igual.
4. El worker envía la invitación por SMTP; el enlace lleva a `https://nimbo.deploya.larasolutions.dev/crear-contrasena`.

### 3.9 `nimbo-docs` (ONLYOFFICE, editor de `.docx`)

Opcional: sin él Nimbo funciona entero y solo «Editar» responde `EDITING_UNAVAILABLE`. La imagen
(`infra/deploya/onlyoffice/Dockerfile`) es ONLYOFFICE Docs 9.3.1, la misma versión de compose, armada para las reglas
de Deploya: todo corre como el usuario `ds` sin privilegios, nginx escucha en `PORT`, RabbitMQ va dentro y las tablas
de ONLYOFFICE van en el esquema `onlyoffice` de su propio PostgreSQL. Usa unos 540 MB de 1 GB en reposo; la primera
construcción tarda unos 3 a 4 min (baja un paquete de 622 MB).

1. Crearlo (§3.2) con nombre `nimbo-docs`, puerto `8080` y ruta `infra/deploya/onlyoffice/Dockerfile` (si el campo no
   aparece, se corrige en **Configuración**).
2. Pestaña **Datos** de `nimbo-docs`: **Agregar** en «PostgreSQL 17 + pgvector». Es una base aparte: ONLYOFFICE no
   necesita ni recibe la de Nimbo.
3. **Pegar las variables** de `infra/deploya/docs.env`: `ONLYOFFICE_JWT_SECRET` con una clave nueva de 32
   caracteres o más (`openssl rand -base64 48 | tr -d '\n=+/'`) → **Guardar y desplegar**.
4. Comprobar: `https://nimbo-docs.deploya.larasolutions.dev/healthcheck` → `true`.
5. En **`nimbo-api`** → **Variables**: agregar las cuatro últimas líneas de `infra/deploya/api.env`, con la **misma**
   `ONLYOFFICE_JWT_SECRET` del paso 3 → **Guardar y desplegar**.
6. En la web, abrir un `.docx` → **Editar**: el editor carga desde `nimbo-docs` y guarda en Nimbo al cerrar.

## 4. Límites conocidos

- **ONLYOFFICE sin persistencia propia**: su caché vive en el contenedor y se pierde al redesplegar. No se pierde nada
  de Nimbo: el documento y sus versiones viven en Nimbo; una sesión abierta durante un redespliegue se cierra y hay
  que volver a abrir el editor. Sin `nimbo-docs` (o sin las cuatro variables en el api), «Editar» responde
  `EDITING_UNAVAILABLE` (503) y el resto funciona.
- **Fuentes de ONLYOFFICE**: sin las fuentes de Microsoft (su licencia no deja redistribuirlas); van Carlito,
  Caladea, Liberation y DejaVu, que ocupan el mismo espacio que Calibri, Cambria, Arial, Times y Courier.
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
| El worker, el optimizer o la web construyen la imagen del api | Falta cambiar la «Ruta del Dockerfile» en **Configuración** (§3.3) |
| `deploya.env` con `warnings` sobre `NIMBO_APP_DB_PASSWORD` | Falta la variable: `DATABASE_URL` queda con el dueño y la app no arranca |
| `db.role_rejected` | `DATABASE_URL` conecta con el dueño o un superusuario |
| `db.app_role_failed` | El api no pudo crear `nimbo_app` (recurso PostgreSQL no listo o no conectado) |
| `config.invalid` con el nombre de una variable | Falta una obligatoria o no cumple su formato (nunca se imprime el valor) |
| El worker u optimizer no encuentran tablas | Se desplegaron antes que el api |
| `mail.retry_scheduled` en el worker | El SMTP no responde o las credenciales están mal |
| `onlyoffice.config_invalid` en `nimbo-docs` | Falta `ONLYOFFICE_JWT_SECRET` (o es corta) o el PostgreSQL de su pestaña Datos |
| El editor dice «Error de descarga» o no guarda | `ONLYOFFICE_JWT_SECRET` distinta entre `nimbo-api` y `nimbo-docs`, o `EDITING_CALLBACK_BASE_URL` mal |

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
| `nimbo-docs` | `infra/deploya/onlyoffice/Dockerfile` | 192 s | 4,08 GB |

| Proyecto | Salud de Deploya (`GET /`) | Comprobación propia | Memoria |
|---|---|---|---|
| `nimbo-api` | 404 en 4,3 s | `nimbo_app` creado, 48 migraciones, `/api/v1/health/ready` 200 (postgres, redis, minio `up`) | 87 MiB |
| `nimbo-worker` | 404 en 2,2 s | `worker.started`, `/health/ready` 200 | 85 MiB |
| `nimbo-optimizer` | 404 en 2,2 s | `worker.started` (`worker-optimizer`), `/health/ready` 200 | 78 MiB |
| `nimbo` | 200 en 1,3 s | `/` y `/iniciar-sesion` 200, la portada ve la API | 70 MiB |
| `nimbo-docs` | 200 en 9,4 s | `/healthcheck` `true`, tablas en el esquema `onlyoffice` | 534 MiB |

El primer administrador con el comando de inicio de la §3.8 dio `admin.bootstrap.completed` y una fila `ADMIN` en
`usuario`. Al repetirlo responde `IDENTITY_ADMIN_ALREADY_EXISTS` y el api arranca igual. Las migraciones de un segundo
despliegue no aplican nada (`applied: []`).

Ciclo de edición de ONLYOFFICE, con un servidor que hace de api de Nimbo:

- conversión firmada con JWT `.docx` → PDF en 1,1 s, descargada por el enlace firmado de nginx;
- en Chromium, el editor abrió en 1,8 s sin errores, se escribió «Hola desde Nimbo en Deploya» y, al cerrar,
  ONLYOFFICE envió el aviso de guardado (`status 2`) con la URL del documento; el `.docx` descargado de esa URL trae
  el texto escrito;
- memoria tras editar: 537 MiB de 1 GiB.

Lo que la simulación no cubre: el TLS y el proxy reales de Deploya (WebSocket del canal en vivo y del editor, y los
60 s de `readTimeout` de Traefik en cargas lentas), el ciclo de edición contra el api real de Nimbo (la integración
016 está probada con compose) y la entrega real de correo.
