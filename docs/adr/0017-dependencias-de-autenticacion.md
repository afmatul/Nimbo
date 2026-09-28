# ADR-0017 — Dependencias de autenticación: `argon2`, `@nestjs/throttler` y `@nestjs/jwt` con Passport (ADR menor)

| Campo | Valor |
|---|---|
| Estado | Aceptado (2026-09-27, Adrián) |
| Fecha | 2026-09-27 |
| Decisores | Adrián (architect), equipo Nimbo |
| Specs relacionadas | 001 (R-1, RN-3, D-8, D-15, CA-19), 002 (R-1, D-1, D-5, D-11, D-13, D-14), 003 (D-2), 000 (D-9) |

## Contexto

La 001 es la primera spec que guarda contraseñas y limita peticiones, y la 002 emite el token de acceso la semana
siguiente. Hacen falta tres dependencias que ninguna spec anterior decidió:

- **Argon2id** (RNF-04, 001 R-1, RN-3): el diagrama M1 ya fija `IPasswordHasher` → `Argon2idHasher`. Node 22 LTS, el
  de `.nvmrc` (000 D-1), no trae Argon2 en `node:crypto`; hace falta una librería. El riesgo que la 001 anotó (§13) es
  que una librería nativa no cargue en la imagen `node:22-alpine` (musl) o que pnpm 10 no ejecute su script de
  instalación, que por defecto bloquea salvo que figure en `onlyBuiltDependencies`.
- **Límite por IP** (001 D-8, D-15; 002 D-5, D-11; 000 D-9): las tres specs ya dicen que el límite por IP lo pone el
  `ThrottlerModule`, y `conventions.md` (§API REST) pide `@Throttle` en operaciones sensibles. PD-32 anotó que la
  dependencia no tenía ADR.
- **Token de acceso** (002 R-1, D-1, D-13, D-14; 003 D-2): la 002 firma un JWT corto. Su verificación vive detrás del
  puerto token→`Actor` que declara `shared` y que implementa `identity`. Lo usan el guard HTTP global (003) y el
  handshake de Socket.IO (015), así que tiene que haber **un solo** camino de verificación.

Restricciones: 4 personas, 3 días para el Avance 1, un `api` de 768 MB en el servidor de staging de 4 GB, y las
imágenes que construye el CI (Fase 2) sobre `node:22-alpine`.

## Opciones consideradas

### a) Argon2id

1. **`argon2` (node-argon2, 0.45.x)**
   - Pros:
     - trae los binarios **dentro del paquete** (`prebuilds/`), comprobado en el *tarball* 0.45.1:
       `linux-x64` y `linux-arm64` en glibc **y** musl, `win32-x64`, `darwin-arm64` y `linux-arm` (armv7);
     - `node-gyp-build` elige el binario al cargar, así que funciona aunque pnpm no ejecute el script `install` y
       aunque `node_modules` se instale en una etapa glibc y se copie a una imagen musl;
     - produce PHC estándar (`$argon2id$v=19$m=…,t=…,p=…$…`, CA-19), tiene `needsRehash` para subir parámetros sin
       invalidar hashes, corre en el *threadpool* de libuv sin bloquear el hilo principal, y es la librería más usada.
   - Contras: código nativo (N-API); no trae binario para `darwin-x64` (Mac con Intel), que compilaría.
2. **`@node-rs/argon2` (napi-rs)**
   - Pros: rápido, PHC estándar.
   - Contras: el binario llega por `optionalDependencies` por plataforma (`@node-rs/argon2-linux-x64-musl`…). pnpm
     instala solo la de la plataforma donde corre `pnpm install`; si el CI instala en glibc y copia a alpine (musl),
     el binario falta y el proceso falla al arrancar. Obliga a instalar dentro de la imagen final o a forzar
     `supportedArchitectures`.
3. **`hash-wasm`** (WebAssembly)
   - Pros: sin código nativo.
   - Contras: corre en el hilo principal. Con `m = 19 MiB, t = 2` bloquea el *event loop* decenas de milisegundos
     por registro, lo que con 25 registros concurrentes (RNF-02) degrada todas las rutas del `api`.
4. **`scrypt` o `bcrypt`**: descartadas. RNF-04 y la 001 R-1 piden Argon2id; bcrypt además no es resistente a memoria.
5. **Posponer**: no es posible; la 001 guarda contraseñas desde su primera tarea de backend.

### b) Límite por IP

1. **`@nestjs/throttler` en memoria**
   - Pros: es lo que ya decidieron 000 D-9, 001 D-15, 002 D-11 y `conventions.md`; guard por ruta, sin
     infraestructura. Con una sola réplica de `api` (ADR-0001) la memoria basta, y un reinicio que vacía los
     contadores es aceptable.
   - Contras:
     - convive con `IRateLimiter` (Redis, límite por correo): son dos mecanismos de límite;
     - agrega cabeceras `X-RateLimit-*` que la 001 tiene que apagar para no romper la respuesta neutra;
     - aplica **todos** los *throttlers* con nombre a cada ruta que usa el guard, salvo que la ruta los omita
       (`@SkipThrottle`).
2. **Reutilizar `IRateLimiter` con una clave por IP**
   - Pros: un solo mecanismo y ninguna dependencia nueva; en Redis, así que sobrevive a reinicios.
   - Contras: contradice tres decisiones de specs ya aclaradas (000 D-9, 001 D-15, 002 D-11) y `conventions.md`;
     cambiarlo exige tocar tres specs a 3 días de la entrega.
3. **Middleware `RateLimit` de Traefik**
   - Contras: responde `429` sin el cuerpo `{ code, message, correlationId }` ni el mensaje de CA-15, y limita por
     ruta en la configuración del proxy, lejos del código que la prueba.
4. **Posponer**: la 001 lo exige (CA-15).

### c) Token de acceso (se instala con 003 PR-A)

1. **`@nestjs/jwt` solo**
   - Cómo funciona: `identity` implementa el puerto token→`Actor` con `JwtService.verifyAsync` y firma con
     `JwtService.signAsync`. `JwtAuthGuard` (`shared`, 003 D-2) y el handshake de `realtime` llaman al mismo puerto.
   - Pros: un solo camino de verificación para HTTP y Socket.IO, que es justo lo que piden 002 D-14 y ADR-0010.
   - Contras: se aparta de la redacción «Passport JWT» de la propuesta (002 R-1).
2. **`@nestjs/jwt` + `@nestjs/passport` + `passport-jwt`**
   - Pros: sigue al pie de la letra la pila de la propuesta.
   - Contras:
     - `passport-jwt` verifica la firma por su cuenta (`secretOrKey`), así que el HTTP verificaría con Passport y
       el socket con el puerto: dos caminos que deben coincidir en algoritmo, emisor y vencimiento;
     - si la estrategia solo delegara al puerto, Passport no aportaría nada;
     - suma tres paquetes y ninguna estrategia más está en alcance (OAuth está fuera, `product-context.md` §9).
3. **`jose`**
   - Pros: sin Nest y con buen soporte de estándares.
   - Contras: `@nestjs/jwt` ya cubre HS256 con la clave del entorno (002 D-13) y se integra con la inyección de
     dependencias de Nest.
4. **Posponer a 002**: la 002 empieza la semana siguiente; decidirlo ahora cierra PD-32 y evita que el plan de 002
   lo reabra.

## Decisión

- **a)** `argon2` (opción a.1), versión exacta fijada.
  - `Argon2idHasher` en `identity/infrastructure` con `m = 19456 KiB, t = 2, p = 1`, el mínimo de OWASP que fija
    RN-3, como constantes con nombre.
  - Se miden en staging al montarlo (RNF-02: p95 del registro con 25 peticiones concurrentes) y se suben solo con
    la medición a la vista.
  - `argon2` **no** se agrega a `onlyBuiltDependencies`: el binario precompilado basta. La tarea del adaptador
    comprueba que carga en `node:22-alpine` sin compilar.
- **b)** `@nestjs/throttler` en memoria (opción b.1), registrado en `AppModule` y aplicado **por ruta**, nunca global.
  - Cada ruta limitada declara su *throttler* con nombre y omite los demás.
  - El guard lanza el `TooManyRequestsError` de `shared`, así la respuesta es la de CA-15, y no escribe cabeceras
    `X-RateLimit-*`.
  - Pasar a un almacenamiento en Redis requiere un ADR, y solo si `api` llega a tener más de una réplica.
- **c)** `@nestjs/jwt` + `@nestjs/passport` + `passport-jwt` (opción c.2), por decisión de Adrián al aceptar
  (2026-09-27: se conserva la pila de la propuesta y el patrón de estrategias de Nest). Se instala con el primer PR
  que la usa (003 PR-A).
  - **Condición: un solo camino de verificación.** Las opciones de verificación (`algorithms`, `issuer`,
    `audience`, vencimiento y clave) viven en **una sola constante** de `identity`, que usan tanto la `JwtStrategy`
    de Passport como la implementación del puerto token→`Actor`.
  - `JwtAuthGuard` de `shared` (003 D-2) extiende `AuthGuard(ACCESS_TOKEN_STRATEGY)` de `@nestjs/passport`;
    `shared` solo conoce el nombre de la estrategia y el puerto, y no importa `identity`. La `JwtStrategy` de
    `identity` (`ignoreExpiration: true`) no arma el `Actor` por su cuenta: delega en el puerto token→`Actor`, que es
    el único que decide validez y vencimiento. `realtime` (015) usa el mismo puerto.
  - Una prueba de contrato comprueba que un mismo token da el mismo resultado (válido, vencido, firma inválida) por
    HTTP y por el puerto.

## Consecuencias

- Positivas:
  - Argon2id no depende de compilar en la imagen ni del orden de instalación de pnpm.
  - El límite por IP sale con la 001 sin infraestructura nueva y con la misma forma de error que el límite por correo.
  - Un solo juego de opciones de verificación del token para HTTP y Socket.IO (002 D-14, ADR-0010), con la pila
    «Passport JWT» de la propuesta.
- Negativas / deuda aceptada:
  - Un paquete nativo en `api`. Si una versión futura deja de publicar el binario musl, el build falla en el CI, no
    en producción.
  - Dos mecanismos de límite de tasa: throttler por IP en memoria y `IRateLimiter` por correo en Redis.
  - La 002 debe usar `@SkipThrottle` con el *throttler* de registro, y la 001 con el de inicio de sesión, para que
    ningún límite cuente peticiones ajenas.
  - Tres paquetes más en `api` (`@nestjs/passport`, `passport`, `passport-jwt`) y dos piezas que deben usar la
    misma constante de verificación; la prueba de contrato de c) lo vigila.
- Cómo sabremos si fue un error:
  - si `argon2` no carga en `node:22-alpine` sin compilar → `@node-rs/argon2` con la instalación dentro de la imagen
    final;
  - si el p95 del registro supera 1 s con 25 concurrentes en staging → revisar el tamaño del *threadpool*
    (`UV_THREADPOOL_SIZE`) antes que los parámetros;
  - si `api` pasa a dos réplicas → almacenamiento del throttler en Redis o `IRateLimiter` por IP;
  - si la prueba de contrato de c) encuentra diferencias entre HTTP y el puerto → verificar solo en el puerto y
    dejar la estrategia como adaptador delgado.

Nota de aplicación (2026-09-27): aclaración de c) tras las revisiones de los planes 002 y 003; no cambia la decisión.
