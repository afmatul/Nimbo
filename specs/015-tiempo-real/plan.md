# Plan 015 — Tiempo real

> Spec: `./spec.md` · Estado del plan: Aprobado
> Obligatorio y ≤ 250 líneas. Dice **qué** archivos se tocan y **qué** se espera de cada uno; no es el código en
> prosa (sin cuerpos de funciones ni pseudocódigo). Lo aprueba Adrián antes de escribir código.

## 1. Resumen técnico
Un único servidor Socket.IO dentro del `api`, montado con el adaptador de WebSocket de Nest (`RealtimeIoAdapter`, que
aplica CORS, latido y ruta desde el entorno). Un *middleware* de *handshake* aplica, en este orden: límite de intentos por
origen (`IRateLimiter`), verificación del token con `IAccessTokenVerifier` (el mismo puerto que usa `JwtStrategy`; no se
copia nada del guard HTTP) y rechazo de roles distintos de `CLIENT`. La conexión aceptada se une sola a la sala
`user:<id>` y se le programa un cierre al vencer su token. Hacia otros módulos `realtime` declara dos puertos
(ISP, ver §2): `IRealtimePublisher` (avisar a un usuario o a un documento) e `IDocumentRooms` (el módulo dueño admite o
retira conexiones de la sala `doc:<id>`). La salida de una conexión de una sala de documento se avisa con el evento
`realtime.document-left` (ADR-0019), que `editing` escucha en 016. Un solo adaptador, `SocketIoHub`, implementa ambos
puertos. Sin migraciones, sin adaptador de Redis (YAGNI, §7) y sin productores de negocio.

## 2. Módulos, archivos y diseño
Prefijo `apps/api/src/modules/realtime/` (salvo indicación). Capas según `architecture.md` §4.

| Capa | Archivo | Responsabilidad |
|---|---|---|
| domain | `domain/room-names.ts` | `userRoom(id)`, `documentRoom(id)` y `documentIdOf(room)`: único lugar que arma o lee nombres de sala (RN-1) |
| domain | `domain/errors/realtime-too-many-requests.error.ts` (+ `index.ts`) | `RealtimeTooManyRequestsError` extiende `TooManyRequestsError`; `code = 'REALTIME_TOO_MANY_REQUESTS'` (CA-14) |
| application | `application/ports/i-realtime-publisher.port.ts` | `IRealtimePublisher` (`toUser`, `toDocument`), `RealtimeNotice { event, payload }`, `I_REALTIME_PUBLISHER`. Nunca lanza ni espera (RN-7) |
| application | `application/ports/i-document-rooms.port.ts` | `IDocumentRooms` (`admit(actor, connectionId, documentId)`, `retire(userId, documentId)`), `I_DOCUMENT_ROOMS`, `DocumentLeftEvent { userId, connectionId, documentId }` y `REALTIME_DOCUMENT_LEFT = 'realtime.document-left'` |
| application | `application/connection-admission.service.ts` | `ConnectionAdmission.admit(attempt)`: límite de intentos → verificación → rol; devuelve `{ actor, expiresAt }` o lanza `RealtimeTooManyRequestsError`, `UnauthenticatedError`, `ForbiddenError` (`SHARED_*`). Sin Socket.IO ni Nest-WS |
| application | `application/realtime-config.ts` | `RealtimeConfig` + `REALTIME_CONFIG` (orígenes, intentos por minuto, `pingIntervalMs`, `pingTimeoutMs`), como `UPLOAD_CONFIG` en `storage` |
| infrastructure | `infrastructure/socket-io-hub.ts` | `SocketIoHub` implementa `IRealtimePublisher` e `IDocumentRooms` sobre el `Server`; `attach(server)` desde el gateway. Sin servidor adjunto, publicar es un no-op (CA-12). `admit` exige que la conexión exista y pertenezca a `actor.id`; si no, `ForbiddenError`. `retire` saca a **todas** las conexiones de ese usuario de la sala del documento (`socketsLeave`). Emite `realtime.document-left` con `EventEmitter2` en `disconnecting` (atrapa y registra si un oyente lanza, ADR-0019) por cada sala `doc:` en que estaba (cierre limpio o caída por latido) |
| infrastructure | `infrastructure/realtime-io.adapter.ts` | `RealtimeIoAdapter extends IoAdapter`: aplica ruta, CORS por `CORS_ORIGIN` exacto (`allowRequest` rechaza un `Origin` presente y no listado, RN-3) y `pingInterval`/`pingTimeout` |
| infrastructure | `infrastructure/connection-lifetime.ts` | Programa el cierre al vencer el token (CA-4): emite `realtime.session-expired` con `{ code: 'SHARED_UNAUTHENTICATED' }` y desconecta; cancela el temporizador al desconectar |
| presentation | `presentation/realtime.gateway.ts` | `@WebSocketGateway`. `afterInit`: adjunta el hub y registra el *middleware* de *handshake* (token en `handshake.auth.token`, nunca en la URL). `handleConnection`: une a `user:<id>` y programa vida. `@SubscribeMessage('room.join')` responde siempre `SHARED_FORBIDDEN` (CA-7); el resto de eventos del cliente no tiene manejador (RN-4). Bitácora de cada aceptación, rechazo y cierre (CA-13) |
| presentation | `presentation/handshake-error.ts` | Convierte un `DomainError` en el error de *middleware* de Socket.IO (`message` = `code`, `data` = `{ code, status, retryAfterSeconds? }`) |
| presentation | `presentation/connection-origin.ts` | Origen del intento: último valor de `x-forwarded-for` (un salto de Traefik, como `trust proxy = 1`) o `handshake.address` |
| módulo | `realtime.module.ts` | `RealtimeModule.forRoot(env)`: `REALTIME_CONFIG`, `ConnectionAdmission`, `SocketIoHub` enlazado a ambos tokens, `RealtimeGateway`. Exporta los dos tokens |
| módulo | `realtime-app.ts` y `index.ts` | `configureRealtime(app, env)` (instala el adaptador; lo llaman `main.ts` y el arnés de integración, como `configureHttpApp`). `index.ts` exporta `RealtimeModule`, `configureRealtime`, ambos puertos y tokens, `RealtimeNotice`, `DocumentLeftEvent`, `REALTIME_DOCUMENT_LEFT` |

Cambios fuera de `realtime`:
| Archivo | Cambio |
|---|---|
| `shared/application/auth/i-access-token-verifier.port.ts` | `AccessTokenVerification` válida suma `expiresAt: Date` (la necesita CA-4; `claims` no cambia) |
| `identity/infrastructure/jwt/jwt-token.service.ts` | `verify` rellena `expiresAt` desde `exp` (ya lo lee) |
| `test/support/access-token-verifier.contract.ts`, `test-access-token-verifier.ts` | Afirman `expiresAt` en el caso válido |
| `shared/infrastructure/config/env.schema.ts`, `.env.example` | `REALTIME_CONNECT_ATTEMPTS_PER_MINUTE` (def. 60, `positiveInt`); la ruta y los tiempos de latido son constantes, no variables (YAGNI). `pnpm env:check` debe pasar |
| `app.module.ts`, `main.ts` | Importa `RealtimeModule.forRoot(env)`; `configureRealtime(app, env)` tras `configureHttpApp` |
| `web/src/features/realtime/realtime-client.ts`, `realtime-provider.tsx` (+ `.spec`) | Mínimo para CA-4/CA-11: `RealtimeProvider` dentro de `(app)/layout.tsx` crea un `socket.io-client` con `auth` en forma de función (lee el token actual de `useSession` en cada intento de reconexión); ante `connect_error` o `realtime.session-expired` con `SHARED_UNAUTHENTICATED` llama a `renew()` de la sesión y reabre. Sin `useRealtime()` hasta 016, su primer consumidor (YAGNI). Sin indicador visual, sin eventos de negocio (P-1) |
| `realtime/README.md`, `docs/sdd/architecture.md` §5, `design-model.md` T3 | Nombres de los puertos y evento (el §5 deja el nombre «en el plan 015») |

- **Puertos nuevos y su justificación (Art. V.2)**: `IRealtimePublisher` e `IDocumentRooms` son **frontera de módulo**
  (regla b): `storage`, `editing`, `intelligence` y `notifications` publican sin conocer Socket.IO y sus pruebas usan
  un doble. Son dos porque los usuarios difieren (ISP, Art. IV): `storage`/`notifications`/`intelligence` solo publican;
  solo el dueño de la sala (`editing`) admite y retira. Sin interfaz para `ConnectionAdmission` ni `ConnectionLifetime`
  (una implementación, sin frontera). `IAccessTokenVerifier` e `IRateLimiter` ya existen.
- **Reutilizado**: `IAccessTokenVerifier`, `IRateLimiter` + `RedisRateLimiter`, `TooManyRequestsError`,
  `UnauthenticatedError`, `ForbiddenError`, `createActor`, `IClock`, `CorrelationContext`, `Logger` de `nestjs-pino`,
  `EventEmitter2` (ya en `AppModule`), `Env.CORS_ORIGIN`.
- **Dependencias entre módulos**: ninguna nueva en el grafo (`realtime → shared`; `editing → realtime` ya permitida).
  `realtime` no importa `identity`, `access` ni módulos de negocio.
- **Sobre `Actor` en los servicios**: `ConnectionAdmission` produce el `Actor` desde los *claims* con `createActor`
  (único lugar, 003 D-9). `IDocumentRooms.admit` recibe `actor` (no un `userId` suelto).

## 3. Datos
Sin migraciones, tablas ni RLS. El estado de salas y conexiones vive en memoria del proceso `api` (RN-6: sin
almacenamiento ni reenvío). `down`: no aplica.

## 4. Contratos
No hay rutas HTTP nuevas. Canal: `GET /socket.io/` (ruta fija `REALTIME_PATH`), transportes `websocket` con *polling*
de respaldo.

| Aspecto | Contrato |
|---|---|
| Apertura | `io(url, { auth: { token } })`. Rol: solo `CLIENT` |
| Rechazo en el *handshake* | `connect_error` con `data.code` en: `SHARED_UNAUTHENTICATED` (CA-2), `SHARED_FORBIDDEN` (CA-3), `REALTIME_TOO_MANY_REQUESTS` (`data.status = 429`, `data.retryAfterSeconds`, CA-14) |
| Servidor → cliente (conexión) | `realtime.session-expired` `{ code: 'SHARED_UNAUTHENTICATED' }` justo antes de cerrar (CA-4). Es el único aviso propio (RN-10) |
| Cliente → servidor | `room.join` → ack `{ error: { code: 'SHARED_FORBIDDEN' } }` siempre (CA-7). Ningún otro evento tiene manejador (RN-4) |
| Salas | `user:<userId>` (la une el servidor al conectar) y `doc:<documentId>` (solo `IDocumentRooms.admit`) |
| Latido | `pingInterval` 20 000 ms + `pingTimeout` 15 000 ms: una caída sin cierre se detecta en ≤ 35 s (< 60 s, RN-9) |

Puertos (TypeScript, sin cuerpos):
- `IRealtimePublisher.toUser(userId, notice)` · `toDocument(documentId, notice)`: síncronos, devuelven `void`, atrapan y
  registran cualquier fallo del servidor (RN-7). Entrega a cada conexión de la sala una vez (CA-5, CA-6).
- `IDocumentRooms.admit(actor, connectionId, documentId): Promise<void>` (`ForbiddenError` si la conexión no es del
  actor o ya no existe) · `retire(userId, documentId): Promise<void>` (CA-8).
- Evento `realtime.document-left` `{ userId, connectionId, documentId }` (CA-9); `editing` lo escucha con `@OnEvent`
  y es idempotente (ADR-0019, mejor esfuerzo). 016 define cómo el cliente le da su `connectionId` por HTTP.

## 5. Seguridad y operación
- **Aislamiento**: el servidor decide las salas; el cliente no puede unirse a ninguna (CA-7, CA-10). `admit` comprueba que
  la conexión pertenece al `actor`, de modo que conocer un `connectionId` ajeno no sirve. La decisión de si el actor puede
  ver el documento la toma el dueño con `PermissionResolver`/`accessibleNodes(actor)` **antes** de llamar a `admit`
  (RN-2); `realtime` no consulta permisos.
- **Roles internos**: rechazados en el *handshake* (CA-3), nunca llegan a una sala (Art. IX.1).
- **Token**: viaja en `auth`, no en la URL; nunca se registra. `ConnectionLifetime` cierra al vencer (CA-4). Riesgo
  aceptado P-2: la revocación o suspensión se nota al intentar renovar, no corta el canal.
- **Orígenes**: `CORS_ORIGIN` exacto, sin comodín. La autenticación no usa cookies, así que no hay CSWSH explotable.
- **Límite**: `ConnectionAdmission` consume `ws:connect:<origen>` con una regla de `REALTIME_CONNECT_ATTEMPTS_PER_MINUTE`
  en 60 s **antes** de verificar el token. Cuenta **todo** intento por origen (`IRateLimiter` no distingue fallidos; CA-14 se redactó así), sin ampliar el puerto de `shared`. Si Redis falla, `IRateLimiter` lanza (falla cerrado): el intento se rechaza
  como `SHARED_UNAUTHENTICATED` sin detalle y se registra.
- **Bitácoras** (Pino, `correlationId` por conexión guardado en `socket.data`; CA-13): `realtime.connected` (`userId`,
  `connectionId`), `realtime.rejected` (`reason`: `missing_token`, `invalid_token`, `expired_token`, `forbidden_role`,
  `rate_limited`, `origin`, `limiter_failed`), `realtime.disconnected` (`userId`, `reason` de Socket.IO),
  `realtime.publish_failed` (solo `errorClass`). Nunca token, nombre de archivo ni contenido del aviso (RN-5).
- **Auditoría (RF-07)**: no aplica (spec §5). **Métricas**: 022.

## 6. Estrategia de pruebas (por riesgo)
Integración con Testcontainers (Redis real para `RedisRateLimiter`), `TestAccessTokenVerifier` de `test/support`,
`socket.io-client` real contra una app Nest en un puerto efímero. Para el latido el arnés pasa tiempos cortos
(`RealtimeConfig`); una prueba unitaria fija que los valores por defecto suman ≤ 60 000 ms.

| CA | Nivel | Archivo (`apps/api/…`) |
|---|---|---|
| CA-1 conecta y queda solo en `user:<id>` | int | `test/int/realtime/handshake.int-spec.ts` |
| CA-2 sin token, inválido, vencido → `SHARED_UNAUTHENTICATED`, sin sala | unit (lógica) + int (uno por motivo representativo) | `src/modules/realtime/application/connection-admission.service.spec.ts`, `handshake.int-spec.ts` |
| CA-3 roles internos → `SHARED_FORBIDDEN` | unit + int (un rol) | ídem |
| CA-4 cierre al vencer y reconexión con token nuevo | unit con reloj/temporizadores falsos | `src/modules/realtime/infrastructure/connection-lifetime.spec.ts` |
| CA-4 lado cliente (renueva y reabre) | web (componente) | `apps/web/src/features/realtime/realtime-provider.spec.tsx` |
| CA-5 dos conexiones del mismo usuario reciben una vez | int | `test/int/realtime/publish.int-spec.ts` |
| CA-6 aviso a documento solo a las admitidas | int | `publish.int-spec.ts` |
| CA-7 `room.join` → `SHARED_FORBIDDEN`, no se une | int | `test/int/realtime/rooms.int-spec.ts` |
| CA-8 `retire` corta los avisos | int | `rooms.int-spec.ts` |
| CA-9 salida limpia y por latido avisan al dueño (≤ 60 s) | int (cliente cierra; cliente deja de responder pings) + unit de la constante | `rooms.int-spec.ts`, `src/modules/realtime/realtime-config.spec.ts` |
| CA-10 aislamiento A/B, varias conexiones y intentos de unirse | **iso (bloqueante)** | `test/isolation/realtime.iso-spec.ts` |
| CA-11 reconexión: vuelve a `user:<id>`, fuera de `doc:`, sin reenvío | int | `rooms.int-spec.ts` |
| CA-12 sin servidor, publicar no falla ni espera | unit | `src/modules/realtime/infrastructure/socket-io-hub.spec.ts` |
| CA-13 líneas de bitácora sin token ni contenido | int (captura del logger) | `handshake.int-spec.ts` |
| CA-14 umbral → `REALTIME_TOO_MANY_REQUESTS` sin llamar al verificador | int (Redis real) + unit | `handshake.int-spec.ts`, `connection-admission.service.spec.ts` |
| Contrato `expiresAt` del verificador | int existente ampliado | `test/int/shared/access-token-contract.int-spec.ts` |

- **CA-10 (aislamiento)**: A y B conectados; documentos casi idénticos; A admitida en `doc:D` con `admit`. Se emiten avisos a
  A y a D; B (varias conexiones, y pidiendo `room.join` a `user:A` y `doc:D`) no recibe ninguno. Segunda afirmación:
  `admit(actorB, conexiónDeA, D)` lanza `ForbiddenError`. Se agrega al `test:isolation` bloqueante.
- No se repite un CA en tres capas: la lógica de rechazo va en unit y solo un caso por familia sube a integración.

## 7. Riesgos y coherencia con el diseño
- **Una sola instancia de `api`**: las salas son de memoria, así que un aviso emitido desde otro proceso (p. ej. el
  `worker`) no llega. Hoy no hay productor en el `worker` (`editing-save` se confirma por HTTP en el `api`). Se descarta
  el adaptador de Redis de Socket.IO por YAGNI (un `api`, 25 usuarios, RNF-02) y se registra PD-74 para decidirlo cuando haya
  más de una réplica o un productor en el `worker`. **No exige ADR ahora**; sumarlo sí (dependencia significativa).
- **Conexión de otro usuario con `connectionId` adivinado**: mitigado por la comprobación de pertenencia en `admit` y por
  ids aleatorios no publicados.
- **Detrás de Traefik**: el origen del intento sale de `x-forwarded-for`; si el proxy se cambia, la clave del límite
  cambia (se verifica en staging, PD-74).
- **Tormenta de reconexiones** tras reiniciar el `api`: el cliente usa el retraso exponencial por defecto de
  `socket.io-client`; el límite cuenta todos los intentos por origen (60/min; suficiente para 25 usuarios, ajustable por entorno).
- **Desviaciones de los diagramas**: DF-76 nuevo (puertos, evento y `expiresAt`; el diagrama T3 no los trae). DF-30 y PD-03
  siguen aplicando: sin `PresenceGateway` propio.
- **Pendientes que deja fuera**: PD-74 (adaptador de Redis y verificación del origen tras el proxy). Presencia, límite de
  editores y avisos de guardado: 016.
- **ADR requerido**: **ADR-0030** «Socket.IO en el `api` sin adaptador de Redis» (redactado, `Propuesto`; dependencia
  significativa nueva, no cubierta por ADR-0010). Paquetes fijados a versión exacta: `@nestjs/websockets` y
  `@nestjs/platform-socket.io` 11.2.5 (con `socket.io` 4.x) en `api`; `socket.io-client` 4.x en `web`. Debe aceptarse
  antes de `/tasks`. `@nestjs/event-emitter` ya está (ADR-0019).

## 8. Aprobación
- `architect`: **Aprobado con cambios** (2026-10-15), ya aplicados en plan y spec: (1) CA-14 y RN-8 cuentan todos los
  intentos por origen, sin tocar `IRateLimiter`; (2) CA-2 deja de prometer rechazo de cuenta suspendida con token vigente
  (P-2, 002 D-10); (3) `useRealtime()` sale hasta 016; (4) el emisor de `realtime.document-left` atrapa errores de oyentes.
  Decisiones: dos puertos (ISP) con un solo `SocketIoHub`; `expiresAt` en `AccessTokenVerification` (leer `exp` en
  `realtime` duplicaría el parseo del JWT y rompería el puerto); `realtime.document-left` con `EventEmitter2` directo en
  el adaptador (el puerto aislante de ADR-0019 ya existe en `identity`; son dos usos, el tercero con 016 extrae
  `IDomainEventPublisher`); 429 como `connect_error` con `data.status` aceptable; cliente web mínimo permitido por
  CA-4/CA-11. Condiciones: ADR-0030 aceptado antes de `/tasks`; DF-76 aceptado (T3 y `design-model.md` se actualizan en
  la implementación, PD-46).
- Adrián: **Aprobado** — 2026-10-15 (incluye ADR-0030 y DF-76 aceptados, y los cambios de CA-2, CA-14 y RN-8).
