# Revisión 007 — Cuota y explorador

| Campo | Valor |
|---|---|
| Fecha | 2026-10-02 |
| Rango revisado | `main..1445f0c` (rama `feat/007-cuota-y-explorador-web`, con la línea A integrada). Solo commits [007] desde `8374a8e`/`b51af44`; los [006] y `5d40b55` quedan fuera |
| CI | ✅ local: lint, typecheck, test (api 1445, contracts 281, config 28, scripts 34, web 861/862 \*), test:int 87 suites/792, test:isolation 13/198, env:check |
| Veredicto | ✅ Aprobar (sin bloqueantes; I-1 corregido en `53a0afa`; I-2 antes del cierre de fase) |

\* `apps/web/src/features/identity/components/register-form.spec.tsx` falló una vez de forma intermitente; es ajena a 007 y no se reprodujo en 13 corridas posteriores (S-4).

## Verificación
| CA | Prueba | Estado |
|---|---|---|
| CA-1 | `test/int/storage/space-summary.int-spec.ts` › «CA-1 a CA-3, CA-6…»; `space-summary.service.spec.ts`; `quota-policy.spec.ts`; `plan-limits.adapter.spec.ts`; web `space-summary-view.spec.tsx` | ✅ |
| CA-2 | `domain/file-category.spec.ts`, `space-breakdown.spec.ts`; int «cuenta nueva mide cero»; web `space-breakdown.spec.tsx` | ✅ |
| CA-3 | int «la carpeta anidada en la papelera cuenta una vez»; `space-measurer.spec.ts` | ✅ |
| CA-4 | int «al purgar baja lo usado»; web `space-provider.spec.tsx`, `use-trash.spec.tsx`, `use-move-to-trash.spec.tsx` | ✅ |
| CA-5 | `quota-bar.spec.tsx`, `sidebar-quota.spec.tsx`, `space-summary-view.spec.tsx` (70–89, 90–99, 100 %) | ✅ (90–99 % no recorrido en navegador) |
| CA-6 | `space-summary.service.spec.ts`; `file-explorer.spec.tsx` (`{máximo}` desde `useSpace`) | ✅ |
| CA-7 | `upload-panel.spec.tsx` › «…hacia el resumen /espacio» | ✅ (sin recorrido en navegador) |
| CA-8 | `space-summary-view.spec.tsx`, `sidebar-quota.spec.tsx`, `space-provider.spec.tsx` | ✅ |
| CA-9 | `test/int/storage/folders-order.int-spec.ts`; web `use-folder-contents.spec.ts`, `load-more.spec.tsx` | ✅ |
| CA-10 | int «sin `sort` ni `dir` es el orden de 006», «`updatedAt`»; `node-order.spec.ts`, `node-order-sql.spec.ts`; web `node-table.spec.tsx`, `node-sort-menu.spec.tsx` | ✅ (ver I-1) |
| CA-11 | int «consultas inválidas», «cursor de otro orden», «cursor de 006», «`limit` se ajusta»; `node-list-cursor.spec.ts`; `folder-schemas.spec.ts` | ✅ |
| CA-12 | int «20 000 archivos ≤ 2 s» (61–102 ms); web `use-folder-contents.spec.ts` | ✅ |
| CA-13 | `test/int/storage/usage-reconcile.int-spec.ts` › «CA-13…»; `usage-reconciler.spec.ts` | ✅ |
| CA-14 | int «CA-14: cuenta coherente no cambia; carga en curso conserva la reserva» | ✅ |
| CA-15 | int «CA-15: si falla una cuenta, las demás se concilian…»; `usage-reconcile.processor.spec.ts` | ✅ |
| CA-16 | `test/isolation/storage-space.iso-spec.ts` (resumen A/B, listado × 8 órdenes, carpeta ajena 404 idéntica, conciliación bajo RLS con `nimbo_app`) | ✅ |
| CA-17 | iso «roles internos y sin sesión»; int `space-summary.int-spec.ts` (403 ×3, 401) | ✅ |

Recorrido manual contra la API real (2026-10-02): cifras y desglose, 401, 4 órdenes × 2 direcciones paginados sin duplicados, 400 por `sort`/`dir`/cursor, papelera y purga, aislamiento A/B, conciliación programada; en navegador `/espacio` con tramos 76 % y 100 %, orden por columnas, «Cargar más» 50 → 58 sin duplicados, refresco tras papelera, sin errores de consola.

## Seguridad
- Toca datos de cliente: sí. `storage-space.iso-spec.ts` en verde dentro de `pnpm test:isolation`.
- `actor` + `accessibleNodes` dentro de la consulta ✅ (`TypeOrmSpaceRepository`; papelera con `ownedTrashedNodes`; listado conserva el filtro de 006).
- Conciliación bajo RLS ✅: `SqlClientAccountScanner` solo devuelve UUID; cada cuenta se mide y corrige con `withActor(createActor(id, CLIENT))` y `lockUsage`; sin `BYPASSRLS` (DF-62 extiende DF-59).
- Roles internos 403 (`@Roles(Role.CLIENT)` en `SpaceController` y `FoldersController`) ✅.
- Bitácoras: `quota.reconciled {userId, diffBytes}`, `quota.reconcile_failed {userId, errorName}`, `quota.reconcile_run {scanned, failed}`; sin nombres ni contenido ✅. SQL parametrizado.
- Hallazgos: ninguno.

## UI
- Solo tokens de Cielo Sereno; sin hex ni valores arbitrarios. Muestras del desglose con `var(--file-*)` (no expuestos en `@theme`, declarado en tasks).
- `QuotaBar`: `role="progressbar"` con `aria-valuetext`, porcentaje y bytes en texto, ícono y rótulo por tramo, pista con borde `input`. Papelera rayada. Chip «TEXTO» para `.txt`/`.md` con tokens `--file-other`.
- Mockups regenerados; axe-core sin violaciones a 360 y 1440 px en mockups; `a11y.spec.tsx` (jest-axe) en verde. Pendiente: axe en navegador real sobre la app.
- Desviación por confirmar con Adrián: el medidor grande no repite el texto del tramo (cambia una viñeta del README de `resumen-espacio`).

## Constitución
- SOLID/ISP: `ISpaceRepository` e `IClientAccountScanner` son puertos internos de `storage`; sin puertos entre módulos ni dependencias nuevas.
- DRY: `SpaceMeasurer` compartido por resumen y conciliación; `FILE_BYTES_SQL` único; `cursor-codec.ts` común; `quotaStateOf` y `QuotaLink` únicos en web. Tercera copia del patrón de schedulers → PD-63.
- YAGNI: sin exportaciones ni parámetros sin consumidor. Funciones ≤ 30 líneas en el código de 007; ≤ 3 parámetros salvo S-1.

## Bloqueantes
Ninguno.

## Importantes y sugerencias
- **[I-1] ✅ Corregido en `53a0afa`** (con otro orden, `visibleOf` no antepone lo subido y `useRefreshWhen` relee la primera página al terminar una carga, renombrar o mover; pruebas en `use-my-files-state.spec.ts` y `use-folder-contents.spec.ts`; comprobado en navegador: `zeta-prueba.txt` subido con orden por nombre quedó al final). Hallazgo original: `apps/web/src/features/storage/hooks/use-my-files-state.ts:49-63` (`withUploaded`) y `:160` (`withOrganized`): con un orden distinto de creación descendente, lo subido en la pestaña se antepone y lo renombrado o movido queda en su posición vieja hasta recargar (CA-10). Corrección: con orden no predeterminado, no anteponer y recargar el listado al completar una carga u organizar; o registrarlo como decisión de Adrián en `features/storage/README.md`.
- **[I-2]** Cierre: commit del estado de la spec; T-12 abierta (incluir tramo 90–99 % y rechazo por cuota desde el panel de carga); integrar 006 en `main` antes de este PR para que el diff no arrastre commits [006].
- **[S-1]** `apps/api/src/modules/storage/domain/space-breakdown.ts:24-31`: constructor privado con 4 parámetros (Art. VII.2) → recibir un objeto.
- **[S-2]** `apps/api/src/modules/storage/infrastructure/persistence/node-list-cursor.ts:36-37`: el cursor guarda fechas con precisión de ms y `timestamptz` guarda µs; documentar el supuesto y cubrirlo con una prueba.
- **[S-3]** `apps/web/src/features/storage/components/space-breakdown.tsx:61`: `var(--brand)` en línea → `className="bg-brand"`.
- **[S-4]** `register-form.spec.tsx` (identidad, ajena a 007): fallo intermitente no reproducido; punto frágil probable en la línea 74 (`getByRole` síncrono tras el clic).

## DF y pendientes
- DF-62 (nuevo): `SpaceSummaryService`, `SpaceMeasurer`, `UsageReconciler`, puertos internos, `GET /storage/summary`, cola `usage-reconcile`, `updatedAt`, extensión de DF-59. Reflejado en `design-model.md` y `architecture.md` §6.6 y §8; `architect` lo revisa al redibujar (PD-46).
- `pendientes.md`: PD-62 (índices de orden) y PD-63 (patrón de schedulers) nuevos; PD-58 resuelto; PD-34 actualizado.
- Punto abierto del plan: «Liberar espacio» del resumen lleva a `/archivos` sin orden por tamaño.
