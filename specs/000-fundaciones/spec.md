# Spec 000 — Fundaciones: monorepo, contenedores, CI/CD, ambientes, `shared`, salud y fronteras

| Campo | Valor |
|---|---|
| Estado | En implementación |
| Dueño | Adrián (1) |
| Fase | 1 |
| Requisitos | RNF-10, RNF-12, RNF-15, RNF-16, RNF-17, RNF-19; RNF-18 (parcial: solo health checks) |
| Depende de | — (bloquea a todas las demás) |
| Última actualización | 2026-09-16 |

## 1. Contexto y problema

Hoy el repositorio solo contiene documentación: no hay `package.json`, no hay forma de levantar los servicios de apoyo,
no hay integración continua y no existe un ambiente donde demostrar nada. Cuatro personas van a construir módulos en
paralelo durante diez semanas; si cada una improvisa su estructura, su forma de registrar bitácoras, sus errores y su
manejo de configuración, el resultado será cuatro sistemas pegados y no un monolito modular. Además, la constitución
exige garantías que solo pueden cumplirse si existen desde el primer commit: fronteras verificadas por lint (Art. VIII),
migraciones reversibles (RNF-10), `correlationId` en toda bitácora (RNF-17) y nada llega a producción sin CI verde y
revisión ajena (RNF-19). Esta spec construye ese suelo común para que las specs 000b y 001+ empiecen a implementar
comportamiento de negocio sin discutir infraestructura.

## 2. Objetivo

Cualquier integrante, en una máquina limpia, clona el repositorio, ejecuta tres comandos y tiene la plataforma
corriendo con sus dependencias; cada cambio integrado a `main` pasa por seis verificaciones automáticas y se despliega
solo a un ambiente de staging con TLS, donde `https://api.staging.<dominio>/api/v1/health/ready` responde `200`.

## 3. Actores

- **Integrante del equipo** (desarrollador): usa el entorno local, el monorepo y el CI.
- **Operador de infraestructura**: ejecuta despliegues, migraciones y rollback en staging.
- **Sistema (CI / GitHub Actions)**: verifica, publica imágenes y despliega.
- **Cliente / Administrador / Soporte**: no interactúan con esta spec. Los endpoints de salud son públicos y no exponen
  datos de cuentas, por lo que ningún rol obtiene nada que no deba (ver §8).

## 4. Historias de usuario

- **HU-1** Como integrante, quiero levantar todo el entorno local desde cero con comandos documentados, para empezar
  a implementar mi módulo el mismo día sin depender de nadie.
- **HU-2** Como integrante, quiero que el lint me impida importar internos de otro módulo, Nest/TypeORM desde el
  dominio o código de los mockups desde `apps/web`, para que la arquitectura del diagrama se conserve sin revisiones manuales.
- **HU-3** Como integrante, quiero un módulo `shared` con `Actor`, `IClock`, `DomainError`, el filtro HTTP de errores,
  el logger con redacción y el `correlationId`, para no reinventar esas piezas en cada módulo y cumplir RNF-17 por defecto.
- **HU-4** Como operador, quiero que la aplicación se niegue a arrancar si la configuración es incompleta y que
  `/health/live` y `/health/ready` reflejen el estado real de las dependencias, para diagnosticar sin entrar al servidor.
- **HU-5** Como operador, quiero que cada merge a `main` publique imágenes inmutables y despliegue staging
  automáticamente con las migraciones aplicadas, y poder volver a la imagen anterior en menos de 10 minutos.
- **HU-6** Como integrante, quiero que ningún cambio entre a `main` sin CI verde y aprobación de otro integrante,
  para cumplir RNF-19 desde el primer PR.

## 5. Decisiones ya tomadas por el equipo

Estas decisiones son entrada de la spec, no preguntas. Cambiarlas requiere ADR o acuerdo del equipo.

| # | Decisión |
|---|---|
| D-1 | **Versiones**: Node 22 LTS (`.nvmrc`), pnpm 10 (`packageManager` en `package.json`), TypeScript 5, NestJS 11, TypeORM 0.3, Next.js 15 (App Router), Tailwind v4, Jest 29, Playwright estable. Versiones exactas fijadas en cada `package.json` (sin rangos flotantes). |
| D-2 | **Repositorio privado** en la cuenta personal de Adrián, que tiene **GitHub Pro** por el Student Developer Pack (Pro habilita protección de ramas y rulesets en repos privados). Límites de Pro a vigilar: 3 000 min/mes de Actions y 2 GB de GitHub Packages (ver riesgos). Protección de `main`: PR obligatorio; 6 status checks requeridos (`lint`, `typecheck`, `unit`, `int`, `isolation`, `migrations`); 1 aprobación de un integrante distinto del autor; *dismiss stale reviews*; sin *force push*; historial lineal (squash). |
| D-3 | **Registry**: `ghcr.io/afmatul/nimbo-api`, `nimbo-worker`, `nimbo-web`. Las tres apps se despliegan en el mismo servidor con Docker Compose. No se usa Vercel ni Render. |
| D-4 | **Hospedaje**: DigitalOcean con crédito del GitHub Student Developer Pack. Un Droplet de **staging** (2 vCPU / 4 GB, Ubuntu LTS, Docker) desde el inicio de Fase 2. ONLYOFFICE en staging solo bajo demanda (perfil de compose). **Producción** (4 vCPU / 8 GB, Droplet separado, RNF-15) se crea en Fase 4; queda fuera de 000 salvo dejar compose y job de deploy parametrizados por ambiente. |
| D-5 | **Dominio**: `.me` gratuito de Namecheap (Student Pack). DNS apunta al Droplet; Traefik emite TLS con Let's Encrypt (HTTP-01). Subdominios de staging: `staging.<dominio>` (web), `api.staging.<dominio>` (api), `docs.staging.<dominio>` (ONLYOFFICE, solo cuando el perfil está activo), `s3.staging.<dominio>` (MinIO, solo para URLs firmadas vía Traefik). |
| D-6 | **Despliegue**: GitHub Actions, en cada merge a `main`, publica imágenes a ghcr.io y despliega a staging por SSH (`docker compose pull && docker compose up -d`) tras ejecutar `migration:run`. Secretos `SSH_HOST`, `SSH_USER`, `SSH_KEY` y los del `.env` de staging viven en GitHub Secrets/Environments. **Rollback** = redesplegar la etiqueta (SHA) anterior (RNF-20), documentado en el Manual Técnico. |
| D-7 | **Objetos**: MinIO en local y staging (mismo compose), con versionado de bucket activado. |
| D-8 | **Ambientes**: `local` / `test` (CI) / `staging` / `production`; `NODE_ENV` ∈ {`development`, `test`, `production`} y una variable propia `APP_ENV` ∈ {`local`, `test`, `staging`, `production`}. `.env.example` obligatorio y validado al arranque con esquema (zod o class-validator; lo fija el plan). |
| D-9 | `ThrottlerModule` lo introduce la spec 002, no esta. |
| D-10 | **gitleaks** como paso del job `lint` en CI y una pasada sobre el historial completo al activar el CI (y de nuevo si algún día el repositorio se hace público). Requiere un **ADR menor** (dependencia significativa de CI). |
| D-11 | Postgres en contenedor en staging con volumen persistente. El respaldo diario (RNF-21) se define en la spec 022. |
| D-12 | La herramienta de lint de fronteras la decide `architect` en el plan (ADR-0008). Es dependencia del plan, no pregunta bloqueante de la spec. |
| D-13 | Mapeo `DomainError → HTTP`: `code` estable por error y `status` por clase de error; el detalle lo fija el plan. |
| D-14 | `synchronize: false` fijo en el código de la fuente de datos de TypeORM, sin leer variable de entorno alguna. |
| D-15 | `apps/web` arranca con una sola página de estado mínima **sin estilos propios**; tokens, tema y layout son de la spec 000b. |

## 6. Criterios de aceptación

> Formato Dado/Cuando/Entonces. Cada criterio es verificable por una prueba automatizada o por un procedimiento
> reproducible documentado (los marcados con «manual» se registran en `verification.md` con evidencia).

### Arranque local (HU-1)

- **CA-1** (HU-1, RNF-12) — arranque desde cero
  - **Dado** una máquina limpia con Git, Docker (con Compose v2) y Node 22 vía `.nvmrc`, sin nada más instalado,
  - **Cuando** el integrante ejecuta, en orden y siguiendo solo el `README.md` del repositorio: `pnpm install`,
    `cp .env.example .env`, `docker compose up -d`, `pnpm --filter api migration:run` y `pnpm dev`,
  - **Entonces** en menos de 10 minutos (sin contar descargas de imágenes) `GET http://localhost/api/v1/health/ready`
    responde `200`, `http://localhost` muestra la página de estado de `web`, y el proceso `worker` escribe una bitácora
    `worker.started` con `correlationId`. No hace falta editar ningún archivo a mano aparte de `.env` copiado.

- **CA-2** (HU-1, RNF-12) — ONLYOFFICE apagado por defecto y encendible por perfil
  - **Dado** el `docker-compose.yml` del repositorio,
  - **Cuando** se ejecuta `docker compose up -d` sin perfiles,
  - **Entonces** corren exactamente los servicios `postgres` (con extensión `vector` disponible), `redis`, `minio`,
    `traefik` y `mailpit` (su ubicación base/override depende de la segunda pregunta de §14), y **no** existe contenedor de ONLYOFFICE.
  - **Y cuando** se ejecuta `docker compose --profile onlyoffice up -d`,
  - **Entonces** el contenedor `onlyoffice` arranca y `http://localhost/docs/healthcheck` (vía Traefik) responde `true`.

- **CA-3** (HU-1, RNF-12) — paridad local/staging
  - **Dado** los archivos de compose del repositorio,
  - **Cuando** se comparan el compose usado en local y el usado en staging,
  - **Entonces** son el **mismo archivo base** con *overrides* por ambiente (`compose.override.yml` para local,
    `compose.staging.yml` para staging) y las diferencias se limitan a: imágenes precompiladas vs. `build`,
    dominios/TLS de Traefik, volúmenes con ruta persistente y ausencia de puertos publicados para Postgres/Redis/MinIO.

### Monorepo y esqueleto (HU-1, HU-2)

- **CA-4** (HU-1, RNF-12) — estructura y comandos raíz
  - **Dado** el repositorio clonado,
  - **Cuando** se inspecciona la raíz,
  - **Entonces** existen `apps/api`, `apps/web`, `apps/worker`, `packages/contracts`, `packages/config`, `infra/`,
    `pnpm-workspace.yaml`, `.nvmrc`, `.env.example`, y el `package.json` raíz expone los scripts `dev`, `lint`,
    `typecheck`, `test`, `test:int`, `test:isolation`, `test:e2e` (puede ser un marcador que reporte «sin pruebas E2E aún»
    con salida `0`), `seed` (marcador equivalente hasta RNF-16 completo) y el filtro `--filter api migration:run|revert|generate`
    tal como los documenta `CLAUDE.md`. `docs/design/mockups/` queda **fuera** del workspace, del lint y del build.

- **CA-5** (HU-2, RNF-12, Art. VIII.3) — lint de fronteras entre módulos
  - **Dado** un archivo de `apps/api/src/modules/sharing/` que importa
    `../../storage/infrastructure/persistence/archivo.orm-entity` (o cualquier ruta de otro módulo que no sea su `index.ts`),
  - **Cuando** se ejecuta `pnpm lint`,
  - **Entonces** el comando termina con código distinto de `0` y el mensaje identifica el archivo, la importación
    prohibida y la regla («solo se importa desde `modules/<x>/index.ts`»). El mismo archivo importando desde
    `../../storage` (su `index.ts`) pasa.

- **CA-6** (HU-2, Art. VIII.2) — lint de capas
  - **Dado** un archivo dentro de `apps/api/src/modules/<x>/domain/` que importa `@nestjs/common` o `typeorm`,
  - **Cuando** se ejecuta `pnpm lint`,
  - **Entonces** falla señalando que `domain` no puede depender de frameworks. Igualmente falla si `application/`
    importa desde `infrastructure/` o `presentation/` del mismo módulo, y si `domain/` importa algo fuera de
    `domain/` o `shared/domain`.

- **CA-7** (HU-2, Art. VIII.4) — ciclos entre módulos
  - **Dado** dos módulos que se importan mutuamente por sus `index.ts`,
  - **Cuando** se ejecuta `pnpm lint`,
  - **Entonces** falla reportando el ciclo con los módulos implicados.

- **CA-8** (HU-2, CLAUDE.md «Prohibiciones») — `apps/web` no importa mockups
  - **Dado** un archivo de `apps/web/src` que importa desde `docs/design/mockups/` (ruta relativa o alias),
  - **Cuando** se ejecuta `pnpm lint`,
  - **Entonces** falla indicando que los mockups son solo referencia.

- **CA-9** (HU-2, RNF-12) — lint limpio en el esqueleto
  - **Dado** el repositorio en el estado final de esta spec, sin las violaciones de CA-5 a CA-8,
  - **Cuando** se ejecutan `pnpm lint` y `pnpm typecheck`,
  - **Entonces** ambos terminan con `0`, con TypeScript `strict` y `noUncheckedIndexedAccess` activos en los tres `apps` y en `packages/*`.

### Persistencia y migraciones (HU-1, HU-5)

- **CA-10** (HU-5, RNF-10, D-14) — `synchronize` fijo
  - **Dado** la fuente de datos de TypeORM de `api` y de `worker`,
  - **Cuando** se arranca con cualquier combinación de variables de entorno (incluido `TYPEORM_SYNCHRONIZE=true` o
    `NODE_ENV=development`),
  - **Entonces** `dataSource.options.synchronize === false` y una prueba unitaria lo verifica leyendo la configuración,
    no una variable.

- **CA-11** (HU-5, RNF-10) — migración inicial reversible
  - **Dado** una base Postgres vacía (Testcontainers en CI),
  - **Cuando** se ejecuta `migration:run`, después `migration:revert` y de nuevo `migration:run`,
  - **Entonces** las tres operaciones terminan con `0`; tras el primer `run` existe la extensión `vector`
    (`SELECT 1 FROM pg_extension WHERE extname = 'vector'`) y la tabla de control de migraciones tiene 1 fila; tras el
    `revert` la extensión no existe y la tabla tiene 0 filas; tras el segundo `run` el estado es idéntico al del primero.
    Este flujo es el job `migrations` de CI.

- **CA-12** (HU-5, RNF-10) — caso de error: migración sin `down`
  - **Dado** un archivo de migración cuyo método `down` está vacío o lanza,
  - **Cuando** corre el job `migrations`,
  - **Entonces** el job falla en el paso `revert` (y el PR queda bloqueado por D-2).

### Módulo `shared` (HU-3)

- **CA-13** (HU-3, RNF-17) — `correlationId` en cada respuesta y bitácora HTTP
  - **Dado** cualquier petición HTTP a `api`,
  - **Cuando** llega **sin** cabecera `x-correlation-id`,
  - **Entonces** la respuesta incluye `x-correlation-id` con un UUID v4 nuevo y todas las líneas de bitácora
    generadas durante esa petición contienen el mismo valor en el campo `correlationId`.
  - **Y cuando** llega **con** `x-correlation-id: <valor válido (≤ 128 caracteres imprimibles)>`,
  - **Entonces** la respuesta devuelve ese mismo valor y las bitácoras lo usan. Si el valor recibido no es válido, se ignora y se genera uno nuevo (no se responde error).

- **CA-14** (HU-3, RNF-17) — `correlationId` propagado al worker
  - **Dado** un trabajo encolado desde `api` durante una petición con `correlationId = X`
    (se usa una cola de prueba `ping` de `shared` para verificarlo; no se crean colas de negocio),
  - **Cuando** el `worker` procesa el trabajo,
  - **Entonces** todas las bitácoras del procesamiento llevan `correlationId = X` y `jobId`.
    Un trabajo programado (sin petición de origen) genera su propio `correlationId` al iniciar.

- **CA-15** (HU-3, RNF-17) — redacción del logger
  - **Dado** una línea de bitácora que incluye, en cualquier nivel de anidamiento, campos con nombres
    `password`, `passwordHash`, `token`, `accessToken`, `refreshToken`, `authorization`, `cookie`, `secret`, `apiKey`,
    `fileName`, `nombre`, `content`, `prompt`, o la cabecera `authorization`,
  - **Cuando** el logger la escribe,
  - **Entonces** el valor aparece como `[REDACTED]` y el resto de la línea se conserva. La lista de campos redactados
    vive en un solo lugar de `shared` y una prueba unitaria la ejercita con un objeto anidado.

- **CA-16** (HU-3, Art. VII.5) — `DomainError` traducido por un único filtro
  - **Dado** un controlador de prueba de `shared` que lanza una subclase de `DomainError` con `code = 'SHARED_EXAMPLE_NOT_FOUND'`,
  - **Cuando** se invoca por HTTP,
  - **Entonces** la respuesta tiene el `status` asignado a esa clase de error, cuerpo
    `{ "code": "SHARED_EXAMPLE_NOT_FOUND", "message": "<español, con acción correctiva>", "correlationId": "<el de la petición>" }`
    y **no** contiene `stack`, nombre de clase ni rutas de archivo.
  - **Y** cuando ocurre un error no controlado (excepción genérica), la respuesta es `500` con `code = 'INTERNAL_ERROR'`,
    un mensaje genérico en español y el `correlationId`; el detalle queda solo en la bitácora del servidor.

- **CA-17** (HU-3, Art. IX.2) — `Actor` e `IClock` disponibles
  - **Dado** el módulo `shared`,
  - **Cuando** otro módulo lo importa desde su `index.ts`,
  - **Entonces** obtiene `Actor` con exactamente los campos `id`, `role` (`CLIENT | ADMIN | SUPPORT | OPERATOR`) y
    `canReadContent`, el puerto `IClock` con `SystemClock` y `FixedClock`, `DomainError`, el logger y las utilidades de
    `correlationId`. Construir el `Actor` desde el JWT y `RolesGuard` **no** son de esta spec (002/003).

### Configuración y salud (HU-4)

- **CA-18** (HU-4, RNF-12) — arranque falla con mensaje claro
  - **Dado** un `.env` al que le falta una variable requerida (p. ej. `DATABASE_URL`) o que tiene un valor inválido
    (p. ej. `PORT=abc`),
  - **Cuando** arranca `api` o `worker`,
  - **Entonces** el proceso termina con código distinto de `0` **antes** de abrir puertos o conectarse a nada, y escribe
    una única línea que nombra cada variable faltante o inválida y el motivo («`DATABASE_URL` es obligatoria»,
    «`PORT` debe ser un entero entre 1 y 65535»). Nunca imprime el valor de una variable secreta.

- **CA-19** (HU-4, RNF-12) — `.env.example` completo
  - **Dado** el esquema de configuración de `api`, `worker` y `web`,
  - **Cuando** se compara con `.env.example`,
  - **Entonces** toda variable del esquema aparece en `.env.example` (con valor de desarrollo o vacío si es secreto) y
    una prueba en CI falla si divergen. Ninguna variable con secreto usa el prefijo `NEXT_PUBLIC_`.

- **CA-20** (HU-4, RNF-18) — `/health/live`
  - **Dado** `api` en ejecución,
  - **Cuando** se pide `GET /api/v1/health/live`,
  - **Entonces** responde `200` con `{ "status": "ok" }` sin consultar ninguna dependencia, y sin requerir autenticación.

- **CA-21** (HU-4, RNF-18) — `/health/ready` con todas las dependencias
  - **Dado** Postgres, Redis y MinIO accesibles,
  - **Cuando** se pide `GET /api/v1/health/ready`,
  - **Entonces** responde `200` con `{ "status": "ok", "checks": { "postgres": "up", "redis": "up", "minio": "up" } }`
    en menos de 2 s.

- **CA-22** (HU-4, RNF-18) — `/health/ready` con una dependencia caída
  - **Dado** que Redis (o cualquiera de las tres) está detenido (Testcontainers lo detiene en la prueba),
  - **Cuando** se pide `GET /api/v1/health/ready`,
  - **Entonces** responde `503` con `{ "status": "error", "checks": { "postgres": "up", "redis": "down", "minio": "up" } }`
    en menos de 3 s (con tiempo de espera por dependencia), y el cuerpo **no** contiene hosts, puertos, usuarios,
    contraseñas, cadenas de conexión ni mensajes de excepción. ONLYOFFICE no participa en `ready` (llega con 016/022, DF-29).

- **CA-23** (HU-4, RNF-18) — salud del worker
  - **Dado** el proceso `worker` en ejecución,
  - **Cuando** Docker ejecuta su `HEALTHCHECK` (o se consulta el mecanismo que defina el plan: puerto mínimo o archivo de latido),
  - **Entonces** reporta sano solo si el proceso está conectado a Redis; si Redis cae, el estado pasa a no sano en menos de 60 s.

### CI y protección de `main` (HU-6)

- **CA-24** (HU-6, RNF-19) — seis checks por PR
  - **Dado** un PR abierto contra `main`,
  - **Cuando** GitHub Actions corre,
  - **Entonces** se ejecutan seis jobs con nombres exactos `lint` (incluye gitleaks), `typecheck`, `unit`, `int`,
    `isolation`, `migrations`; `int`, `isolation` y `migrations` usan Postgres (+pgvector), Redis y MinIO reales
    (Testcontainers o servicios del workflow, nunca mocks), y el resultado de cada job es visible como *status check*.
    El tiempo total del workflow en el esqueleto es menor a 15 min.

- **CA-25** (HU-6, RNF-19) — CI falla cuando debe
  - **Dado** un PR que introduce, respectivamente: una violación de fronteras (CA-5), un error de tipos, una prueba
    unitaria roja, una prueba de integración roja, una prueba de aislamiento roja (la suite `isolation` del esqueleto
    contiene una prueba marcador que se puede forzar a fallar) o una migración sin `down` (CA-12),
  - **Cuando** corre el workflow,
  - **Entonces** el job correspondiente falla y el botón de merge queda deshabilitado. Se ensaya una vez por job y se
    registra la evidencia (enlace a la corrida) en `verification.md`.

- **CA-26** (HU-6, RNF-19) — protección de `main` (manual, evidencia por captura)
  - **Dado** la configuración del repositorio,
  - **Cuando** se intenta hacer `git push` directo a `main`, mergear un PR sin los seis checks en verde, mergear con
    aprobación solo del autor, o `push --force`,
  - **Entonces** GitHub rechaza cada acción. Un nuevo commit en la rama descarta aprobaciones previas (*dismiss stale*).
    El merge disponible es únicamente *squash*.

- **CA-27** (HU-6, D-10) — secretos en el historial
  - **Dado** el historial completo del repositorio,
  - **Cuando** se ejecuta gitleaks sobre todo el historial al activar el CI (T-32),
  - **Entonces** no reporta hallazgos; el resultado se adjunta en `security.md`. Un commit posterior que agregue una
    cadena con forma de secreto (p. ej. una clave privada de prueba) hace fallar el job `lint`.

### Imágenes y despliegue (HU-5)

- **CA-28** (HU-5, RNF-15) — imágenes publicadas por SHA y `latest`
  - **Dado** un merge a `main` con SHA `abc1234`,
  - **Cuando** termina el workflow de publicación,
  - **Entonces** existen en ghcr.io `nimbo-api`, `nimbo-worker` y `nimbo-web` con las etiquetas `sha-abc1234` y `latest`,
    construidas en modo producción, multietapa, sin `devDependencies`, y el proceso principal corre como usuario **no root**
    (`docker run --rm <img> id -u` ≠ `0`). Un PR no publica imágenes (solo las construye).

- **CA-29** (HU-5, RNF-15) — una misma imagen para todos los ambientes
  - **Dado** la imagen `sha-abc1234`,
  - **Cuando** se arranca con el `.env` de staging o con el de local,
  - **Entonces** se comporta según la configuración inyectada, sin reconstrucción. En `web`, la URL de la API y demás
    valores públicos se leen en tiempo de ejecución (no quedan horneados en el build), o el plan justifica una excepción explícita.

- **CA-30** (HU-5, RNF-12, RNF-15) — despliegue automático a staging
  - **Dado** un merge a `main` con las imágenes publicadas,
  - **Cuando** corre el job `deploy-staging` (ambiente `staging` de GitHub con sus secretos),
  - **Entonces** por SSH ejecuta en el Droplet: `docker compose pull`, `migration:run` (contenedor efímero de `api`) y
    `docker compose up -d`; al terminar, `curl -fsS https://api.staging.<dominio>/api/v1/health/ready` devuelve `200` y
    `https://staging.<dominio>` sirve la página de estado de `web` con certificado válido de Let's Encrypt.
    Si `migration:run` falla, el job se detiene **antes** de `up -d` y los contenedores anteriores siguen sirviendo.

- **CA-31** (HU-5, RNF-20) — rollback documentado y ensayado
  - **Dado** un despliegue en staging con la etiqueta `sha-N` y la anterior `sha-N-1` disponible en ghcr.io,
  - **Cuando** el operador sigue el procedimiento de rollback del Manual Técnico (cambiar la etiqueta y `up -d`, sin
    ejecutar `migration:revert` salvo que el procedimiento lo indique),
  - **Entonces** en menos de 10 minutos `/api/v1/health/ready` responde `200` y la cabecera de versión de `api`
    (`x-nimbo-version`, la fija el plan) reporta `sha-N-1`. El ensayo se hace **una vez** en esta spec y su evidencia (tiempo medido, comandos) queda en `verification.md`.

- **CA-32** (HU-5, D-4, D-5) — exposición de red en staging
  - **Dado** el Droplet de staging desplegado,
  - **Cuando** se escanean sus puertos desde fuera (`nmap` o equivalente sobre `80`, `443`, `5432`, `6379`, `9000`, `9001`),
  - **Entonces** solo responden `80` (redirige a `443`) y `443`. Postgres, Redis y la consola de MinIO no son alcanzables
    desde Internet; el API S3 de MinIO solo es alcanzable vía Traefik en `s3.staging.<dominio>` (para URLs firmadas en 005).
    Las respuestas HTTPS incluyen `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options`
    (o `Content-Security-Policy: frame-ancestors`) y `Referrer-Policy`.

### Web mínimo (HU-1)

- **CA-33** (HU-1, D-15) — página de estado de `web`
  - **Dado** `web` en ejecución,
  - **Cuando** se pide `GET /`,
  - **Entonces** responde `200` con una página en español que muestra el nombre «Nimbo», el ambiente (`APP_ENV`) y el
    resultado de consultar `health/ready` de la API («API: disponible» / «API: no disponible», sin exponer detalles), sin
    hojas de estilo propias ni tokens de color (000b los introduce), tipada con `packages/contracts` para el contrato de salud.

## 7. Reglas de negocio

No hay reglas de negocio de producto en esta spec. Reglas técnicas transversales que quedan fijadas:

- **RN-1** Todo error que llega al cliente HTTP tiene la forma `{ code, message, correlationId }`; `code` es estable y en `SCREAMING_SNAKE_CASE` con prefijo de módulo.
- **RN-2** Ninguna bitácora contiene contenido de archivos, nombres de archivo, contraseñas, tokens ni claves de enlace (RNF-17); la lista de campos redactados es única y vive en `shared`.
- **RN-3** `synchronize` es `false` por construcción; todo cambio de esquema es una migración con `down` funcional.
- **RN-4** Un módulo solo importa de otro a través de `modules/<x>/index.ts`; `domain/` no importa frameworks.
- **RN-5** Los endpoints de salud son públicos, no autenticados, y nunca revelan topología ni credenciales.
- **RN-6** Nada se despliega a staging sin pasar por `main` con los seis checks en verde y una aprobación ajena.

## 8. Requisitos no funcionales aplicables

| RNF | Cómo aplica aquí | Cómo se verifica |
|---|---|---|
| RNF-10 | Migraciones versionadas y reversibles; `synchronize: false` fijo | CA-10, CA-11, CA-12 (job `migrations`) |
| RNF-12 | Todo en contenedores; paridad local/staging; arranque desde cero | CA-1, CA-2, CA-3, CA-18, CA-19, CA-30 |
| RNF-15 | Misma imagen en CI, staging y producción; recursos separados | CA-28, CA-29, CA-30 (producción en Fase 4) |
| RNF-16 | Datos sintéticos fuera de producción | Solo el marcador `pnpm seed` (CA-4); el corpus real lo definen 005/019 |
| RNF-17 | `correlationId` en toda bitácora; redacción | CA-13, CA-14, CA-15, CA-16 |
| RNF-18 (parcial) | `/health/live`, `/health/ready`, salud del worker | CA-20 a CA-23. Métricas, tableros y alertas: spec 022 |
| RNF-19 | CI verde + aprobación ajena antes de integrar | CA-24 a CA-27 |
| RNF-20 | Rollback < 10 min | CA-31 (ensayo único aquí; ensayo por fase desde Fase 2, workflow §6) |
| RNF-04 | Todo sobre TLS | CA-30, CA-32 (Let's Encrypt en staging) |

## 9. Seguridad y privacidad

- **¿Toca contenido de archivos?** No. No hay tablas de negocio ni buckets con datos de usuarios; solo la extensión `vector` y el bucket vacío con versionado.
- **¿Qué acciones van a auditoría (RF-07)?** Ninguna: no hay cuentas ni actores reales. `audit` llega en 004.
- **¿Qué operaciones requieren límite de tasa?** Ninguna en esta spec (`ThrottlerModule` en 002). Los endpoints de salud son baratos y no consultan datos de cuentas; si en 022 se detecta abuso, se limita ahí.
- **Secretos**: viven únicamente en `.env` local (en `.gitignore`) y en GitHub Secrets/Environments. `.env.example` solo contiene valores de desarrollo no sensibles o vacíos. gitleaks corre sobre todo el historial al activar el CI (CA-27, T-32) y en cada PR; el repositorio es privado (D-2).
- **Contenedores**: los tres procesos corren sin root (CA-28); imágenes multietapa sin herramientas de compilación en la etapa final.
- **Red en staging**: Postgres, Redis y MinIO solo en la red interna de compose; nada publica puertos salvo Traefik (CA-32). MinIO solo vía Traefik cuando 005 necesite URLs firmadas; la consola de MinIO nunca se expone.
- **Cabeceras en Traefik**: HSTS, `nosniff`, `X-Frame-Options`/`frame-ancestors`, `Referrer-Policy`; redirección 80→443 (CA-32). Las cabeceras específicas del origen aislado de archivos (RNF-07) las define 005.
- **Bitácoras**: redacción por nombre de campo (CA-15); los errores no controlados no exponen `stack` al cliente (CA-16); `health/ready` no expone hosts ni credenciales (CA-22); el validador de configuración no imprime valores (CA-18).
- **Acceso al servidor**: solo por clave SSH; la clave de deploy es exclusiva de GitHub Actions y el usuario de deploy no tiene acceso a otros recursos que el directorio de compose y Docker.
- **Roles internos**: ningún rol obtiene información de cuentas desde esta spec; los endpoints públicos (`health/*`, página de estado) devuelven solo estado agregado.

## 10. Experiencia de usuario

| Pantalla | Mockup | Capturas | Estados requeridos | Estado del mockup |
|---|---|---|---|---|
| Página de estado de `web` (`/`) | — (decisión explícita: sin mockup) | — | API disponible / no disponible | No aplica |

- **Sin interfaz propia**: la única página es un marcador técnico sin estilos, texto plano en español, que 000b
  reemplaza o reviste con Cielo Sereno. **Decisión explícita: no se crea mockup** (Art. XIII.1, segunda opción). No se
  convoca al `ui-designer` para esta spec.
- Mensajes clave: «API: disponible», «API: no disponible. Revisa el estado de los servicios.» y, para errores HTTP,
  el mensaje genérico «Ocurrió un error inesperado. Intenta de nuevo; si persiste, comparte este código con soporte: `<correlationId>`».

## 11. Fuera de alcance

- Cualquier comportamiento funcional (registro, archivos, planes…): specs 001 en adelante.
- Tokens, tema shadcn, fuentes, layout, `components/nimbo`: spec **000b**.
- Tabla `plan`, `PlanLimits`, `IPlanLimitsProvider`: spec **006a**.
- `JwtAuthGuard`, `RolesGuard`, construcción del `Actor` desde el JWT, `accessibleNodes`, RLS: specs **002/003**.
- `ThrottlerModule` y límites de tasa: **002**.
- Métricas Prometheus, `/metrics`, Grafana, alertas, respaldo diario y restauración: **022**.
- Ambiente de **producción** (Droplet, dominio final, despliegue manual por etiqueta): **Fase 4**; aquí solo quedan compose y job parametrizados.
- Integración de ONLYOFFICE en código (JWT, callback, indicador de salud): **016/022**. Aquí solo el servicio en compose bajo perfil.
- Pruebas E2E con Playwright y de carga con k6: solo la carpeta y el script marcador; contenido en **000b/023**.
- Corpus sintético real (`pnpm seed`): **005/019**.
- Segundo servidor, alta disponibilidad, CDN, WAF.

## 12. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Crédito del Student Pack (~US$200) se consume: staging 4 GB ≈ US$24/mes + producción 8 GB ≈ US$48/mes desde Fase 4 | Sin ambiente para demostrar | Registrar el consumo mensual en `verification.md`; apagar ONLYOFFICE en staging cuando no se use; un solo Droplet hasta Fase 4 |
| Aprobación del dominio `.me` del Student Pack tarda o se rechaza | Sin TLS válido ni URL pública | Iniciar la solicitud el primer día; alternativa temporal: subdominio `*.sslip.io` del IP del Droplet con Let's Encrypt (misma configuración de Traefik) |
| 4 GB de RAM con ONLYOFFICE encendido (≈ 4 GB solo él) | Staging inestable o OOM | Perfil apagado por defecto; límites de memoria en compose; encender solo para demos de 016 |
| Tiempo de Adrián: 000 bloquea a las otras tres personas | Retraso de toda la Fase 1 | Orden de entrega: contratos + compose + esqueleto + CI (semana 1) antes que deploy/rollback (semana 2); PRs pequeños que desbloqueen a cada dueño |
| Límites de tasa de Let's Encrypt al iterar la configuración | Certificados bloqueados una semana | Usar el servidor de *staging* de Let's Encrypt hasta que Traefik esté estable |
| Cuota de GitHub Pro en repo privado: 3 000 min/mes de Actions y 2 GB de Packages | CI bloqueado a fin de mes; `build-publish` falla por cuota | `concurrency` que cancela runs obsoletos; `int`/`isolation`/`migrations` solo en `pull_request` y `push: main`, no en cada push de rama; retención de imágenes en ghcr.io (conservar `latest` + últimas 5 por app); revisar el consumo en cada cierre de fase; si se agota, hacer público el repo (un clic, sin cambios de código) |
| Tiempo de CI con Testcontainers en runners de GitHub | PRs lentos | Caché de pnpm y de capas Docker; imágenes pequeñas (`pgvector/pgvector`, `redis:alpine`, `minio/minio`) |

## 13. Dependencias y documentos a actualizar

- **ADR**: ADR-0001 (monolito modular con worker), ADR-0002 (NestJS + TypeORM con migraciones manuales), **ADR-0008**
  (herramienta de lint de fronteras: la decide `architect` en el plan), ADR-0009 (Crystal Clear + SDD), ADR-0010
  (separación de módulos: define el listado de módulos que el lint conoce), **ADR menor nuevo**: gitleaks en CI (D-10).
  Los ADR 0001, 0002, 0008, 0009 y 0010 deben pasar de `Pendiente` a `Aceptado` a más tardar al aprobar el plan.
- **DF que afecta**: DF-02, DF-03, DF-30, DF-34 (lista de módulos y DAG que el lint de fronteras hace cumplir);
  DF-06, DF-23, DF-24 (convenciones de tipos que el plan fija en `packages/config`/lint: `bigint` para bytes, centavos
  para dinero, bytes en `plan`); DF-29 (indicadores de salud: aquí Postgres, Redis y MinIO; ONLYOFFICE después).
- **Documentos**: `docs/sdd/product-context.md` §8 (proveedor DigitalOcean, dominio, subdominios), `CLAUDE.md`
  «Comandos del repositorio» (quitar la nota de «aún no existe `package.json`»), `README.md` raíz (arranque desde cero),
  Manual Técnico (instalación, despliegue, rollback), `docs/adr/README.md`.

## 14. Preguntas

- **[RESUELTA 2026-09-15, Adrián]** Dominio: **`nimbo.me`** (`DOMAIN=nimbo.me`; subdominios `staging.nimbo.me`, `api.staging.nimbo.me`, `docs.staging.nimbo.me`, `s3.staging.nimbo.me`).
- **[RESUELTA 2026-09-15, Adrián]** Mailpit **solo en el override local**; no va en el compose base de staging. El correo real de staging lo define la spec 001.
- **[RESUELTA 2026-09-15, Adrián]** Repositorio y namespace de ghcr.io en la cuenta personal de Adrián: `ghcr.io/afmatul/nimbo-api`, `nimbo-worker`, `nimbo-web`.

## 15. Registro de cambios

| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-09-15 | Creación de la spec (Borrador) | Inicio de Fase 1 | — |
| 2026-09-15 | Resueltas las 3 preguntas (dominio `nimbo.me`, Mailpit solo local, ghcr.io/afmatul); spec pasa a Aclarada | Compuerta humana | Adrián |
| 2026-09-15 | Precisión editorial: §2, CA-30 y CA-31 usan la ruta completa `/api/v1/health/ready` (igual que CA-1, CA-20–22) y la versión se reporta en la cabecera `x-nimbo-version`. Sin cambio de comportamiento. `plan.md` creado (Propuesto) | Coherencia spec ↔ plan | — (pendiente de `architect`) |
| 2026-09-15 | Precisión (CA-23): la salud del `worker` se sirve por HTTP en el puerto interno `WORKER_PORT` (nunca publicado) en `/health/live` y `/health/ready` **sin** prefijo `/api/v1`, porque no es API pública. `plan.md` aprobado con cambios por `architect` e incorporados | Observación (c) de la aprobación de arquitectura | architect (plan §11) |
| 2026-09-16 | Plan `Aprobado` (§11.0) y `tasks.md` generado (44 tareas, 6 bloques, matriz CA→tarea completa). Estado → Planificada | Compuerta: architect + Adrián | Adrián |
| 2026-09-16 | D-2: el repositorio será **privado** (GitHub Pro del Student Pack cubre la protección de `main`). D-10/CA-27: gitleaks histórico al activar el CI en vez de «antes de publicar». Riesgo nuevo: cuota de Actions/Packages con mitigaciones | Decisión de Adrián | Adrián |
| 2026-09-22 | Calendario: los bloques 3 (compuerta ADR/DF), 4 (CI), 5 (imágenes) y 6 (staging) pasan a la primera semana de Fase 2; D-4 dice «desde el inicio de Fase 2». Sin cambio de criterios de aceptación, reglas ni diseño. Mientras tanto rigen las excepciones temporales de `docs/sdd/workflow.md` §7 (verificación local en lugar del CI; `Hecha` = integrada y demostrable en local) | Calendario de la Fase 1 | Adrián |
