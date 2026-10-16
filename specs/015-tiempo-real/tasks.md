# Tareas 015 — Tiempo real

> Spec: `./spec.md` · Plan: `./plan.md` (aprobado 2026-10-15; ADR-0028 y DF-65 aceptados)
> 9 tareas verticales, un commit cada una (`feat(realtime): … [015 T-xx]`). Toda tarea de lógica empieza por su prueba.
> Prefijo `apps/api/src/modules/realtime/` abreviado como `realtime/`. Una sola línea: `api` primero (T-01 a T-07), `web` después (T-08).
> Constitución, siempre: funciones ≤ 30 líneas y ≤ 3 parámetros. `realtime` no importa `identity`, `access` ni módulos de negocio.
> Los textos de ADR-0028 fijan versiones exactas: `@nestjs/websockets` y `@nestjs/platform-socket.io` 11.2.5 (con `socket.io` 4.x) en `api`; `socket.io-client` 4.x en `web`.

- [x] **T-01** Base: `expiresAt` en el verificador, configuración y dominio de `realtime`. Primero: el contrato `access-token-verifier.contract.ts` afirma `expiresAt` en el caso válido (falla), y `realtime-config.spec.ts` fija que `pingIntervalMs + pingTimeoutMs` ≤ 60 000. Luego: `AccessTokenVerification` válida suma `expiresAt: Date`; `JwtTokenService.verify` lo rellena desde `exp`; `TestAccessTokenVerifier` también; `room-names.ts` (`userRoom`, `documentRoom`, `documentIdOf`, con su spec); `RealtimeTooManyRequestsError` (`REALTIME_TOO_MANY_REQUESTS`); `RealtimeConfig` + `REALTIME_CONFIG` con constantes de ruta y latido (20 000 + 15 000 ms); variable `REALTIME_CONNECT_ATTEMPTS_PER_MINUTE` (def. 60, `positiveInt`) en `env.schema.ts` y `.env.example` (`pnpm env:check` debe pasar). — CA: CA-9 (constante de latido), CA-14 (error de dominio), soporte de CA-4 — Archivos: `shared/application/auth/i-access-token-verifier.port.ts`, `identity/infrastructure/jwt/jwt-token.service.ts`, `test/support/{access-token-verifier.contract,test-access-token-verifier}.ts`, `test/int/shared/access-token-contract.int-spec.ts`, `shared/infrastructure/config/env.schema.ts`, `.env.example`, `realtime/domain/{room-names,errors/*}.ts`, `realtime/application/realtime-config.ts` y sus specs
- [x] **T-02** `ConnectionAdmission` (lógica de rechazo, sin Socket.IO). Primero su spec con dobles de `IAccessTokenVerifier`, `IRateLimiter` e `IClock`: sin token, inválido, vencido → `UnauthenticatedError`; rol ≠ `CLIENT` → `ForbiddenError`; válido → `{ actor, expiresAt }` con `createActor`; umbral superado → `RealtimeTooManyRequestsError` con espera y **sin llamar al verificador**; fallo del limitador → `UnauthenticatedError` sin detalle (falla cerrado). Un método de ≤ 30 líneas: encadenar pasos pequeños (límite → verificación → rol). — CA: CA-2, CA-3, CA-14 (lógica) — Archivos: `realtime/application/connection-admission.service.ts` y `.spec.ts` — Depende: T-01
- [x] **T-03** Canal autenticado de punta a punta (_handshake_). Primero `test/int/realtime/handshake.int-spec.ts` (Testcontainers con Redis real, `socket.io-client` real, `TestAccessTokenVerifier`): conecta y queda solo en `user:<id>`; sin token, inválido y vencido → `connect_error` con `SHARED_UNAUTHENTICATED`; rol interno → `SHARED_FORBIDDEN`; `Origin` no listado rechazado; umbral → `REALTIME_TOO_MANY_REQUESTS` (`data.status` 429, `retryAfterSeconds`); captura del logger: una línea `realtime.connected`/`rejected`/`disconnected` con `correlationId`, `userId` y motivo, sin token. **Instala aquí las dependencias de `api`** de ADR-0028 (versiones exactas). Crea `RealtimeIoAdapter`, `RealtimeGateway` (`afterInit`, `handleConnection`, token solo en `handshake.auth.token`), `handshake-error.ts`, `connection-origin.ts` (último `x-forwarded-for`), `RealtimeModule.forRoot(env)`, `configureRealtime` e `index.ts`; `app.module.ts` y `main.ts`. Arranca `realtime/README.md` (propósito, rutas, salas, bitácoras). `SocketIoHub` aún no existe: el gateway solo une a `user:<id>`. — CA: CA-1, CA-2, CA-3, CA-13, CA-14 — Archivos: `test/int/realtime/handshake.int-spec.ts`, `realtime/presentation/{realtime.gateway,handshake-error,connection-origin}.ts`, `realtime/infrastructure/realtime-io.adapter.ts`, `realtime/{realtime.module,realtime-app,index}.ts`, `realtime/README.md`, `app.module.ts`, `main.ts`, `package.json`, `pnpm-lock.yaml` — Depende: T-02
- [x] **T-04** Cierre al vencer el token. Primero `connection-lifetime.spec.ts` con temporizadores y reloj falsos: al llegar `expiresAt` emite `realtime.session-expired` `{ code: 'SHARED_UNAUTHENTICATED' }` y desconecta; al desconectar antes cancela el temporizador (sin fugas). Luego se conecta al gateway (`handleConnection`) y una int-spec en `handshake.int-spec.ts` o `lifetime.int-spec.ts` prueba que un token que vence en pocos segundos cierra la conexión y que otra con token nuevo vuelve a abrir. Sin interfaz para `ConnectionLifetime` (una implementación, Art. V.2). — CA: CA-4 (servidor) — Archivos: `realtime/infrastructure/connection-lifetime.ts` y `.spec.ts`, `realtime/presentation/realtime.gateway.ts`, `test/int/realtime/lifetime.int-spec.ts` — Depende: T-03
- [x] **T-05** Avisar a un usuario y `room.join` denegado. Primero `socket-io-hub.spec.ts` (sin servidor adjunto, `toUser`/`toDocument` no fallan ni esperan; un fallo interno se atrapa y registra `realtime.publish_failed` solo con `errorClass`) y `publish.int-spec.ts` (dos conexiones del mismo usuario reciben el aviso una vez cada una) y `rooms.int-spec.ts` (`room.join` a `user:<otro>` o `doc:<id>` → ack `SHARED_FORBIDDEN`, no se une, no recibe). Luego `IRealtimePublisher` + `RealtimeNotice` + `I_REALTIME_PUBLISHER` y `SocketIoHub.attach` + `toUser`/`toDocument` (gateway adjunta el hub); `@SubscribeMessage('room.join')` siempre deniega; ningún otro evento del cliente tiene manejador (RN-4). El módulo exporta el token. — CA: CA-5, CA-7, CA-12 — Archivos: `realtime/application/ports/i-realtime-publisher.port.ts`, `realtime/infrastructure/socket-io-hub.ts` y `.spec.ts`, `realtime/presentation/realtime.gateway.ts`, `realtime/{realtime.module,index}.ts`, `test/int/realtime/{publish,rooms}.int-spec.ts` — Depende: T-03
- [x] **T-06** Salas de documento: admitir, retirar y avisar la salida. Primero en `rooms.int-spec.ts` y `publish.int-spec.ts`: `admit(actorA, conexiónDeA, D)` + aviso a D lo reciben solo las conexiones admitidas; `admit` con conexión ajena o inexistente → `ForbiddenError`; `retire(userId, D)` saca a todas sus conexiones y corta los avisos; salida limpia emite `realtime.document-left` `{ userId, connectionId, documentId }`; cliente que deja de responder pings lo emite en ≤ 60 s (con tiempos cortos de `RealtimeConfig`); un oyente que lanza no rompe el cierre; tras corte y reconexión vuelve a `user:<id>`, queda fuera de `doc:` y no recibe lo emitido durante el corte. Luego `IDocumentRooms` + `DocumentLeftEvent` + `REALTIME_DOCUMENT_LEFT` + `I_DOCUMENT_ROOMS`, `admit`/`retire` y el emisor en `disconnecting` con `EventEmitter2` (ADR-0019); el mismo `SocketIoHub` enlazado a ambos tokens (ISP, un solo adaptador). **Docs donde nacen**: `docs/sdd/design-model.md` T3 (puertos, evento, `expiresAt`; DF-65), `docs/sdd/architecture.md` §5 (nombres) y `realtime/README.md` (puertos y evento). — CA: CA-6, CA-8, CA-9, CA-11 (servidor) — Archivos: `realtime/application/ports/i-document-rooms.port.ts`, `realtime/infrastructure/socket-io-hub.ts`, `realtime/{realtime.module,index}.ts`, `realtime/README.md`, `test/int/realtime/{rooms,publish}.int-spec.ts`, `docs/sdd/{design-model,architecture}.md` — Depende: T-05
- [ ] **T-07** Aislamiento (bloqueante): A y B conectados a la vez, documentos casi idénticos, A admitida en `doc:D`. Se emiten avisos a A y a D: B, con varias conexiones y pidiendo `room.join` a `user:A` y `doc:D`, no recibe ninguno; `admit(actorB, conexiónDeA, D)` lanza `ForbiddenError`. Entra al `pnpm test:isolation` bloqueante. — CA: CA-10 — RNF-05 — Archivos: `apps/api/test/isolation/realtime.iso-spec.ts` — Depende: T-06
- [x] **T-08** Cliente web mínimo de reconexión. Primero `realtime-provider.spec.tsx` (componente, `socket.io-client` simulado): `auth` como función que lee el token actual de `useSession` en cada intento; ante `connect_error` o `realtime.session-expired` con `SHARED_UNAUTHENTICATED` llama a `renew()` y reabre con el token nuevo; al volver la red reconecta sin intervención; sin `useRealtime()` (016 es su primer consumidor), sin indicador visual ni eventos de negocio. **Instala `socket.io-client`** en `web` (versión exacta, ADR-0028). `RealtimeProvider` se monta en `(app)/layout.tsx` solo para cliente con sesión. Sin colores escritos a mano (no hay UI nueva). — CA: CA-4 (cliente), CA-11 (cliente) — Archivos: `apps/web/src/features/realtime/{realtime-client.ts,realtime-provider.tsx}` y specs, `apps/web/src/app/(app)/layout.tsx`, `apps/web/package.json`, `pnpm-lock.yaml` — Depende: T-04 (contrato `realtime.session-expired`)
- [ ] **T-09** **(humana, Adrián)** Recorrido de la demo en local con `docker compose up -d` y `pnpm dev`: iniciar sesión como cliente y ver en DevTools el canal abierto; esperar o forzar el vencimiento del token y ver el cierre y la reapertura; cortar y restaurar la red y ver la reconexión; confirmar que una cuenta de Soporte no se conecta; subir un archivo con el `api` sin canal (apagado de prueba) y comprobar que responde igual. Nota en el PR (no hay pantalla nueva, P-1). — CA: los visibles (CA-1, CA-3, CA-4, CA-11, CA-12) — Depende: T-07, T-08

## Matriz CA → tarea

| CA    | Tarea(s)                                                   |
| ----- | ---------------------------------------------------------- |
| CA-1  | T-03                                                       |
| CA-2  | T-02, T-03                                                 |
| CA-3  | T-02, T-03                                                 |
| CA-4  | T-04 (servidor), T-08 (cliente)                            |
| CA-5  | T-05                                                       |
| CA-6  | T-06                                                       |
| CA-7  | T-05                                                       |
| CA-8  | T-06                                                       |
| CA-9  | T-01 (constante ≤ 60 s), T-06 (salida limpia y por latido) |
| CA-10 | T-07                                                       |
| CA-11 | T-06 (servidor), T-08 (cliente)                            |
| CA-12 | T-05                                                       |
| CA-13 | T-03                                                       |
| CA-14 | T-01 (error), T-02 (lógica), T-03 (integración)            |

## Notas del developer

- T-01: sumar `expiresAt` a `AccessTokenVerification` obligó a ajustar, además de los archivos listados, los dobles y
  afirmaciones que construyen o comparan un resultado válido: `jwt.strategy.spec.ts`, `jwt-token.service.spec.ts`,
  `test/int/identity/sessions.int-spec.ts` y `test/isolation/isolation-world.iso-spec.ts`; y la variable nueva, las
  fijaciones de entorno de `load-env.spec.ts` y `minio-config.module.spec.ts`. Sin cambio de comportamiento.
- T-01: el contrato del verificador afirma `expiresAt` igual al `exp` del propio token (sin suponer el TTL del emisor).
  `DEPARTURE_DETECTION_LIMIT_MS` (60 000, RN-9) queda como constante junto a las de latido para que la prueba no use un
  número suelto.
- T-03: la bitácora `realtime.rejected` con motivo la emite `ConnectionAdmission` (T-02), no el gateway; el gateway
  registra `realtime.connected` y `realtime.disconnected`, y el adaptador el rechazo por `Origin` (desviación del
  plan §2, anotada en `realtime/README.md`). El gateway agrega `reason: 'unexpected_error'` (con `errorClass`) si algo
  no previsto lanza en el _handshake_: se rechaza como `SHARED_UNAUTHENTICATED` sin detalle (falla cerrado).
- T-03: `configureRealtime(app)` lee `REALTIME_CONFIG` de la app en vez de recibir `env` (plan: `configureRealtime(app,
env)`), para que el arnés la sustituya con `overrides` (tiempos cortos de T-06). `createTestApp` suma la opción
  `withRealtime`, y `test/int/realtime/realtime-test-app.ts` arma la app (puerto efímero, verificador de prueba con su
  reloj, umbral de 3 intentos) y el cliente (`connectClient`, `waitForConnect`, `waitForConnectError`).
- T-03: el plan no decía cómo `RealtimeModule` resuelve `I_ACCESS_TOKEN_VERIFIER` (`IdentityModule` lo exporta pero no
  es global, y `realtime` no puede importarlo). `RealtimeModule.forRoot(env, accessTokenVerifierModule)` recibe el
  módulo que lo exporta: `AppModule` le pasa **la misma instancia** de `IdentityModule.forRoot(env)` (Nest 11
  deduplica módulos dinámicos por referencia) y las pruebas, un módulo con `TestAccessTokenVerifier`. Mismo criterio que
  DF-51 (la raíz de composición enlaza el puerto); sin puerto ni dependencia nueva.
- T-03: dependencias (ADR-0028, versiones exactas): `@nestjs/websockets` y `@nestjs/platform-socket.io` 11.2.5,
  `socket.io` 4.8.3 (la que fija `@nestjs/platform-socket.io`; directa porque `realtime` importa sus tipos) y, en
  desarrollo, `socket.io-client` 4.8.4 (la misma que `web`) para las pruebas de integración. `RealtimeSocket`,
  `RealtimeServer` y `ConnectionData` viven en `realtime/infrastructure/realtime-socket.ts` (archivo no previsto) para
  que `ConnectionLifetime` (T-04) y `SocketIoHub` (T-05/T-06) los usen sin depender de `presentation`.
- T-03 (pedido del coordinador): el web conecta a `<origen de API_PUBLIC_URL>/socket.io`, y el Traefik local solo
  enrutaba `/api`. Se suma el prefijo `/socket.io` al enrutador del `api` en `infra/traefik/local-routes.yml` y en
  las etiquetas de `compose.override.yml` (Traefik v3 pasa el WebSocket sin configuración extra); `REALTIME_PATH` no
  cambia. Staging aún no tiene archivos de Traefik: queda en **PD-75**.
- T-04: `ConnectionLifetime` toma la hora de `I_CLOCK` (global) y cierra con `socket.disconnect()` sin cerrar el
  transporte: el cliente recibe primero el aviso y luego `io server disconnect` (no reconecta solo; T-08 reabre con el
  token renovado). La int-spec usa reloj real en el servidor y un `FixedClock` atrasado 15 min menos 3 s en el
  verificador y el emisor: el token se acepta y su `exp` cae a 2–3 s reales, sin falsear temporizadores de Socket.IO.
- T-05: `room.join` sin manejador respondería por _timeout_, así que el gateway responde el _ack_ con el `code` de
  `InsufficientRoleError` (`SHARED_FORBIDDEN`), sin registrar el intento (ningún CA lo pide). `errorClassOf`
  (`realtime/application/error-class.ts`, archivo no previsto) junta la clase del error para las bitácoras: tercera
  copia con `SocketIoHub` (Art. VI.2); la usan `ConnectionAdmission` y el hub, y `RealtimeGateway.asDomainError`
  conserva su copia hasta integrar T-04 (se trabajó en paralelo y se evitó tocar esa zona). El arnés suma
  `OpenClients`, `collectEvents` y `settle` para las suites nuevas (`handshake.int-spec.ts` no se tocó).
- T-06: el emisor de `realtime.document-left` vive en `SocketIoHub` (escucha `disconnecting` de cada conexión desde
  `attach`), no en el gateway: el hub es dueño de las salas de documento (`admit`/`retire`) y el gateway queda en
  *handshake*, sala de usuario y bitácoras. Se emite en todo cierre con salas `doc:` (cliente, vencimiento del token,
  latido); `retire` no lo emite. `admit` con conexión ajena o inexistente lanza `InsufficientRoleError`
  (`ForbiddenError`, `SHARED_FORBIDDEN`): mismo código que `room.join` (CA-7), sin código nuevo en `contracts`. Bitácora
  nueva `realtime.document_left_failed` (solo `errorClass`) si un oyente lanza. `withCorrelation` del gateway pasa a
  `inConnectionContext` en `infrastructure/realtime-socket.ts` (lo usan gateway y hub) y `RealtimeGateway.asDomainError`
  usa `errorClassOf` (pendiente de T-05). El arnés suma `EventEmitterModule`, la opción `reconnection`,
  `collectDepartures`, `nextDeparture` y `stopAnsweringPings` (deja de responder `pong` tocando el método interno
  `_sendPacket` de `engine.io-client` 6). Además se tocan `design-findings.md` (estado de DF-65; falta redibujar T3,
  PD-46), `realtime/infrastructure/realtime-socket.ts`, `realtime/presentation/realtime.gateway.ts` y
  `test/int/realtime/realtime-test-app.ts`.
