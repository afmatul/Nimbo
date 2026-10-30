# `sharing` — M3b · Compartición y Control de Acceso (comparticiones y enlaces)

- **Dueño**: Abel (`specs/README.md`).
- **Diagrama de origen**: M3b en `docs/sdd/design-model.md` §3 y `docs/design/diagramas/`.
- **Responsabilidad**: Comparticiones, enlaces públicos, límite de intentos.
- **Puede depender de**: shared, access, storage, audit (`docs/sdd/architecture.md` §3; el lint de fronteras lo hace cumplir).
- **Declara**: `IShareeDirectory` (destinatario por correo y nombres visibles; lo implementa `identity` con
  `ShareeDirectoryAdapter` y lo enlaza la raíz con `ShareeDirectoryBindingModule`, DF-84). `sharing` no importa `identity`.
- **Specs que lo construyen**: 012, 013.

## Qué hay hoy (012)

| Ruta | Caso de uso | Notas |
|---|---|---|
| `POST /api/v1/shares` | `SharingService.share` | `201` alta, `200` cambio o mismo nivel (CA-1, CA-5). Orden: límite (`sharing:share:<propietario>`, `SHARING_RATE_LIMIT_PER_MINUTE`) → `PermissionResolver.can(SHARE)` (404 uniforme) → destinatario (los cuatro motivos de CA-3 en un solo `null`) → solo lectura (`WritableAccountPolicy`, solo si crea o sube a `EDITOR`) → alta o cambio con `share.granted`/`share.level_changed` en la misma transacción |

- Todas las rutas: `@Roles(Role.CLIENT)` y `Cache-Control: no-store` (llevan correos).
- Persistencia: `TypeOrmShareRepository` (`IShareRepository`) sobre `comparticion` con `requireActorScope`; el alta
  exige el nodo en `ownedNodes(actor)` dentro de la consulta.
- Bitácoras: `sharing.granted`, `sharing.level_changed`, `sharing.rate_limited`, solo con ids y nivel.

## Capas (`docs/sdd/architecture.md` §4)

```
modules/sharing/
├─ domain/          # entidades, objetos de valor, errores; sin Nest, TypeORM ni zod
├─ application/     # servicios («service» de los diagramas) y puertos (`ports/`)
├─ infrastructure/  # persistencia (*.orm-entity.ts), adaptadores, procesadores
├─ presentation/    # controladores, DTOs, gateways
├─ sharing.module.ts # lo crea la primera spec del módulo
└─ index.ts         # única API pública
```

## Regla

Otros módulos importan **solo** desde `modules/sharing/index.ts` (fachadas, puertos que este módulo implementa,
eventos y tipos públicos). Nada de `infrastructure/**` cruza la frontera. Nombres de clases y puertos: los de
`docs/sdd/design-model.md`.
