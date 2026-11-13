# Plan 025 — Despliegue público en Deploya

> Spec: `./spec.md` · Estado del plan: Aprobado
> Redactado a posteriori con lo implementado (2026-11-13).

## 1. Resumen técnico
Cada proceso de Nimbo se construye con su Dockerfile y corre como un proyecto de Deploya. Un **entrypoint** traduce las
variables inyectadas por los recursos de datos (`DEPLOYA_*`, `S3_*`) a las de Nimbo, crea el rol `nimbo_app` y migra
(solo en el api). Fuera de Deploya el entrypoint no actúa. ONLYOFFICE se arma en una imagen propia compatible con las
reglas de Deploya (`--cap-drop ALL`, sin volúmenes, sin root). Todo se documenta en `docs/operations/deploya.md`.

## 2. Módulos, archivos y diseño
| Capa | Archivo | Responsabilidad |
|---|---|---|
| Imagen api | `Dockerfile` (raíz) | Multi-etapa, `pnpm deploy --prod`, usuario `node`, `ENTRYPOINT … --migrate`; base `mirror.gcr.io` |
| Entrypoint | `apps/api/deploya-entrypoint.sh` | Si hay `DEPLOYA_*`: traduce variables, `--migrate` crea rol y migra; luego `exec` |
| Traducción | `apps/api/src/scripts/deploya-env.ts`, `print-deploya-env.ts` | Función pura `S3_*`→`MINIO_*`, dueño→`DATABASE_MIGRATION_URL`, `DATABASE_URL`→`nimbo_app`; avisos sin valores |
| Rol | `apps/api/src/scripts/ensure-app-role.ts` | Crea/actualiza `nimbo_app` (equivale a `infra/postgres/init/10-nimbo-app.sh`) |
| Prueba | `apps/api/src/scripts/deploya-env.spec.ts` | Traducción, no pisar al usuario, `eval` con `'`, `$` y espacios |
| Imagen worker | `apps/worker/Dockerfile` | Misma imagen para worker y optimizer (comando de inicio distinto); entrypoint de Deploya |
| Imagen web | `apps/web/Dockerfile`, `apps/web/src/app/(public)/layout.tsx` | `standalone` de Next; `force-dynamic` en páginas públicas |
| ONLYOFFICE | `infra/deploya/onlyoffice/{Dockerfile,entrypoint.sh,nginx.conf}`, `.dockerignore` | Docs 9.3.1 (SHA-256) sobre `ubuntu:24.04`, usuario `ds`, nginx en `PORT`, RabbitMQ interno, esquema `onlyoffice`, `X-Forwarded-Proto: https` |
| Plantillas | `infra/deploya/{api,worker,optimizer,web,docs}.env` | Solo lo obligatorio; secretos como `<genera-uno>` |
| Compose | `compose.override.yml` | Apunta al `Dockerfile` de la raíz |
| Guía | `docs/operations/deploya.md` | Pasos, límites, síntomas y prueba |

Puertos nuevos: ninguno. Dependencias entre módulos: ninguna. Dependencias nuevas: ninguna (ONLYOFFICE ya está en ADR-0004).

## 3. Datos
Sin migraciones. El entrypoint solo crea el rol `nimbo_app` (sin privilegios, idempotente) y corre las existentes (48 en la prueba; el segundo despliegue aplica `[]`).

## 4. Contratos
Sin endpoints nuevos. Variables de Deploya: `DEPLOYA_POSTGRES_URL`, `DEPLOYA_REDIS_URL`, `S3_*`, `PORT`, y las cuatro de edición en el api (`ONLYOFFICE_JWT_SECRET`, `ONLYOFFICE_PUBLIC_URL`, `ONLYOFFICE_INTERNAL_URL`, `EDITING_CALLBACK_BASE_URL`).

## 5. Seguridad y operación
- La app solo conecta como `nimbo_app` (`DatabaseRoleCheck`, ADR-0005); el dueño solo migra.
- El entrypoint imprime nombres de variables, nunca valores; ninguna plantilla trae secretos.
- Orden de despliegue: api → worker → optimizer → web → docs (+ variables de edición en el api).
- Primer administrador: comando de inicio temporal con `bootstrap-admin.js` (Deploya no tiene consola).

## 6. Estrategia de pruebas (por riesgo)
| CA | Nivel | Dónde |
|---|---|---|
| CA-3, CA-4 | unit | `deploya-env.spec.ts` |
| CA-1, CA-2, CA-5, CA-6, CA-7, CA-8 | simulación local fiel a Deploya (`guía §6`) | builder clásico, sin `.dockerignore`, recursos como Deploya, `--cap-drop ALL --memory 1g --cpus 1`, `GET /` cada 1 s hasta 60 s |
| CA-9, CA-10 | simulación + Chromium | conversión JWT `.docx`→PDF 1,1 s; edición con `status 2`; verificación real en la demo tras #115–#117 |
| CA-11, CA-12 | revisión | Dockerfiles y guía |

Resultados: api 404 en 4,3 s (87 MiB), worker 2,2 s (85), optimizer 2,2 s (78), web 200 en 1,3 s (70), docs 200 en 9,4 s (534). Builds: 159–192 s; imágenes 437–658 MB, docs 4,08 GB.

## 7. Riesgos y coherencia con el diseño
- Docker Hub 429 → `mirror.gcr.io`. Redirecciones de nginx rotas por reemplazo global de `$the_scheme` → solo `X-Forwarded-Proto`, con verificación que falla con diagnóstico (#116, #117).
- No cubierto: TLS y proxy reales (WebSocket, `readTimeout` 60 s), edición contra el api real en Deploya y entrega real de correo, salvo lo comprobado en la demo.
- Desviaciones de diagramas: ninguna. Pendientes: ver §9 de la spec. ADR: ninguno.

## 8. Aprobación
- `architect`: no aplica (sin puerto, tecnología nueva ni cambio de arquitectura).
- Adrián: Aprobado — 2026-11-12 (PRs #109, #110, #113, #115, #116, #117).
