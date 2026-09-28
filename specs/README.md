# Backlog de specs

> Fuente de verdad del estado del trabajo. La actualizan `/spec`, `/tasks`, `/verify`, `/review` y `/status`.
> Dueños: Adrián (1), Juan Marcos (2), Abel (3), Fátima (4). Nadie revisa sus propios PRs (excepción: los del diseñador principal, `docs/sdd/workflow.md` §7.1).

## Dueños de módulos (propuesta, alineada con los diagramas de clases)

| Integrante      | Rol Crystal Clear               | Módulos                                                                                                          |
| --------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Adrián (1)      | Diseñador principal (Tech Lead) | fundaciones, `shared`, `access` (M3a), `audit`, `backoffice` (M8), CI/CD, infraestructura, guardián de diagramas |
| Juan Marcos (2) | Diseñador-programador           | `identity` (M1), `billing` (M4), `notifications`                                                                 |
| Abel (3)        | Diseñador-programador           | `storage` (M2), `sharing` (M3b), `optimizer` (M7)                                                                |
| Fátima (4)      | Diseñador-programador           | sistema de diseño (000b), `realtime`, `editing` (M5), `intelligence` (M6)                                        |

Cada dueño construye backend **y** frontend de su módulo. Excepciones por spec: 001 y 002 (`identity`) las lleva
Adrián y 006a (`billing`) la lleva Fátima; el resto de esos módulos sigue con su dueño.

## Estados (SDD lite)

`Borrador` → `Lista` → `En curso` → `En revisión` → `Hecha`

Mapeo desde el flujo anterior: `Aclarada`/`Planificada` → `Lista`; `En implementación`/`En verificación` → `En curso`.
Detalle de cada estado y sus compuertas en `docs/sdd/workflow.md` §2.

## Paso previo: decidir los hallazgos del diseño

Antes de planificar las specs de Fase 1, el equipo decide en una reunión los hallazgos que las bloquean
(`docs/sdd/design-findings.md`, columna «Resolver antes de»). ADR-0010 ya está `Aceptado` (26/09/2026); el `architect` redacta los ADR 0011–0013. Lo que quedó fuera de las specs (diagramas por redibujar, documentos por corregir, decisiones abiertas) se controla en `docs/sdd/pendientes.md`, con su columna «Resolver antes de».

## Backlog

| #    | Spec                                                                                                                       | Módulo (diagrama)   | Requisitos                | DF que dependen            | Fase | Dueño | Depende de    | Estado    |
| ---- | -------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------- | -------------------------- | ---- | ----- | ------------- | --------- |
| 000  | [fundaciones](000-fundaciones/spec.md): monorepo, compose, CI, ambientes, `shared`, logger, `correlationId`, health, lint de fronteras, imágenes ghcr.io, staging en DigitalOcean | transversal         | RNF-10, 12, 15–17, 19 (18 parcial) | 02, 03, 06, 23, 24, 30, 34 | 1    | Adrián | —             | En curso (2026-09-22): PR-1 «esqueleto» T-01…T-10 y PR-2 «shared» T-11…T-26 (+ carga del `.env` y correcciones de revisión, #4) fusionados; bloques 3–6 (CI, imágenes, staging) desde el 30/09 |
| 000b | [sistema-de-diseno](000b-sistema-de-diseno/spec.md): tokens Cielo Sereno en `globals.css`, tema shadcn, fuentes, layout, `components/nimbo` base, axe en E2E | transversal (web)   | RNF-13, RNF-14            | 41–48                      | 1    | Fátima | 000           | En revisión (2026-09-20); PR #2 y #5 fusionados |
| 001  | [registro-y-verificacion](001-registro-y-verificacion/spec.md)                                                             | M1                  | RF-01, RNF-04             | 13, 33, 35                 | 1    | Adrián | 000, 006a     | Lista (2026-09-26); lista para `/tasks` (no es transversal ni agrega puerto/tecnología: sin `/plan`) |
| 002  | [autenticacion-sesiones-y-dispositivos](002-autenticacion-sesiones-y-dispositivos/spec.md)                                 | M1                  | RF-02, 03, 04, RNF-07     | 11, 15                     | 1    | Adrián | 001           | Lista (2026-09-26) |
| 003  | [roles-y-acceso](003-roles-y-acceso/spec.md) (`RolesGuard`, `Actor`, `PermissionResolver`, `accessibleNodes`, RLS)         | T1 `shared` + M3a   | RF-05, RNF-05             | 01, 02, 32                 | 1    | Adrián | 002           | Lista (2026-09-26); lista para `/tasks` (agrega `RolesGuard`/`PermissionResolver` como puerto entre módulos: `/plan` antes, con aprobación de `architect`) |
| 004  | auditoria                                                                                                                  | T2 `audit`          | RF-07                     | 03, 12, 15                 | 1    | Adrián | 003           | Pendiente |
| 005  | carga-y-descarga                                                                                                           | M2                  | RF-08, 09, 14, RNF-06, 07 | 06, 16, 33                 | 1    | Abel | 003, 006a     | Pendiente |
| 006  | carpetas-y-papelera                                                                                                        | M2                  | RF-10, 11                 | 15, 40                     | 1    | Abel | 005           | Pendiente |
| 006a | catalogo-y-limites (tabla `plan`, `PlanLimits`, `IPlanLimitsProvider`)                                                     | M4                  | RF-19 (parcial)           | 23, 24, 27                 | 1    | Fátima | 000           | Pendiente |
| 007  | cuota-y-explorador                                                                                                         | M2                  | RF-12, RNF-14             | 26, 38                     | 1    | Abel | 005, 006a     | Pendiente |
| 008  | catalogo-y-comparador                                                                                                      | M4                  | RF-19                     | 15                         | 2    | Juan Marcos | 006a          | Pendiente |
| 009  | contratacion-pagos-y-facturas                                                              | M4                  | RF-20, 21                 | 23                         | 2    | Juan Marcos | 008           | Pendiente |
| 010  | renovacion-vencimiento-y-cambio-de-plan                                                    | M4                  | RF-22, 23, 24             | 25                         | 2    | Juan Marcos | 009           | Pendiente |
| 011  | administracion-y-soporte                                                                   | M8                  | RF-06                     | 04, 26, 36                 | 2    | Adrián | 003, 004, 008 | Pendiente |
| 012  | comparticion-y-accesos                                                                     | M3b                 | RF-16, 18                 | 31                         | 2    | Abel | 003, 006      | Pendiente |
| 013  | enlaces-publicos                                                                           | M3b                 | RF-17, RNF-08             | 09, 10                     | 2    | Abel | 012           | Pendiente |
| 014  | versiones-y-restauracion                                                                   | M2 (+ M5 autoría)   | RF-13, 29                 | 17, 18                     | 2    | Abel | 005           | Pendiente |
| 015  | tiempo-real                                                                                | transversal         | RF-08, 26                 | 30                         | 2    | Fátima | 002           | Pendiente |
| 016  | edicion-colaborativa-docx                                                                  | M5                  | RF-25, 26, 28, RNF-02, 09 | 05, 19, 20, 39             | 2    | Fátima | 014, 015      | Pendiente |
| 017  | previsualizacion                                                                           | M2                  | RF-27                     | 15                         | 2    | Abel | 005           | Pendiente |
| 018  | busqueda                                                                                   | M2 (+ M6 contenido) | RF-15                     | 15, 32                     | 2    | Fátima | 005           | Pendiente |
| 019  | indexacion                                                                                 | M6                  | RF-30, 31, RNF-03         | 07, 14, 37                 | 3    | Fátima | 005, 014      | Pendiente |
| 020  | agente-con-citas                                                                           | M6                  | RF-32, 33, 34, RNF-03     | 08, 14, 15, 25             | 3    | Fátima | 019, 010      | Pendiente |
| 021  | optimizador                                                                                | M7                  | RF-35, 36                 | 21, 22                     | 3    | Abel | 014           | Pendiente |
| 022  | operacion-metricas-y-alertas                                                               | M8                  | RF-37, RNF-18, 20, 21     | 22, 28, 29                 | 3    | Adrián | 000           | Pendiente |
| 023  | pruebas-de-carga-y-aislamiento-global                                                      | transversal         | RNF-01, 02, 05, 09        | —                          | 3    | Adrián | 020           | Pendiente |
| 024  | pulido-accesibilidad-manuales-y-diagramas-finales                                          | todos               | RNF-13, 14                | todos los abiertos         | 4    | Todos | —             | Pendiente |

«Pendiente» = aún sin spec creada. Al crearla con `/spec`, el estado pasa a `Borrador`.

## Próximos pasos por integrante (actualizado el 26/09/2026)

Escribir specs, mockups y planes solo toca `specs/` y `docs/`: no espera a nadie. `/implement` de una spec necesita
los bloques 1 y 2 de 000 en `main` (ya lo están: #1 y #4) y las specs de su columna «Depende de» integradas. Los
bloques 3–6 de 000 (CI, imágenes, staging) no bloquean a nadie.

| Integrante  | Ahora                                                                                                                                                                                                                                                                                      | Después                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Adrián      | 000: bloques 3–6 desde el 30/09, empezando por el CI y la compuerta T-27 (`docs/sdd/workflow.md` §7.2); 001: `/tasks 001` e `/implement 001`; `/spec 002` sesiones-y-dispositivos y `/spec 003` roles-y-acceso, con `/plan 003` (agrega puerto entre módulos) | `/implement 002` (depende de 001) y `/implement 003` (depende de 002); 004 auditoría   |
| Juan Marcos | `/spec 008` catalogo-y-comparador y `/spec 009` contratacion-pagos-y-facturas (Fase 2; dependen de 006a)                                                                                                                                                                                   | `/implement 008` cuando 006a esté integrada                                            |
| Abel        | `/spec 005` carga-y-descarga y `/spec 006` carpetas-y-papelera (los mockups del explorador y de la carga ya existen); `/tasks` directo si no son transversales                                                                                                                            | `/implement 005` (depende de 003 y 006a); luego 006 y 007                              |
| Fátima      | 000b: comprobar que se demuestra en local sobre `main` (`docker compose up -d` + `pnpm dev`) y pasarla a `Hecha` (#2 y #5 ya están integrados, `workflow.md` §7.2); `/spec 006a` catalogo-y-limites, `/tasks` e `/implement` (la usan 001, 005 y 007)                                      | `/spec 015` tiempo-real; `/implement 015` (depende de 002) |

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
