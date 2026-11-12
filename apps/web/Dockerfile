# Imagen `nimbo-web` (plan 000 §6.5, CA-28/CA-29). Contexto = raíz del repositorio. Salida `standalone` de Next
# (`next.config.ts`, con `outputFileTracingRoot` en la raíz): el servidor queda en `apps/web/server.js` con solo los
# módulos que traza. Nada se hornea en el build (no hay `NEXT_PUBLIC_*`): la misma imagen sirve en cualquier ambiente.
# Misma imagen oficial `node:22.23.3-trixie-slim`, desde el mirror público de Google: Docker Hub limita las descargas
# anónimas por IP (429 Too Many Requests) y los servidores de construcción compartidos, como el de Deploya, lo agotan.
ARG NODE_IMAGE=mirror.gcr.io/library/node:22.23.3-trixie-slim

FROM ${NODE_IMAGE} AS base
ENV CI=true \
  NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /repo

# Caché de capa: solo el lockfile descarga los paquetes.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm fetch

FROM deps AS build
COPY . .
RUN pnpm install --frozen-lockfile --offline --filter "web..."
RUN pnpm --filter @nimbo/contracts build \
  && pnpm --filter web build

FROM ${NODE_IMAGE} AS runtime
ARG APP_VERSION=0.0.0
# `HOSTNAME=0.0.0.0`: el `server.js` de Next escucha en `HOSTNAME`, y Docker lo fija al id del contenedor.
ENV NODE_ENV=production \
  NEXT_TELEMETRY_DISABLED=1 \
  APP_VERSION=${APP_VERSION} \
  PORT=3002 \
  HOSTNAME=0.0.0.0
WORKDIR /app
# Código de `root`, solo lectura para `node`; solo la caché de Next es escribible.
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
RUN mkdir -p apps/web/.next/cache && chown node:node apps/web/.next/cache
USER node
EXPOSE 3002
HEALTHCHECK --interval=20s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3002) + '/').then((r) => process.exit(r.status < 500 ? 0 : 1), () => process.exit(1))"]
CMD ["node", "apps/web/server.js"]
