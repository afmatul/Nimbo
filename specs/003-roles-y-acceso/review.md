# Revisión 003 — PR-A «autorización en shared»

| Campo | Valor |
|---|---|
| Fecha | 2026-09-27 |
| Rango revisado | spec/003-roles-y-acceso..HEAD (T-01 a T-19, Bloque 1 de tasks.md) |
| Veredicto | Cambios requeridos (bloqueante unico: evidencia de integracion/aislamiento pendiente antes de abrir el PR) |

## Resumen

El PR entrega los guards globales de negacion por defecto (JwtAuthGuard + RolesGuard), el Actor inmutable, los
decoradores (Public, Roles, CurrentActor, CurrentSessionId), el puerto IAccessTokenVerifier y el arnes de pruebas
(ProbeModule, TestJwtStrategy, TestAccessTokenVerifier).

## Bloqueantes

- **[B-1]** specs/003-roles-y-acceso/tasks.md linea 578 (Notas del developer, T-11...T-19) - Ninguna prueba de
  integracion (auth-guards.int-spec.ts, auth-guards.no-strategy.int-spec.ts, access-token-contract.int-spec.ts,
  auth-logs.int-spec.ts, health.int-spec.ts, test-app.int-spec.ts, y las de 000 con guards activos) corrio contra una
  app Nest real con Test.createTestingModule/Postgres: solo un arnes temporal fuera del repositorio. Esto valida
  justo el comportamiento mas delicado del PR: que sin estrategia registrada la ruta responde 401 y no 500 (T-08,
  dependiente de como @nestjs/passport propaga "Unknown authentication strategy"), que el guard real de Passport
  entrega info/err con la forma que handleRequest espera, y que quietReqLogger en verdad suprime req en las lineas de
  denegacion con nestjs-pino real. Nada de esto se puede verificar con confianza solo por lectura del codigo porque
  depende del comportamiento real de passport/nestjs-pino, no solo del codigo propio. Viola: Art. I (verificacion de
  la spec) y el criterio de no abrir PR sin las pruebas correspondientes en verde. Correccion: antes de abrir el PR,
  ejecutar pnpm test:int (y las suites de este bloque de pnpm test:isolation que no dependan de PR-B) con Docker
  disponible y adjuntar la evidencia en la descripcion del PR, tal como ya lo exige T-19.

## Importantes (no bloquean, deben atenderse antes de cerrar la fase)

- **[I-1]** apps/api/src/shared/infrastructure/logging/logger.options.ts (serializers.req) - la linea http.request
  sigue serializando req.headers completos (salvo authorization/cookie), asi que x-forwarded-user u otra cabecera con
  un correo o dato personal queda en claro en esa linea; auth-logs.int-spec.ts solo revisa las lineas de denial, no
  http.request. El propio developer ya lo senala como "Hallazgo para security-auditor" en tasks.md linea 577 y lo deja
  fuera de alcance de 003. Es razonable no resolverlo aqui (viene de 000), pero conviene abrir explicitamente un DF o
  una tarea de seguimiento (lista blanca de cabeceras en redact-deep/REDACTED_HEADER_PATHS) antes de que otra spec de
  por sentado que las bitacoras de acceso estan libres de PII. Viola en espiritu: spec 003 parrafo 10 "Nunca en
  bitacoras: tokens, contenido, nombres de archivo y correos" y RNF-17. Sugerencia: registrar el hallazgo en
  design-findings.md o pendientes.md con dueno y spec de destino, no solo en "Notas del developer".
- **[I-2]** apps/api/src/shared/presentation/auth/jwt-auth.guard.ts (bloque catch de canActivate) - cualquier error
  que no sea UnauthenticatedError, incluido un error de programacion genuino en la estrategia, termina en 401
  invalid_token igual que un token invalido. Es deliberado ("nunca 500", plan 11.2) y esta probado, asi que no
  bloquea, pero mezcla en la bitacora un fallo de configuracion con un intento de acceso invalido bajo el mismo
  reason. Sugerencia: incluir err.message (sin datos sensibles) en el log solo cuando err no es null/undefined, para
  poder diferenciar en observabilidad sin cambiar el codigo HTTP.
- **[I-3]** apps/api/test/support/probe.controller.ts - el comentario indica que /__probe/resources/:id "llega con
  T-46"; correcto y fuera de alcance de PR-A, pero es el vector que CA-4/D-11 ya prueban aqui (nada del cuerpo o la
  consulta cambia el Actor). Dejar como recordatorio para quien implemente PR-D: no introducir autorizacion basada en
  parametros de esa ruta.

## Sugerencias

- **[S-1]** apps/api/src/shared/presentation/auth/route-pattern.ts - el plan lo describe como "archivo no listado";
  conviene actualizar el plan o dejar nota en pendientes.md para que el siguiente PR no lo lea como una divergencia.
- **[S-2]** apps/api/test/int/shared/auth-logs.int-spec.ts - ya que la suite es minuciosa con la ausencia de PII en
  las lineas de denegacion, podria agregar una asercion (aunque sea marcada todo/skip) que documente en el propio test
  el hallazgo I-1 sobre http.request, en vez de dejarlo solo en tasks.md.

## Checklist

| Aspecto | Estado |
|---|---|
| Cumple spec y criterios | OK para CA-1, CA-2, CA-4, CA-5, CA-6, CA-16 en su forma; pendiente de ejecucion real (B-1) |
| SOLID | OK: JwtAuthGuard autentica, RolesGuard compara roles, RequestPrincipal es el unico estado compartido |
| YAGNI | OK: se quito la opcion guards:false de createTestApp segun el cambio 7 del plan |
| DRY | OK: un solo createActor, un solo routePatternOf, roles y codigos en contracts |
| Codigo limpio | OK: funciones pequenas, nombres claros, sin console.log, sin codigo muerto |
| Fronteras de modulos y capas | OK: shared no importa identity; AuthGuardsModule estatico sin forRoot |
| Seguridad y aislamiento | OK en diseno; falta ejecucion contra Postgres/Passport real (B-1) |
| Bitacoras sin datos sensibles | OK en las lineas de denegacion (CA-16); pendiente en http.request general (I-1) |
| Migraciones reversibles | No aplica en este PR |
| Pruebas suficientes y significativas | OK a la lectura; no ejecutadas las de integracion/aislamiento (B-1) |
| UI: tokens, sin hex, componentes reutilizados | No aplica en este PR |
| Documentacion actualizada | OK: shared/README.md y tasks.md reflejan el estado real, con desviaciones declaradas |

## Sobre las desviaciones declaradas (Notas del developer)

Las ocho desviaciones que declara el developer son aceptables:

1. Precedencia de "Cambios aplicados" sobre el texto original de la seccion 11.2 del plan: correcto, es justo el
   proposito de esa seccion del plan.
2. fullName en vez de { id, name, role } para la sesion web: coherente con 002 y la seccion 6.9; no afecta a PR-A.
3. Marcador /archivos lo crea quien integre primero: razonable, sin impacto en autorizacion.
4. not-found.tsx raiz sin SessionProvider: fuera del alcance de PR-A.
5. Verificacion manual de la migracion de permisos dentro de una transaccion revertida: tecnica correcta para
   CREATE/ALTER ROLE transaccional; no aplica a este bloque.
6. Archivos de prueba no nombrados por el plan (route-pattern.ts, roles-contract.spec.ts, etc.): consistentes con las
   tareas y el proposito de la spec.
7. ALL_ROLES tipado como tupla no vacia en vez de readonly Role[]: necesario para que Roles(...ALL_ROLES) compile con
   la firma readonly [Role, ...Role[]]; verificado con actor.spec.ts contra Object.values(Role).
8. Docker no disponible, sin ejecutar test:int/test:isolation: es la unica desviacion que bloquea el cierre del PR
   (ver B-1); el resto son detalles de implementacion bien resueltos.

## Lo que esta bien hecho

- El manejo de Authorization duplicada via rawHeaders (Node deduplica headers) es un detalle de seguridad fino que
  muchos equipos pasarian por alto; esta bien razonado y probado con casos concretos (Bearer vacio, dos cabeceras,
  espacios de mas, esquema en minusculas).
- RequestPrincipal como WeakMap privado del modulo, sin tocar req.user, cierra de raiz el vector de suplantacion de
  D-11/R-3: las pruebas lo verifican explicitamente escribiendo req.user con otro actor antes y despues del guard.
- La unica puerta de traduccion de errores de Passport (handleRequest) evita duplicar logica de mapeo de motivos y
  garantiza que nunca se filtre un 500 por un caso no contemplado, incluida la estrategia desconocida.
- El uso de quietReqLogger para separar las lineas de auditoria (auth.unauthenticated/auth.forbidden) de la linea
  http.request es exactamente la clase de decision operativa que CA-16 exige, y quedo documentada con transparencia.
- Transparencia del developer: declarar sin rodeos que Docker no estaba disponible y que suites quedaron sin correr,
  en vez de marcarlas como hechas, es justo el comportamiento que permite confiar en el resto del diff.
