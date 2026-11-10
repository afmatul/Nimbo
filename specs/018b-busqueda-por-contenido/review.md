# Revisión 018b — Búsqueda por contenido

| Campo | Valor |
|---|---|
| Fecha | 2026-11-07 |
| Rango revisado | `origin/main` (`bce85394`)`..51a4eb60` + cambios de cierre en `spec.md`, `tasks.md`, `specs/README.md` y `pendientes.md` (incluye el cierre de 018, `f6dd5dc`) |
| CI | No corre (facturación de GitHub Actions). Evidencia local: typecheck ✅ · unit ✅ (api 331/3300, web 236/2222, contracts 33/662, config 7/255, raíz 4/41) · int ✅ 191/2057 · iso ✅ 34/674 · lint ❌ solo por `apps/api/dist-worker-optimizer/` sin ignorar (I-1); sin esa carpeta, eslint 0 y prettier ✅ |
| Veredicto | ✅ Aprobar |

## Verificación
| CA | Prueba | Estado |
|---|---|---|
| CA-1 | `test/int/intelligence/content-match.int-spec.ts › CA-1`; `search.repository.int-spec.ts › CA-1, CA-4`; `search.int-spec.ts › CA-1, CA-8` | ✅ (no visto en demo, T-08) |
| CA-2 | `content-match.int-spec.ts › CA-2` (CAMIÓN, camiones, Camión; «camio» no) + `RN-1 ñ ≠ n`; `search.repository.int-spec.ts › CA-2` | ✅ |
| CA-3 | `content-match.int-spec.ts › CA-3`; `search.repository.int-spec.ts › CA-3` | ✅ |
| CA-4 | `search.repository.int-spec.ts › CA-1, CA-4` y `› CA-4 páginas 1/2/3 sin repetir ni saltar`; `search.int-spec.ts › CA-4`; `search-schemas.spec.ts › 018b CA-4, CA-8`; `search.service.spec.ts › 018b CA-4, RN-3` | ✅ (no visto en demo) |
| CA-5 | `content-match.int-spec.ts › CA-5` (palabras vacías; el texto es un parámetro); `search.repository.int-spec.ts › CA-5`; `search.int-spec.ts › CA-5` + `400` de 018; visto en demo | ✅ |
| CA-6 | `search.repository.int-spec.ts › CA-6` (pendiente, indexando, fallido, no_indexable); sin llamada al worker, Redis ni Gemini (por construcción); visto en demo con indexación `fallido` | ✅ |
| CA-7 | `content-match.int-spec.ts › CA-7` + H-4 (swap interrumpido; `indexado` es final); `search.repository.int-spec.ts › CA-7` (versión nueva y papelera) | ✅ |
| CA-8 | `search-view.spec.tsx › 018b CA-8` (marca, nota en resultados y sin resultados); `a11y.spec.tsx › 018b CA-8`; `search.service.spec.ts › 018b CA-8`; nota de alcance vista en demo | ✅ (la marca no se vio en demo) |
| CA-9 | `search.repository.int-spec.ts › CA-9` (tipo, fecha; carpetas nunca por contenido); filtros vistos en demo | ✅ |
| CA-10 | `test/isolation/storage-search.iso-spec.ts › por contenido › CA-10` (texto casi idéntico, respuesta igual a «nada», compartido `shared` y revocado) | ✅ (por contenido no visto en demo) |
| CA-11 | `search.int-spec.ts › CA-14` (403 de 018); `storage-search.iso-spec.ts › CA-11` (repositorio con actor interno: 0 filas por contenido) | ✅ |
| CA-12 | `search.int-spec.ts › CA-15, 018b CA-12` (sin palabra, texto, nombre ni el `NOTICE` «stop words»); 13 búsquedas en la bitácora local de `api` sin texto ni nombres | ✅ |

Cobertura de lógica de 018b (unit + int): 100 % de líneas en `SqlContentMatchReader`, `TypeOrmNodeSearchRepository` (ramas 96,97 %), `SearchService`, `SearchController` y `ContentMatchBindingModule`; web 100 % en `search-results.tsx` y `search-form.tsx`, 75 % en `search-view.tsx` (líneas sin cubrir ajenas a 018b). Supera el 60 %.

## Seguridad
- Datos de cliente: sí (texto indexado). Aislamiento: `storage-search.iso-spec.ts` ✅ dentro de las 34/674. `actor` + `accessibleNodes`: ✅. La condición de contenido va dentro de la misma consulta (`typeorm-node-search.repository.ts`, `nameOrContent`), sobre el `EntityManager` de `requireActorScope`; la RLS `fragmento_cliente`/`fragmento_compartido` es la segunda barrera. No se filtra después de consultar.
- El puerto valida que las columnas sean `alias.propiedad` (`sql-content-match.reader.ts:10-14`) y el texto viaja solo como `:contentText` (probado contra inyección).
- Roles internos: 403 y 0 filas ✅. Bitácoras sin texto, nombres, tokens ni contraseñas ✅. La respuesta no trae texto del archivo, solo `matchedBy`.
- Hallazgos: ninguno. No requiere `security-auditor`.

## UI
- Coincide con el mockup `busqueda--resultados-por-contenido` (decisiones 1 a 5): `StatusBadge` neutral con `TextSearch`, nota con `Info` y `aria-describedby`, textos de H-8, nota también en «sin resultados». Sin colores escritos a mano; axe sin `serious`/`critical` ✅.
- Desviación declarada: la nota usa `text-sm` porque no hay token de 13 px.

## Bloqueantes
- Ninguno.

## Importantes y sugerencias
- **[I-1]** `eslint.config.mjs:30-31` y `packages/config/eslint/base.js:10-11` no ignoran `**/dist-worker-optimizer/**` (build de 021, sí está en `.gitignore`): `pnpm lint` falla en cualquier equipo que haya corrido `start:all --prod`. No es de 018b → **PD-197**.
- **[I-2]** PD-153 describía la condición como `OR EXISTS`; tras H-3 es `IN (SELECT …)` no correlacionada, y faltaba R-1 (`@@` no es leakproof; con RLS no está garantizado el uso del GIN). **Corregido** en `pendientes.md`; se mide en 023.
- **[I-3]** T-08 parcial: sin `GEMINI_API_KEY`, CA-1, CA-4, la marca de CA-8 y CA-10 por contenido no se vieron en demo. Los cubren integración y aislamiento sobre Postgres real con RLS; no bloquea → **PD-199** (repetir la demo con indexación real antes de la exposición).
- **[S-1]** `apps/api/src/modules/storage/storage.module.spec.ts:144`: la prueba dice «018b CA-1» pero verifica el enlace D-1. Renombrar a «018b D-1». **Aplicado.**
- **[S-2]** `apps/api/test/int/storage/search.repository.int-spec.ts:416`: «al indexarse» inserta el fragmento sin pasar la indexación a `indexado` (queda `fallido` con texto, estado que H-4 hace imposible). Marcar `indexado` en ese paso. **Aplicado** (M-3 de Adrián): fragmento e `indexado` en la misma transacción, como el swap.
- **[S-3]** `apps/web/src/features/search/components/search-results.tsx:175`: `aria-describedby` apunta a un id que renderiza el padre (`search-view.tsx:107`). Si `SearchResults` se usa sin `ScopeNote`, la referencia queda colgando. Pasar el id por prop o documentarlo → **PD-198**.

## DF y pendientes
- DF-95 aceptado y reflejado en `architecture.md` §3/§5, `design-model.md` M2/M6 y los README de `storage` e `intelligence`. DF-15 actualizado.
- Pendientes: PD-185 (redibujo de M2/M6), PD-186 (búsqueda semántica sin spec), PD-187 (diéresis en el contenido), PD-199 (demo con indexación real), PD-197 (ignore de ESLint), PD-198 (pulido de la auditoría de Adrián). PD-127 se cierra al fusionar. PD-153 ampliado con R-1.

## Auditoría de Adrián (PR #101, 2026-11-10)
- Sin bloqueantes de código; ~87 %. Aplicado antes del merge: **M-1** (merge de `main`; DF-91 de `main` + DF-95), **M-2** (PD-188/PD-189 renumerados a PD-199/PD-197, ya existían en `main`; la demo pasó de PD-196 a PD-199 porque la 022 tomó PD-196), **M-3** (= S-2) y **menor 1** (docstrings de `NodeSearchCriteria`, `INodeSearchRepository`, `SearchService` y `SearchController` con «nombre o contenido»); también S-1 y la referencia de la línea del puerto (menor 7).
- Segunda revisión (2026-11-10): N-1, merge de `main` con la 022 y la 022c; se conserva el encabezado de `pendientes.md` de la 022 y el PD-196 de 018b pasa a PD-199.
- M-4 (R-1) ya está en PD-153 para 023. Menores 2, 3, 4, 8 y S-3 → PD-198. Menor 5 (el puerto devuelve SQL) queda como observación aceptada en DF-95.

## Lo que está bien hecho
- Puerto mínimo y bien documentado. La condición la escribe el dueño de `fragmento`, sin arista nueva ni excepción a la propiedad de tablas, y con el contrato probado (columnas inválidas y choque de `contentText`).
- Una sola consulta sin `UNION`: el orden, el cursor y las páginas de 018 se mantienen y quedan probados con nombre y contenido mezclados.
- El invariante H-4 está fijado con una prueba de `swap` interrumpido en lugar de una suposición.
- El aislamiento por contenido incluye lo compartido y su revocación, y comprueba que una palabra ajena responde igual que «nada».
