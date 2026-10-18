# Revisión 016 — Edición colaborativa de .docx

> Una página. La escribe `reviewer` (sin `security-auditor`: 016 no es 011/012/013/020 ni se marcó riesgo, `workflow.md` §4) y la aprueba Adrián. 2.ª pasada tras el rebase sobre `main` (009, 011, 014, 015).

| Campo | Valor |
|---|---|
| Fecha | 2026-10-18 |
| Rango revisado | `origin/main...HEAD` (24 commits: 23 de 016 + `28fc0ec` de integración) |
| CI | Sin PR. Local: lint ✅ · typecheck ✅ · unit ✅ (config 244, contracts 438, api 2109, web 1424) · env:check ✅ · int/isolation: pendiente (los corre el orquestador) |
| Veredicto | ✅ Aprobar, condicionado a int e isolation en verde (sin bloqueantes; I-1…I-4 antes del cierre de fase) |

## Verificación
| CA | Prueba (`apps/api/test/…` salvo indicación) | Estado |
|---|---|---|
| 1, 6 | `int/editing/open-session › CA-1, CA-6`; `presence.int-spec`; web `editor-view.spec › coeditando` | ✅ (stub de plan; ver S-1) |
| 2, 4, 5, 7, 21 | `open-session.int-spec`; `edit-mode-policy.spec`; `billing/plan-limits.adapter.int-spec` (`maxEditors` 0/3/5/5) | ✅ · CA-5 «vencida» inalcanzable hasta 010 (I-2, I-3) |
| 3, 22 | `edit-mode-policy.spec` + `editor-view.spec`; en int, inalcanzables hasta 012 | ✅ por diseño |
| 8, 16 | `presence.int-spec` CA-8, CA-16 | ✅ |
| 9–13, 20 | `save-version`, `registered-edited-version`, `quota-overdraft`, `migrations.int-spec`; `minio-storage.adapter.int-spec › 016 CA-9` (B-1 anterior corregido) | ✅ |
| 14, 15 | `callback-security`, `degradation.int-spec`; web `save-failed-listener/banner.spec`, `layout.listener.spec`, `load-docs-api.spec` | ✅ |
| 17, 18, 19 | `open-session › CA-17`; `isolation/editing.iso-spec`; `callback-security › CA-19` | ✅ |

## Seguridad
- Datos de cliente: sí. Apertura con `accessibleNodes` + `PermissionResolver` en `withActor`; el plan es el de la propietaria (`createActor(file.ownerId)`) y ahora sale de la suscripción real de 009 bajo su RLS: ✅. Bitácoras y auditoría (`edit.*`, `file.version_created`) sin nombres, URLs ni tokens: ✅. SEC-1/SEC-2 siguen como PD-117/PD-118.
- **[SEC-3]** media · `storage/infrastructure/minio-storage.adapter.ts:270` — `putObjectStream` acepta cualquier clave y `billing` recibe el `IObjectStorage` completo (`storage/index.ts`): anula la guarda de 009 («`putObject` solo `invoices/`»). Corrección en I-1.

## UI (si aplica)
- 10 estados con tokens, sin hex ni valores arbitrarios, axe limpio: ✅. `solo-lectura-vencida` no coincide con su mockup aprobado («Renovar plan» → la UI muestra «Ver planes»): I-3.

## Bloqueantes
- Ninguno. B-1 (T-FIX-1) e I-1 (rebase) de la pasada anterior están resueltos.

## Importantes y sugerencias
- **[I-1]** `minio-storage.adapter.ts:270` — escritura sin restricción expuesta a `billing` (SEC-3; Art. IX, decisión 1 de 009). Validar con `ObjectKey.parse(key)` (solo `u/{propietario}/{archivo}/{versión}`, rechaza `invoices/`), con su prueba en `minio-storage.adapter.int-spec` y el JSDoc del puerto (`i-object-storage.port.ts:80-84`).
- **[I-2]** Suposiciones de antes de 009. `spec.md:11` («**No** espera… a 009»), `spec.md:67` RN-13 (andamiaje) y `plan.md:40`, `:79-88` (§2.1), `:203` (§7.1, «Hoy todas las cuentas son Personal») están obsoletos. CA-5 «vencida» no es alcanzable: `billing/…/plan-limits.adapter.ts:26` ignora `vence_en` hasta 010. Corrección: RN-13 como «Cumplida (T-11; desde 009 el plan sale de la suscripción)», CA-5 con «vencida: alcanzable con 010» (como CA-22) y una entrada en el §9 de spec y plan.
- **[I-3]** `apps/web/…/editor-view.spec.tsx:264` — `solo-lectura-vencida` usa la misma entrada que `solo-lectura-plan` y no prueba nada propio; la UI no tiene «Renovar plan». Quitarlo del `it.each`, marcar el estado como «alcanzable con 010» en spec §6 y abrir una fila PD para su texto (dueño: 010).
- **[I-4]** `OnlyOfficeHealthIndicator`, omitido por PD-113, sigue en `architecture.md:188`, `design-model.md:169`, `modules/editing/README.md:5` y `adr/0004…:49` (código y docs no pueden contradecirse). Quitarlo o tacharlo con «omitido (PD-113)».
- **[S-1]** Un caso de `open-session.int-spec` con `PlanLimitsAdapter` y `suscripcion` reales (Pro → `edit`, `maxEditors: 3`; Personal → `EDITING_PLAN_READ_ONLY`): hoy toda la edición usa el stub.
- **[S-2]** `minio-storage.adapter.ts:261` — `Readable.from([])` cuando el cuerpo no es un flujo: daría un documento vacío sin error. Lanzar un error.
- **[S-3]** `apps/web/…/realtime-client.ts:46` — la clase `RealtimeChannel` choca con la interfaz homónima de `use-realtime.ts`. Renombrarla a `SocketChannel`.
- **[S-4]** `editing.version-saved` (`save-version.service.ts:123`) no tiene consumidor en `web` (Art. V). Que lo consuma una pantalla o quitarlo con su esquema. Migraciones: renombrar `20261016100000/100100` a `20261018…` antes del merge, para que vayan después de `20261017100000` (009); hoy funcionan, pero el orden de aplicación difiere entre una base nueva y una existente.

## Lo que está bien hecho
- Integración limpia: `PlanLimitsAdapter.toLimits` suma `maxEditors` (DF-73) con pruebas unitarias e int; auditoría con las acciones de 011 y 016; los exports de `storage`/`identity` se suman a los de 009/011; arista `identity → editing` sin ciclo.
- Contrato compartido: los eventos de `editing` salen de `@nimbo/contracts` en `api` y `web`; `useRealtime()` se monta sobre el canal de 015 sin duplicar su contrato.
- Idempotencia en BD (uuid v5, `UNIQUE`, CAS) y guardado que nunca se descarta por cuota; funciones ≤ 30 líneas y ≤ 3 parámetros en el código nuevo.

## DF y pendientes
- Renumeración verificada: PD-108…118, DF-70…76 y ADR-0030 existen; DF-69 y ADR-0028 restantes son de 009. Sin DF nuevos. Filas nuevas: estado «vencida» del editor con 010 (I-3).
