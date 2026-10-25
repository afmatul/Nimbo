# Tareas 014b — Original optimizado y cuota

> Spec: `./spec.md` · Plan: `./plan.md`
> 5 a 12 tareas verticales, de medio día a un día, un commit cada una (`feat(storage): … [014b T-xx]`).
> Cada tarea es una línea: criterio, prueba y de qué depende. Los archivos viven en `plan.md`. Sin tareas de «cierre».

- [x] **T-01** Migración `conservada_hasta` (con `down`), columna en la entidad y el repositorio, y `keptUntil` en el contrato y en `FileVersionSummary` — CA: CA-4 — Prueba: migración reversible, columnas de ORM y contrato (unit)
- [x] **T-02** Dominio: `FileVersion.conserveAsOriginal` y `countsInQuota` (prueba primero) — CA: CA-1, CA-3 — Prueba: unitaria — Depende: T-01
- [x] **T-03** `register` conserva el original y aplica el cambio neto con `markKept`, probado con el doble del origen `optimizacion` (cuenta llena incluida) — CA: CA-1, CA-2, CA-3 — Prueba: unitaria + integración `versions-optimization` — Depende: T-02
- [x] **T-04** Historial con `keptUntil`, descarga y restauración del original con y sin cuota — CA: CA-4, CA-5 — Prueba: integración `versions-optimization` — Depende: T-03
- [x] **T-05** Predicado único «versión que cuenta» en `FILE_BYTES_SQL`, `FOLDER_BYTES_SQL` y `purgeTargets`: medidor, papelera y conciliación coherentes — CA: CA-9 (purga del archivo), CA-10 — Prueba: integración `usage-reconcile` — Depende: T-03
- [x] **T-06** Poda que no resta originales conservados (prueba primero) — CA: CA-8 — Prueba: unitaria `version-pruner` + integración con plan Personal — Depende: T-03
- [x] **T-07** `purgeExpiredOriginals` y su llamada por cuenta en `UsageReconcileProcessor`, con auditoría sin nombres ni claves — CA: CA-6, CA-7, CA-9 (papelera), CA-13 — Prueba: unitaria + integración `usage-reconcile` con reloj adelantado — Depende: T-05, T-06
- [x] **T-08** Aislamiento: la pasada de A no toca el original vencido de B; historial ajeno `404`; roles internos `403` — CA: CA-11, CA-12 — Prueba: aislamiento `storage-versions` — Depende: T-07
- [x] **T-09** **(humana)** Recorrido de la demo en local (doble de optimización, historial con `keptUntil`, medidor que baja, purga al adelantar el reloj) y nota en el PR — CA: CA-1, CA-2, CA-4, CA-6

## Notas del developer
- T-01 y T-02 van en un solo commit: el `snapshot` de `FileVersion` con `keptUntil` es el mismo cambio.
- T-05: sus pruebas de integración viven en `test/int/storage/space-kept-originals.int-spec.ts` (no en
  `usage-reconcile.int-spec.ts`) para trabajar en paralelo con T-07; el medidor es la misma medición que usa la
  conciliación (`SpaceMeasurer`), así que «desglose = `espacio_usado`» es la prueba de «sin deriva».
