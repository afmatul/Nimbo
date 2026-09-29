# Revisión 001 — Registro de cuenta de cliente y verificación de correo

> Modo SDD lite: un solo `review.md` por spec. Cada PR parcial agrega su sección; la verificación, la seguridad y la UI
> completas se cierran con el PR-4.

## PR-3 — backend de identity

Revisor: `reviewer` (Sonnet), 2026-09-28. Tareas T-28 a T-53 y la corrección `no-store` de T-45.

**Veredicto inicial: Bloqueante** (hallazgo 1). Las pruebas de integración y aislamiento están escritas y compilan, pero
**no se ejecutaron** (sin Docker); T-54 sigue abierta.

**Veredicto tras correcciones: Aprobado con pruebas de integración pendientes de ejecutar (sin Docker)**

### Bloqueantes

1. **IP y cabeceras en las bitácoras de `identity`.** `shared/infrastructure/logging/logger.options.ts` no fija
   `quietReqLogger`; `pino-http` crea `req.log = logger.child({ req })` y `nestjs-pino` usa ese logger para todo lo que
   se registra durante la petición. `identity.rate_limited` y los eventos de `RegistrationService` heredan `req` con
   `x-forwarded-for`, `host`, `user-agent` y `remoteAddress`. Viola plan §7 («sin IP ni correo») y la prohibición dura
   sobre bitácoras. `identity-logs.int-spec.ts` no lo detectaría.
   **Corrección**: `quietReqLogger: true` y `quietResLogger: true` en `pino-http` (el `req`/`res` queda solo en la línea
   `http.request`) y una prueba que falle si una línea de negocio lleva `req`, `headers` o `remoteAddress`.

### Importantes

2. **`identity/index.ts` exporta `IDENTITY_THROTTLERS`**, fuera de lo que fija plan §3b/§6.1. Defendible (DRY, pasa por
   la frontera de `index.ts`); anotarlo en el plan.
3. **`400 VALIDATION_FAILED` de JSON mal formado sin `Cache-Control: no-store`**: el analizador global corre antes del
   middleware de módulo. Riesgo bajo; cerrar fijando la cabecera antes del analizador.
4. **`PASSWORD_COMMON` repite «Elige otra»** (`packages/contracts/src/identity/error-codes.ts`): el mensaje compuesto
   de `IDENTITY_WEAK_PASSWORD` termina en «… Elige otra. Elige otra que los cumpla.». Quitar «Elige otra.» del campo.

### Sugerencias

5. **`@nestjs/event-emitter` fijado en 3.1.0** (la serie 12 es solo ESM y `api` compila a CJS): dejar la restricción
   escrita en ADR-0019 o en el README de `identity`.

### Verificación (CA → prueba → estado)

| CA | Prueba | Estado |
|---|---|---|
| CA-1 a CA-4 | `register.int-spec.ts` | verde |
| CA-5, CA-6, CA-7 | `register-validation.int-spec.ts` | verde |
| CA-8 a CA-11 | `verify-email.int-spec.ts` | verde |
| CA-12 | `verification-token-repository.int-spec.ts` | verde |
| CA-13, CA-14 | `resend-verification.int-spec.ts` | verde |
| CA-15 | `rate-limits.int-spec.ts` · `identity-ip-throttler.guard.spec.ts` | verde · verde |
| CA-17 | `token-secrecy.int-spec.ts` | verde |
| CA-18 | `identity-logs.int-spec.ts` | verde (incluye la comprobación de la fuga de IP del hallazgo 1) |
| CA-19 | `password-hash.int-spec.ts` · `argon2id.hasher.spec.ts` | verde · verde |
| CA-21 | `mail-degradation.int-spec.ts` | verde |
| CA-29 | `verify-email-concurrency.int-spec.ts` · `user-repository.int-spec.ts` | verde |
| Anti-enumeración | `test/isolation/identity-enumeration.iso-spec.ts` | verde |

Estados de la corrida de T-54 (2026-09-28, con Docker): `pnpm test:int` 28 suites y 169 pruebas, `pnpm test:isolation`
5/5. Las correcciones de las pruebas que fallaron en la primera corrida están en «Notas del developer» de `tasks.md`
(T-54).

### Lo que está bien

- Dominio inmutable, sin `contracts` ni infraestructura; transiciones encapsuladas (Art. IV/V, ADR-0008).
- Respuesta neutra de punta a punta: Argon2id siempre, límite por correo antes del repositorio, sin `X-RateLimit-*`.
- `insertIfAbsent` con `ON CONFLICT DO NOTHING` y relectura en la misma transacción.
- Evento después del commit, sin propagar fallos de oyentes (ADR-0019).
- Desviaciones bien documentadas en «Notas del developer».

### Correcciones

Aplicadas por el `developer` el 2026-09-28. `pnpm lint`, `pnpm typecheck` y `pnpm test` en verde (api 347 pruebas);
`test:int` y `test:isolation` **sin ejecutar** (sin Docker).

| Hallazgo | Commit | Cómo se verificó |
|---|---|---|
| 1. IP y cabeceras en las bitácoras | `80ba41c` | `logger.options.ts`: `quietReqLogger` y `quietResLogger`; `customSuccessObject`/`customErrorObject` devuelven `req` solo a la línea de cierre. `logger.options.spec.ts` monta el *middleware* real de pino-http: la prueba de la línea de negocio falló en rojo con `req` (cabeceras y `x-forwarded-for`) y pasa en verde; `http.request` conserva `req` (método, URL sin consulta, cabeceras con `authorization` y `cookie` redactadas), `res` y `responseTime` en `2xx` y `5xx`. El `correlationId` sigue en las líneas de negocio (viene del `mixin`, no de los enlaces de `req`); estas llevan además `reqId`, igual al `correlationId`. `identity-logs.int-spec.ts` agrega que ninguna línea `identity.*` lleva `req`, `remoteAddress` ni las IP de `X-Forwarded-For` (sin ejecutar) |
| 3. `no-store` en el `400` de JSON mal formado | `1056fc5` | `configureHttpApp` fija `Cache-Control: no-store` en `/api/v1/auth/*` antes del analizador (comparación sin mayúsculas, como Express). `configure-http-app.spec.ts` (nuevo, sin contenedores) falló en rojo y pasa: `400 VALIDATION_FAILED` con `no-store`, ruta en mayúsculas, respuesta correcta y ruta ajena sin la cabecera. `NoStoreMiddleware` se conserva: va ligado a `AuthController` y no depende de una ruta escrita en `shared` |
| 4. `PASSWORD_COMMON` repite «Elige otra» | `d7033fa` | Mensaje sin «Elige otra.» en `contracts`; `constants.spec.ts` ajustada; `identity-validation.spec.ts` fija el mensaje compuesto completo cuando solo falla `PASSWORD_COMMON` (rojo con el texto duplicado, verde después). spec §11 actualizada, con fila en su registro de cambios; plan §5 no fijaba el texto del campo |
| 2 y 5. Documentación | `e857a97` | plan §3b y el árbol de §6.1 anotan `IDENTITY_THROTTLERS` en `identity/index.ts`; ADR-0019 fija `@nestjs/event-emitter` `3.1.0` (la serie 12 es solo ESM) |
