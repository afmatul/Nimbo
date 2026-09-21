# Backlog de specs

> Fuente de verdad del estado del trabajo. La actualizan `/spec`, `/tasks`, `/verify`, `/review` y `/status`.
> Dueños: Adrián (1), Juan Marcos (2), Abel (3), Fátima (4). Nadie revisa sus propios PRs.

## Dueños de módulos (propuesta, alineada con los diagramas de clases)

| Integrante      | Rol Crystal Clear               | Módulos                                                                                                          |
| --------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Adrián (1)      | Diseñador principal (Tech Lead) | fundaciones, `shared`, `access` (M3a), `audit`, `backoffice` (M8), CI/CD, infraestructura, guardián de diagramas |
| Juan Marcos (2) | Diseñador-programador           | `identity` (M1), `billing` (M4), `notifications`                                                                 |
| Abel (3)        | Diseñador-programador           | `storage` (M2), `sharing` (M3b), `optimizer` (M7)                                                                |
| Fátima (4)      | Diseñador-programador           | sistema de diseño (000b), `realtime`, `editing` (M5), `intelligence` (M6)                                        |

Cada dueño construye backend **y** frontend de su módulo. Nadie revisa sus propios PRs.

## Estados

`Borrador` → `Aclarada` → `Planificada` → `En implementación` → `En verificación` → `En revisión` → `Hecha`

## Paso previo: decidir los hallazgos del diseño

Antes de planificar las specs de Fase 1, el equipo decide en una reunión los hallazgos que las bloquean
(`docs/sdd/design-findings.md`, columna «Resolver antes de»). El `architect` redacta los ADR 0010–0013.

## Backlog

| #    | Spec                                                                                                                       | Módulo (diagrama)   | Requisitos                | DF que dependen            | Fase | Dueño | Depende de    | Estado    |
| ---- | -------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------- | -------------------------- | ---- | ----- | ------------- | --------- |
| 000  | [fundaciones](000-fundaciones/spec.md): monorepo, compose, CI, ambientes, `shared`, logger, `correlationId`, health, lint de fronteras, imágenes ghcr.io, staging en DigitalOcean | transversal         | RNF-10, 12, 15–17, 19 (18 parcial) | 02, 03, 06, 23, 24, 30, 34 | 1    | Adrián | —             | En implementación (2026-09-16): PR-1 «esqueleto» T-01…T-10 en `feat/000-fundaciones-esqueleto` |
| 000b | [sistema-de-diseno](000b-sistema-de-diseno/spec.md): tokens Cielo Sereno en `globals.css`, tema shadcn, fuentes, layout, `components/nimbo` base, axe en E2E | transversal (web)   | RNF-13, RNF-14            | 41–48                      | 1    | Fátima | 000           | En revisión (2026-09-20) |
| 001  | registro-y-verificacion                                                                                                    | M1                  | RF-01, RNF-04             | 13, 33, 35                 | 1    | Juan Marcos | 000           | Pendiente |
| 002  | autenticacion-sesiones-y-dispositivos                                                                                      | M1                  | RF-02, 03, 04, RNF-07     | 11, 15                     | 1    | Juan Marcos | 001           | Pendiente |
| 003  | roles-y-acceso (`RolesGuard`, `Actor`, `PermissionResolver`, `accessibleNodes`, RLS)                                       | M8 + M3a            | RF-05, RNF-05             | 01, 02, 32                 | 1    | Adrián | 002           | Pendiente |
| 004  | auditoria                                                                                                                  | transversal (M8)    | RF-07                     | 03, 12, 15                 | 1    | Adrián | 003           | Pendiente |
| 005  | carga-y-descarga                                                                                                           | M2                  | RF-08, 09, 14, RNF-06, 07 | 06, 16, 33                 | 1    | Abel | 003, 006a     | Pendiente |
| 006  | carpetas-y-papelera                                                                                                        | M2                  | RF-10, 11                 | 15, 40                     | 1    | Abel | 005           | Pendiente |
| 006a | catalogo-y-limites (tabla `plan`, `PlanLimits`, `IPlanLimitsProvider`)                                                     | M4                  | RF-19 (parcial)           | 23, 24, 27                 | 1    | Juan Marcos | 000           | Pendiente |
| 007  | cuota-y-explorador                                                                                                         | M2                  | RF-12, RNF-14             | 26, 38                     | 1    | Abel | 005, 006a     | Pendiente |
| 008  | catalogo-y-comparador                                                                                                      | M4                  | RF-19                     | 15                         | 2    | Juan Marcos | 006a          | Pendiente |
| 009  | contratacion-pagos-y-facturas                                                                                              | M4                  | RF-20, 21                 | 23                         | 2    | Juan Marcos | 008           | Pendiente |
| 010  | renovacion-vencimiento-y-cambio-de-plan                                                                                    | M4                  | RF-22, 23, 24             | 25                         | 2    | Juan Marcos | 009           | Pendiente |
| 011  | administracion-y-soporte                                                                                                   | M8                  | RF-06                     | 04, 26, 36                 | 2    | Adrián | 003, 004, 008 | Pendiente |
| 012  | comparticion-y-accesos                                                                                                     | M3b                 | RF-16, 18                 | 31                         | 2    | Abel | 003, 006      | Pendiente |
| 013  | enlaces-publicos                                                                                                           | M3b                 | RF-17, RNF-08             | 09, 10                     | 2    | Abel | 012           | Pendiente |
| 014  | versiones-y-restauracion                                                                                                   | M2 (+ M5 autoría)   | RF-13, 29                 | 17, 18                     | 2    | Abel | 005           | Pendiente |
| 015  | tiempo-real                                                                                                                | transversal         | RF-08, 26                 | 30                         | 2    | Fátima | 002           | Pendiente |
| 016  | edicion-colaborativa-docx                                                                                                  | M5                  | RF-25, 26, 28, RNF-02, 09 | 05, 19, 20, 39             | 2    | Fátima | 014, 015      | Pendiente |
| 017  | previsualizacion                                                                                                           | M2                  | RF-27                     | 15                         | 2    | Abel | 005           | Pendiente |
| 018  | busqueda                                                                                                                   | M2 (+ M6 contenido) | RF-15                     | 15, 32                     | 2    | Fátima | 005           | Pendiente |
| 019  | indexacion                                                                                                                 | M6                  | RF-30, 31, RNF-03         | 07, 14, 37                 | 3    | Fátima | 005, 014      | Pendiente |
| 020  | agente-con-citas                                                                                                           | M6                  | RF-32, 33, 34, RNF-03     | 08, 14, 15, 25             | 3    | Fátima | 019, 010      | Pendiente |
| 021  | optimizador                                                                                                                | M7                  | RF-35, 36                 | 21, 22                     | 3    | Abel | 014           | Pendiente |
| 022  | operacion-metricas-y-alertas                                                                                               | M8                  | RF-37, RNF-18, 20, 21     | 22, 28, 29                 | 3    | Adrián | 000           | Pendiente |
| 023  | pruebas-de-carga-y-aislamiento-global                                                                                      | transversal         | RNF-01, 02, 05, 09        | —                          | 3    | Adrián | 020           | Pendiente |
| 024  | pulido-accesibilidad-manuales-y-diagramas-finales                                                                          | todos               | RNF-13, 14                | todos los abiertos         | 4    | Todos | —             | Pendiente |

«Pendiente» = aún sin spec creada. Al crearla con `/spec`, el estado pasa a `Borrador`.

## Hitos del curso

| Entrega         | Fecha                   | Specs que deben estar `Hecha`                            |
| --------------- | ----------------------- | -------------------------------------------------------- |
| Avance 1 (30 %) | 25/09/2026              | 000, 000b, 001–007, 006a                                 |
| Avance 2 (50 %) | 09/10/2026              | 008–018                                                  |
| Avance 3 (80 %) | 23/10/2026              | 019–023                                                  |
| Final           | 1.ª semana de noviembre | 024 + diagramas y capturas actualizados + ensayo de demo |

Mockups: el inventario de pantallas y su estado está en `docs/sdd/ui-guidelines.md` §7. Toda spec con UI necesita su mockup antes de pasar a `Aclarada`.
