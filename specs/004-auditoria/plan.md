# Plan 004 — Auditoría

> Spec: `./spec.md` · Estado del plan: **Aprobado** (Adrián, 2026-10-05, con un cambio: la escritura síncrona entra ya al puerto)
> Dice qué archivos se tocan y qué se espera de cada uno. Reutiliza lo que 005 dejó en `audit` (puerto, catálogo, módulo) y el
> patrón de 006/007 (repositorio sobre `TransactionContext`, cursor opaco, `@Roles`, contratos zod).

## 1. Resumen técnico
- **Escritura**: `AuditService` (nombre del diagrama T2) sustituye a `LogAuditLogger` detrás de `I_AUDIT_LOGGER`. El puerto tiene dos
  operaciones (D-5): `record` conserva el contrato de 005 (mejor esfuerzo, posterior al commit, nunca lanza; firma sin cambios) y la nueva
  `recordInTransaction` (síncrona: lanza y se une a la transacción del llamador). Ambas delegan en `append` (inserción estricta que lanza);
  `record` solo agrega el `try/catch` y el log (§2, «Contrato de escritura»).
- **Datos**: tabla `evento_auditoria` (DF-12), solo adición reforzada con `REVOKE UPDATE, DELETE, TRUNCATE` al rol `nimbo_app`
  y RLS por afectado (D-7). Sin FK al recurso: el nombre no se resuelve y el recurso puede haberse purgado (D-3).
- **Lectura**: `AuditController` con una sola ruta, `GET /audit/my-events`, para cualquier usuario autenticado y siempre sobre
  su propia cuenta como afectado. Filtros `from`/`to`/`origin` dentro del `WHERE`, cursor `[ocurrido_en, id]`, 20 por página (D-8, D-10).
  Un mapeador de lista blanca arma el DTO: sin nombres, URLs, correo ni id del actor (CA-14, D-2).
- **Web**: página `/actividad` («Mi actividad») con filtros, «Cargar más» y los cuatro estados, y su entrada en el menú de la cuenta.
- **Sin dependencias nuevas** ni puertos entre módulos: `audit` solo depende de `shared` (ADR-0010).

## 2. Módulos, archivos y diseño
| Módulo / capa | Archivo (nuevo o cambiado) | Responsabilidad |
|---|---|---|
| audit/application | `audit-action.ts` (cambia) | Se queda con el enum de 005. `isAuditAction` sigue igual |
| audit/application | `audit-catalog.ts` (nuevo) | `AUDIT_CATALOG: Record<AuditAction, { resourceType, attributes }>`: por acción, `resourceType` (`file`, `folder`, `upload`, `fromAttribute('nodeType')` o `null`) y las claves de atributo **permitidas** con su tipo (`sizeBytes` y `itemCount` números, `nodeType` `file\|folder`, `mode` y `reason` de 005 como texto corto). Declarado con `satisfies` para que una acción nueva sin entrada no compile (RN-3). Lista cerrada: lo que no está, no se guarda |
| audit/domain | `audit-entry.ts` (nuevo) | `AuditEntry` (nombre del diagrama): VO inmutable con id, acción, `actorId` (nullable por D-8), `actorRole`, `targetUserId`, `resourceType`, `resourceId`, `attributes`, `occurredAt`, `correlationId`. Sin Nest ni TypeORM. **No** lleva `isVisibleTo`: la visibilidad es la consulta con RLS (Art. IX.2, DF-64) |
| audit/domain | `attribute-sanitizer.ts` (nuevo) | `sanitizeAttributes(action, raw)` → `{ attributes, rejections }`. Descarta claves fuera de la lista del catálogo (cubre nombre, URL, token, contraseña y clave de enlace sin enumerarlos), valores no planos (objeto, arreglo, `null`) y textos de más de `AUDIT_NOTE_MAX_LENGTH` (500). `rejections` lleva códigos (`attribute_not_allowed`, `attribute_not_flat`, `attribute_too_long`) y la **clave**, nunca el valor (CA-4) |
| audit/application | `audit.service.ts` (nuevo) | `record(entry)`: acción desconocida → `audit.record_failed` y fin (CA-3); sanea (CA-4, anota los rechazos); `append`; cualquier excepción se captura y se anota `audit.record_failed` con `errorName` (CA-5). `recordInTransaction(entry)`: acción desconocida lanza `UnknownAuditActionError` (sin rastro no hay acción interna); los atributos prohibidos se descartan y se anotan igual que en `record`; delega en `append` y deja pasar su error. `append(entry)`: arma el `AuditEntry` (id, reloj, `correlationId`) y lo inserta con `withActor(entry.actor)` (se une a la transacción del mismo actor); lanza si falla; privado. `listForUser(actor, query)`: página del propio actor. Funciones ≤ 30 líneas: el saneo y el armado viven en helpers privados |
| audit/application/ports | `i-audit.repository.port.ts` (nuevo) | `IAuditRepository`: `insert(entry)` y `listForTarget(actor, query)` → `{ entries, nextCursor }`. Regla (b) del Art. V: repositorio, mantiene el dominio libre de TypeORM. Interno a `audit` |
| audit/application | `i-audit-logger.port.ts` (cambia) | Agrega `recordInTransaction(entry: AuditRecord): Promise<void>` («síncrona: lanza si no puede guardar y se une a la transacción del llamador; si esa transacción se revierte, el evento también», D-5). `record` no cambia de firma ni de contrato; 005 y 006 no se tocan (CA-2). Mismo puerto y módulo: no hay abstracción nueva (Art. V.2) |
| audit/infrastructure/persistence | `typeorm-audit.repository.ts` (nuevo) | SQL parametrizado sobre `TransactionContext` (como `typeorm-trash.repository.ts`). `insert` sin `RETURNING` (un interno no puede leer el evento que escribe sobre un cliente: `RETURNING` fallaría con la política de lectura). `listForTarget`: `WHERE usuario_afectado_id = :actorId` + rango + origen + teclado `(ocurrido_en, id) < (:fecha, :id)`, `ORDER BY ocurrido_en DESC, id DESC LIMIT 21` |
| audit/infrastructure/persistence | `audit-cursor.ts` (nuevo) | Codifica y decodifica `[ISO, id]` en base64url; cursor inválido → `InvalidAuditQueryError` (`INVALID_CURSOR`). El instante se guarda con milisegundos (viene de `IClock`), así el ida y vuelta es exacto |
| audit/domain | `audit-query.ts` (nuevo) | VO `AuditQuery` (`from?`, `to?`, `origin?`, `cursor?`) y `InvalidAuditQueryError`. Valida `from < to` |
| audit/presentation | `audit.controller.ts` (nuevo) | `GET /audit/my-events`; `@Roles` con los cuatro roles (CA-12); valida con `ZodValidationPipe` (`listAuditEventsQuerySchema`); delega en `AuditService.listForUser(actor, query)` |
| audit/presentation | `audit-event-response.ts` (nuevo) | Mapeador **de lista blanca** `AuditEntry → AuditEventResponse`: `origin` = `self` si `actorId === targetUserId`, si no `staff`; `itemCount` y `sizeBytes` desde los atributos; el resto no sale. El `actorId` no se copia (CA-14) |
| audit | `audit.module.ts` (cambia) | `I_AUDIT_LOGGER` pasa a `useExisting: AuditService`; provee `AuditService` y `I_AUDIT_REPOSITORY`. Lo importan `storage` y `storage-worker` como hasta hoy |
| audit | `audit-http.module.ts` (nuevo) | Declara `AuditController` e importa `AuditModule`. Se registra en `app.module.ts` (solo `api`): el worker no carga controladores |
| audit | `infrastructure/log-audit-logger.ts` y su spec (se eliminan) | Código muerto desde este cambio (Art. VII.6); `audit.module.spec.ts` e `index.spec.ts` se ajustan |
| audit | `index.ts` (cambia), `README.md` (cambia) | Se agrega `AuditModule`/`AuditHttpModule` a la API pública sin exportar `AuditService` ni el repositorio (DF-60); el README documenta capas y el contrato |
| api | `app.module.ts` (cambia) | Importa `AuditHttpModule` |
| api/migrations | `20261005100000-crear-evento-auditoria.ts` (nuevo) | Ver §3 |
| packages/contracts | `src/audit/` (nuevo: `schemas.ts`, `error-codes.ts`, `parameters.ts`, `index.ts`) y `src/index.ts` (cambia) | `auditEventResponseSchema` (`strict`), `listAuditEventsQuerySchema`, `listAuditEventsResponseSchema`, `AUDIT_PAGE_SIZE = 20`, `AUDIT_NOTE_MAX_LENGTH = 500`, `AUDIT_ORIGINS = ['self','staff']`, `AUDIT_ERROR_CODES` (`AUDIT_INVALID_QUERY`, motivos `INVALID_DATE`, `INVALID_RANGE`, `INVALID_ORIGIN`, `INVALID_CURSOR`) |
| web | `app/(app)/(cliente)/actividad/page.tsx` (nuevo) | Ruta `/actividad`; monta la vista. Vive en `(cliente)` (el área interna sin página de actividad hasta 011, §7) |
| web/features/audit | `audit-api.ts`, `routes.ts` (`ACTIVITY_PATH`), `components/activity-view.tsx` (página y estados), `activity-filters.tsx` (`ActivityFilters`: origen y fechas), `activity-event-row.tsx` (`ActivityEventRow`: una fila, con distintivo «Acción interna» y bloque de motivo), `hooks/use-activity.ts`, `activity-labels.ts`; `LoadMoreFooter` (cargar más, cargando, error con «Reintentar» y fin de lista) vive en `features/audit/components/` y solo sube a `components/nimbo/` si `storage` lo adopta (regla de tres, Art. VI.2) | `audit-api.ts` usa `StorageHttp`-equivalente (la capa `auth-fetch`) y valida con `parseResponse` (ver nota). `use-activity` guarda filtros, acumula páginas («Cargar más» conserva lo visible, patrón de `use-folder-contents`) y expone `loading\|empty\|error\|filteredEmpty\|data`. `activity-labels.ts`: textos en español por acción y origen (abajo) |
| web | entrada «Mi actividad» en el menú de la cuenta | Ver nota de dependencia con 002 |

- **Contrato de escritura mixto (D-5, decisión de Adrián: la vía síncrona entra ya)**. `IAuditLogger` ofrece `record` (mejor esfuerzo,
  después del commit, sin lanzar; 005/006) y `recordInTransaction` (síncrona, para 011). `append` usa `TransactionContext` y por tanto se
  une a la transacción vigente del **mismo actor** (`withActor` dentro de `withActor`, `shared/README.md`): si esa transacción se
  revierte, el evento no queda; si `append` falla, lanza y el llamador revierte su acción. Fuera de una transacción del llamador abre la
  suya (sin garantía conjunta): quien exige «sin acción sin rastro» debe llamarla dentro de su `withActor`. 004 no tiene consumidor
  síncrono real; el consumidor de la prueba de integración es un caso de uso de prueba. La garantía se prueba en `unit` e `int` (§6).
- **Actor del insert**: `record` corre después del commit del consumidor, así que abre su propia transacción con
  `withActor(entry.actor)`; la política de inserción exige `actor_id = nimbo_actor_id()`. Si alguien llamara `record` dentro de una
  transacción de otro actor, `withActor` lanza (`actor-scope.errors`) y se anota `audit.record_failed`: no se pierde la operación.
- **Catálogo**: 004 solo trae las siete acciones de 005/006 (D-1). Cada spec agrega su acción y su entrada en `AUDIT_CATALOG` (011, 012…).
  El motivo de Soporte (D-6) será el atributo `note` que declare 011; el DTO ya lo expone como `note` **opcional** (confirmado por Adrián,
  RN-6): `string` cuando el evento lo tiene, ausente si no.
- **Textos** (`activity-labels.ts`, español, tuteo, sin nombres): `file.upload_completed` «Subiste 1 archivo (12 MB)»; `file.upload_rejected`
  «Se rechazó una carga»; `file.download_url_issued` «Descargaste 1 archivo»; `node.trashed` «Enviaste N elementos a la papelera»;
  `node.restored` «Restauraste N elementos»; `node.purged` «Eliminaste definitivamente N elementos (X MB)»; `trash.emptied` «Vaciaste la papelera
  (N elementos)». Con origen `staff` el sujeto cambia por el rol: «Soporte de Nimbo» (`SUPPORT`), «Administración de Nimbo» (`ADMIN`),
  «Operación de Nimbo» (`OPERATOR`). Etiqueta de origen: «Tú» / «Personal de Nimbo». Acción desconocida (catálogo más nuevo que la web) →
  «Actividad en tu cuenta», sin romper. Los tamaños usan `formatBytes` de contratos. Fechas en el formato de 002 (mes con «sept»).
- Puertos nuevos: `IAuditRepository` (dentro de `audit`, regla b). **Entre módulos: ninguno.** Dependencias nuevas entre módulos: ninguna.
- **Gancho de anonimización (D-8)**: hoy **no existe** flujo de eliminar cuenta (`REVOKE DELETE` sobre `usuario`, PD-39; 003/002 no lo
  implementan). No se inventa. La política queda en el esquema: `actor_id` es `ON DELETE SET NULL` (conserva `rol_actor`) y
  `usuario_afectado_id` es `ON DELETE CASCADE`; las acciones referenciales las ejecuta el dueño de la tabla, así que el `REVOKE` no
  las estorba. Quien implemente la eliminación de cuentas lo prueba (PD-66, §7).
- **Nota web, menú de la cuenta**: en `main` **no existe** el menú de la cuenta ni la página Seguridad; solo `SignOutButton` y el correo en
  `app-layout.tsx`. El menú es 002 T-103 (rama `feat/002-web-pr5`). La ruta y la vista de `/actividad` no dependen de él; el enlace sí.
  PR-B se rebasa sobre 002 y agrega «Mi actividad» a ese menú (un ítem con `ACTIVITY_PATH`); si 002 aún no está, PR-B no agrega el enlace y se
  anota en `pendientes.md` (PD-68). **Mockup**: `docs/design/mockups/audit/mi-actividad/` (README y 11 estados: default, cargando, vacio,
  vacio-filtros, error, filtrado, rango-invalido, cargando-mas, cargar-mas-error, fin-de-lista, menu-cuenta-abierto) y capturas a 360 y 1440 px en
  `docs/design/capturas/audit/mi-actividad/`. El menú de la cuenta pone «Mi actividad» entre «Seguridad» y «Plan y facturación».
- **Decisiones de UI** (README del mockup, preguntas 1 a 3, resueltas por Adrián): «Personal de Nimbo» agrupa Soporte y Administración, **sin subfiltro**
  (el filtro `origin` es `self\|staff`); en vacío con filtros hay un solo «Limpiar filtros»; sin rango por defecto (todo el historial). El rango
  inválido (`to <= from`) se muestra con `role="alert"` y **no consulta** (la API también lo rechaza con `INVALID_RANGE`).

## 3. Datos
```sql
CREATE TABLE evento_auditoria (
  id                   uuid        PRIMARY KEY,
  accion               text        NOT NULL,   -- catálogo en la app: cada spec agrega acciones sin migrar
  actor_id             uuid        REFERENCES usuario(id) ON DELETE SET NULL,
  rol_actor            text        NOT NULL CHECK (rol_actor IN ('CLIENT','ADMIN','SUPPORT','OPERATOR')),
  usuario_afectado_id  uuid        NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  tipo_recurso         text        CHECK (tipo_recurso IN ('file','folder','upload')),
  recurso_id           uuid,       -- sin FK: el recurso puede purgarse (D-3)
  atributos            jsonb       NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(atributos) = 'object'),
  ocurrido_en          timestamptz NOT NULL,
  correlation_id       text,
  CONSTRAINT ck_evento_recurso CHECK ((tipo_recurso IS NULL) = (recurso_id IS NULL))
);
CREATE INDEX idx_evento_afectado_fecha ON evento_auditoria (usuario_afectado_id, ocurrido_en DESC, id DESC);
ALTER TABLE evento_auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE evento_auditoria FORCE ROW LEVEL SECURITY;
CREATE POLICY evento_auditoria_lectura ON evento_auditoria FOR SELECT TO nimbo_app
  USING (usuario_afectado_id = nimbo_actor_id());
CREATE POLICY evento_auditoria_alta ON evento_auditoria FOR INSERT TO nimbo_app
  WITH CHECK (actor_id = nimbo_actor_id() AND rol_actor = nimbo_actor_role()
              AND (usuario_afectado_id = nimbo_actor_id() OR nimbo_actor_role() <> 'CLIENT'));
REVOKE UPDATE, DELETE, TRUNCATE ON evento_auditoria FROM nimbo_app;
```
- **Índice**: uno solo, el que sirve a la consulta (afectado + fecha descendente + id = el teclado del cursor). El filtro por origen
  (`actor_id = usuario_afectado_id` o distinto) y por rango se evalúa sobre las filas de un solo cliente: no justifica índices (YAGNI). No se
  indexa `actor_id`: nadie borra cuentas aún (PD-66 decide si hace falta).
- **Append-only: `REVOKE`, no trigger.** Es el mecanismo del proyecto (PD-39 ya revoca `DELETE` de `usuario`), una línea que se prueba conectando como
  `nimbo_app`, y `TRUNCATE` queda cubierto. Un trigger necesitaría uno por fila y otro por sentencia, y además bloquearía el `SET NULL` de la
  anonimización (D-8) salvo que se le agreguen excepciones. Falta el dueño de la tabla (rol de migraciones): queda fuera del modelo de amenaza de la
  aplicación, que nunca usa esas credenciales (ADR-0005). Además no hay política `UPDATE`/`DELETE`: RLS niega por segunda vez.
- **RLS**: lectura solo del propio afectado, para todos los roles (CA-12); inserción solo a nombre propio y, para un `CLIENT`, solo sobre su cuenta
  (un cliente no puede fabricar eventos de otro). Los roles internos no tienen política de lectura sobre cuentas ajenas.
- Orden y cursor por `ocurrido_en` (milisegundos) con desempate por `id` (`uuid`, aleatorio): estable, sin duplicados ni omisiones.
- `down`: `DROP POLICY` de las dos políticas y `DROP TABLE evento_auditoria` (el índice y los permisos caen con ella).
- Volumen: una fila por operación sensible; sin retención automática (D-8). Se vigila en PD-66.

## 4. Contratos
Prefijo `/api/v1`.

| Método | Ruta | Rol | Request → Respuesta | Errores (`code`) |
|---|---|---|---|---|
| GET | `/audit/my-events?from&to&origin&cursor` | `CLIENT`, `ADMIN`, `SUPPORT`, `OPERATOR` (solo su propia cuenta) | `from` (inclusivo) y `to` (exclusivo) en ISO 8601; `origin` ∈ `self\|staff`; `cursor` opaco → `200 { items: AuditEventResponse[], nextCursor: string \| null }` de 20 en 20 (fijo, no hay `limit`) | `401 SHARED_UNAUTHENTICATED` · `400 AUDIT_INVALID_QUERY` (`fields`: `from`/`to` `INVALID_DATE`, `to` `INVALID_RANGE`, `origin` `INVALID_ORIGIN`, `cursor` `INVALID_CURSOR`) |

`AuditEventResponse` = `{ id, occurredAt, action, origin: 'self'\|'staff', actorRole, resourceType: 'file'\|'folder'\|'upload'\|null, itemCount: number\|null, sizeBytes: number\|null, note?: string }`,
esquema `strict`. **Fija el contrato para el trabajo en paralelo**: PR-A y PR-B parten del mismo commit de `packages/contracts`.
- El filtro de fechas es instantáneo, no por día: la web convierte el día local del usuario a `from`/`to` UTC (evita el desfase de zona horaria
  en el servidor, que no conoce la del navegador).
- `limit` no existe: 20 por página es regla de la spec (D-8) y vive como constante de contratos (`AUDIT_PAGE_SIZE`).
- No hay `GET /audit/events/:id` ni ninguna ruta por usuario (D-10): lo que CA-8 pide «por su id» se cumple porque la ruta no existe (404 del
  enrutador, igual que para cualquier id) y porque la política RLS impide leerlo aunque se intentara por SQL (se prueba en aislamiento).
- Sin eventos de Socket.IO ni colas.

## 5. Seguridad y operación
- `actor` es el primer parámetro de `listForUser`; la consulta filtra `usuario_afectado_id = actor.id` **dentro del SQL** (no hay filtro posterior,
  Art. IX.2) y RLS es la segunda barrera. La spec no toca `accessibleNodes`: no hay nodos en este módulo; la regla de visibilidad es «afectado = yo».
- Un rol interno tiene acceso a la ruta pero obtiene solo sus propios eventos (CA-12). Nadie puede pedir los de otro: ni parámetro ni ruta.
- Un evento donde el actor es interno y el afectado un cliente aparece siempre: la consulta no tiene ningún filtro por rol del actor salvo el que elige
  el propio cliente (CA-13).
- Qué no sale: el mapeador es de lista blanca; el esquema de respuesta es `strict`. Qué no se guarda: lista blanca por acción en el saneo (CA-4).
  Los textos libres (`note`) los captura y valida 011 (D-6), con tope de 500 en el saneo como segunda barrera.
- Bitácora técnica (Pino, `redactDeep` en las rutas existentes): `audit.record_failed` `{ action, reason, keys?, errorName?, correlationId }` (sin valores).
  Consultar la actividad no se audita (spec §5). Métrica: un contador de `audit.record_failed` queda como pendiente de 022, no se crea aquí.
- Operación: si la base cae, `record` falla en silencio para los consumidores actuales y deja rastro técnico (CA-5); los eventos de 005/006 de ese
  periodo se pierden (D-5, riesgo aceptado). `GET` responde 500 con el error estándar.

## 6. Estrategia de pruebas (por riesgo)
| CA | Nivel | Archivo |
|---|---|---|
| CA-3, CA-4 (acción desconocida; clave prohibida, valor no plano, texto largo; el log no repite el valor) | unit | `domain/attribute-sanitizer.spec.ts`, `application/audit.service.spec.ts` |
| CA-1, CA-3, CA-5 (arma el evento con reloj y `correlationId`; `record` no lanza; `recordInTransaction` lanza ante acción desconocida o fallo del repositorio, descarta atributos prohibidos y registra con el mismo actor) | unit | `application/audit.service.spec.ts` |
| Catálogo completo (toda acción del enum tiene entrada; el tipo de recurso derivado) | unit | `application/audit-catalog.spec.ts` |
| CA-9 (cursor: ida y vuelta, rechazo de basura) · rango y origen | unit | `infrastructure/persistence/audit-cursor.spec.ts`, `domain/audit-query.spec.ts` |
| CA-14 (el mapeador no copia `actorId` ni claves ajenas: caso con atributos sembrados con `fileName`) | unit | `presentation/audit-event-response.spec.ts` |
| Contrato de ruta y códigos; esquema `strict` | unit | `presentation/audit-routes.contract.spec.ts`, `contracts/src/audit/schemas.spec.ts` |
| CA-1, CA-2, CA-7, CA-9 a CA-11, CA-13 (eventos guardados con columnas correctas; los de 005/006 aparecen sin cambios; orden; 45 eventos → 3 páginas sin duplicados ni omisiones; filtros por fecha y origen; lista vacía; evento interno visible) | int | `test/int/audit/my-events.int-spec.ts` |
| CA-5 (**rollback**: un caso de uso de prueba llama `recordInTransaction` dentro de su `withActor`; si la inserción falla —acción desconocida o base rota— lanza y la operación del llamador se revierte; si la transacción exterior falla, el evento no queda; `record` con la base caída no lanza y no revierte) · CA-6 (como `nimbo_app`: `UPDATE`, `DELETE` y `TRUNCATE` dan `permission denied`; no existe ruta mutante) | int | `test/int/audit/audit-write.int-spec.ts`, `audit-immutability.int-spec.ts` |
| CA-12 (sin sesión 401; los tres roles internos reciben solo lo suyo) | int | `test/int/audit/my-events.int-spec.ts` |
| Migración reversible (`up`, `down`, `up`) | int | `test/int/audit/migration.int-spec.ts` |
| **CA-8, CA-12, CA-13, CA-14 (bloqueante)**: A contra eventos de B por lista y por SQL directo como `nimbo_app` (RLS devuelve 0 filas; `GET /audit/events/<id de B>` es 404); un interno no lee la actividad de un cliente; un cliente no inserta un evento sobre otra cuenta; ningún campo del cuerpo contiene el nombre de archivo sembrado, URL, correo ni id del actor | iso | `test/isolation/audit.iso-spec.ts` (+ `withAuditEvents` en `setup/isolation-world.ts`, que escribe con `AuditService.record` como los demás constructores) |
| CA-15 (cuatro estados, filtros, «Cargar más» conserva lo visible, un filtro sin resultados distinto del vacío, textos por acción y origen, acción desconocida) | web | `activity-view.spec.tsx`, `activity-list.spec.tsx`, `use-activity.spec.ts`, `activity-labels.spec.ts`, `audit-api.spec.ts` |
| CA-15 (360 y 1440 px, axe, teclado) | web | `a11y.spec.tsx` (se amplía) |
| E2E | — | No aplica en 004: Playwright sigue siendo marcador (PD-41) y el recorrido se cubre en la tarea humana. El flujo completo de «una acción interna visible» se prueba en 011 |

No se repite un mismo CA en tres capas: la regla de saneo se prueba en unitarias, la persistencia y la paginación una vez en integración, y el
aislamiento solo en `test/isolation`.

## 7. Riesgos y coherencia con el diseño
- **R-1 Mejor esfuerzo pierde eventos** si la base cae justo después del commit del consumidor (D-5): aceptado por la spec para 005/006; 011 usa
  `recordInTransaction`. Se anota `audit.record_failed`.
- **R-2 `record` dentro de una transacción ajena**: lanzaría por actor distinto y el evento se perdería. Los consumidores actuales lo llaman tras el
  commit; `CA-2` (int) lo comprueba con 005 y 006 reales.
- **R-3 Fuga por columna nueva**: el mapeador de lista blanca y el esquema `strict` hacen que agregar un atributo no lo exponga sin cambiar el
  contrato. La prueba de aislamiento siembra una fila con `fileName` en `atributos` (como dueño) para probarlo.
- **R-4 `timestamptz` con microsegundos** (si algún día otro escritor los pone) rompería el cursor: hoy todo viene de `IClock` (ms); el repositorio
  lo documenta y el `int` de 45 eventos con el mismo milisegundo cubre el desempate.
- **R-5 Zona horaria** de los filtros: resuelto en la web (días locales → instantes UTC).
- **R-6 `audit` en el worker**: el controlador va en `AuditHttpModule` para que `storage-worker.module.ts` solo cargue servicio y repositorio.
- **R-7 Anonimización sin gancho**: ver §2; es un hueco consciente, no una promesa de 004.
- **Decidido por Adrián (2026-10-05)**: `recordInTransaction` entra ya al puerto; `note` opcional en el DTO; rutas `/audit/my-events` y `/actividad`.
  **Sigue a la vista**: `REVOKE` frente a trigger (se eligió `REVOKE`); el rótulo «Operación de Nimbo» (rol `OPERATOR`) no está en la spec; filtro por
  instantes `from`/`to` en la API; `actor_id` con `ON DELETE SET NULL`.
- **Desviaciones de los diagramas — DF nuevo/actualizados**: **DF-12 → Aceptado** (columnas de §3, más `tipo_recurso`, `atributos`, `ocurrido_en`,
  `correlation_id`; el `architect` actualiza el E-R con las dos relaciones y `rol_actor`, D-9). **DF-15 parcial** (se agrega `AuditController`). **DF-03**
  ya está aceptado: el binding pasa a `AuditService`. **DF-64 (nuevo, a registrar)**: `AuditEntry` sin `isVisibleTo`; `AuditService.record/recordInTransaction/append/listForUser` y `IAuditLogger.recordInTransaction`;
  `IAuditRepository` interno; `AuditHttpModule`; ruta `GET /audit/my-events`; `AuditEntry.actorId` nullable (anonimización); `LogAuditLogger` retirado.
- **Documentación por actualizar**: `design-model.md` T2 y §245 (mapeo `AuditEntry` ↔ `evento_auditoria`), `architecture.md` §3 (fila `audit`) y §5
  (fila `IAuditLogger`: ya no «provisional»), `audit/README.md`, `features/audit/README.md`, `specs/README.md` (fila 004), `ui-guidelines.md` §7 (fila del mockup).
- **Pendientes que deja fuera (filas nuevas en `pendientes.md`)**: **PD-66** flujo de eliminar cuenta: ejecutar y probar la anonimización de
  `actor_id`, la política de privacidad (confirmar con 001) y evaluar `idx_evento_actor`; **PD-67** contador/alerta de `audit.record_failed` en 022; **PD-68** enlace a «Mi
  actividad» si 002 T-103 aún no está al integrar PR-B. Lo interno (011) agrega su vista y sus acciones.
- **ADR requeridos**: ninguno (sin tecnología nueva ni cambio de arquitectura). Se cita ADR-0010 y ADR-0005.
- **Alcance respetado**: nada de exportación, alertas, búsqueda de texto, cadenas de hash ni consulta de otras cuentas (spec §7).

### División en PRs (`workflow.md` §6) — dos ramas desde `spec/004-auditoria`
- **PR-A** `feat/004-auditoria-api` (`contracts` + `api` + migración + pruebas `unit`, `int`, `iso`). Primer commit: `packages/contracts/src/audit/` para fijar el DTO.
- **PR-B** `feat/004-auditoria-web` (`web`), en paralelo desde ese primer commit; maqueta según `docs/design/mockups/audit/mi-actividad/`. Se prueba contra `audit-api` con
  respuestas del contrato y se verifica contra la API real al integrar. Orden de merge: PR-A, luego PR-B (rebasado sobre 002 por el menú).

## 8. Aprobación
- `architect`: **no aprueba** (sin puerto entre módulos, tecnología nueva ni cambio de arquitectura). Se le pide **solo** lo que la spec D-9 ya le asigna: actualizar el E-R
  con DF-12 y registrar DF-64.
- Adrián: Aprobado — Adrián, 2026-10-05 (con un cambio: la escritura síncrona `recordInTransaction` entra ya al puerto `IAuditLogger`; `note` opcional; rutas confirmadas).
