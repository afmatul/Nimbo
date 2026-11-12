# Imagen `nimbo-api` (plan 000 §6.5). Contexto = raíz del repositorio. Misma base y etapas que `apps/worker/Dockerfile`
# (glibc `trixie-slim`, ADR-0038): `argon2` y `sharp` se instalan y corren en la misma libc. Sin Ghostscript: el `api`
# no extrae texto de PDF (019 D-1). Sirve en compose (perfil `apps`) y en Deploya (docs/operations/deploya.md).
# Vive en la raíz y no en `apps/api/` porque el alta de un proyecto en Deploya exige un `Dockerfile` en la raíz; los
# demás proyectos (worker, optimizer, web) cambian después la «Ruta del Dockerfile» a `apps/<app>/Dockerfile`.
# Misma imagen oficial `node:22.23.3-trixie-slim`, desde el mirror público de Google: Docker Hub limita las descargas
# anónimas por IP (429 Too Many Requests) y los servidores de construcción compartidos, como el de Deploya, lo agotan.
ARG NODE_IMAGE=mirror.gcr.io/library/node:22.23.3-trixie-slim

FROM ${NODE_IMAGE} AS base
ENV CI=true
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /repo

# Caché de capa: solo el lockfile descarga los paquetes.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm fetch

FROM deps AS build
COPY . .
RUN pnpm install --frozen-lockfile --offline --filter "api..."
RUN pnpm --filter @nimbo/contracts build \
  && pnpm --filter api build

# Sin `devDependencies` (CA-28): de lo que despliega pnpm solo pasan `package.json` y `node_modules`; `dist` sale de
# la compilación y el entrypoint de Deploya se copia aparte.
FROM build AS prod
RUN pnpm --filter api deploy --prod --legacy /deploy \
  && mkdir /out \
  && mv /deploy/package.json /deploy/node_modules /out/ \
  && cp -r apps/api/dist /out/dist \
  && cp apps/api/deploya-entrypoint.sh /out/deploya-entrypoint.sh

FROM ${NODE_IMAGE} AS runtime
ARG APP_VERSION=0.0.0
ENV NODE_ENV=production \
  APP_VERSION=${APP_VERSION} \
  PORT=3000
WORKDIR /app
# Archivos de `root` y solo lectura para `node`: el proceso no puede modificar su propio código.
COPY --from=prod /out ./
USER node
# Humo con el `node_modules` desplegado y el usuario de ejecución: los binarios nativos cargan en glibc.
RUN node -e "require('argon2'); const s = require('sharp'); console.log('argon2 ok, sharp', s.versions.sharp)"
EXPOSE 3000
HEALTHCHECK --interval=20s --timeout=5s --start-period=60s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/v1/health/live').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
# `--migrate`: en Deploya crea `nimbo_app` y migra antes de arrancar; sin variables `DEPLOYA_*` solo ejecuta el CMD.
ENTRYPOINT ["sh", "/app/deploya-entrypoint.sh", "--migrate"]
CMD ["node", "dist/main.js"]
