# Revisión 001 — Registro de cuenta de cliente y verificación de correo

> Modo SDD lite: un solo `review.md` por spec. Cada PR parcial agrega su sección; la verificación, la seguridad y la UI
> completas se cierran con el PR-4.

## Estado de la spec

**Veredicto final: Aprobada para revisión humana** (2026-09-28). No quedan bloqueantes abiertos: todos los hallazgos
de PR-3, PR-4, seguridad y UI están corregidos o aceptados con su pendiente. La spec pasa a `En revisión`; el PR-4 y
el merge los aprueba otro integrante (`workflow.md` §2).

| Comando (2026-09-28, rama `feat/001-web-base`, con Docker) | Resultado |
|---|---|
| `pnpm lint` | verde (ESLint sin avisos y Prettier) |
| `pnpm typecheck` | verde |
| `pnpm test` | verde: `contracts` 96, `api` 349 (57 suites), `web` 191 (49 suites), raíz 32 |
| `pnpm test:int` | verde: 28 suites, 170 pruebas |
| `pnpm test:isolation` | verde: 2 suites, 5 pruebas (`identity-enumeration.iso-spec.ts` con `resend-ip` activo) |
| `pnpm env:check` | verde |

**Fuera de 001, con dueño**: CA-16, CA-26 y la sesión de CA-29 → 002; CA-20 (manual) → staging al inicio de la
Fase 2; segunda parte de CA-8 (suscripción Personal) → 006a (PD-40); E2E con Playwright y axe → PD-41; contrato del
catálogo → PD-48; cabeceras de seguridad de `web` → PD-49.

## PR-4 — web

Tareas T-55 a T-68 y correcciones de la revisión. Revisores: `reviewer`, `security-auditor` y `ui-designer` (Sonnet),
2026-09-28; recorrido local T-67 aprobado por Adrián.

### Verificación (CA → prueba → estado)

Todos los CA de la spec (CA-24 y CA-25 se eliminaron el 2026-09-23 sin reutilizar sus números). Integra el backend
del PR-3 y la interfaz del PR-4. Rutas de `api` relativas a `apps/api/`; las de `web`, a `apps/web/src/`.

| CA | Prueba(s) | Estado |
|---|---|---|
| CA-1 | `test/int/identity/register.int-spec.ts`; `registration.service.spec.ts`; `register-form.spec.tsx`, `register-flow.spec.tsx` | verde |
| CA-2 | `register.int-spec.ts`; `registration-attempt-notifier.spec.ts` | verde |
| CA-3 | `email-address.vo.spec.ts`; `test/int/identity/user-repository.int-spec.ts`; `register.int-spec.ts` | verde |
| CA-4 | `register.int-spec.ts` | verde |
| CA-5 | `packages/contracts/src/identity/password-policy.spec.ts`; `register-validation.int-spec.ts`; `password-requirements.spec.tsx` (en vivo); `identity-enumeration.iso-spec.ts` | verde |
| CA-6 | `packages/contracts/src/identity/schemas.spec.ts`; `register-validation.int-spec.ts`; `register-form.spec.tsx`; `identity-enumeration.iso-spec.ts` | verde |
| CA-7 | `register-validation.int-spec.ts`; `auth.controller.spec.ts`; `register-form.spec.tsx` | verde |
| CA-8 | `test/int/identity/verify-email.int-spec.ts`; `verify-email-view.spec.tsx`, `use-verify-email.spec.ts` | verde; la segunda parte (suscripción Personal) → **006a** (PD-40) |
| CA-9 | `verify-email.int-spec.ts`; `verify-email-view.spec.tsx` (enlace-expirado con el 422 del plan) | verde |
| CA-10 | `verify-email.int-spec.ts`; `verify-email-view.spec.tsx` | verde |
| CA-11 | `opaque-token.vo.spec.ts`; `verify-email.int-spec.ts`; `verify-email-view.spec.tsx`, `use-verify-email.spec.ts` | verde |
| CA-12 | `test/int/identity/verification-token-repository.int-spec.ts` | verde (parcial por diseño: se completa en 002 y 003) |
| CA-13 | `test/int/identity/resend-verification.int-spec.ts`; `resend-link-button.spec.tsx`, `request-link-form.spec.tsx` | verde |
| CA-14 | `resend-verification.int-spec.ts`; `test/isolation/identity-enumeration.iso-spec.ts`; `request-link-form.spec.tsx` | verde |
| CA-15 | `test/int/shared/redis-rate-limiter.int-spec.ts`; `test/int/identity/rate-limits.int-spec.ts` (60 s, 5/h, 10 registros/h y, desde SEC-1, 10 reenvíos/h por IP); `identity-ip-throttler.guard.spec.ts`; `auth.controller.spec.ts` (cada ruta con su contador); `identity-enumeration.iso-spec.ts`; `resend-link-button.spec.tsx`, `request-link-form.spec.tsx` | verde |
| CA-16 | — | → **002** (`login.int-spec.ts`); 001 deja `emailVerified` listo |
| CA-17 | `test/int/identity/token-secrecy.int-spec.ts` | verde |
| CA-18 | `redacted-fields.spec.ts`, `logger.options.spec.ts`; `test/int/identity/identity-logs.int-spec.ts` | verde |
| CA-19 | `argon2id.hasher.spec.ts`; `test/int/identity/password-hash.int-spec.ts` | verde |
| CA-20 | `env.spec.ts` (esquema de `web`) | esquema verde; la prueba manual → **staging** (inicio de la Fase 2) |
| CA-21 | `test/int/notifications/mail-degradation.int-spec.ts` | verde |
| CA-22 | `register-form.spec.tsx`, `plan-picker.spec.tsx`, `password-requirements.spec.tsx`, `check-email-panel.spec.tsx`, `register-flow.spec.tsx`, `app/(public)/registro/page.spec.tsx` (con jest-axe); axe a 360 y 1440 px sobre las capturas de T-67 | verde |
| CA-23 | `verify-email-view.spec.tsx`, `app/(public)/terminos/page.spec.tsx`, `app/(public)/privacidad/page.spec.tsx` (con jest-axe); axe sobre las capturas de T-67 | verde |
| CA-26 | — | → **002** (002 CA-15) |
| CA-27 | `register-flow.spec.tsx` | verde |
| CA-28 | `chosen-plan-storage.spec.ts`, `verify-email-view.spec.tsx`, `register-flow.spec.tsx` | verde |
| CA-29 | `test/int/identity/verify-email-concurrency.int-spec.ts`, `user-repository.int-spec.ts` | verde (token); la sesión → **002** |

### Seguridad

Revisor: `security-auditor` (Sonnet), 2026-09-28, sobre PR-1 a PR-4.

**Veredicto inicial: sin bloqueantes**, un hallazgo importante (SEC-1). **Veredicto final: Aprobado** tras SEC-1 y
SEC-2; SEC-3 queda como pendiente transversal.

| Amenaza | Control | Evidencia | Estado |
|---|---|---|---|
| Enumeración por latencia | Argon2id se calcula siempre, antes de la BD | `registration.service.ts:106-117` | ✅ |
| Enumeración por E/S residual entre ramas | 1–2 escrituras extra frente a Argon2id | `registration.service.ts:234-261` | ⚠️ Riesgo aceptado; medir p95 por rama en staging (CA-20) |
| Enumeración por respuesta | Misma secuencia de estado, cuerpo y cabeceras en los 4 tipos de correo | `test/isolation/identity-enumeration.iso-spec.ts` | ✅ |
| Reenvío sin límite por IP | *Throttler* `resend-ip` (10/h) con `IdentityIpThrottlerGuard` | `auth.controller.ts`, `identity-ip-throttler.guard.ts`, `rate-limits.int-spec.ts` | ✅ SEC-1 cerrado |
| Token en tránsito y reposo | 256 bits, SHA-256, `timingSafeEqual` | `opaque-token.vo.ts` | ✅ |
| Token en el trabajo de correo (Redis) | `removeOnComplete`, `removeOnFail` a 24 h, Redis sin puertos publicados | `mail-queue.ts:11-24`; plan §13 | ✅ Riesgo aceptado ya escrito en el plan |
| Bitácoras del `worker` | Sin `job.data` ni mensaje | `mail.processor.ts:56-102` | ✅ |
| Bitácoras sin datos personales ni IP | `REDACTED_FIELDS`, `redactDeep`, `quietReqLogger` | `redacted-fields.ts`, `logger.options.ts` | ✅ |
| Token en el navegador | Fragmento borrado con `replaceState` antes del POST; un solo origen | `use-verify-email.ts` | ✅ |
| `no-store` y sin `X-RateLimit-*` | Middleware y guard | `no-store.middleware.ts`, `identity-ip-throttler.guard.ts` | ✅ |
| Hash de contraseña | Argon2id m=19456, t=2, p=1 | `argon2id.hasher.ts` | ✅ |
| Almacenamiento del navegador | Plan elegido sin datos personales, 24 h | `chosen-plan-storage.ts` | ✅ |
| Correo en `sessionStorage` | Prellenado de pedir enlace como `{ email, savedAt }`, 24 h, se borra al leerlo | `request-link-email-storage.ts` | ✅ SEC-2 cerrado |

| Hallazgo | Descripción | Cierre |
|---|---|---|
| SEC-1 (importante) | `POST /auth/resend-verification` sin límite por IP: spam a terceros y reputación del remitente | `e616d47`: D-8 ampliada (spec §5.2, §6, CA-15 y registro de cambios; plan §5, §6.5 y §8), `RESENDS_PER_IP_PER_HOUR = 10` en `contracts`, *throttler* `resend-ip` con ámbito `ip` y sin `X-RateLimit-*`, y `@SkipThrottle` cruzados para que registro y reenvío cuenten aparte. Rojo y verde en `identity-ip-throttler.guard.spec.ts`, `auth.controller.spec.ts` y `constants.spec.ts`; `rate-limits.int-spec.ts` agrega el 11.º reenvío de una IP → 429 sin correo ni cambios, con registro desde esa IP y reenvío desde otra aún permitidos; `identity-enumeration.iso-spec.ts` sigue verde (cada tipo de correo usa su IP) |
| SEC-2 (sugerencia) | Correo en `sessionStorage` sin vencimiento | `c178ba6`: `saveRequestLinkEmail`/`takeRequestLinkEmail` sobre `expiring-storage.ts` (compartido con `chosen-plan-storage`), 24 h y borrado al leer; plan §6 lo anota |
| SEC-3 (sugerencia) | `web` sin CSP ni cabeceras de seguridad | Aceptado como pendiente transversal **PD-49** (`4eee16b`), a resolver al montar staging |

**Riesgos aceptados**: token en el trabajo de BullMQ hasta 24 h (plan §13); diferencia de E/S entre ramas del registro.

### UI (T-67)

Revisor: `ui-designer` (Sonnet), 2026-09-28, sobre 22 capturas a 360 y 1440 px del recorrido local.

**Veredicto inicial: ❌** (UI-B1 a UI-B3). **Veredicto final: ✅ Aprobado.**

Correcciones: 36be355…8db654a; revisión de las capturas nuevas aprobada; axe 0 violaciones AA en 32 capturas.

| Pantalla / estado (revisión inicial) | Coincide | Observación |
|---|---|---|
| Registro — inicial / requisitos | Parcial | Tokens correctos; faltan panel lateral e indicador de pasos (UI-I1) |
| Registro — catálogo no disponible | Sí | Texto y tono correctos |
| Revisa tu correo / pedir enlace | No | Sin tarjeta, ícono ni pasos (UI-I1) |
| Verificar — ya verificado, enlace inválido | Parcial | Texto y acción correctos; sin tarjeta (UI-I1) |
| Verificar — éxito | No | UI-B3 |
| Términos / Privacidad | Sí | Sin desbordamiento a 360 px |
| Casilla de aceptación | No | UI-B1 |
| Requisitos de contraseña | No | UI-B2 |

| Hallazgo | Descripción | Cierre |
|---|---|---|
| UI-B1 | Casilla de aceptación partida en columnas a 360 px; enlaces solo por color | `36be355` |
| UI-B2 | «Contraseña común» y «correo» salían con ✓ «Cumple» y el texto de error | `b525e93` (rótulos positivos en spec §11) |
| UI-B3 | Éxito de verificación sin tarjeta, ícono ni plan | `9716364` (texto del botón en spec §11: «Iniciar sesión» hasta 002, decisión de Adrián) |
| UI-I1 | Confirmación, pedir enlace y verificación sin tarjeta, ícono ni indicador de pasos | `9716364` |
| UI-I2 | Enlaces de ya-verificado, enlace-expirado y enlace-invalido solo por color | `36be355` (`TextLink` subrayado) |
| UI-I3 | Falta favicon | `8db654a` (excepción de hex documentada en `ui-guidelines.md` §1, `4eee16b`) |
| UI-S1 | «Cumple»/«Falta» con color semántico | `b525e93` |
| UI-S2 | La captura de errores mezclaba el aviso de catálogo no disponible | Cerrado con las capturas nuevas |
| UI-S3 | Faltaban capturas de limite-reenvio, error-servidor y enlace-expirado, y el informe de axe | Cerrado con las 32 capturas nuevas y axe; error-servidor además se alineó con el mockup (`a357714`) |

Checklist final: tokens sin valores escritos a mano ✔ (salvo el favicon, documentado) · componentes de `ui` ✔ ·
contraste AA ✔ · 44 px ✔ · 360 px sin desplazamiento horizontal ✔ · `aria-live` ✔ · axe ✔ · coincidencia con
mockup ✔ con las diferencias documentadas.

**Diferencias con el mockup que quedan** (documentadas en `docs/design/mockups/identity/registro/README.md` y
`docs/design/mockups/identity/verificar-correo/README.md`):
- Registro sin el panel lateral oscuro (propuesta de valor y «Plan elegido»): una columna con indicador de pasos.
- error-servidor con el texto de spec §11 y el mensaje genérico de 000 §10.
- Cuenta regresiva en un texto aparte con `aria-live`, no dentro del botón; pedir-enlace sin el aviso «El enlace que
  abriste expiró».
- Requisitos de contraseña como lista «Cumple»/«Falta» en lugar de barra de fuerza en dos columnas.
- Textos de spec §11 en lugar de los del mockup; «Correo verificado» con «Iniciar sesión» hasta 002 y sin precio,
  cuota ni saludo (dependen de 006a, 007 y 002).
- Círculo de pasos completados con `success-foreground`, por contraste.

### Código

Revisor: `reviewer` (Sonnet), 2026-09-28. Diff `feat/001-identity-backend...HEAD` (T-55…T-66 y correcciones).

**Veredicto inicial: Aprobado**, sin bloqueantes. **Veredicto final: Aprobado.**

| Hallazgo | Descripción | Cierre |
|---|---|---|
| I-1 (importante) | `plan-picker.tsx` duplicaba el marcado y las clases del radio de `components/ui/radio-group.tsx` | `e3fd715`: `RadioGroup` con `defaultValue` (no controlado) y `value` + `onValueChange` (controlado); `PlanPicker` lo reutiliza. Pruebas en `radio-group.interaction.spec.tsx` y `plan-picker.spec.tsx` |
| I-2 (importante) | `plan-catalog.ts` usa la ruta provisional `GET {API_INTERNAL_URL}/plans`, fuera de `packages/contracts` | Aceptado hasta 006a: registro de cambios de la spec y **PD-48** (`4eee16b`) |
| S-3 (sugerencia) | `app/icon.svg` fija hex, atado a los tokens por `icon.spec.ts` | `4eee16b`: excepción documentada en `ui-guidelines.md` §1 |

**Lo que está bien**

- Fronteras respetadas: sin importaciones de mockups, `API_PUBLIC_URL` sin `NEXT_PUBLIC_*`, precios desde la API.
- StrictMode y `hashchange` en la verificación, sin caché a nivel de módulo.
- `IdentityCard`, `ServerErrorAlert` y `SignupSteps` reutilizados en todas las pantallas.
- Accesibilidad en el código: `aria-live`, `aria-invalid`, `aria-describedby`, foco gestionado, roles correctos.

## PR-3 — backend de identity

Revisor: `reviewer` (Sonnet), 2026-09-28. Tareas T-28 a T-53 y la corrección `no-store` de T-45.

**Veredicto inicial: Bloqueante** (hallazgo 1). Las pruebas de integración y aislamiento están escritas y compilan, pero
**no se ejecutaron** (sin Docker); T-54 sigue abierta.

**Veredicto tras correcciones: Aprobado.** `test:int` 169/169 y `test:isolation` 5/5 en verde (2026-09-28, T-54).

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
