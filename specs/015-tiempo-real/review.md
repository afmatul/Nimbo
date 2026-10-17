# Revisión 015 — Tiempo real (re-revisión tras T-FIX-1)

> Una página. La escribe `reviewer` (sin `security-auditor`: 015 no es 011/012/013/020 y no se marcó riesgo, `workflow.md` §4) y la aprueba Adrián.

| Campo | Valor |
|---|---|
| Fecha | 2026-10-17 |
| Rango revisado | `main...feat/015-tiempo-real` (`331149e..76693d5`, 13 commits, 73 archivos); foco en `9b1a3b3..76693d5` (`21a3769`, `aa4ced5`, `76693d5`) |
| CI | — (sin PR aún). Local: `pnpm lint` ✅ · `pnpm typecheck` ✅ · unitarias: scripts 34/34, config 240/240, contracts 320/320, web 1116/1116, api 1610/1611 (1 fallo intermitente, ver abajo), worker sin pruebas · `test:int` ✅ 103 suites / 969 · `test:isolation` ✅ 18 suites / 301 (incluye `realtime.iso-spec.ts`) |
| Veredicto | ✅ Aprobar (sin bloqueantes; I-3 antes del cierre de fase) |

> Entorno: en un worktree bajo `.claude/` los `testMatch` con `<rootDir>` no encuentran pruebas; se corrieron completas con el mismo patrón en forma `**/…` (S-2). El fallo de api es `src/shared/infrastructure/logging/redact-deep.spec.ts › CA-15 (R-8)` (203 µs frente a < 150 µs con todas las suites en paralelo; sola pasa): es de 005, no lo toca esta rama y ya está registrado como PD-69.

## Hallazgos previos
- **B-1 resuelto.** `packages/contracts/src/realtime/` publica `REALTIME_PATH`, `REALTIME_EVENTS` y `REALTIME_ERROR_CODES` con su prueba (`constants.spec.ts`) y su exportación en `index.ts`; `api` (adaptador, *gateway*, `connection-lifetime`) y `web` (`realtime-client.ts`) los importan y las constantes locales se borraron. Fuera de `packages/contracts` el único literal es `realtime-too-many-requests.error.ts:8`: ADR-0008 §3 prohíbe a `layer:domain` importar `@nimbo/contracts`, y `realtime-errors.spec.ts` lo ata a `REALTIME_ERROR_CODES.TOO_MANY_REQUESTS` (mismo patrón que identity con `session-errors.spec.ts`). Los demás aciertos de búsqueda son títulos de pruebas. `packages/contracts/dist` está en `.gitignore` y ningún commit de la rama lo incluye.
- **I-1 resuelto.** `connection-admission.service.ts:117` registra `{ userId }` en `forbidden_role`; lo afirman la unitaria y `handshake.int-spec.ts › CA-3` (con `correlationId`).
- **I-2 resuelto.** `RealtimeChannel` reabre tras `retryAfterSeconds` ante `REALTIME_TOO_MANY_REQUESTS`, con tres pruebas: espera exacta, espera por defecto y cancelación al desmontar (`getTimerCount() === 0`).
- **S-1 resuelto.** Si el token ya no es el que se presentó, reabre sin `renew()` (`realtime-provider.spec.tsx › CA-4: si la sesión ya renovó…`). **S-2** sigue abierta (fuera de 015).
- Clase `RealtimeChannel`: no hay fugas. Hay un solo socket por montaje, un solo temporizador que se reemplaza (`clearTimeout` antes de programar), y `stop()` limpia temporizador, *listeners* y socket. Un 429 repetido se reintenta como mucho una vez por ventana. CA-11 sigue en pie: `auth` es una función que lee el token vigente y la reconexión automática sigue activa.

## Verificación
Sin cambios frente a la revisión anterior: CA-1…CA-14 ✅ con las mismas pruebas. Además, CA-4 cliente ×2 (incluye S-1), CA-14 cliente ×3 (I-2), CA-13 `forbidden_role` con `userId` (I-1), y contrato `constants.spec.ts` (CA-4, CA-7, CA-14).

## Seguridad
- Datos de cliente: sí. Aislamiento: `realtime.iso-spec.ts` en verde dentro de `test:isolation`. `actor` en `IDocumentRooms.admit`: ✅. Bitácoras: `userId` está permitido; siguen sin token, `Origin` ni contenido: ✅.
- Sin riesgo nuevo que pida `security-auditor`. La observación de `x-forwarded-for` sigue cubierta por PD-74.

## UI (si aplica)
- Sin pantalla ni textos nuevos (P-1): ✅.

## Bloqueantes
- Ninguno.

## Importantes y sugerencias
- **[I-3]** `apps/web/src/features/realtime/realtime-client.ts:10,32` — `DEFAULT_RETRY_AFTER_SECONDS = 60` copia la ventana del límite del `api` (`connection-admission.service.ts:24`, `CONNECT_ATTEMPT_WINDOW_SECONDS`), y su comentario lo dice. Además, `typeof seconds === 'number'` acepta `NaN`, valores negativos y 0, que terminan en reintento inmediato. Viola Art. VI (límite duplicado), aunque hoy no cambia el comportamiento porque `toHandshakeError` siempre manda la espera en un 429. Corrección: valida con `Number.isFinite(seconds) && seconds > 0` y, si falta, publica la ventana en `REALTIME_*` de `packages/contracts` (y que la use el `api`) o no reabras sin espera.
- **[S-3]** `specs/015-tiempo-real/spec.md` — el reintento del cliente tras un 429 (I-2) y la reapertura sin renovar (S-1) no figuran en CA-14/CA-4. Agrega una fila a la bitácora de cambios o una cláusula al CA.
- **[S-4]** `realtime-client.ts:86-95` — si `renew()` termina después de `stop()`, se escribe `token.current`. Es inocuo hoy, pero antes no pasaba. Corrección: `if (this.stopped || renewed === null) return;`.
- **[S-5]** `realtime-client.ts:82` — si el servidor rechaza con `SHARED_UNAUTHENTICATED` también el token recién renovado (desfase de reloj, verificador mal configurado), el cliente entra en un ciclo renovar → reabrir sin pausa. El problema ya venía de T-08; conviene una pausa mínima o un tope de intentos.

## Lo que está bien hecho
- B-1 se corrigió en el lugar correcto: el contrato en `packages/contracts` y la excepción de dominio justificada por ADR-0008, con una prueba que impide que se desvíe en silencio.
- `RealtimeChannel`: métodos cortos, una sola responsabilidad (mantener el canal abierto), `stop()` idempotente y pruebas de temporizadores falsos que comprueban que no queda nada pendiente.

## DF y pendientes
- Sin DF nuevos. DF-65 y DF-58 como en la revisión anterior (falta redibujar T3, PD-46).
- `pendientes.md`: PD-74 y PD-75 siguen vigentes; PD-69 (guarda intermitente de `redact-deep`) volvió a fallar en esta corrida. Si I-3 se pospone al cierre de fase, agrega su fila.
