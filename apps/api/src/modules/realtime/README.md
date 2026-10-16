# `realtime` — T3 · transversal (generalizado desde M5)

- **Dueño**: Adrián (`specs/README.md`).
- **Diagrama de origen**: T3 en `docs/sdd/design-model.md` §3 y `docs/design/diagramas/`.
- **Responsabilidad**: Único gateway Socket.IO, salas por usuario y documento. Valida el token del handshake con el puerto token→`Actor` que define `shared` (lo implementa `identity`, sin que `realtime` lo importe) y declara su puerto de publicación (ADR-0010).
- **Puede depender de**: shared (`docs/sdd/architecture.md` §3; el lint de fronteras lo hace cumplir).
- **Specs que lo construyen**: 015.

## Canal en vivo (015)

- **Ruta**: `GET /socket.io/` (`REALTIME_PATH`, constante), WebSocket con _polling_ de respaldo, en el mismo puerto que
  la API HTTP. Traefik la enruta al `api` (`infra/traefik/local-routes.yml`, etiquetas de `compose.override.yml`).
- **Montaje**: `RealtimeModule.forRoot(env, accessTokenVerifierModule)` en `AppModule`, que le pasa la misma instancia
  de `IdentityModule` para resolver `I_ACCESS_TOKEN_VERIFIER` sin que `realtime` importe `identity`.
  `configureRealtime(app)` instala `RealtimeIoAdapter` (ruta, CORS y `allowRequest` por `CORS_ORIGIN` exacto, latido
  de `RealtimeConfig`) antes de `listen`; lo llaman `main.ts` y el arnés de integración (`withRealtime: true`).
- **Handshake**: el token va solo en `auth.token`. `RealtimeGateway.afterInit` registra el _middleware_, que delega en
  `ConnectionAdmission` (límite por origen con `IRateLimiter` → `IAccessTokenVerifier` → solo `CLIENT`). Un rechazo
  llega al cliente como `connect_error` con `message` = código y `data` = `{ code, status, retryAfterSeconds? }`
  (`SHARED_UNAUTHENTICATED`, `SHARED_FORBIDDEN`, `REALTIME_TOO_MANY_REQUESTS`). El origen del intento es el último
  valor de `x-forwarded-for` o la dirección de la conexión.
- **Datos de la conexión**: `socket.data` = `{ correlationId, actor, expiresAt }` (`ConnectionData`).
- **Salas**: `user:<userId>` (el gateway la une al conectar) y `doc:<documentId>`; nombres solo con `room-names.ts`.
- **Bitácoras** (sin token, origen, nombre de archivo ni contenido, CA-13), todas con `correlationId` de la conexión:
  - `realtime.rejected` con `reason` la emite `ConnectionAdmission` (`missing_token`, `invalid_token`, `expired_token`,
    `forbidden_role`, `rate_limited`, `limiter_failed`); `RealtimeIoAdapter` emite `reason: 'origin'`, y el gateway
    `reason: 'unexpected_error'` (con `errorClass`) si algo no previsto lanza en el _handshake_.
  - `realtime.connected` (`userId`, `connectionId`) y `realtime.disconnected` (`userId`, `connectionId`, `reason` de
    Socket.IO) las emite el gateway.

## Capas (`docs/sdd/architecture.md` §4)

```
modules/realtime/
├─ domain/          # entidades, objetos de valor, errores; sin Nest, TypeORM ni zod
├─ application/     # servicios («service» de los diagramas) y puertos (`ports/`)
├─ infrastructure/  # persistencia (*.orm-entity.ts), adaptadores, procesadores
├─ presentation/    # controladores, DTOs, gateways
├─ realtime.module.ts # lo crea la primera spec del módulo
└─ index.ts         # única API pública
```

## Regla

Otros módulos importan **solo** desde `modules/realtime/index.ts` (fachadas, puertos que este módulo implementa,
eventos y tipos públicos). Nada de `infrastructure/**` cruza la frontera. Nombres de clases y puertos: los de
`docs/sdd/design-model.md`.
