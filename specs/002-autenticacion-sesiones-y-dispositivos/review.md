# Revisión 002 — Autenticación, sesiones y dispositivos (cierre: PR-2, PR-4 y PR-5b)

> Una página. La escribe `reviewer`; la aprueba Adrián (`workflow.md` §7.1).

| Campo | Valor |
|---|---|
| Fecha | 2026-10-05 |
| Rango revisado | `main (8f14d38)..feat/002-backend-pr2-pr4 (570b156)` y `main..feat/002-web-pr5 (9512b26)`; se combinan sin conflictos (merge-tree) |
| CI | Local: api lint ✅ · typecheck ✅ · test ✅ (1 intermitente ajeno: `redact-deep.spec.ts`, tiempo bajo carga; sola 12/12) · test:int 887/888 (intermitente de 006 `node-tree.repository.int-spec.ts`; sola 16/16) · test:isolation 241/241 ✅ · web lint ✅ · typecheck ✅ · test 1028/1028 ✅. T-94 y T-104 (recorridos humanos) sin hallazgos |
| Veredicto | ✅ Aprobar (con I-1 a I-3 antes del cierre de fase) |

## Verificación
| CA | Prueba | Estado |
|---|---|---|
| CA-2, CA-5 | `test/isolation/login-enumeration.iso-spec.ts` (respuestas idénticas con y sin cuenta, también internas) | ✅ |
| CA-11 | `test/int/identity/sessions.int-spec.ts › CA-11` (vigentes, actual primero, sin datos internos) · `sessions-isolation.iso-spec.ts › CA-11: %s ve solo sus sesiones` (4 roles) · web `sessions-card.spec.tsx`, `seguridad/page.spec.tsx` | ✅ |
| CA-12 | `sessions.int-spec.ts › CA-12` (refresco falla al instante; acceso hasta 15 min; id mal formado/ajeno/cerrado → mismo 404) · `sessions-isolation › CA-12` (otro cliente y roles internos → 404, base sin cambios) | ✅ |
| CA-13 | `sessions.int-spec.ts › CA-13` (4 sesiones → `revokedCount = 3`) · `sessions-isolation › CA-13` | ✅ |
| CA-14 | `sessions.int-spec.ts › CA-14` (`nimbo_rt` borrada) · web `account-menu.spec.tsx`, `seguridad/page.spec.tsx › CA-14` (confirmación en lista y menú) | ✅ |
| CA-15 | `sessions.int-spec.ts › CA-15` · `verify-email-session.int-spec.ts`, `verify-email-concurrency.int-spec.ts` | ✅ |
| CA-16 | `new-device.int-spec.ts` (6 casos, incluido el de carrera) | ✅ |
| CA-17, CA-24 | `credential-secrecy.int-spec.ts` (refresco, recuperación, dispositivo y cambio de contraseña solo como hash / `$argon2id$`) | ✅ |
| CA-22 | `change-password.int-spec.ts › CA-22` (3 navegadores, rol interno, débil sobre `newPassword`) · web `change-password-form.spec.tsx` | ✅ |
| CA-23 | `change-password.int-spec.ts › CA-23` (5 fallos → 6.º correcto `429 PASSWORD_CHANGE_LOCKED` con `Retry-After`; a los 15 min vuelve; la sesión nunca se cierra) | ✅ |
| CA-25 | `auth-logs.int-spec.ts` (16 casos: eventos, `correlationId`, sin correo/IP/agente/tokens/cookies/`huella_hash`) | ✅ |
| CA-26 | `access-token-verifier.jwt.int-spec.ts`, `access-token-contract.int-spec.ts`, arnés de aislamiento con tokens reales (T-55) | ✅ |
| CA-27 | web `seguridad/page.spec.tsx › CA-27` (15 estados del mockup trazados a pruebas; jest-axe) · axe en `sessions-card`, `change-password-form`, `account-menu` · T-104 | ✅ |

## Seguridad
- Datos de cliente: sí (sesiones). `SessionService.list/revoke/revokeOthers` y `PasswordService.changePassword` reciben `actor`; el `UPDATE` de `revokeIfActive` filtra por dueño y no revocada (sin filtrar después). `:id` no UUID, ajeno, inexistente o ya cerrado → mismo `404 IDENTITY_SESSION_NOT_FOUND` (003 D-6). Aislamiento 241/241 ✅.
- Respuestas sin IP, agente completo, hashes ni `deviceId` (`toSessionSummary`); bitácoras con `userId`/`sessionId` y sin secretos (CA-25) ✅. `Cache-Control: no-store` también en `SessionsController` ✅.
- **[SEC-1] Media** · `apps/api/src/modules/identity/application/password.service.ts:285-308` — el bloqueo del cambio es *check-then-act*: N peticiones simultáneas con un token robado pasan todas `enforceChangeNotLocked` antes de que `recordFailure` sume, así que una ráfaga prueba más de 5 contraseñas. El login tiene el mismo patrón pero lo respalda `IdentityIpThrottlerGuard`; `POST /auth/change-password` no tiene throttler. Ver I-1.

## UI
- Coincide con el mockup `identity/seguridad` (15 estados) y con el layout aprobado (Q-3, Q-4); sin hex ni valores arbitrarios en el diff; `Alert` `success` con texto `foreground` (AA); axe sin `serious`/`critical` ✅.

## Bloqueantes
- Ninguno.

## Importantes y sugerencias
- **[I-1]** `password.controller.ts` (`changePassword`) — SEC-1; viola D-7/RNF-07 bajo concurrencia. Corrección: un throttler por usuario en la ruta (p. ej. `@UseGuards(IdentityIpThrottlerGuard)` con un `PASSWORD_CHANGE_THROTTLER` de pocas peticiones por minuto) o reservar el intento antes de verificar (`recordFailure` primero y descontarlo al acertar). Prueba: 10 envíos en paralelo con la contraseña errónea → como máximo 5 `422`.
- **[I-2]** `docs/sdd/pendientes.md` — PD-27 (velo, Q-4) y PD-28 (confirmación en el menú, Q-3) siguen «Abierto» aunque la spec y `ui-guidelines.md` ya los resolvieron. Marcarlos resueltos en T-105.
- **[I-3]** `specs/README.md` fila 002 — tras combinar las dos ramas, dejar un único estado («En revisión», 2026-10-05) en T-105; DF-56 y DF-57 siguen «Propuesto, pendiente del `architect`»: pedir su aprobación o dejarlo explícito en PD-07.
- **[S-1]** `session.service.ts:260` — `revokeOthers` registra `identity.session.revoked` con `count: 0`; `PasswordService.logSessionsRevoked` solo registra si `count > 0`. Unificar el criterio.
- **[S-2]** `apps/web/src/features/identity/hooks/use-sessions-card.ts:60` — `currentFirst` repite el orden que la API ya garantiza (D-9); basta con el de la API.
- **[S-3]** `apps/web/src/components/nimbo/account-menu.tsx:85` — `<a href>` a Seguridad recarga la página y fuerza una renovación; usar `next/link` con `asChild`.
- **[S-4]** `session.service.ts:228` — con más de `SESSION_LIST_MAX_ITEMS` sesiones, la actual puede quedar fuera del `LIMIT` y no salir marcada. Caso límite aceptado en DT-13; anotarlo.

## DF y pendientes
- DF-56 (clases M1) y DF-57 (E-R `sesion`/`dispositivo`) nuevos, Propuestos; redibujo en PD-07. Sin filas nuevas en `pendientes.md`; actualizar PD-27 y PD-28 (I-2).

## Lo que está bien hecho
- Revocación con un solo `UPDATE` filtrado por dueño y respuesta indistinguible, probada en los cuatro roles.
- `PasswordService` reutiliza el flujo de restablecer (`NewPasswordTarget`, `sendPasswordChangedMail`) sin duplicar la política; `LOGIN_LOCKOUT_POLICY` y `PASSWORD_CHANGE_LOCKOUT_POLICY` en un solo lugar.
- `useAuthFetch` extrae el `TokenHolder` que vivía en `uploads-provider` (DRY) y `SIGN_OUT_CONFIRMATION` comparte los textos entre el menú y Seguridad.
- La página traza sus 15 estados del mockup a pruebas concretas.
