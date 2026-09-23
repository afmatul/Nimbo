# Nimbo

Plataforma de **Almacenamiento como Servicio** con edición colaborativa de `.docx`, historial de versiones con
autoría e inteligencia documental con citas. Proyecto final de Ingeniería de Software I (URL, 2026), construido
con Crystal Clear y Spec-Driven Development. El contexto completo está en [`CLAUDE.md`](CLAUDE.md) y en `docs/sdd/`.

## Requisitos

- Git.
- Docker con Compose v2 (`docker compose version`).
- Node 22 (el archivo `.nvmrc` fija la versión: `nvm use` o `fnm use`). Otras versiones se rechazan por
  `engine-strict` (`.npmrc`).
- pnpm 10 vía corepack: `corepack enable` (la versión exacta está en `packageManager` de `package.json`).

## Arranque desde cero (CA-1 de la spec 000)

Ejecuta, en orden y desde la raíz del repositorio:

```bash
pnpm install                         # instala el workspace y compila packages/contracts
cp .env.example .env                 # valores locales listos; no hace falta editar nada
docker compose up -d                 # Postgres (pgvector), Redis, MinIO, Traefik y Mailpit
pnpm --filter api migration:run      # migraciones de la API (llega con el PR-2 de la spec 000)
pnpm dev                             # api (3000), worker (3001, salud interna) y web (3002)
```

`api`, `worker` y las migraciones leen ese `.env` de la raíz al arrancar (`process.loadEnvFile`, integrado en
Node 22). Las variables que ya estén en el entorno **ganan** sobre el archivo, así que en staging y en los
contenedores el `.env` es opcional: allí la configuración llega del entorno.

Resultado esperado (menos de 10 minutos sin contar descargas de imágenes):

| URL                                    | Qué es                                             |
| -------------------------------------- | -------------------------------------------------- |
| `http://localhost`                     | Página de estado de `web` (vía Traefik)            |
| `http://localhost/api/v1/health/ready` | Salud de la API con Postgres, Redis y MinIO        |
| `http://localhost/api/v1/health/live`  | Vida del proceso `api` (sin consultar nada)        |
| `http://localhost:8025`                | Mailpit (correo de desarrollo)                     |
| `http://localhost:8080`                | Panel de Traefik (solo local)                      |
| `http://localhost:9001`                | Consola de MinIO (`MINIO_ROOT_USER` / `_PASSWORD`) |

El proceso `worker` escribe la bitácora `worker.started` con su `correlationId` al arrancar.

### Puertos en el host

`api` 3000 · `worker` 3001 (solo salud interna, nunca publicado en compose) · `web` 3002. Traefik (puerto 80) enruta
`/` → 3002 y `/api` → 3000 hacia el host (`infra/traefik/local-routes.yml`); `/s3` → MinIO y `/docs` → ONLYOFFICE.

### Perfiles de compose

- Sin perfil (`docker compose up -d`): `postgres`, `redis`, `minio`, `minio-init`, `traefik`, `mailpit`.
- `--profile onlyoffice`: agrega ONLYOFFICE Docs (≈ 3 GB de memoria); `http://localhost/docs/healthcheck` responde
  `true`. Solo hace falta para la edición colaborativa (spec 016).
- `--profile apps`: construye y corre `api`, `worker` y `web` en contenedores en lugar de `pnpm dev` (requiere los
  `Dockerfile` del PR-4 de la spec 000).

## Comandos del día a día

```bash
pnpm lint && pnpm typecheck     # verificaciones estáticas (ESLint flat + Prettier, TypeScript strict)
pnpm test                       # unitarias (raíz, packages/*, apps/*)
pnpm test:int                   # integración con Testcontainers (apps/api)
pnpm test:isolation             # aislamiento entre cuentas (bloqueante en CI)
pnpm test:e2e                   # marcador hasta 000b/023
pnpm env:check                  # .env.example vs. esquemas de configuración
pnpm --filter api migration:generate -- <nombre>
pnpm --filter api migration:run | migration:revert
pnpm seed                       # marcador hasta 005/019
```

## Estructura

```
apps/api        NestJS: módulos de la lógica del sistema + shared (T1); worker.main.ts es la raíz del worker
apps/worker     paquete delgado del proceso worker (healthcheck, Dockerfile); compone módulos de api
apps/web        Next.js (App Router)
packages/contracts   contratos HTTP compartidos web ↔ api (zod)
packages/config      tsconfig, ESLint, Prettier y Jest compartidos
infra/          configuraciones de Traefik, MinIO y despliegue (los compose viven en la raíz)
docs/           SDD (constitución, arquitectura, modelo de diseño), diseño y mockups
specs/          backlog y specs (spec.md, plan.md, tasks.md, verification.md)
```

## Operación

La documentación operativa se escribe en la spec 000: `docs/operations/ambientes.md` (variables y diferencias
local/staging), `docs/operations/despliegue.md` (staging en DigitalOcean, protección de `main`) y
`docs/operations/rollback.md` (volver a la etiqueta anterior). Son la base del Manual Técnico.

## Solución de problemas

- `ERR_PNPM_UNSUPPORTED_ENGINE`: la versión de Node no es 22. Usa `nvm use` (o `nvm install 22`) y repite.
- `next build` con `output: 'standalone'` en Windows puede fallar con `EPERM … symlink`: activa el Modo de
  desarrollador de Windows (permite symlinks) o construye la imagen con Docker; `pnpm dev` no lo necesita.
- Docker Desktop apagado: `docker compose config --services` valida los archivos sin daemon; `up -d` lo necesita.
