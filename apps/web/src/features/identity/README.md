# Identity en la web

Registro y verificación (spec 001), inicio de sesión, sesión y recuperación de contraseña (spec 002, PR-5a) y la
primera contraseña de una cuenta interna (011). Solo `api.ts` y `account-setup/api.ts` hablan con la API de
`identity`; validan cada respuesta con `@nimbo/contracts` y lanzan `ApiClientError` con el `code` estable. Los textos
de error salen de `lib/error-catalog.ts` (`messageForCode`).

**Sesión en memoria (D-1, CA-28)**: el token de acceso vive solo en la memoria de la pestaña; nunca en
`localStorage`, `sessionStorage` ni `document.cookie`. El refresco viaja en una cookie `HttpOnly` que el navegador
manda solo (`credentials: 'include'` en `login`, `refresh` y `logout`). Recargar pierde la memoria y el proveedor la
recupera con esa cookie.

| Pieza                                          | Qué hace                                                                                                       | Tarea      |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------- |
| `api.ts`                                       | Registro, verificación, `login`, `refresh`, `logout`, `forgotPassword`, `checkResetLink`, `resetPassword`      | T-82       |
| `routes.ts`                                    | `/iniciar-sesion` y `?sesion=terminada` (`SESSION_ENDED_PATH`)                                                 | T-86       |
| `session/session-memory.ts`                    | Entrega la sesión recién abierta del grupo `(public)` al `SessionProvider` de `(app)`; olvida un token vencido | T-84       |
| `session/use-enter-session.ts`                 | Con una sesión nueva (login o verificación): la recuerda y `router.replace(homePathFor(role))` (CA-1)          | T-88       |
| `session/refresh-coordinator.ts`               | Renovación en un solo vuelo por pestaña y serializada entre pestañas con el candado `nimbo-refresh`            | T-83       |
| `session/session-provider.tsx`                 | `useSession()`: `{ status, user, accessToken, renew, signOut }`; renueva un minuto antes de que venza el token | T-84       |
| `session/auth-fetch.ts`                        | `requestJson` con `Authorization: Bearer`; ante `401 SHARED_UNAUTHENTICATED` renueva una vez y repite          | T-85       |
| `session/session-gate.tsx`                     | Muestra a sus hijos solo con sesión; carga mientras renueva; sin sesión lleva a `/iniciar-sesion`              | T-86       |
| `components/login-form.tsx`, `login-alert.tsx` | Formulario de inicio de sesión y alerta de cada rechazo encima del botón (spec §11)                            | T-88, T-89 |
| `components/request-reset-form.tsx`            | `/recuperar-contrasena`: pedir el enlace y «revisa tu correo» neutro                                           | T-91       |
| `components/reset-password-view.tsx`           | `/restablecer-contrasena`: lee y borra `#token`, comprueba el enlace y elige la contraseña nueva               | T-92, T-93 |
| `account-setup/`                               | `/crear-contrasena` (011 CA-5): igual que restablecer, con `checkAccountSetupLink` y `setFirstPassword`        | 011 T-08   |

## Renovación

- `refresh-coordinator` comparte la promesa en curso: varias llamadas simultáneas en la pestaña hacen **una** petición.
  Entre pestañas usa `navigator.locks.request('nimbo-refresh')`, así la siguiente pestaña manda la cookie que dejó la
  anterior (RN-4). Sin `navigator.locks` basta el vuelo único de la pestaña (DT-16).
- `IDENTITY_REFRESH_INVALID` se reintenta **una** vez (CA-9). `IDENTITY_SESSION_EXPIRED` o `IDENTITY_SESSION_REVOKED`
  llaman `onSessionEnded`: el proveedor olvida la sesión y queda en `ended` (CA-8).
- Estados de `SessionProvider`: `loading` (al montar sin sesión en memoria, también en el servidor: sin desajuste de
  hidratación), `authenticated`, `unauthenticated` (no hay cookie válida o se cerró la sesión) y `ended`.
- `signOut` llama a `logout` (idempotente) y limpia la memoria aunque la API no responda.

## `auth-fetch`

`createAuthFetch({ getAccessToken, renew })` es el cliente de cualquier módulo que llama a la API con sesión (p. ej.,
`storage/components/uploads-provider.tsx` con `useSession()`). Solo un `401 SHARED_UNAUTHENTICATED` (token de acceso
vencido) renueva y repite **una** vez; un `401 IDENTITY_*` se propaga tal cual (plan §5). Si `renew` devuelve `null`
se propaga el `401` original y el proveedor ya cambió de estado.

## `SessionGate` y el grupo `(app)`

`app/(app)/layout.tsx` monta `SessionProvider` + `SessionGate`; `(cliente)` e `(interno)` van anidados dentro sin
cambiar sus rutas. El servidor solo pinta la carga «Cargando tu sesión…», nunca contenido privado. Con `unauthenticated`
el portero hace `router.replace('/iniciar-sesion')`; con `ended`, `router.replace('/iniciar-sesion?sesion=terminada')`,
que muestra «Tu sesión terminó. Inicia sesión de nuevo.».

## Inicio de cada rol

`homePathFor(role)` vive en `features/access/home-path.ts` (003 §6.9): `CLIENT` → `/archivos`; `ADMIN`, `SUPPORT` y
`OPERATOR` → `/interno`. Lo usan `useEnterSession` y las áreas por rol (`RequireRole`).

En el mismo archivo (011 CA-17): `areaHomePathFor(role)` es la pantalla a la que `/interno` lleva al rol que ya tiene
área (Soporte: `/soporte/metadatos`; Admin y Operador, `null` y el marcador hasta T-13 y T-11) y
`activityPathFor(role)` es «Mi actividad» del menú de la cuenta (cliente: `/actividad`; internos:
`/interno/actividad`).
