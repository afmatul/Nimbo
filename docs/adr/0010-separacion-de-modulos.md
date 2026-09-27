# ADR-0010 — Separar M3 en `access` y `sharing` y extraer `audit`, `realtime` y `notifications` como transversales

| Campo | Valor |
|---|---|
| Estado | Aceptado (2026-09-26, Adrián) |
| Fecha | 2026-09-26 |
| Decisores | Adrián (architect), equipo Nimbo |
| Specs relacionadas | 000 (PR-3 «CI»: lista de módulos de `boundaries.js`), 001 (`notifications`), 003 (`access`), 004 (`audit`), 012–013 (`sharing`), 015 (`realtime`) |

## Contexto

La constitución exige un grafo de módulos sin ciclos, verificado por lint (Art. VIII.4), y ADR-0001 fija como señal
de error la aparición de `forwardRef`. Los diagramas de clases, tal como se entregaron, tienen cuatro acoplamientos
que lo impiden (`design-findings.md`):

- **DF-02 (Alta)**: «`FileService` necesita `PermissionResolver` (M3) y `PublicLinkService.resolve()` devuelve
  `StorageNode` (M2). Además `inheritedGrants` necesita la jerarquía de carpetas. En NestJS esto obliga a `forwardRef`.»
- **DF-03 (Alta)**: «`SharingService` usa `IAuditLogger` y la única implementación es `AuditService` en M8, que a su vez
  depende de repos de M1, M2 y M4 → ciclo con cualquier módulo que audite.»
- **DF-30 (Media)**: «Solo existe `PresenceGateway` en M5, pero también necesitan Socket.IO el progreso de carga (RF-08),
  el streaming del agente (RF-32) y las notificaciones.»
- **DF-34 (Baja)**: «Dos puertos de notificación (`IMailer`, `INotifier`) sin módulo dueño; la tabla `notificacion`
  tampoco tiene dueño.»

El problema de fondo es que M3 mezcla una **lectura** que necesitan casi todos («¿qué puede ver este actor?», RNF-05,
resuelta dentro de la consulta) con una **escritura** que solo le importa a la compartición; y que tres servicios de
infraestructura compartida (auditoría, tiempo real, correo) quedaron dentro de módulos de negocio. El PR-3 de la
spec 000 fija la lista de módulos y el DAG en `packages/config/eslint/boundaries.js` (ADR-0008): necesita esta
decisión antes de su merge. Restricciones: 4 personas, 10 semanas y diagramas que deben coincidir con el código al
cierre de cada fase (Art. VIII.6).

## Opciones consideradas

1. **Separar M3 por lectura/escritura y extraer tres transversales sin dependencias de negocio** (esta propuesta)
   - Pros: rompe los cuatro ciclos solo con la dirección de las dependencias, sin eventos ni `forwardRef`; cada
     módulo coincide con una spec y un dueño (003, 004, 012–013, 015, 001); el lint lo verifica en cada PR.
   - Contras: 12 módulos más `shared` en lugar de 8; `access` lee tablas ajenas por SQL; los diagramas se redibujan.
2. **Mantener M3 único y romper el ciclo con eventos de dominio**
   - Contras: el ciclo storage↔M3 es de **lectura síncrona**: `FileService` debe saber si el actor puede ver un nodo
     *antes* de responder, y `accessibleNodes(actor)` es un fragmento SQL dentro de la consulta. Un evento es
     asíncrono y no devuelve respuesta. Además, todo consumidor del CTE seguiría dependiendo de un módulo con
     enlaces, contraseñas y límite de intentos que no usa. Requeriría también un bus de eventos que hoy no existe.
3. **Mover la auditoría (y el tiempo real y el correo) a `shared`**
   - Pros: ningún módulo nuevo.
   - Contras: `shared` es infraestructura sin reglas de negocio ni tablas (DF-49); `audit` tiene tabla
     (`evento_auditoria`), una regla de visibilidad (`AuditEntry.isVisibleTo`, RF-07), su controlador (DF-15), su spec
     (004) y su migración. `shared/domain` lo importa hasta la capa de dominio, y el `worker` cargaría Socket.IO y
     SMTP sin necesitarlos. Se diluye la frontera en lugar de dibujarla.
4. **Dejar M8 como está y tolerar el ciclo con `forwardRef`**
   - Contras: `forwardRef` resuelve la inyección en tiempo de ejecución, no el acoplamiento. `import-x/no-cycle`
     fallaría (CA-7) y habría que desactivarlo. Todo módulo que audite dependería de `backoffice`, y por él de
     `identity`, `billing` y `storage`, así que cualquier prueba o el `worker` cargaría medio sistema.
5. **Posponer hasta 004/015**
   - Contras: 001 envía el correo de verificación en la semana 1 y necesita un dueño para `IMailer`. El PR-3 fijaría
     una lista de módulos que se cambiaría después, junto con los módulos ya escritos contra ella.

## Decisión

Opción 1. Se reemplaza M3 por dos módulos y se agregan tres transversales (`design-model.md` §2: M3a, M3b, T2–T4):

| Módulo | Responsabilidad | Puede depender de | Expone en `index.ts` |
|---|---|---|---|
| `access` (M3a) | Solo lectura: `PermissionResolver` (`levelFor`, `can`, `inheritedGrants`), `IAccessPolicy` (Owner/Editor/Viewer, Strategy), `accessibleNodes(actor)` (DF-32) | `shared` | `PermissionResolver`, `accessibleNodes`, `AccessLevel`, `Action` |
| `sharing` (M3b) | Escritura: `SharingService`, `PublicLinkService`, `IRateLimiter`; tablas `comparticion`, `enlace_publico`, `intento_acceso` | `shared`, `access`, `storage`, `audit` | Solo su módulo Nest (nadie lo consume) |
| `audit` (T2) | `AuditService`, `AuditEntry`; tabla `evento_auditoria` | `shared` | `IAuditLogger` y consulta para M8 |
| `realtime` (T3) | Único servidor Socket.IO: handshake autenticado, salas por usuario y por documento | `shared` | Puerto de publicación (nombre en el plan 015) |
| `notifications` (T4) | `IMailer`, `INotifier` (segregados por consumidor), tabla `notificacion`, cola `mail` | `shared`, `realtime` | `IMailer`, `INotifier` |

Aristas nuevas o que cambian:
- `storage → access` y `sharing → storage, access` (DF-02). `PublicLinkService.resolve()` vive en `sharing`, que ya
  depende de `storage`, así que devolver un `StorageNode` no crea ciclo.
- `access` **no importa código** de `storage` ni de `sharing`: lee `archivo`, `carpeta` y `comparticion` por SQL de
  solo lectura, sin sus entidades ORM. Es la única excepción a «cada módulo es dueño de sus tablas»
  (`architecture.md` §3, regla 3), y se justifica porque la autorización debe resolverse dentro de la consulta.
- Los módulos de negocio dependen de los transversales; nunca al revés:
  `identity → notifications (IMailer), audit`; `billing → notifications (INotifier), audit`;
  `storage → audit, realtime`; `editing → audit, realtime`; `intelligence → realtime`; `backoffice → audit`.
  Entre transversales solo existe `notifications → realtime`.
- **Los transversales declaran sus propios puertos.** Si los declarara el consumidor, como sugiere la columna
  «dueño → implementador» de `architecture.md` §5 para `IMailer` e `INotifier`, el transversal tendría que importarlo.
- `realtime` **no depende de `identity`**. Valida el token del handshake con la misma abstracción token→`Actor` que el
  guard HTTP global (la define 002 sin que `realtime` importe `identity`). Las salas de documento las autoriza el
  módulo dueño: `editing` consulta `access` y después une el socket. `realtime` no conoce permisos.
- `audit` guarda identificadores (`actorId`, `targetUserId`, `resourceId`), no nombres. Así no necesita repos de M1,
  M2 ni M4, y cumple la prohibición de nombres de archivo en bitácoras. M8 consume `audit`, no lo contiene.
- Ninguna arista de este ADR necesita eventos. El mecanismo de eventos de `architecture.md` §3, regla 2, se decide con
  su propio ADR cuando una spec lo requiera.

## Consecuencias

- Positivas: el DAG se sostiene sin `forwardRef`. `accessibleNodes` tiene un solo dueño de solo lectura que reutilizan
  listados, búsqueda, edición y el agente (DRY, DF-32). La auditoría, el socket y el correo se prueban y arrancan
  aislados, y el `worker` no arrastra `backoffice`. Cada módulo tiene spec y dueño.
- Negativas / deuda aceptada:
  - 12 módulos más `shared` frente a los 8 del diagrama: más `index.ts`, más filas en `boundaries.js` y más contexto
    que explicar en la exposición.
  - `access` se acopla al **esquema** de `storage` y `sharing` sin que el lint lo vea. Se mitiga con pruebas de
    integración de `accessibleNodes` (Testcontainers) y con la suite `test/isolation`, bloqueante.
  - El código se aparta de los diagramas entregados. Al aceptar este ADR: DF-02, 03, 30 y 34 pasan a `Aceptado`, y a
    `Resuelto` cuando se redibujen los diagramas. Hay que redibujar: Clases M3 (dos paquetes, M3a y M3b); Clases M8
    (sin `AuditService`/`AuditEntry`); Clases M5 (presencia vía `realtime`); Clases M1/M4 (`IMailer`/`INotifier`
    implementados por `notifications`); bloques T2–T4; y Arquitectura (DF-28 c).
  - El `architect` corrige en el mismo PR `architecture.md` §3 (la fila `realtime` sin `identity`) y §5 (dueño de
    `IMailer`/`INotifier`).
- Cómo sabremos si fue un error: si `access` necesita escribir, o si una migración de `storage` rompe `access` más de
  una vez por fase; si un transversal necesita importar un módulo de negocio; o si aparece `forwardRef`.

## Verificación

`packages/config/eslint/boundaries.js` (T-28 de la spec 000; hoy `eslint/nest.js` aún no lo incluye) codifica esta
tabla en `allowed`: `access: [shared]`, `audit: [shared]`, `realtime: [shared]`, `notifications: [shared, realtime]`,
`sharing: [shared, access, storage, audit]`, y las aristas de los consumidores. Reglas que reflejan la decisión:
1. `boundaries` (elementos `module`/`entry`): se importa de otro módulo solo por su `index.ts` y solo si está en
   `allowed`. El fixture de CA-5 ya usa el mensaje de este ADR: «`sharing` solo puede importar de `storage` desde
   `modules/storage/index.ts`».
2. `import-x/no-cycle` (`maxDepth: 6`) sobre `apps/api/src/**` y `apps/worker/src/**` (CA-7).
3. Fixtures negativos propuestos en `boundaries.spec.ts`: `realtime-imports-identity.ts` y
   `access-imports-storage.ts` (ambos fallan).

Dependen de este ADR: el merge del PR-3 «CI» de la spec 000 (D-1, D-2, T-27), el plan de la spec 001 (`notifications`
envía el correo de verificación) y la spec 003 (`access`: `PermissionResolver`, `accessibleNodes`, RLS).
