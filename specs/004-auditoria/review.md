# Revisión 004 — Auditoría

> Una página. La escribe `reviewer` (sin `security-auditor`: 004 no está en su lista y el riesgo quedó cubierto por ISO-1…12) y la aprueba Adrián.

| Campo | Valor |
|---|---|
| Fecha | 2026-10-05 |
| Rango revisado | PR-A `main..430ebed` (`feat/004-auditoria`) · PR-B `main..c70542b` (`feat/004-auditoria-web`) |
| CI | Local, todo en verde. PR-A: lint ✅, typecheck ✅, unit ✅ (api 1578, web 1028, contracts 313, config 28), int ✅ (98 suites/939), iso ✅ (17/298). PR-B: `web test` ✅ (140/1099), lint raíz ✅ (`--filter web lint` no existe), `web typecheck` ✅ |
| Veredicto | ✅ Aprobar (sin bloqueantes; I-1…I-4 antes de cerrar la fase; T-10 humana pendiente) |

## Verificación
| CA | Prueba | Estado |
|---|---|---|
| CA-1 | `audit.service.spec` · `int/audit/audit-write` · `audit-repository` «CA-1: guarda acción, actor…» | ✅ |
| CA-2 | `int/audit/audit-write` «CA-2: carga, URL de descarga, papelera y purga…» · `audit-catalog.spec` (los 7 atributos reales) | ✅ con I-4 |
| CA-3, CA-4 | `attribute-sanitizer.spec` · `audit.service.spec` «CA-3…», «CA-4…» (el log no repite el valor) · `audit-write` «CA-3, CA-5» | ✅ |
| CA-5 | `audit.service.spec` (`record` no lanza) · `audit-write` «dentro de `withActor`… se confirman juntos», «…no queda ni la operación ni el evento», «RLS… se revierte», «base caída» | ✅ |
| CA-6 | `audit-immutability` (UPDATE/DELETE/TRUNCATE `permission denied`) · `migration.int-spec` (RLS forzada, 2 políticas) · ISO-7 | ✅ |
| CA-7, CA-9…CA-11 | `int/audit/my-events` · `audit-repository` (45 eventos mismo ms) · `audit-cursor.spec` | ✅ |
| CA-8, CA-12, CA-13, CA-14 | `isolation/audit.iso-spec` ISO-1…ISO-12 · `my-events` «CA-12: sin sesión 401» · `audit-event-response.spec` | ✅ |
| CA-15 | `activity-view.spec`, `use-activity.spec`, `activity-labels.spec`, `a11y.spec` (axe 360/1440, teclado del menú) | ✅ código · T-10 humana pendiente |

## Seguridad
- Datos de cliente: sí. Filtro `usuario_afectado_id = :targetUserId` dentro del SQL (`typeorm-audit.repository.ts:62-74`), RLS de lectura por afectado y de alta a nombre propio; sin filtro posterior: ✅.
- Migración: RLS `ENABLE`+`FORCE`, `REVOKE UPDATE, DELETE, TRUNCATE`, `down` reversible (`revert`/`run` ×3 probado): ✅. Worker sin `AuditHttpModule` (`audit.module.spec` R-6): ✅.
- Bitácoras: `audit.record_failed` solo con `action`, `reason`, `keys`, `errorName`; acción desconocida sin repetirla; `audit.record` con atributos ya saneados: ✅. Mapeador de lista blanca + esquema `strict`: ✅.
- Hallazgos SEC: ninguno. No hace falta `security-auditor`.

## UI
- Estados del mockup (cargando, vacío, vacío-filtros, error, rango inválido, cargando-más, error de «Cargar más», fin de lista, menú abierto) presentes; textos de la spec; sin hex; `border-l-[3px]` es medida permitida (ui-guidelines §262); web no importa mockups; `components/nimbo` no importa `features`: ✅.
- El mensaje de rango inválido de web («igual o posterior», días) difiere del de contratos («posterior», instantes) a propósito y está documentado (`activity-filters.tsx:24-29`): web nunca consulta un rango inválido. Correcto.

## Bloqueantes
- Ninguno.

## Importantes y sugerencias
- **[I-1]** `apps/web/src/features/audit/components/activity-view.tsx:219-245` — `TokenHolder`/`createTokenHolder`/`useSessionAuditLoad` copian `useAuthFetch` (`features/identity/session/use-auth-fetch.ts:8-33`, ya en `main` por 002). No es la tercera copia, pero sí reimplementa un hook existente (Art. VI). Fix: `const authFetch = useAuthFetch(); return useMemo(() => createAuditApi(apiPublicUrl, authFetch).listMyEvents, [apiPublicUrl, authFetch]);`.
- **[I-2]** Documentación del plan §7 sin hacer: `design-model.md:193-195` sigue con `isVisibleTo` y `LogAuditLogger` provisional; DF-15 no anota `AuditController` como parcial; falta `apps/web/src/features/audit/README.md`. DF-64 sí declara las desviaciones.
- **[I-3]** Purga programada (`trash-purge.processor.ts:79`, actor = dueño `CLIENT`, `trigger: 'scheduled'`) se muestra como «Eliminaste definitivamente…» con origen «Tú»: el cliente lee que lo hizo él. `trigger` no sale en el DTO. Decide Adrián: exponer `trigger` (cambio de spec/contrato) o registrar PD.
- **[I-4]** CA-2 dice «sin cambios»: los dobles `file.service.spec.ts:126` y `test/support/storage-fakes.ts:531` agregan `recordInTransaction` (inevitable por el puerto ampliado). La fila del registro de cambios de la spec con «Aprobó: Adrián» entró en el commit T-04 del developer: Adrián debe ratificarla. Además el `int` de CA-2 no cubre `node.restored`, `trash.emptied` ni `file.upload_rejected` (solo los cubre la unitaria del catálogo).
- **[S-1]** `load-more-footer.tsx:46-72` repite `LoadMoreButton` de `storage/components/load-more.tsx:34-55` (segunda copia, dentro de la regla de tres): al tercer uso, subirlo a `components/nimbo/`.
- **[S-2]** `features/audit` importa `MoreStatus` (`storage/hooks/use-folder-contents`) y `parseResponse` (`storage/storage-http`): moverlos a `lib/` evita acoplar `audit` a internos de `storage`.
- **[S-3]** `account-menu.tsx:18` `ACTIVITY_HREF` duplica `ACTIVITY_PATH` (`features/audit/routes.ts`) por la frontera de `components/nimbo`; aceptable, que `account-menu.spec` fije `/actividad`.

## DF y pendientes
- DF-12 → Aceptado; DF-64 nuevo. Falta DF-15 parcial (I-2). · PD-66, PD-67, PD-68 nuevas; **PD-68 debe cerrarse en PR-B**, que ya agrega el enlace.
- **T-10 (humana)**: recorrido de la demo con PR-A + PR-B, en curso por Adrián.

## Lo que está bien hecho
- `record` no puede lanzar (validación fuera del `try`, todo lo demás dentro) y `recordInTransaction` se prueba con rollback real en Postgres en ambos sentidos.
- Saneo por lista blanca tipada por acción con `satisfies` (una acción sin entrada no compila); el mapeador no copia `actorId`, `correlationId` ni `resourceId`.
- `insert` sin `RETURNING` (un interno no lee lo que escribe sobre otro) y cursor `(ocurrido_en, id)` probado con 45 eventos del mismo milisegundo.
- Aislamiento exhaustivo: cursores fabricados, rutas por id inexistentes, roles internos, RLS directa como `nimbo_app`, sembrado con `fileName`.
