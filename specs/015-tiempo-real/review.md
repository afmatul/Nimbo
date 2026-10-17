# Revisión 015 — Tiempo real

> Una página. La escribe `reviewer` (sin `security-auditor`: 015 no es 011/012/013/020 y no se marcó riesgo, `workflow.md` §4) y la aprueba Adrián.

| Campo | Valor |
|---|---|
| Fecha | 2026-10-17 |
| Rango revisado | `main...feat/015-tiempo-real` (`331149e..4dc6b93`, 10 commits, 68 archivos) |
| CI | — (sin PR aún). Local: `pnpm lint` ✅ · `pnpm typecheck` ✅ · unitarias ✅ (scripts 34, config 240, contracts 317, api 1611, web 1112; worker sin pruebas) · `test:int` ✅ 103 suites / 969 · `test:isolation` ✅ 18 suites / 301 (incluye `realtime.iso-spec.ts`) |
| Veredicto | 🔁 Cambios requeridos (B-1) |

> Nota de entorno: en un worktree bajo `.claude/`, los `testMatch` con `<rootDir>` no encuentran archivos (`pnpm test` sale con «No tests found»). Las suites se corrieron con el mismo patrón en forma `**/…` (`--testMatch`); no es un defecto de la rama (S-2).

## Verificación
| CA | Prueba | Estado |
|---|---|---|
| CA-1 | `test/int/realtime/handshake.int-spec.ts › CA-1` | ✅ |
| CA-2 | `connection-admission.service.spec.ts` + `handshake.int-spec.ts › CA-2` (sin token, no texto, en la URL, inválido, vencido) | ✅ |
| CA-3 | `connection-admission.service.spec.ts` + `handshake.int-spec.ts › CA-3`; web: `realtime-provider.spec.tsx › rol interno no abre` | ✅ |
| CA-4 | `connection-lifetime.spec.ts`, `lifetime.int-spec.ts › CA-4`; cliente: `realtime-provider.spec.tsx › CA-4` (×3) | ✅ |
| CA-5 | `publish.int-spec.ts › CA-5`, `socket-io-hub.spec.ts › CA-5` | ✅ |
| CA-6 | `publish.int-spec.ts › CA-6`, `rooms.int-spec.ts › CA-6` | ✅ |
| CA-7 | `rooms.int-spec.ts › CA-7` (sala de otro usuario y de documento) | ✅ |
| CA-8 | `rooms.int-spec.ts › CA-8` | ✅ |
| CA-9 | `rooms.int-spec.ts › CA-9` (limpio, servidor, sin salas, latido), `realtime-config.spec.ts › CA-9` | ✅ |
| CA-10 | `test/isolation/realtime.iso-spec.ts › CA-10` (×3) | ✅ |
| CA-11 | `rooms.int-spec.ts › CA-11`; cliente: `realtime-provider.spec.tsx › CA-11` | ✅ |
| CA-12 | `socket-io-hub.spec.ts › CA-12` (×2) + recorrido T-09 | ✅ |
| CA-13 | `handshake.int-spec.ts › CA-13`, `connection-admission.service.spec.ts › CA-13` | ✅ (ver I-1) |
| CA-14 | `connection-admission.service.spec.ts › CA-14` (×3), `handshake.int-spec.ts › CA-14` (Redis real), `realtime-errors.spec.ts` | ✅ |

## Seguridad
- Datos de cliente: sí (avisos por cuenta y documento). Aislamiento: `realtime.iso-spec.ts` en verde dentro del `test:isolation` bloqueante. `actor`: `IDocumentRooms.admit` recibe `Actor` y comprueba pertenencia de la conexión; `realtime` no consulta permisos (RN-2, la admisión por `accessibleNodes` se prueba en 016): ✅.
- Bitácoras sin token, `Origin`, nombre de archivo ni contenido del aviso; errores solo con `errorClass`: ✅. Token solo en `auth.token` (el de la URL se ignora, probado). Roles internos rechazados en el *handshake* y sin canal en la web: ✅.
- Observación (sin hallazgo nuevo): `connectionOrigin` toma el último `x-forwarded-for`, igual que `trust proxy = 1` en HTTP. Si el `api` queda alcanzable sin Traefik, un cliente puede falsear la cabecera y esquivar CA-14. Ya cubierto por PD-74 (verificar en staging); el puerto del `api` no debe publicarse fuera del proxy.

## UI (si aplica)
- Sin pantalla propia (P-1). `RealtimeProvider` no pinta nada; sin colores ni textos nuevos: ✅.

## Bloqueantes
- **[B-1]** `apps/web/src/features/realtime/realtime-client.ts:5,8` y `apps/api/src/modules/realtime/application/realtime-config.ts:2`, `infrastructure/connection-lifetime.ts:10`, `domain/errors/realtime-too-many-requests.error.ts:5` — el contrato del canal (ruta `/socket.io`, evento `realtime.session-expired`, código `REALTIME_TOO_MANY_REQUESTS`, mensaje `room.join`) está escrito dos veces, en `api` y en `web`, y no figura en `packages/contracts` (identity y storage sí publican allí sus catálogos de códigos). Si uno cambia, el web deja de renovar el canal sin que ninguna prueba falle. Viola: Art. VI.3 («contratos y tipos compartidos → `packages/contracts`») y `conventions.md` («contratos públicos en `packages/contracts`»). Corrección: `packages/contracts/src/realtime/` con `REALTIME_PATH`, `REALTIME_EVENTS = { SESSION_EXPIRED: 'realtime.session-expired', ROOM_JOIN: 'room.join' }` y `REALTIME_ERROR_CODES = { TOO_MANY_REQUESTS: 'REALTIME_TOO_MANY_REQUESTS' }` (con su spec, como `storage/constants.spec.ts`), exportados en `index.ts`; `api` y `web` los importan y se borran las constantes locales.

## Importantes y sugerencias
- **[I-1]** `apps/api/src/modules/realtime/application/connection-admission.service.ts:117` — el rechazo `forbidden_role` ya conoce el usuario pero no lo registra; CA-13 pide «id de usuario y motivo» y un intento de un rol interno es justo el que conviene rastrear. Corrección: `this.reject('forbidden_role', new InsufficientRoleError(), { userId })` y afirmarlo en `handshake.int-spec.ts › CA-3`.
- **[I-2]** `apps/web/src/features/realtime/realtime-client.ts:53-62` — ante `REALTIME_TOO_MANY_REQUESTS` (p. ej., 25 usuarios tras una misma IP en la demo y un reinicio del `api`) `socket.io-client` no reintenta un rechazo de *middleware* y la pestaña queda sin canal hasta recargar. 016 lo sufriría como presencia muda. Corrección: reabrir tras `data.retryAfterSeconds`; si se pospone, fila en `pendientes.md` ligada a 016.
- **[S-1]** `realtime-client.ts:55` — tras `realtime.session-expired` siempre llama a `renew()`, aunque la sesión ya renovó el token antes de vencer (`RENEW_BEFORE_EXPIRY_MS`): un refresco extra cada 15 min por pestaña. Si `token.current` ya es otro, basta `socket.connect()`.
- **[S-2]** `jest.config.cjs`, `packages/config/jest/base.cjs` y configs de `api`/`web` — `<rootDir>/…` en `testMatch` falla bajo rutas con carpetas que empiezan por punto (worktrees en `.claude/`); fuera de 015, candidato a `chore`.

## Lo que está bien hecho
- Frontera limpia: `realtime` no importa `identity` (el verificador llega por la raíz de composición, misma instancia), dos puertos segregados por consumidor y un solo adaptador; funciones cortas y ≤ 3 parámetros.
- Falla cerrado en todos los caminos (limitador caído, error inesperado del *handshake*), y la publicación nunca lanza ni espera.
- Pruebas reales de lo difícil: Redis real para CA-14, latido sin respuesta para CA-9, reconexión sin reenvío para CA-11 y aislamiento con documentos casi idénticos.

## DF y pendientes
- DF-65 aceptado y reflejado en `design-model.md` T3/T1 y `architecture.md` §5; falta redibujar T3 (PD-46). DF-58 actualizado (RF-08 sale de 015).
- `pendientes.md`: PD-74 (adaptador de Redis y origen tras Traefik) y PD-75 (`/socket.io` en el Traefik de staging) ya registradas. Si I-2 se pospone, agregar su fila.

> T-FIX-1 (2026-10-17): B-1, I-1, I-2 y S-1 corregidos en `21a3769` y `aa4ced5`; queda para la re-revisión.
