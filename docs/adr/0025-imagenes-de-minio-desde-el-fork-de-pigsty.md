# ADR-0025 — Imágenes de MinIO desde el fork de Pigsty (`pgsty/silo` y `pgsty/mc`)

| Campo | Valor |
|---|---|
| Estado | Propuesto |
| Fecha | 2026-10-07 |
| Decisores | Adrián |
| Specs relacionadas | 000, 005 |

## Contexto
El almacenamiento de objetos (MinIO, ADR-0015) usaba `quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z` y
`quay.io/minio/mc:RELEASE.2025-08-13T08-35-41Z`, en `compose.yml` y en Testcontainers (`MINIO_IMAGE`). Docker Hub ya había
dejado de servir `minio/minio`, y el 2026-10-07 Quay tampoco sirve esos tags: `docker manifest inspect` responde
`no such manifest`. En una máquina sin esas imágenes en caché, `docker compose up -d` y `pnpm test:int` fallan en
cualquier rama; ya le pasó a un integrante. Usamos de MinIO: `server /data`, `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD`,
`MINIO_API_CORS_ALLOW_ORIGIN` (cargas prefirmadas, 005), el healthcheck `mc ready local` dentro del contenedor del
servidor, `GET /minio/health/live` (espera de Testcontainers) e `infra/minio/init.sh` (`mc alias set`, `mc mb
--ignore-existing`, `mc version enable`).

## Opciones consideradas
1. **Fork compatible de Pigsty (`pgsty/silo` + `pgsty/mc`, tag fijo)** — pros: se descarga hoy desde Docker Hub; acepta
   los mismos comandos, variables y rutas de salud; el cliente se cambia junto con el servidor; no toca código de
   producción (el adaptador habla S3). Contras: depende de un tercero distinto del autor original y salta un año de
   versiones (2025-09 → 2026-09).
2. **Compilar MinIO desde el código fuente y publicar la imagen propia** — pros: control total. Contras: hay que mantener
   un pipeline de imágenes y un registro; no cabe en el calendario del curso.
3. **Cambiar a otro almacenamiento S3 (p. ej., SeaweedFS, Garage)** — pros: proyectos activos. Contras: otro
   healthcheck, otra inicialización y otra semántica de versionado; habría que revalidar 005, 006 y 007.
4. **No hacer nada (depender de la caché local)** — contras: rompe a quien no tenga la imagen y a cualquier CI limpio.

## Decisión
Opción 1, con el tag fijo `RELEASE.2026-09-16T00-00-00Z` (nunca `latest`) para servidor y cliente a la vez, en
`compose.yml`, `MINIO_IMAGE` de `apps/api/test/int/setup/containers.ts` y `docs/operations/ambientes.md`. No se usa la
variante distroless porque el healthcheck ejecuta `mc ready local` dentro del contenedor del servidor.

Verificado el 2026-10-07 con las imágenes reales: `server /data` arranca (el binario se llama `silo`; el entrypoint
acepta `server`), `mc ready local` sale con 0, `/minio/health/live` responde 200, `init.sh` sin cambios crea el bucket
con versionado y es idempotente, y `MINIO_API_CORS_ALLOW_ORIGIN` se respeta en el preflight. Con el cambio,
`docker compose up -d` queda sano y `pnpm test:int` pasa completo (98 suites, 941 pruebas).

## Consecuencias
- Positivas: el entorno local y las pruebas de integración vuelven a levantarse en máquinas limpias; sin cambios de
  código de producción ni del script de inicialización.
- Negativas / deuda aceptada: dependemos del fork de Pigsty. La imagen `pgsty/mc` es mínima (sin `sed`, `grep` ni
  `awk`): `infra/minio/init.sh` debe limitarse a `sh` y `mc`. Un volumen `minio_data` creado con la imagen anterior
  arrancó sin cambios (probado en local); si algún equipo falla, se recrea con `docker compose down -v`.
- Cómo sabremos si fue un error: el fork deja de publicar o de servir el tag, o una prueba de `storage` (005–007) falla
  por diferencias de comportamiento S3; en ese caso se reevalúan las opciones 2 y 3.
