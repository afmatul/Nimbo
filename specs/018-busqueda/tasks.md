# Tareas 018 — Búsqueda por nombre, tipo y fecha

> Spec: `./spec.md` · Plan: `./plan.md` (Aprobado por Adrián, 2026-10-27)
> 5 a 12 tareas verticales, de medio día a un día, un commit cada una (`feat(storage): … [018 T-xx]` o
> `feat(web): … [018 T-xx]`). Cada tarea es una línea: criterio, prueba y de qué depende. Los archivos viven en `plan.md`.

- [x] **T-01** Contratos de la búsqueda (`search-schemas`, motivos `INVALID_TYPE`, `INVALID_DATE`, `INVALID_RANGE`, exportación) — CA: CA-6, CA-9 — Prueba: unitaria de contratos, en rojo primero
- [x] **T-02** `SearchService` y `INodeSearchRepository` con un doble: palabras, categoría → tipos y mapeo a la respuesta — CA: CA-1, CA-7 — Prueba: unitaria, en rojo primero — Depende: T-01
- [ ] **T-03** Extraer `escapeLike` a `shared` (tercer uso), con `storage` e `identity` importándolo y `toFolder` exportado — CA: CA-4 — Prueba: unitaria de `escapeLike` en rojo primero; las suites existentes de `storage` e `identity` siguen en verde — Depende: —
- [ ] **T-04** `TypeOrmNodeSearchRepository` por nombre: `accessibleNodes`, plegado (D-1), comodines literales, papelera, orden por grupos, cursor y ubicación — CA: CA-1, CA-2, CA-3, CA-4, CA-5 — Prueba: integración (Testcontainers, `nimbo_app`), en rojo primero — Depende: T-02, T-03
- [ ] **T-05** Filtros de tipo (sin carpetas) y de rango de fechas en el repositorio — CA: CA-7, CA-8 — Prueba: integración con los extremos del rango — Depende: T-04
- [ ] **T-06** `GET /search` (`SearchController`, registro en `StorageModule`) — CA: CA-6, CA-9, CA-14, CA-15 — Prueba: integración HTTP, caso feliz y `400`, `403` de los tres roles internos, `401` y bitácora sin `q` ni nombres — Depende: T-05
- [ ] **T-07** Aislamiento: B nunca ve nodos ni ubicaciones de A con nombres casi iguales; internos con 0 filas — CA: CA-13 — Prueba: aislamiento (`pnpm test:isolation`) — Depende: T-06
- [ ] **T-08** `useSearch` y `fetchSearchPage`: estado en la URL, días locales y atajos de fecha → `from`/`to`, vacío y rango inválido sin consultar, «Cargar más» — CA: CA-3, CA-6, CA-8, CA-9 — Prueba: unitaria del hook, en rojo primero — Depende: T-01
- [ ] **T-09** Pantalla `/buscar` con resultados, filtros y estados (spec §6) — CA: CA-2, CA-10, CA-11 — Prueba: componente y axe a 360 y 1440 px con las observaciones del mockup aprobado (spec §6: filtros plegables a 360 px, lista atenuada con rango inválido, fechas `es-GT`) — Depende: T-08
- [ ] **T-10** Punto de entrada: «Buscar» en `DEFAULT_NAV_ITEMS` de `AppLayout` (barra lateral y menú móvil), no en la navegación interna — CA: CA-12, CA-14 — Prueba: componente (`app-layout.spec.tsx`) — Depende: T-09
- [ ] **T-11** **(humana)** Recorrido de la demo en local (buscar «camion», filtrar por tipo y fecha, abrir carpeta y archivo, sin resultados, rol interno sin «Buscar») y nota en el PR — CA: CA-1, CA-7, CA-8, CA-10, CA-11, CA-12, CA-14 — Depende: T-07, T-10

## Notas del developer
<Desviaciones (con enlace al registro de cambios de la spec), DF o pendientes que surgieron.>
