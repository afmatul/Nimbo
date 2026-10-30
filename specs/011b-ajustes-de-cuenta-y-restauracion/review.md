# Revisión 011b — Ajustes de cuenta y restauración por Soporte (PR-B)

> Una página. La escribe `reviewer` (con `security-auditor` solo si aplica, `workflow.md` §4) y la aprueba Adrián.

| Campo | Valor |
|---|---|
| Fecha | 2026-10-29 |
| Rango revisado | `8676659e..HEAD` (T-08 a T-12 y las correcciones de esta revisión); PR-A integrado como `cd05a9f` (#82) |
| CI | Local: lint y typecheck en cada commit; unitarias api 2824 y web (264 de `backoffice` tras las correcciones); integración 1725; aislamiento 495/496 (la única falla, `billing-renewal.iso-spec.ts`, es ajena: rutas `\` en Windows); gitleaks sin fugas; `migrations-roundtrip.sh` idéntico (41); demo T-12 del 2026-10-29 aprobada |
| Veredicto | 🔁 Cambios requeridos → B-1, B-2 e I-1 a I-5 corregidos en este PR; queda la aprobación de Adrián |

## Verificación
| CA | Prueba | Estado |
|---|---|---|
| CA-10 | `test/int/backoffice/client-trash.int-spec.ts` (lista, paginación, auditoría de la consulta); `support-trash.service.spec.ts`; `support-trash.spec.tsx` | ✅ |
| CA-11 | `test/int/storage/support-trash.int-spec.ts` (función, subárbol, nombre libre equivalente a `node-name.ts`); `client-trash.int-spec.ts`; web (restaurado, renombrado, movido a la raíz) | ✅ |
| CA-12 | `client-trash.int-spec.ts` (`400`, `404`, `422`); `trash.spec.ts`; web: motivo vacío y largo, `404` vencido y vigente, `422` de profundidad | ✅ |
| CA-13, CA-16 | `roles-matrix.int-spec.ts` (`CLIENT_TRASH_ROUTES`, `CLIENT_ONLY_TRASH_ROUTES`, `401`) | ✅ |
| CA-14 | `client-trash.int-spec.ts` (motivo en `node.restored`; Pino sin motivo, nombre ni correo; `correlationId`) | ✅ |
| CA-15 | `test/isolation/backoffice-trash.iso-spec.ts` ISO-14 a ISO-22 (plan §6, casos 1-5 y 8-11) | ✅ |
| CA-17 | `support-trash.spec.tsx` (11 estados); `a11y.spec.tsx` con axe a 360 y 1440 px | ✅ |
| Migración | `support-trash.int-spec.ts` (`up → down → up`, `NOSUPERUSER`, `REVOKE`/`GRANT`, `search_path`); `migrations-roundtrip.sh` | ✅ |

## Seguridad
- Datos de cliente: sí. Aislamiento: ISO-14 a ISO-22 en verde como `nimbo_app`. Excepción a `accessibleNodes` (architecture §6.5): el dueño se filtra dentro de la consulta (`rootInForce`, `ROOT_IN_FORCE`) y la RLS es la segunda barrera; `nimbo_app` no recibe `UPDATE`. ✅
- `restaurar_raiz_papelera`: `SECURITY DEFINER`, `search_path = pg_catalog, pg_temp`, `PUBLIC` sin `EXECUTE` y solo `nimbo_app`; exige rol `SUPPORT`, bloquea `usuario` (`CLIENT`) y luego la raíz, escribe solo columnas permitidas y su `down` es reversible. ✅
- Bitácoras: `client_trash.viewed`, `restored` y `not_found` con ids y resultado; `recordLine` omite el valor de `note`; nunca correo ni nombres. Soporte no ve contenido, versiones, claves ni URLs (lista blanca y contrato `.strict()`). ✅
- Hallazgos SEC: ninguno.

## UI
- Coincide con los mockups `backoffice/soporte` en los 11 estados (comparado en la demo a 1440 y 360 px); solo tokens; axe sin `serious`/`critical`; nada importado de `docs/design/mockups/`. ✅
- Los mensajes del motivo inválido salen del catálogo (`BACKOFFICE_FIELD_MESSAGES`); el mockup `papelera-motivo-invalido` y sus capturas se regeneraron con esos textos (decisión de Fátima, 2026-10-29).

## Bloqueantes
- **[B-1] Corregido** `trash-restore-dialog.tsx`: `NOTE_MAX = 500` y tres textos del motivo repetían `AUDIT_NOTE_MAX_LENGTH` y `BACKOFFICE_FIELD_MESSAGES` (Art. VI.3). Ahora los importa de contracts.
- **[B-2] Corregido** `trash-restore-dialog.tsx`: el `422 STORAGE_FOLDER_DEPTH_EXCEEDED` mostraba «Llegaste al máximo de  niveles… Crea la carpeta en otro lugar.» (sin cifra, acción imposible para Soporte; CA-12, CA-17). Ahora `RestoreRejection` usa `details.maxDepth` y `depthExceededText` pide al cliente mover la carpeta original; prueba nueva en `support-trash.spec.tsx`.

## Importantes y sugerencias
- **[I-1] Corregido** `trash-notices.ts`: todo `404` decía «venció el <purgeAt>», también con fecha futura. `unavailableNotice(item, firstName, now)` dice «venció» solo si ya pasó; si no, «Ya no está en la papelera de <cliente>. Nada cambió.» Pruebas con fechas relativas a hoy.
- **[I-2] Corregido** Art. VII.2: `useRestoreFlow` y `useRestoreTarget` (`support-trash.tsx`), `RestoreCell` (`client-trash-table.tsx`) y `NoteCounter` (`trash-restore-dialog.tsx`) dejan cada función bajo 30 líneas.
- **[I-3] Corregido** `design-model.md` M2 y DF-81: `restoreRoot(actor, request)` con `maxDepth` y los exports `InvalidQueryError`, `toTrashItem`, `toNodeSummary`. `SupportTrashQuery` sale de `storage/index.ts` (sin consumidor fuera de `storage`).
- **[I-4] Corregido** `spec.md` y `specs/README.md` pasan a «En revisión», con su entrada en el registro de cambios.
- **[I-5] Corregido** `trash-notices.ts` usa `MY_FILES_LABEL` de `storage/routes.ts`.
- **[S-1]** `trash-notices.ts`: `moved_to_root` no dice el nombre nuevo si además hubo renombrado; `renamed` podría usar `locationText(folder)`.
- **[S-2] Corregido** `TrashRestoreDialog` deja de ser genérico (un solo uso, Art. V.3).
- **[S-3]** `client-trash.service.ts` importa `filesViewedEvent` de `support.service.ts`; moverlo a `backoffice-events.ts` si aparece un tercer uso.
- **[S-4]** `422 BACKOFFICE_INVALID_INPUT` no está en `apps/web/src/lib/error-catalog.ts` (cae al genérico).
- **[S-6] Corregido** (re-verificación) `NoteCounter` contaba `value.length` y validaba el texto recortado («505/500» sin rojo); ahora cuenta el recortado, con prueba.
- **[S-7]** (re-verificación) `trash-restore-dialog.tsx`: sin `details.maxDepth` el aviso quedaría sin cifra; hoy la API siempre lo envía (`node.errors.ts`).
- **[S-5, fuera de 011b]** `configure-http-app.ts:25`: `CORS_METHODS` es `GET,POST,DELETE` desde la 001; desde `:3002` fallan `PUT` y `PATCH` (cuota, vigencia, renovación, renombrar, fijar). Con Traefik no.

## DF y pendientes
- DF nuevos: ninguno. DF-81 actualizado (I-3). PD-96, PD-120 y PD-131 siguen como dice el plan §7. Fila propuesta en `pendientes.md`: CORS de S-5.
