# Imagen `nimbo-worker` (plan 000 §6.5, ADR-0038, PD-128). Contexto = raíz del repositorio.
# Un solo artefacto para los dos procesos `worker`: el general (`CMD` por omisión) y el `worker-optimizer`
# (`node dist/worker-optimizer.main.js`); solo cambia el comando. Todas las etapas usan la misma base glibc
# (`trixie-slim`, ADR-0038): `node_modules` y binarios nativos (`sharp`/libvips, `argon2`) nunca cruzan de libc.
# Debian 13 porque su Ghostscript (10.05.1, con parches de seguridad) corrige CVE que Debian 12 deja abiertos.
ARG NODE_IMAGE=node:22.23.3-trixie-slim

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
RUN pnpm install --frozen-lockfile --offline --filter "worker..."
RUN pnpm --filter @nimbo/contracts build \
  && pnpm --filter api build \
  && pnpm --filter worker build

# Sin `devDependencies` (CA-28). De lo que despliega pnpm solo pasan `package.json` y `node_modules` (sin `src`,
# `test` ni configuraciones); `dist` se copia de la compilación, con el `healthcheck` de `apps/worker`.
FROM build AS prod
RUN pnpm --filter api deploy --prod --legacy /deploy \
  && mkdir /out \
  && mv /deploy/package.json /deploy/node_modules /out/ \
  && cp -r apps/api/dist /out/dist \
  && cp apps/worker/dist/healthcheck.js /out/dist/healthcheck.js \
  && cp apps/api/deploya-entrypoint.sh /out/deploya-entrypoint.sh

FROM ${NODE_IMAGE} AS runtime
# Ghostscript para PDF de 019 (ADR-0033) y futuro 021b; 021 JPEG/PNG no lo usa. Se comparte imagen, no pipeline.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ghostscript \
  && rm -rf /var/lib/apt/lists/*
ARG APP_VERSION=0.0.0
ENV NODE_ENV=production \
  APP_VERSION=${APP_VERSION} \
  GHOSTSCRIPT_BIN=gs \
  MALLOC_ARENA_MAX=2
WORKDIR /app
# Archivos de `root` y solo lectura para `node`: el proceso no puede modificar su propio código.
COPY --from=prod /out ./
USER node
# Humo en la imagen final, con el `node_modules` desplegado y el usuario de ejecución: `sharp`/libvips cargan en glibc,
# Ghostscript responde y `MALLOC_ARENA_MAX` está fijado. Si algo falla, el build falla.
RUN node -e "const s = require('sharp'); console.log('sharp', s.versions.sharp, 'libvips', s.versions.vips)" \
  && gs --version \
  && ldd --version | head -n 1 \
  && test "$MALLOC_ARENA_MAX" = 2
# Por omisión el `worker` general; el `worker-optimizer` sobrescribe el comando y el `HEALTHCHECK`
# (`node dist/healthcheck.js WORKER_OPTIMIZER_PORT`).
HEALTHCHECK --interval=20s --timeout=5s --start-period=30s --retries=2 \
  CMD ["node", "dist/healthcheck.js"]
# Entrypoint compartido con el `api`, sin `--migrate`: en Deploya solo traduce las variables de los recursos de datos
# (docs/operations/deploya.md); sin variables `DEPLOYA_*` ejecuta el comando tal cual. `command:` de compose y el
# `comandoInicio` de Deploya reemplazan solo el CMD.
ENTRYPOINT ["sh", "/app/deploya-entrypoint.sh"]
CMD ["node", "dist/worker.main.js"]
