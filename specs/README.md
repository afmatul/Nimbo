# Backlog de specs

> Fuente de verdad del estado del trabajo. La actualizan `/spec`, `/tasks`, `/verify`, `/review` y `/status`.
> Dueños: Adrián (1), Juan Marcos (2), Abel (3), Fátima (4). Adrián revisa y aprueba todos los planes y PRs; los suyos
> siguen la autoaprobación de `docs/sdd/workflow.md` §7.1.

## Dueños de módulos (reasignados el 30/09/2026 para la Fase 2)

En la Fase 1 solo trabajaron Adrián y Fátima; desde la Fase 2 entran Juan Marcos y Abel. La regla es **un módulo, un
dueño, de punta a punta** (backend y frontend): nadie edita un módulo ajeno; si lo necesita, lo pide a su dueño o por
un puerto.

| Integrante      | Rol Crystal Clear               | Módulos                                                                                                                                      |
| --------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Adrián (1)      | Diseñador principal (Tech Lead) | fundaciones, `shared`, `identity` (M1), `notifications`, `storage` (M2), `access` (M3a), `audit`, `editing` (M5), `intelligence` (M6), CI/CD, infraestructura, guardián de diagramas; revisor de planes y PRs |
| Juan Marcos (2) | Diseñador-programador           | `billing` (M4) y búsqueda (018)                                                                                                              |
| Abel (3)        | Diseñador-programador           | previsualización (017), `optimizer` (M7), observabilidad (022)                                                                               |
| Fátima (4)      | Diseñador-programador           | sistema de diseño (000b), `realtime`, `sharing` (M3b), `backoffice` (M8)                                                                     |

Excepciones: 006a (`billing`) la construyó Fátima y la integra Adrián. 017 y 018 viven en `storage`, pero en carpetas
propias (`storage/preview`, `storage/search`) de Abel y Juan Marcos; los cambios al resto de `storage` los hace Adrián.

## Estados (SDD express)

`Borrador` → `Lista` → `En curso` → `En revisión` → `Hecha`

Mapeo desde el flujo anterior: `Aclarada`/`Planificada` → `Lista`; `En implementación`/`En verificación` → `En curso`.
Detalle de cada estado y sus compuertas en `docs/sdd/workflow.md` §2. Desde la Fase 2, `Lista` exige `plan.md` aprobado por Adrián.
Guía de una página para arrancar una spec: `docs/sdd/guia-rapida.md`.

## Paso previo: decidir los hallazgos del diseño

Antes de planificar las specs de Fase 1, el equipo decide en una reunión los hallazgos que las bloquean
(`docs/sdd/design-findings.md`, columna «Resolver antes de»). ADR-0010 ya está `Aceptado` (26/09/2026); el `architect` redacta los ADR 0011–0013. Lo que quedó fuera de las specs (diagramas por redibujar, documentos por corregir, decisiones abiertas) se controla en `docs/sdd/pendientes.md`, con su columna «Resolver antes de».

## Backlog

| #    | Spec                                                                                                                       | Módulo (diagrama)   | Requisitos                | DF que dependen            | Fase | Dueño | Depende de    | Estado    |
| ---- | -------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------- | -------------------------- | ---- | ----- | ------------- | --------- |
| 000  | [fundaciones](000-fundaciones/spec.md): monorepo, compose, CI, ambientes, `shared`, logger, `correlationId`, health, lint de fronteras, imágenes ghcr.io, staging en DigitalOcean | transversal         | RNF-10, 12, 15–17, 19 (18 parcial) | 02, 03, 06, 23, 24, 30, 34 | 1    | Adrián | —             | En curso (2026-10-07): bloques 1–2 integrados (#1, #4); el lint de fronteras entre módulos ya existe (`boundaries.js`). Faltan los bloques 3–6: ciclos y `typeorm-columns` en el lint, CI (`ci.yml`), imágenes en ghcr.io y staging en DigitalOcean (T-27…T-44) |
| 000b | [sistema-de-diseno](000b-sistema-de-diseno/spec.md): tokens Cielo Sereno en `globals.css`, tema shadcn, fuentes, layout, `components/nimbo` base, axe en E2E | transversal (web)   | RNF-13, RNF-14            | 41–48                      | 1    | Fátima | 000           | Hecha (2026-10-03): aprobada por Adrián; PR #2 y #5 fusionados |
| 001  | [registro-y-verificacion](001-registro-y-verificacion/spec.md)                                                             | M1                  | RF-01, RNF-04             | 13, 33, 35                 | 1    | Adrián | 000, 006a     | Hecha (2026-10-03): aprobada por Adrián. Registro, verificación por enlace y reenvío completos en `api`, `worker` y `web`, con todas las suites en verde; [revisión](001-registro-y-verificacion/review.md) |
| 002  | [autenticacion-sesiones-y-dispositivos](002-autenticacion-sesiones-y-dispositivos/spec.md)                                 | M1                  | RF-02, 03, 04, RNF-07     | 11, 15                     | 1    | Adrián | 001           | Hecha (2026-10-07): integrada en `main` (cbdd788); [revisión](002-autenticacion-sesiones-y-dispositivos/review.md) ✅ y recorrido de Adrián |
| 003  | [roles-y-acceso](003-roles-y-acceso/spec.md) (`RolesGuard`, `Actor`, `PermissionResolver`, `accessibleNodes`, RLS)         | T1 `shared` + M3a   | RF-05, RNF-05             | 01, 02, 32                 | 1    | Adrián | 002           | Hecha (2026-10-07): PR-A…PR-F integrados en `main`; [revisión PR-F](003-roles-y-acceso/review-pr-f.md) ✅ y recorrido T-55 de Adrián |
| 004  | [auditoria](004-auditoria/spec.md)                                                                                         | T2 `audit`          | RF-07                     | 03, 12, 15                 | 1    | Adrián | 003           | Hecha (2026-10-07): integrada en `main` (76a8a8f); [revisión](004-auditoria/review.md) ✅ (I-1…I-4 resueltos, T-10 hecha) |
| 005  | [carga-y-descarga](005-carga-y-descarga/spec.md)                                                                                                           | M2                  | RF-08, 09, 14, RNF-06, 07 | 06, 16, 33                 | 1    | Adrián | 001, 003, 006a (004 llega después: 005 declara `IAuditLogger`) | En revisión (2026-10-07): PR-A…PR-F integrados en `main` (#36…#41) y recorrido T-55 de Adrián; [revisión](005-carga-y-descarga/review.md) 🔁: B-1 (tamaño en dos auditorías, CA-20) e I-1…I-4 como T-FIX-1…4. [plan](005-carga-y-descarga/plan.md) y [tareas](005-carga-y-descarga/tasks.md) |
| 006  | [carpetas-y-papelera](006-carpetas-y-papelera/spec.md)                                                                     | M2                  | RF-10, 11                 | 15, 40                     | 1    | Adrián | 005           | Hecha (2026-10-07): integrada en `main` (e766e3f) con CA-26 a CA-28; [revisión](006-carpetas-y-papelera/review.md) ✅ (I-7 cerrado en `CLAUDE.md`) y recorridos T-11 y T-17 de Adrián |
| 006a | [catalogo-y-limites](006a-catalogo-y-limites/spec.md) (tabla `plan`, `PlanLimits`, `IPlanLimitsProvider`) | M4 | RF-19 (parcial) | 23, 24, 27 | 1 | Fátima | 000 | Hecha (2026-09-30): integrada en `main` (#8, squash); `PlanLimitsAdapter` enlazado en `PlanLimitsBindingModule`. Revisión ✅ sin bloqueantes; quedan I-1…I-6 de documentación y pruebas. [plan](006a-catalogo-y-limites/plan.md), [tareas](006a-catalogo-y-limites/tasks.md) y [revisión](006a-catalogo-y-limites/review.md) |
| 007  | [cuota-y-explorador](007-cuota-y-explorador/spec.md)                                                                       | M2                  | RF-12, RNF-14             | 26, 38                     | 1    | Adrián | 005, 006a, 006 | Hecha (2026-10-07): integrada en `main` (8f14d38) con CA-18 a CA-21; [revisión](007-cuota-y-explorador/review.md) ✅ |
| 008  | catalogo-y-comparador                                                                                                      | M4                  | RF-19                     | 15                         | 2    | Juan Marcos | 006a          | Lista (2026-10-07): spec, plan y tareas en `feat/008-catalogo-y-comparador`; plan aprobado por Adrián (por escrito fuera del repo, falta registrarlo en `plan.md` §8) |
| 009  | contratacion-pagos-y-facturas (incluye el PD-40: suscripción Personal, conciliación y catálogo público) | M4 | RF-20, 21 | 23 | 2 | Juan Marcos | 008 | Pendiente |
| 010  | renovacion-vencimiento-y-cambio-de-plan                                                    | M4                  | RF-22, 23, 24             | 25                         | 2    | Juan Marcos | 009           | Pendiente |
| 011  | administracion-y-soporte                                                                   | M8                  | RF-06                     | 04, 26, 36                 | 2    | Fátima | 003, 004, 008 | Pendiente |
| 012  | comparticion-y-accesos                                                                     | M3b                 | RF-16, 18                 | 31                         | 2    | Fátima | 003, 006      | Pendiente |
| 013  | enlaces-publicos                                                                           | M3b                 | RF-17, RNF-08             | 09, 10                     | 2    | Fátima | 012           | Pendiente |
| 014  | versiones-y-restauracion                                                                   | M2 (+ M5 autoría)   | RF-13, 29                 | 17, 18                     | 2    | Adrián | 005           | Pendiente |
| 015  | tiempo-real                                                                                | transversal         | RF-08, 26                 | 30                         | 2    | Fátima | 002           | Pendiente |
| 016  | edicion-colaborativa-docx                                                                  | M5                  | RF-25, 26, 28, RNF-02, 09 | 05, 19, 20, 39             | 2    | Adrián | 014, 015      | Pendiente |
| 017  | previsualizacion                                                                           | M2                  | RF-27                     | 15                         | 2    | Abel | 005           | Pendiente |
| 018  | busqueda                                                                                   | M2 (+ M6 contenido) | RF-15                     | 15, 32                     | 2    | Juan Marcos | 005           | Pendiente |
| 019  | indexacion                                                                                 | M6                  | RF-30, 31, RNF-03         | 07, 14, 37                 | 3    | Adrián | 005, 014      | Pendiente |
| 020  | agente-con-citas                                                                           | M6                  | RF-32, 33, 34, RNF-03     | 08, 14, 15, 25             | 3    | Adrián | 019, 010      | Pendiente |
| 021  | optimizador                                                                                | M7                  | RF-35, 36                 | 21, 22                     | 3    | Abel | 014           | Pendiente |
| 022  | operacion-metricas-y-alertas                                                               | M8                  | RF-37, RNF-18, 20, 21     | 22, 28, 29                 | 3    | Abel | 000           | Pendiente |
| 023  | pruebas-de-carga-y-aislamiento-global                                                      | transversal         | RNF-01, 02, 05, 09        | —                          | 3    | Adrián | 020           | Pendiente |
| 024  | pulido-accesibilidad-manuales-y-diagramas-finales                                          | todos               | RNF-13, 14                | todos los abiertos         | 4    | Todos | —             | Pendiente |

«Pendiente» = aún sin spec creada. Al crearla con `/spec`, el estado pasa a `Borrador`.

## Próximos pasos por integrante (actualizado el 07/10/2026)

Fase 1 cerrada salvo las correcciones de 005 (T-FIX-1…4) y los bloques 3–6 de 000 (CI, imágenes, staging), que arrancan ahora.
Avance 2 (50 %) el 14/10/2026: no caben 008–018 completas; el alcance mínimo para la demo se decide en el equipo.
Ningún plan de Juan Marcos, Abel o Fátima pasa a código sin la aprobación de Adrián registrada en su `plan.md` §8.

| Integrante  | Ahora (Fase 2)                                                                                                                       | Después (Fase 2 → Fase 3)          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| Adrián      | `/implement 005` (T-FIX-1…4) → CI de 000 (lint de ciclos, `ci.yml`, protección de `main`) → imágenes y staging → `/spec 014`. Revisa planes y PRs del equipo | 014 → 016 → 019 → 020 → 023        |
| Juan Marcos | Registrar la aprobación en `plan.md` §8 de 008 y `/implement 008` (desbloquea 009 y 011)                                             | 009 → 010 → 018                    |
| Abel        | `/implement 017` desde T-03 (T-01, T-02 y T-05 de habilitación ya hechas por Adrián en `feat/017-previsualizacion`)                  | 022 → 021 (021 depende de 014)     |
| Fátima      | `/plan 011` (spec en `spec/011-administracion-y-soporte`); `/spec 015` y `/plan 015` tiempo real (la necesita 016)                  | 012 → 013 → 011b → 022b            |

Reglas de convivencia: PRs pequeños y rebase frecuente sobre `main`. Los únicos archivos compartidos que se tocan
son:

- `specs/README.md` (tu fila);
- `apps/api/src/app.module.ts` (registrar tu módulo);
- `packages/contracts/src/` (un archivo por módulo);
- `.env.example` y las migraciones (archivos con timestamp);
- `apps/web/src/app/globals.css`, `apps/web/src/app/layout.tsx` y `apps/web/src/components/nimbo/` (tokens, layout
  y componentes base de 000b);
- `docs/sdd/ui-guidelines.md` §7 (tu fila del inventario; `/mockup` la actualiza).

## Hitos del curso

| Entrega         | Fecha                   | Specs que deben estar `Hecha`                                                       |
| --------------- | ----------------------- | ----------------------------------------------------------------------------------- |
| Avance 1 (30 %) | 30/09/2026              | 000 (bloques 1–2), 000b, 001–007, 006a — demostración en local (`workflow.md` §7.2) |
| Avance 2 (50 %) | 14/10/2026 (estimada)   | 008–018                                                                             |
| Avance 3 (80 %) | por reprogramar         | 019–023                                                                             |
| Final           | 1.ª semana de noviembre | 024 + diagramas y capturas actualizados + ensayo de demo                            |

Mockups: el inventario de pantallas y su estado está en `docs/sdd/ui-guidelines.md` §7. Toda spec con UI necesita su mockup antes de pasar a `Lista`.
