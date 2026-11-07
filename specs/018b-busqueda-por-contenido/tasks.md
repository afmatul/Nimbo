# Tareas 018b — Búsqueda por contenido

> Spec: `./spec.md` · Plan: `./plan.md`
> 5 a 12 tareas verticales, de medio día a un día, un commit cada una (`feat(<modulo>): … [018b T-xx]`).
> Cada tarea es una línea: criterio, prueba y de qué depende. Los archivos viven en `plan.md`. Sin tareas de «cierre».
> `/implement` exige el plan `Aprobado` y la spec en `Lista` (P-1 a P-4 y P-6 resueltas).

- [ ] **T-01** (`ui-designer`) Estado `resultados-por-contenido` en `storage/busqueda` con `/mockup` (marca y nota de alcance) y capturas a 360 y 1440 px, aprobado por Adrián — CA: CA-8 — Prueba: axe del mockup sin violaciones — Depende: P-4, P-6
- [ ] **T-02** Contrato `matchedBy` en `searchHitSchema` y puerto `IContentMatchReader` exportado por `storage/index.ts` (JSDoc del contrato, parámetro `contentText`) — CA: CA-4, CA-8 — Prueba: unitaria de contratos y `storage.module.spec.ts` (no enlaza el token; rojas primero) — Depende: —
- [ ] **T-03** `SqlContentMatchReader` en `intelligence`, `ContentMatchBindingModule` en la raíz, y `architecture.md` (§3 patrón «condición SQL que da el dueño de la tabla» junto a `accessibleNodes`; §5 fila del puerto) y `design-model.md` M2/M6 al día — CA: CA-1, CA-2, CA-3, CA-5, CA-7 — Prueba: integración `content-match.int-spec.ts` y unitaria del enlace (rojas primero) — Depende: T-02
- [ ] **T-04** Repositorio de búsqueda con «nombre ∨ contenido» y `coincide_nombre` — CA: CA-4, CA-6, CA-7, CA-9 — Prueba: integración `search.repository.int-spec.ts` (roja primero) — Depende: T-03
- [ ] **T-05** `SearchService` con `matchedBy` y `GET /search` de punta a punta — CA: CA-4, CA-5, CA-12 — Prueba: unitaria del servicio + integración HTTP (feliz, `400`, bitácora sin texto) — Depende: T-04
- [ ] **T-06** Aislamiento: B no encuentra el texto de A; un compartido que coincide solo por contenido aparece con `shared` (`fragmento_compartido`) y desaparece al revocarse; actor interno sin filas — CA: CA-10, CA-11 — Prueba: aislamiento `storage-search.iso-spec.ts` — Depende: T-04
- [ ] **T-07** Web: marca «Coincide en el contenido» y nota de alcance según el mockup de T-01 — CA: CA-8 — Prueba: componente `search-view.spec.tsx` + axe a 360 y 1440 px — Depende: T-01, T-05
- [ ] **T-08** **(humana, Juan Marcos)** Recorrido de la demo en local: subir un `.docx` y un PDF, esperar su indexación, buscar por una frase, ver la marca, compartir y revocar con otra cuenta; nota en el PR — CA: CA-1, CA-4, CA-6, CA-8, CA-10 — Depende: T-06, T-07

## Notas del developer
