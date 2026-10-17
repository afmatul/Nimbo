# Revisión 016 — Edición colaborativa de .docx

> Una página. La escribe `reviewer` (sin `security-auditor`: 016 no es 011/012/013/020 y no se marca un riesgo que lo exija, `workflow.md` §4) y la aprueba Adrián.

| Campo | Valor |
|---|---|
| Fecha | 2026-10-17 |
| Rango revisado | `main...13090d0` (30 commits: 20 de 016 y 10 de 015, ver I-1; 261 archivos) |
| CI | — (sin PR). Local: `pnpm lint` ❌ solo por `.claude/worktrees/**` (693 errores ajenos) → `eslint . --ignore-pattern ".claude/**" --max-warnings 0` ✅ y `prettier --check .` ✅ · typecheck ✅ · unit ✅ (raíz 34, config 241, contracts 358, api 1880, web 1266; 1.ª corrida: `redact-deep.spec` R-8, prueba de rendimiento, cayó con la máquina sin memoria y pasa sola y en la 2.ª corrida) · env:check ✅ · **int ❌ 119/120 suites, 1090/1092** (B-1) · isolation ✅ 20 suites / 332 |
| Veredicto | 🔁 Cambios requeridos (B-1) |

## Verificación
| CA | Prueba (`apps/api/test/…` salvo indicación) | Estado |
|---|---|---|
| 1, 6 | `int/editing/open-session › CA-1, CA-6`; `presence.int-spec` (nombres reales); web `editor-view.spec › coeditando` | ✅ |
| 2, 4, 5, 7, 21 | `open-session.int-spec` CA-2 (ajeno/papelera/inexistente sin sesión), CA-4, CA-5, CA-7, CA-21; `edit-mode-policy.spec` | ✅ |
| 3, 22 | `edit-mode-policy.spec` (tabla) + `editor-view.spec` (estados); en int, inalcanzables hasta 012 (lo cubre la política) | ✅ por diseño |
| 8, 16 | `presence.int-spec` CA-8 (≤ 60 s) y CA-16 (sale de la sala, lo escrito se conserva) | ✅ |
| 9, 10, 11, 12 | `save-version.int-spec` (CA-9, CA-12, CA-10 doble aviso, CA-11 estados 4 y 6); `migrations.int-spec` (UNIQUE) | ✅ |
| 13, 20 | `registered-edited-version.int-spec` CA-13; `quota-overdraft.int-spec` CA-20 | ✅ |
| 14 | `callback-security.int-spec` (integridad, purga, estado 3, reintentos); web `save-failed-listener/banner.spec`, `layout.listener.spec` | ✅ |
| 15 | `degradation.int-spec` (503 y subir/descargar/listar igual); `load-docs-api.spec` | ✅ |
| 17 | `open-session.int-spec › CA-17` (`SHARED_FORBIDDEN`, sin participación); `file-row-menu.spec` | ✅ |
| 18, 19 | `isolation/editing.iso-spec` ISO-1…; `callback-security.int-spec › CA-19` (sin firma, `alg`, otra clave, origen parecido, redirección) | ✅ |
| CA-9 (adaptador) | `int/storage/minio-storage.adapter.int-spec › 016 CA-9` | ❌ B-1 |

## Seguridad
- Datos de cliente: sí. Aislamiento: `editing.iso-spec.ts` en verde (B con varias conexiones, tokens de otro documento y avisos falsificados). Apertura con `files.find(actor)` = `accessibleNodes` + `PermissionResolver` dentro de `withActor`; enlaces de ONLYOFFICE actúan con `createActor(oid)` y revalidan (sesión abierta o versión vigente); `ownedFiles(actor)` solo para RN-11 (PD-99): ✅. `sesion_edicion`/`participacion` se filtran por RLS de la propietaria (sin `accessibleNodes`): correcto hasta 012 (PD-95).
- Callbacks: doble firma (enlace `nimbo.edit-callback` + JWT de ONLYOFFICE HS256 fijo) con `key` = sesión; procesamiento en cola; descarga solo de orígenes configurados, `redirect: 'manual'`, `Content-Length` obligatorio y tope `2 × EDITING_MAX_DOC_BYTES` con corte del flujo; `.docx` verificado con `IFileTypeDetector` antes de registrar: ✅.
- Bitácoras y auditoría sin nombre de archivo, URL, token ni contenido (solo ids, `reason`, `errorClass`); `job.data` no se registra: ✅. Tamaños `bigint` en dominio y columnas; `Number()` solo al serializar, como el resto de `storage`. Migraciones con `down` probado (`migrations.int-spec`). Andamiaje de T-11: `grep` sin resultados en `apps packages docs .env.example compose*.yml infra`: ✅.
- **[SEC-1]** baja · `editing/infrastructure/onlyoffice-download.ts:122-132` — la lista blanca es por **origen**; en local `ONLYOFFICE_PUBLIC_URL`/`INTERNAL_URL` = `http://localhost/docs`, el mismo origen que web y `api` tras Traefik, así que acepta cualquier ruta de la app. La firma de ONLYOFFICE lo impide hoy; como defensa en profundidad, exigir además el prefijo de ruta configurado (`/docs/`) y que staging use un host propio para ONLYOFFICE.
- **[SEC-2]** baja · `content-link.signer.ts:81-86` — el enlace de `callbackUrl` no vence y viaja en la configuración que ve el navegador; solo vale con un JWT de ONLYOFFICE de la misma sesión abierta, pero un aviso de ONLYOFFICE capturado (sin `exp`) podría repetirse para cerrar sin cambios la sesión en curso. Aceptable en red interna; anotarlo para staging (TLS interno).

## UI (si aplica)
- 10 estados implementados con `StateView`, textos de `readOnlyReason`, «Editar» solo en `.docx` y oculto a roles internos; anillos de participante con tokens (`ring-brand`, `ring-live`…), sin hex ni valores arbitrarios; axe en las specs de componente sin `serious`/`critical`: ✅. Mockups `editing/editor/` siguen como «Borrador» (I-2).

## Bloqueantes
- **[B-1]** `apps/api/test/int/storage/minio-storage.adapter.int-spec.ts:166` — `pnpm test:int` en rojo y reproducible (sola también falla: `016 CA-9` a los 70 s con `TimeoutError: read ECONNRESET` en `headObject`). Causa: `toEqual` sobre dos `Buffer` de 3 MB bloquea el bucle ~70 s y el socket *keep-alive* del cliente (`maxAttempts: 1`) llega muerto a la línea 167. El adaptador está bien (sondeo en Jest contra el mismo MinIO: put → get → head en 230 ms). Viola: suite en rojo (reviewer §4). Corrección: `expect(Buffer.compare(read, content)).toBe(0)` → **T-FIX-1**.

## Importantes y sugerencias
- **[I-1]** La rama trae los 10 commits de 015 (`d9ba0ff…cf0a747`), cuya revisión (`feat/015-tiempo-real`, 9b1a3b3) es 🔁 con B-1 (contrato del canal duplicado entre `api` y `web`, T-FIX-1 de 015) y 3 commits de documentación que 016 no tiene. Integrar 015 primero y rebasar 016 sobre `main` antes de abrir su PR (un PR por spec).
- **[I-2]** `docs/sdd/ui-guidelines.md` y spec §6: los 10 mockups del editor siguen «Borrador». Con el recorrido de T-10 aprobado, pasarlos a «Aprobado» (o pedir la pasada a `ui-designer`).
- **[S-1]** `editing/application/edit-session.service.ts:109-111` — `presence.admit` une la conexión a la sala antes de `admit`; si la apertura responde 409 `EDITING_SAVE_IN_PROGRESS`, la conexión queda en la sala del documento (sin fuga: es la propietaria). Admitir después de decidir.
- **[S-2]** SEC-1 y SEC-2 como filas de `pendientes.md` ligadas a staging.

## Lo que está bien hecho
- Idempotencia en BD (`UNIQUE (sesion_edicion_id)`, uuid v5 de la sesión, CAS de estados, `jobId` = sesión) en lugar de Redis con TTL (DF-05, DF-72).
- Guardado fuera de la petición y nunca descartado por cuota (RN-7, RN-8); verificación de `.docx` íntegro antes de mover el puntero.
- Constitución: funciones ≤ 30 líneas (lint), ≤ 3 parámetros en todo `editing`/`realtime`, puertos pequeños por consumidor (`IUserDirectory`, `IIndexQueue`, `IDocumentEditor`), desviaciones del diagrama registradas.

## DF y pendientes
- DF-05, 19, 20, 39, 70–75 registrados y aceptados; PD-95…PD-103 abiertos o resueltos con su decisión. Sin DF nuevos. Filas nuevas sugeridas: SEC-1/SEC-2 (S-2) e I-2 si no se resuelve en la rama.

> 2026-10-17 (developer): corregidos B-1 (T-FIX-1: `Buffer.compare`; `pnpm test:int` 120/120 suites, 1092/1092), S-1 (la conexión entra a la sala dentro de la admisión, tras descartar el 409 y antes de escribir sesión o participación; `edit-session.service.spec.ts`), I-2 (mockups del editor `Aprobado`) y S-2 (PD-104 = SEC-1, PD-105 = SEC-2). Queda I-1 (integrar 015 y rebasar). El veredicto no cambia hasta la nueva pasada de `reviewer`.
