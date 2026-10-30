# Revisión 018 — Búsqueda por nombre, tipo y fecha

> Una página. La escribe `reviewer` (sin `security-auditor`: 018 no está en su lista y no se marcó riesgo) y la aprueba Adrián.

| Campo | Valor |
|---|---|
| Fecha | 2026-10-29 |
| Rango revisado | `origin/main...6500779f` (`feat/018-busqueda`, 21 commits) |
| CI | Local: `lint` ✅ · `typecheck` ✅ · `test` ✅ (contracts 548, config 248, api 2658, web 1809, raíz 3 suites / 34) · `test:int` ✅ (completo en dos tandas: storage + identity 80 suites / 846 pruebas; resto 84 suites / 779; total 164 / 1625) · `test:isolation` ✅ (27 suites, 476 pruebas) |
| Veredicto | ✅ Aprobable (2026-10-30), tras cerrar B-1 e I-1 (T-FIX-1 y T-FIX-2) y aplicar S-1 a S-3. Primera pasada: 🔁 por B-1 |

## Verificación
| CA | Prueba (archivo › caso) | Estado |
|---|---|---|
| CA-1 | `search.repository.int-spec` › todas las palabras, mayúsculas y acentos; ñ ≠ n; `COLLATE "C"`; diéresis/cedilla · `search.service.spec` › palabras, NFC (tilde combinable real) | ✅ |
| CA-2 | `search.repository.int-spec` › carpetas y luego archivos por fecha; ubicación o `null` · `search-view.spec` › CA-2, CA-10 | ✅ |
| CA-3 | `search.repository.int-spec` › cursor con fechas iguales, página llena sin cursor, cursor ajeno · `use-search.spec` / `search-view.spec` › «Cargar más», error y «Cargando más…» | ✅ |
| CA-4 | `escape-like.spec` · `search.repository.int-spec` › `%`, `_`, `\` literales | ✅ |
| CA-5 | `search.repository.int-spec` › papelera y restaurar | ✅ |
| CA-6 | `search-schemas.spec` › `REQUIRED`/`NAME_TOO_LONG` · `search.int-spec` › 400 · `use-search.spec` / `search-view.spec` › vacío sin buscar, foco | ✅ |
| CA-7 | `search.service.spec` › categoría → tipos · `search.repository.int-spec` › sin carpetas con tipo · `search-view.spec` › nota | ✅ |
| CA-8 | `search.repository.int-spec` › `from` incl./`to` excl. y combinación · `use-search.spec` › cada atajo, mismo día, un extremo | ✅ |
| CA-9 | `search-schemas.spec` + `search.int-spec` › `INVALID_TYPE/DATE/RANGE` · `use-search.spec` / `search-view.spec` › sin consultar, campos editables, lista atenuada | ✅ |
| CA-10 | `search-view.spec` › carpeta → explorador, archivo → ficha | ✅ |
| CA-11 | `search-view.spec` › cargando, error + «Reintentar», sin resultados con/sin filtros, panel plegable · `a11y.spec` › axe 360/1440 | ✅ |
| CA-12 | `app-layout.spec` › «Buscar» tras «Mis Archivos» (barra y cajón) · `use-search.spec` › dirección y volver atrás · `page.spec` · `search-view.spec` › foco | ✅ |
| CA-13 | `storage-search.iso-spec` › nombres casi iguales, ubicación ajena `null`, respuesta idéntica, filtros, cursor de A, internos 0 filas | ✅ (ver PD-136) |
| CA-14 | `search.int-spec` + `storage-search.iso-spec` › 403 ×3, 401 · `storage-routes.contract.spec` › solo `CLIENT` · `internal-area-layout.spec` | ✅ |
| CA-15 | `search.int-spec` › CA-15 (con resultados, sin ellos y 400; sin `q`, `?q=` ni nombres; sin `audit.record`) | ✅ |

## Seguridad
- Datos de cliente: sí. `actor` en `SearchService.search` y en el puerto; `accessibleNodes(actor)` dentro del `WHERE` de las dos consultas **y** del `JOIN` de la ubicación (`typeorm-node-search.repository.ts:192-210`); `requireActorScope(actor)`; RLS sin cambios (`FORCE`). ✅
- Roles internos: `@Roles(Role.CLIENT)` → 403 antes del servicio; además 0 filas en el repositorio. Bitácoras: sin línea propia, `stripQuery` de Pino, 400 sin el valor. ✅
- Residual aceptado: `NodeSummary.folderId` revelaría el UUID de una carpeta no visible cuando exista 012 (PD-136). Hoy es imposible (todo es propio); el dueño de 012 debe cerrarlo con su auditoría. No pido `security-auditor` para 018.

## UI
- Coincide con el mockup aprobado y sus observaciones (panel plegable a 360 px, lista atenuada e `inert`, es-GT); solo tokens (`bg-brand/10`, `text-secondary-foreground`, `text-destructive`…), sin hex ni valores arbitrarios; axe sin `serious`/`critical` a 360 y 1440 px. ✅
- Desviaciones del developer, valoradas: campos no deshabilitados al cargar (justificada por WCAG 2.4.3, mejor que el mockup) · «Cargar más» dice «elementos» (reutiliza `LoadMore` de 007, que CA-3 pide) · fecha corta es-GT (observación 6) · sin migas (patrón de Espacio y Mi actividad) · `aria-current` ausente en la barra compartida (preexistente, PD-138). Aceptadas; ver S-1.

## Bloqueantes
- **[B-1]** `apps/web/src/features/search/components/date-filter.tsx:23-24` — `INVALID_RANGE_MESSAGE` copia literal de `STORAGE_FIELD_MESSAGES.INVALID_RANGE` (`packages/contracts/src/storage/error-codes.ts:69-70`), mismo conocimiento (regla y texto del error de rango de 018). Viola Art. VI (mensajes duplicados) — si se ajusta el texto en el contrato, la web diverge en silencio. Corrección: `import { STORAGE_FIELD_MESSAGES } from '@nimbo/contracts';` y en la línea 121 `<span>{STORAGE_FIELD_MESSAGES.INVALID_RANGE}</span>`; borrar la constante y su comentario.

## Importantes y sugerencias
- **[I-1]** `apps/api/src/modules/storage/search/infrastructure/typeorm-node-search.repository.ts:127-145,156-168` — `pageOf`, `ordered` y el algoritmo «carpetas, luego archivos con el espacio que queda» son la segunda copia de `typeorm-node.repository.ts:98-129` y de `listContents`. La regla de tres lo permite, pero el plan §2 (DRY) declaró las copias y estas no: anotarlas en el plan o en «Notas del developer» con «al tercer uso (017/018b) se extraen a `node-order-sql`», para que 018b no las copie una tercera vez.
- **[S-1]** `docs/design/mockups/storage/busqueda/README.md` «Diferencias con la spec» — llevar ahí las cuatro desviaciones de T-09 (hoy solo en `tasks.md`), para que mockup y app no se contradigan.
- **[S-2]** `apps/web/src/features/search/components/date-filter.tsx:29` — `DATE_OPTIONS` local repite el nombre y el contenido de `DATE_OPTIONS` exportado de `search-url.ts`; importarlo.
- **[S-3]** `specs/018-busqueda/spec.md:14` — «Última actualización» dice 2026-10-28 y el estado, 2026-10-29.

## DF y pendientes
- DF-15 actualizado (`SearchController`/`SearchService` en `storage/search`). Sin DF nuevos.
- Filas nuevas: PD-132, PD-133, PD-134, PD-135 (resuelto en la rama: `layers.js` + prueba), PD-136, PD-137, PD-138; PD-127 reasignado a 018b. Completo.

## Lo que está bien hecho
- Plegado D-1 sin extensión y probado con `COLLATE "C"`; ñ ≠ n fijado en integración.
- Aislamiento por construcción en el `JOIN` de la ubicación y prueba de «respuesta idéntica» (sin canal lateral).
- `escapeLike` extraído a `shared` con sus tres usuarios; lint de capas extendido a subcarpetas con prueba.
- Hook puro con la dirección inyectada (`SearchLocation`): prueba sin simular `next/navigation`; respuestas tardías descartadas.
