# Despliegue en Deploya · traspaso (WIP)

Rama `chore/despliegue-en-deploya`. Contrato de Deploya que manda: `docs/contratos/recursos-datos.md` del repo
`derekCmorales/deploya` (variables inyectadas `DATABASE_URL`/`PG*`, `REDIS_URL`, `S3_*` y `DEPLOYA_*`; las del
usuario ganan; `comandoInicio` reemplaza solo el `CMD`, nunca el `ENTRYPOINT`).

## Lo que ya está (sin verificar: no se ha corrido lint, typecheck, pruebas ni `docker build`)

| Archivo | Qué hace |
|---|---|
| `apps/api/Dockerfile` | Imagen `nimbo-api` (trixie-slim, pnpm deploy --prod, usuario `node`), `EXPOSE 3000`, `ENTRYPOINT deploya-entrypoint.sh --migrate`, `CMD node dist/main.js` |
| `apps/web/Dockerfile` | Next standalone, `EXPOSE 3002`, `CMD node apps/web/server.js` |
| `apps/worker/Dockerfile` | Copia el entrypoint y lo usa sin `--migrate` |
| `apps/api/deploya-entrypoint.sh` | Sin variables `DEPLOYA_*` solo hace `exec "$@"`. Con ellas: exporta lo de `print-deploya-env.js`; con `--migrate` corre `ensure-app-role.js` y `migrate.js run` |
| `apps/api/src/scripts/deploya-env.ts` (+ `.spec.ts`) | Traducción pura `DEPLOYA_*`/`S3_*` → `MINIO_*`, `REDIS_URL`, `DATABASE_URL` (rol `nimbo_app`) y `DATABASE_MIGRATION_URL` (dueño `deploya`) |
| `apps/api/src/scripts/ensure-app-role.ts` | Crea o actualiza el rol `nimbo_app` con `NIMBO_APP_DB_PASSWORD` (equivale a `infra/postgres/init/10-nimbo-app.sh`) y `CREATE EXTENSION vector` |
| `apps/api/src/scripts/print-deploya-env.ts` | Imprime los `export` seguros para `eval` en el entrypoint |

## Lo que falta (en orden)

1. **Verificación estática:** `pnpm install`, luego `pnpm lint && pnpm typecheck` y `pnpm --filter api test -- deploya-env`. Confirmar que
   `nest build` emite `dist/scripts/{print-deploya-env,ensure-app-role,migrate}.js` (revisar `tsconfig.build.json` y
   `tsconfig.worker.json`: el worker también necesita `print-deploya-env.js`).
2. **Escape en `print-deploya-env`:** que las comillas de los valores sean seguras para `eval` (contraseñas con `'`, `$` o espacios), con su prueba.
3. **Plantillas** `infra/deploya/{api,worker,optimizer,web}.env` con solo lo obligatorio del esquema zod (≤ 150 variables cada una):
   - URLs públicas `https://nimbo.deploya.larasolutions.dev` y `https://nimbo-api.deploya.larasolutions.dev`;
   - `CORS_ORIGIN`, `WEB_PUBLIC_URL`, `API_PUBLIC_URL`;
   - `API_INTERNAL_URL` = la URL pública de la api (la web está en otra red);
   - `APP_ENV=staging`, para que las cookies lleven `Secure`;
   - `MINIO_BUCKET=app` (Deploya lo crea con versionado);
   - marcadores `<genera-uno>` para JWT, `NIMBO_APP_DB_PASSWORD`, `GEMINI_API_KEY` y SMTP.
4. **ONLYOFFICE:** comprobar que la api arranca con `ONLYOFFICE_*` vacío o ausente (sin edición colaborativa) y documentarlo.
5. **Guía `docs/operations/deploya.md`:**
   - hacer público el repo;
   - crear 4 proyectos (Pro):

     | Proyecto | Dockerfile | Puerto | Comando de inicio |
     |---|---|---|---|
     | `nimbo-api` | `apps/api/Dockerfile` | 3000 | — |
     | `nimbo-worker` | `apps/worker/Dockerfile` | 3001 (`WORKER_PORT`) | — |
     | `nimbo-optimizer` | `apps/worker/Dockerfile` | 3003 | `node dist/worker-optimizer.main.js` |
     | `nimbo` (web) | `apps/web/Dockerfile` | 3002 | — |

   - en la pestaña *Datos* de `nimbo-api`, crear postgres, redis y s3, y compartirlos con worker y optimizer;
   - pegar los `.env`;
   - desplegar en orden api → worker → optimizer → web;
   - límites: sin ONLYOFFICE, Prometheus, Grafana ni respaldos, y el worker queda con una URL pública de salud;
   - opcional: la regla de ciclo de vida de 7 días de `infra/minio/init.sh` con `mc ilm import`.
6. **Prueba real con Docker:**
   - construir las tres imágenes (anotar tiempo y tamaño; la construcción en Deploya tiene un límite de 20 min);
   - simular Deploya en una red propia con:
     - `pgvector/pgvector:pg17` (usuario `deploya`, base `app`);
     - `redis:7-alpine`;
     - `pgsty/silo:RELEASE.2026-09-16T00-00-00Z` (bucket `app`, creado con `mc`);
   - correr cada app con `--cap-drop ALL --security-opt no-new-privileges --memory 1g --cpus 1`, pasando solo las variables `DEPLOYA_*`/`S3_*` y las plantillas;
   - criterios:
     - migraciones OK;
     - `GET /api/v1/health/ready` responde 200;
     - el worker y el optimizer están sanos;
     - la web responde 200;
     - registrar `docker stats --no-stream`;
   - limpiar contenedores y redes al terminar.
7. **PR** a `main` con la plantilla del repo, cuando todo lo anterior esté en verde.
