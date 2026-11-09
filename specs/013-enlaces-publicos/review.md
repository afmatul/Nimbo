# Revisión 013 — Enlaces públicos (API)

> Una página. La escribe `reviewer` (con `security-auditor` solo si aplica, `workflow.md` §4) y la aprueba Adrián.

| Campo | Valor |
|---|---|
| Fecha | 2026-11-03 |
| Rango revisado | `origin/main...HEAD` (`b944106d..cddc2336`, incluye el merge de `main` `bbeb9a40`) |
| CI | Local, Node 22: `lint` ✅ · `typecheck` ✅ · `test` ✅ (api 327 suites / 3281 pruebas) · `test:int` 187 suites ✅; los 2 fallos sobre `bbeb9a40` quedan explicados: `sharing/migrations` corregido en `cddc2336` (37/37 al repetirla) e `intelligence/indexing-retries` inestable y ajeno · `test:isolation` 34 suites, 667/667 ✅ |
| Veredicto | ✅ Aprobar (I-1, I-2 y SEC-5 corregidos el 2026-11-03; después: `test:isolation` 668/668 ✅, int de `sharing`/`shared`/`storage` 880/880 ✅) |

## Verificación
| CA | Prueba | Estado |
|---|---|---|
| CA-1, CA-15 | `test/int/sharing/public-links.int-spec.ts › CA-1, CA-15: 201 con la URL…` y `…con contraseña y 1 día guarda solo el hash…` | ✅ |
| CA-2 | `public-links.int-spec.ts › CA-2: …422 con fields…`; `domain/public-link.spec.ts` | ✅ |
| CA-3 | `public-links.int-spec.ts › CA-3: carpeta, ajeno, inexistente, papelera, Editora o Lectora…` | ✅ |
| CA-4 | `public-links.int-spec.ts › CA-4, CA-15: generar otro revoca el anterior…` y `CA-4: dos POST simultáneos…` | ✅ |
| CA-5 | `public-links.int-spec.ts › CA-5: en solo lectura…` y `CA-8, CA-5: se revoca en solo lectura y en la papelera` | ✅ |
| CA-6 | `public-links.int-spec.ts › CA-6: superado el límite, 429…` | ✅ |
| CA-7 | `public-links.int-spec.ts › CA-7` (tres casos: resumen, `expired`, 404/422) | ✅ |
| CA-8 | `public-links.int-spec.ts › CA-8` (tres casos); `public-links.iso-spec.ts › ISO-27, ISO-28` | ✅ |
| CA-9 | `public-link-access.int-spec.ts › CA-9` (dos casos) | ✅ |
| CA-10 | `public-link-access.int-spec.ts › CA-10: sin contraseña, URL de 5 minutos…` y `…con la correcta` | ✅ |
| CA-11 | `public-link-access.int-spec.ts › CA-11: el mismo 404 con el mismo cuerpo en todos los motivos` (mal formado, campo de más, revocado, reemplazado, vencido, papelera y restauración, suspensión y reactivación, purga) | ✅ |
| CA-12 | `public-link-access.int-spec.ts › CA-12: sin contraseña (ausente o "")…` y `…una incorrecta es 403…` | ✅ |
| CA-13 | `public-link-access.int-spec.ts › CA-13, RN-7, CA-18: N fallos desde un /64 → 429…`; límite general por red etiquetado como «CA-14» (ver I-1) | ✅ |
| CA-14 | `public-link-access.int-spec.ts › CA-14: con la cuenta propietaria en solo lectura…` (abrir y descargar) | ✅ |
| CA-15 | `public-link-access.int-spec.ts › CA-15: las bitácoras no llevan el token ni el nombre…` (con `correlationId`); `audit-catalog.spec.ts › 013 CA-15` | ✅ |
| CA-16 | `public-links.int-spec.ts › CA-16: Administrador, Soporte y Operador…`; `public-links.iso-spec.ts › ISO-13, ISO-14` | ✅ |
| CA-17 | `test/isolation/public-links.iso-spec.ts › ISO-2 a ISO-26`; `database-roles.iso-spec.ts` | ✅ |
| CA-18 | `public-link-access.int-spec.ts › CA-15, CA-18: public_link.downloaded con trigger: public_link…`; `audit-catalog.spec.ts › 013 CA-18` | ✅ |

## Seguridad
- Datos de cliente: sí. Aislamiento: `apps/api/test/isolation/public-links.iso-spec.ts` ISO-1…ISO-29 (A/B/C/anónimo e internos por HTTP; SQL con dueño `NOSUPERUSER`; ids en el cuerpo; `enlace_por_token()` de 3 columnas, sin `PUBLIC`; revocar irreversible ISO-27 a ISO-29) y `database-roles.iso-spec.ts` (sin `DELETE`, `UPDATE` solo de `revocado_en`): `pnpm test:isolation` 34 suites, 667/667 ✅ (668/668 tras SEC-5). `actor` + `ownedNodes`/RLS: ✅ — el visitante sigue ADR-0039: el actor derivado nace solo en `PublicLinkAccessService` (`public-link-access.service.ts:170`) tras `activeDisplayName`, con ids solo de la fila de la función `SECURITY DEFINER` (`search_path` fijo, `REVOKE … FROM PUBLIC`, `FORCE RLS` + `enlace_publico_por_token`); cuerpos `.strict()` sin ids; un solo `404 SHARING_LINK_UNAVAILABLE` (R-2; oráculo de tiempo aceptado en el plan); `no-store` y `Referrer-Policy: no-referrer`; `trigger` cerrado a `['public_link']` (CA-18).
- Bitácoras sin contenido, nombres de archivo, tokens ni contraseñas: ✅ — solo `linkId`/`fileId`; `password_failed` sin IP; Redis con `sha256(red)`; `http.request` sin cuerpo ni query. SEC-2 (des-revocar por SQL) y SEC-3 (`password` sin máximo) de T-09 corregidos y verificados.
- Hallazgos (ninguno bloqueante):
  - **[SEC-1]** baja · `storage/application/current-version-download.ts:81` · la URL firmada lleva `u/{propietario}/{archivo}/{versión}` (ids que la ficha oculta; sin acceso) · DF-90, decide Adrián.
  - **[SEC-4]** media · `sharing/application/public-link-access.service.ts:94-95,207-208` · el bloqueo es por enlace + /64 sin techo global por enlace: con un /48 (65 536 redes) se prueban ~327 000 contraseñas cada 15 min contra un enlace, y un enlace propio con contraseña sirve para cargar Argon2 (CPU y memoria, R-3). Lo permite RN-7 · PD-175: techo global de fallos por enlace (p. ej., 100/h → `429` para todos, sin inhabilitar el enlace) o contar IPv6 por /48 en el límite general.
  - **[SEC-5]** ✅ corregido (`USING … revocado_en IS NULL`, ISO-29) · baja · `migrations/20261102100000-crear-enlace-publico.ts:112` · `USING` deja reescribir `revocado_en` de un enlace ya revocado (solo cambia la fecha; nunca lo reactiva) · opcional: `USING (… AND revocado_en IS NULL)`.
  - **[SEC-6]** baja (para 013b/staging) · la página pública debe llamar al `api` desde el navegador vía Traefik (si `web` hace de proxy, todos los visitantes comparten una red y un límite); staging sin el puerto 3000 expuesto ni `forwardedHeaders.insecure`.
  - Notas: `audit/README.md:63` dice «`trigger` solo `manual` o `scheduled`» (falta `public_link`); ISO-27 es control positivo y no sigue el patrón «no puede».

## UI (si aplica)
- No aplica: la pantalla es la 013b.

## Bloqueantes
- Ninguno.

## Importantes y sugerencias
- **[I-1]** ✅ corregido. El límite general por red de las rutas públicas está etiquetado como CA-14, pero es CA-13 («Igual 429 si una IP supera el límite general»); CA-14 es el de la cuenta en solo lectura (Art. VII, trazabilidad CA → prueba). En `public-link-access.service.ts:235`, `sharing-config.ts:14`, `public-link-access.service.spec.ts:191, 201, 449`, `public-link-access.int-spec.ts:37, 425-462` y `sharing/README.md:37`. Corrección: cambiar esas etiquetas a «CA-13».
- **[I-2]** ✅ corregido. Documentación del cierre incompleta: (a) el plan §7 cierra la parte de 013 de PD-78 (suspensión, CA-11) y de PD-121 (solo lectura, CA-5), pero las filas siguen «Abierto» sin anotar 013 (`pendientes.md:51` y `:133`); (b) `spec.md:107` deja P-4 como `[ABIERTA]` aunque el plan §8 registra la autorización de Adrián (PR #87); (c) el plan §2 nombra `enlace-publico.orm-entity.ts`, que no se creó (el repositorio usa SQL con `queryNamed`, extraído a `query-named.ts` como DRY con `typeorm-share.repository.ts`), y la desviación no está declarada. Corrección: anotar 013 en PD-78 y PD-121, marcar P-4 resuelta y declarar la desviación en `tasks.md` o en DF-86.
- **[S-1]** `assertWithinRate` ya es la tercera copia dentro de `sharing` (`sharing.service.ts:213`, `public-link.service.ts:182`, `public-link-access.service.ts:236`; Art. VI.2), y el patrón se repite en `storage`, `optimizer` e `intelligence`: registrar un PD para un ayudante en `shared` (p. ej. `consumeOrThrow(limiter, key, limitPerMinute)`) en lugar de extraerlo en este PR.
- **[S-2]** Al sumar `'public_link'` a `AUDIT_TRIGGERS` también se abre la lista de `SUBSCRIPTION_RENEWED` y `SUBSCRIPTION_RENEWAL_REJECTED` (`audit-catalog.ts:144` y `:148`): ampliar el pendiente de `billing` de la 013 (PD-174, antes PD-156, que chocaba con el PD-156 de la 021) para cerrarlas con `['manual', 'scheduled']`, como `PUBLIC_LINK_TRIGGERS`.
- **[S-3]** `packages/contracts/src/sharing.ts:34` dice «…o deja el campo vacío», pero `createPublicLinkSchema` rechaza `password: ""` con 422: la 013b debe omitir el campo, o el contrato tratar `""` como ausente como en CA-12. Anotarlo para la 013b.
- **[S-4]** La condición de Adrián hoy la garantiza la revisión, no una prueba: una prueba de arquitectura que falle si `createActor` aparece en `sharing` fuera de `public-link-access.service.ts`.

## Lo que está bien hecho
- Camino sin actor mínimo y bien probado: la función devuelve solo 3 ids, se relee con RLS del propietario, cuerpos `.strict()` y falla cerrada sin la política (ISO-26).
- Revocar es irreversible también en la base y `nimbo_app` solo puede actualizar `revocado_en`.
- Reemplazo serializado con `pg_advisory_xact_lock`, cubierto por la prueba de dos POST simultáneos.
- `limitNetworkOf` es una función pura que también cubre IPv4 mapeada en IPv6.
- La firma de la URL de 5 minutos, extraída a `current-version-download.ts`, aplica DRY de conocimiento sin cambiar `FileService`.
- Migración reversible y probada con un dueño `NOSUPERUSER`; merge con la 021 bien resuelto en auditoría, `storage` y las listas de migraciones.

## Auditoría de Adrián (PR #93, 2026-11-04)
- [Auditoría](https://github.com/afmatul/Nimbo/pull/93#issuecomment-6640713503) (~93 %, sin bloqueantes) y [respuesta](https://github.com/afmatul/Nimbo/pull/93#issuecomment-6646008150).
- Corregidos en `cb386205`: M-2 (`consumeOrThrow` en `shared`, que resuelve S-1 en `sharing`), M-6 (`derived-actor.arch.spec.ts`, que resuelve S-4), m-1 (`audit/README.md`) y CA-4 con orden estable (M-1).
- M-3 y m-4 → PD-177 (PR #98). M-4 y M-5 → [decisiones de Adrián](https://github.com/afmatul/Nimbo/pull/93#issuecomment-6646871998): PD-175 planificado y DF-90 aceptado.

## DF y pendientes
- DF-09 y DF-10 aceptados; DF-86 aceptado y ampliado por T-04 a T-09; DF-90 abierto (SEC-1), lo decide Adrián; la desviación de I-2 (c) declarada en DF-86.
- `pendientes.md`: PD-20 cerrado; PD-155 y PD-174 abiertos; la parte de 013 de PD-78 y PD-121 anotada (I-2 a); PD-174 (antes PD-156, renumerado por choque con la 021) ampliado con S-2; PD-175 (SEC-4) y PD-176 (S-1) abiertos.
