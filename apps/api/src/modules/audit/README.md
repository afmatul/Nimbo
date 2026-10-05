# `audit` — T2 · transversal (extraído de M8)

- **Dueño**: Adrián (`specs/README.md`).
- **Diagrama de origen**: T2 en `docs/sdd/design-model.md` §3 y `docs/design/diagramas/`.
- **Responsabilidad**: `AuditService`, `AuditEntry`; implementa `IAuditLogger`.
- **Puede depender de**: shared (`docs/sdd/architecture.md` §3; el lint de fronteras lo hace cumplir).
- **Specs que lo construyen**: 005 (puerto `IAuditLogger` y catálogo `AuditAction`, D-11) y 004 (persistencia en `evento_auditoria`; retira el adaptador provisional `LogAuditLogger`).

## Capas (`docs/sdd/architecture.md` §4)

```
modules/audit/
├─ domain/          # entidades, objetos de valor, errores; sin Nest, TypeORM ni zod
├─ application/     # servicios («service» de los diagramas) y puertos (`ports/`)
├─ infrastructure/  # persistencia (*.orm-entity.ts), adaptadores, procesadores
├─ presentation/    # `AuditController` (`GET /audit/my-events`) y el mapeador de lista blanca a `AuditEventResponse`
├─ audit.module.ts  # `I_AUDIT_LOGGER` → `AuditService` (`useExisting`) e `I_AUDIT_REPOSITORY` (interno); sin controladores
├─ audit-http.module.ts # `AuditController`; solo lo registra `app.module.ts` (el `worker` no carga rutas)
└─ index.ts         # única API pública
```

## Regla

Otros módulos importan **solo** desde `modules/audit/index.ts` (fachadas, puertos que este módulo implementa,
eventos y tipos públicos). Nada de `infrastructure/**` cruza la frontera. Nombres de clases y puertos: los de
`docs/sdd/design-model.md`.

## Contrato de escritura (`IAuditLogger`, spec 004 D-5)

Las dos operaciones reciben el mismo `AuditRecord`, sanean los atributos con la lista blanca de `AUDIT_CATALOG` (lo
descartado se anota como `audit.record_failed` con el motivo y las **claves**, nunca el valor) e insertan dentro de
`withActor(entry.actor)`.

| Operación                   | Garantía                                                                                                                                                             | Si falla                                                                                                                          |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `record` (005, 006)         | Mejor esfuerzo, **después del commit** del consumidor: abre su propia transacción. Tras guardar deja la línea técnica `audit.record` (solo ids y atributos saneados) | Nunca lanza: anota `audit.record_failed` (`unknown_action`, o `write_failed` con `errorName`) y la operación del consumidor sigue |
| `recordInTransaction` (011) | Síncrona: se une al `withActor` vigente del **mismo** actor; si esa transacción se revierte, el evento también. No deja `audit.record`                               | Lanza (`UnknownAuditActionError` o el error de la base) y el llamador revierte su acción                                          |

- `record` dentro de una transacción de **otro** actor lanzaría `ActorScopeConflictError` (se anota y se pierde el
  evento); dentro de la del mismo actor, un fallo de la base dejaría esa transacción abortada. Por eso se llama tras el
  commit.
- Una acción nueva se agrega a `AuditAction` y a `AUDIT_CATALOG` (tipo de recurso y atributos permitidos): sin entrada
  no compila (RN-3).
- `AuditService` y el repositorio no salen de `index.ts` (DF-60).

## Consulta (`GET /audit/my-events`, spec 004 §4)

- Los cuatro roles la llaman y cada uno recibe solo los eventos donde **él** es el afectado: `listForUser(actor, query)`
  filtra `usuario_afectado_id = actor.id` dentro del SQL (RLS es la segunda barrera). No hay ruta por id ni por usuario.
- `origin` es `self` si el actor es el afectado; cualquier otro, incluido el actor anonimizado (`null`), es `staff`.
- `toAuditEventResponse` es de lista blanca: no copia `actorId`, `correlationId`, `resourceId` ni atributos fuera de
  `itemCount`, `sizeBytes` y `note` (que solo sale si existe).
