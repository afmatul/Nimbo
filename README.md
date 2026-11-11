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
pnpm start:all                       # Todo en uno: Docker + migraciones + api, worker y web (Ctrl+C para parar)
pnpm start:all --prod                # igual, pero con la web compilada (`next build` + `next start`) para medir velocidad real
pnpm dev                             # solo api (3000), worker (3001, salud interna) y web (3002), con Docker ya arriba
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

Los procesos `worker` y `worker-optimizer` (ADR-0038) escriben la bitácora `worker.started` (con `process`) y su
`correlationId` al arrancar.

### Puertos en el host

`api` 3000 · `worker` 3001 y `worker-optimizer` 3003 (solo salud interna, nunca publicados en compose) · `web` 3002. Traefik (puerto 80) enruta
`/` → 3002 y `/api` → 3000 hacia el host (`infra/traefik/local-routes.yml`); `/s3` → MinIO y `/docs` → ONLYOFFICE.

### Perfiles de compose

- Sin perfil (`docker compose up -d`): `postgres`, `redis`, `minio`, `minio-init`, `traefik`, `mailpit`.
- `--profile onlyoffice`: agrega ONLYOFFICE Docs (≈ 3 GB de memoria); `http://localhost/docs/healthcheck` responde
  `true`. Solo hace falta para la edición colaborativa (spec 016).
- `--profile apps`: construye y corre `api`, `worker`, `worker-optimizer` y `web` en contenedores en lugar de `pnpm dev`
  (la imagen de los `worker` existe desde 021 T-10; las de `api` y `web` llegan con el PR-4 de la spec 000).

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
apps/api        NestJS: módulos de la lógica del sistema + shared (T1); worker.main.ts y worker-optimizer.main.ts son las raíces de los worker
apps/worker     paquete delgado del proceso worker (healthcheck, Dockerfile); compone módulos de api
apps/web        Next.js (App Router)
packages/contracts   contratos HTTP compartidos web ↔ api (zod)
packages/config      tsconfig, ESLint, Prettier y Jest compartidos
infra/          configuraciones de Traefik, MinIO y despliegue (los compose viven en la raíz)
docs/           SDD (constitución, arquitectura, modelo de diseño), diseño y mockups
specs/          backlog y specs (spec.md, plan.md, tasks.md, verification.md)
```

## Onboarding del equipo

Lectura del día 1 (~1 h), en este orden: `CLAUDE.md` → `HARNESS.md` → `docs/adr/0009` (cómo trabajamos) →
`docs/sdd/workflow.md` → `docs/sdd/constitution.md` → `specs/README.md` → este README.
Antes de la primera `/spec`: `docs/sdd/product-context.md` (roles, planes, RF/RNF, fuera de alcance),
`docs/sdd/architecture.md` §3–§4, el `README.md` de tu módulo en `apps/api/src/modules/<modulo>/` y
`specs/000-fundaciones/spec.md` como ejemplo. El resto (`design-model.md`, `design-findings.md`, `conventions.md`,
`ui-guidelines.md`) se lee cuando la tarea lo pide.

Dónde vive tu trabajo: `specs/NNN-slug/` (spec, plan, tareas, evidencia), `apps/api/src/modules/<tu-modulo>/`
(backend) y `apps/web/src/features/<tu-modulo>/` (frontend: cada dueño construye también sus pantallas).
`apps/api/src/shared/` es de la spec 000 y su dueño es Adrián: los demás módulos lo consumen desde
`shared/index.ts`, y algo nuevo entra ahí cuando lo necesitan al menos tres módulos (regla de tres, constitución
Art. VI.2), con un PR que revisa su dueño. `docs/design/mockups/` es referencia; nunca se importa.

Flujo por funcionalidad, siempre con Claude Code desde la raíz del repo:

```
/spec <necesidad>   → responder preguntas
/mockup <modulo>/<pantalla> NNN → si la spec tiene interfaz: mockup y capturas de cada pantalla
                    → marcar Aclarada (una spec con interfaz no pasa sin mockup)
/plan NNN           → confirmar el plan
/tasks NNN
/implement NNN      → repetir hasta terminar (requiere los bloques 1–2 de 000, ya en main, y las
                      specs de su columna «Depende de» en specs/README.md)
/verify NNN → /review NNN → PR → aprobación de otro integrante (salvo §7.1) → squash merge
```

Lo siguiente de cada integrante está en `specs/README.md` («Próximos pasos por integrante»).

Rigen dos excepciones: el diseñador principal puede autoaprobar sus PRs durante todo el proyecto, y el CI y staging
se implementan desde el 30/09/2026 (mientras tanto, verificación local pegada en el PR). Detalle en
`docs/sdd/workflow.md` §7.

## Operación

La documentación operativa se escribe en la spec 000: `docs/operations/ambientes.md` (variables y diferencias
local/staging), `docs/operations/despliegue.md` (staging en DigitalOcean, protección de `main`) y
`docs/operations/rollback.md` (volver a la etiqueta anterior). Son la base del Manual Técnico.

## Solución de problemas

- `ERR_PNPM_UNSUPPORTED_ENGINE`: la versión de Node no es 22. Usa `nvm use` (o `nvm install 22`) y repite.
- `next build` con `output: 'standalone'` en Windows puede fallar con `EPERM … symlink`: activa el Modo de
  desarrollador de Windows (permite symlinks) o construye la imagen con Docker; `pnpm dev` no lo necesita.
- Docker Desktop apagado: `docker compose config --services` valida los archivos sin daemon; `up -d` lo necesita.
