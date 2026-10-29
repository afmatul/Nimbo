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
| Adrián (1)      | Diseñador principal (Tech Lead) | fundaciones, `shared`, `identity` (M1), `notifications`, `storage` (M2), `access` (M3a), `audit`, `realtime`, `editing` (M5), `intelligence` (M6), CI/CD, infraestructura, guardián de diagramas; revisor de planes y PRs |
| Juan Marcos (2) | Diseñador-programador           | `billing` (M4) y búsqueda (018)                                                                                                              |
| Abel (3)        | Diseñador-programador           | previsualización (017), `optimizer` (M7), observabilidad (022)                                                                               |
| Fátima (4)      | Diseñador-programador           | sistema de diseño (000b), `sharing` (M3b), `backoffice` (M8), incluido el tablero de operación (022b)                             |

Excepciones: 006a (`billing`) la construyó Fátima y la integra Adrián. En la 011, Adrián autorizó a Fátima a cambiar `identity`, `storage` y `audit` (2026-10-07), y `shared` y `features/access` solo en los archivos que nombra el plan (2026-10-08), y la parte de `billing` la escribe Juan Marcos. 017 y 018 viven en `storage`, pero en carpetas
propias (`storage/preview`, `storage/search`) de Abel y Juan Marcos; los cambios al resto de `storage` los hace Adrián.

## Estados (SDD express)

`Borrador` → `Lista` → `En curso` → `En revisión` → `Hecha`

Mapeo desde el flujo anterior: `Aclarada`/`Planificada` → `Lista`; `En implementación`/`En verificación` → `En curso`.
Detalle de cada estado y sus compuertas en `docs/sdd/workflow.md` §2. Desde la Fase 2, `Lista` exige `plan.md` aprobado por Adrián.
Desde ADR-0034, `/spec` escribe spec, plan y tareas juntos cuando la carpeta todavía no existe; las que ya están escritas no se reescriben.
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
| 005  | [carga-y-descarga](005-carga-y-descarga/spec.md)                                                                                                           | M2                  | RF-08, 09, 14, RNF-06, 07 | 06, 16, 33                 | 1    | Adrián | 001, 003, 006a (004 llega después: 005 declara `IAuditLogger`) | En revisión (2026-10-07): PR-A…PR-F integrados en `main` (#36…#41) y recorrido T-55 de Adrián; [revisión](005-carga-y-descarga/review.md) ✅ tras corregir B-1 e I-1…I-4 (T-FIX-1…4) en `fix/005-revision`; pasa a `Hecha` al integrarla. [plan](005-carga-y-descarga/plan.md) y [tareas](005-carga-y-descarga/tasks.md) |
| 006  | [carpetas-y-papelera](006-carpetas-y-papelera/spec.md)                                                                     | M2                  | RF-10, 11                 | 15, 40                     | 1    | Adrián | 005           | Hecha (2026-10-07): integrada en `main` (e766e3f) con CA-26 a CA-28; [revisión](006-carpetas-y-papelera/review.md) ✅ (I-7 cerrado en `CLAUDE.md`) y recorridos T-11 y T-17 de Adrián |
| 006a | [catalogo-y-limites](006a-catalogo-y-limites/spec.md) (tabla `plan`, `PlanLimits`, `IPlanLimitsProvider`) | M4 | RF-19 (parcial) | 23, 24, 27 | 1 | Fátima | 000 | Hecha (2026-09-30): integrada en `main` (#8, squash); `PlanLimitsAdapter` enlazado en `PlanLimitsBindingModule`. Revisión ✅ sin bloqueantes; quedan I-1…I-6 de documentación y pruebas. [plan](006a-catalogo-y-limites/plan.md), [tareas](006a-catalogo-y-limites/tasks.md) y [revisión](006a-catalogo-y-limites/review.md) |
| 007  | [cuota-y-explorador](007-cuota-y-explorador/spec.md)                                                                       | M2                  | RF-12, RNF-14             | 26, 38                     | 1    | Adrián | 005, 006a, 006 | Hecha (2026-10-07): integrada en `main` (8f14d38) con CA-18 a CA-21; [revisión](007-cuota-y-explorador/review.md) ✅ |
| 008  | catalogo-y-comparador                                                                                                      | M4                  | RF-19                     | 15                         | 2    | Juan Marcos | 006a          | Hecha (2026-10-14): T-01 a T-06 hechas, revisión sin bloqueantes; PD-92 decidido («Ver planes» espera a la 009) |
| 009  | contratacion-pagos-y-facturas (incluye el PD-40: suscripción Personal y conciliación, y el PD-80) | M4 | RF-20, 21 | 23 | 2 | Juan Marcos | 008, 011 (parte de `billing` e `identity`) | Hecha (2026-10-18): PR #62 integrado en `main` (`4b16c7d`), aprobado por Adrián |
| 010  | [renovacion-vencimiento-y-cambio-de-plan](010-renovacion-vencimiento-y-cambio-de-plan/spec.md)                             | M4                  | RF-22, 23, 24             | 25                         | 2    | Juan Marcos | 009           | En revisión (2026-10-21): 12 de 12 tareas y `review.md`; spec, plan, ADR-0031 y ADR-0032 aprobados por Adrián (2026-10-20); se integra desde `feat/010b-renovacion-web` (PR #70) |
| 011  | [administracion-y-soporte](011-administracion-y-soporte/spec.md)                           | M8                  | RF-06                     | 04, 36                     | 2    | Fátima | 003, 004, 005, 006, 007, 008 | En revisión (2026-10-20): el PR-A (T-01 a T-08) está en `main`; el PR-B va en `feat/011-cuentas-catalogo-y-metricas` (borrador #67) con T-10 a T-14 y T-12 hechas, con su `review.md` sin bloqueantes; falta el visto bueno de Adrián y el de Juan Marcos a su `billing` y al `PlanCard` |
| 011b | [ajustes-de-cuenta-y-restauracion](011b-ajustes-de-cuenta-y-restauracion/spec.md) (ajuste de cuota y de vigencia, restauración de papelera por Soporte; separada de 011 por tamaño) | M8                  | RF-05, RF-06, RF-07, RF-12, RF-22, RF-23, RF-24 | 26                         | 3    | Fátima | 004, 006, 007, 009, 010, 011 | Lista (2026-10-26): [spec](011b-ajustes-de-cuenta-y-restauracion/spec.md), [plan](011b-ajustes-de-cuenta-y-restauracion/plan.md), [ADR-0035](../docs/adr/0035-escrituras-internas-acotadas-de-ajustes-y-restauracion.md) y mockups aprobados por Adrián (PR #74); sigue `/tasks` y el PR-A en `feat/011b-ajustes` |
| 012  | comparticion-y-accesos                                                                     | M3b                 | RF-16, 18                 | 31                         | 2    | Fátima | 003, 006      | Pendiente |
| 013  | enlaces-publicos                                                                           | M3b                 | RF-17, RNF-08             | 09, 10                     | 2    | Fátima | 012           | Pendiente |
| 014  | versiones-y-restauracion                                                                   | M2 (+ M5 autoría)   | RF-13, 29                 | 17, 18                     | 2    | Adrián | 005           | En revisión (2026-10-10): T-01…T-10 en `feat/014-versiones-y-restauracion`; [revisión](014-versiones-y-restauracion/review.md) con B-1, B-2 e I-1…I-3 corregidos (T-FIX-1…5); pasa a `Hecha` al integrarla. [spec](014-versiones-y-restauracion/spec.md), [plan](014-versiones-y-restauracion/plan.md) y [tareas](014-versiones-y-restauracion/tasks.md) |
| 014b | [original-optimizado-y-cuota](014b-original-optimizado-y-cuota/spec.md): la versión `optimizacion` resta el original de `espacio_usado` (sin exigir cuota), original restaurable durante la retención en papelera del plan y purga automática; prerrequisito de 021 | M2                  | RF-36, 13, 12             | 21, 38                     | 3    | Adrián | 014, 007, 006 | En revisión (2026-10-25): [plan](014b-original-optimizado-y-cuota/plan.md) aprobado, ADR-0013 `Aceptado`; [tareas](014b-original-optimizado-y-cuota/tasks.md) T-01 a T-09 hechas (recorrido de la demo hecho por Adrián); [review](014b-original-optimizado-y-cuota/review.md) |
| 015  | [tiempo-real](015-tiempo-real/spec.md)                                                     | transversal         | RF-26                     | 30                         | 2    | Adrián | 002           | En revisión (2026-10-17): `feat/015-tiempo-real`, [review](015-tiempo-real/review.md) 🔁 con T-FIX-1 ([plan](015-tiempo-real/plan.md) aprobado; ADR-0030 y DF-76 aceptados) |
| 016  | [edicion-colaborativa-docx](016-edicion-colaborativa-docx/spec.md)                         | M5                  | RF-25, 26, 28, RNF-02, 09 | 05, 19, 20, 39             | 2    | Adrián | 003, 005, 015, identity (nombre visible) | En revisión (2026-10-17): `/review 016` en `feat/016-edicion-colaborativa-docx` ([plan](016-edicion-colaborativa-docx/plan.md) aprobado por Adrián, visto bueno de `architect`; ADR-0004 y ADR-0029 aceptados; [tareas](016-edicion-colaborativa-docx/tasks.md) T-01…T-11) |
| 017  | previsualizacion                                                                           | M2                  | RF-27                     | 15                         | 2    | Abel | 005           | Pendiente |
| 018  | busqueda                                                                                   | M2 (+ M6 contenido) | RF-15                     | 15, 32                     | 2    | Juan Marcos | 005           | Pendiente |
| 019  | [indexacion](019-indexacion/spec.md)                                                       | M6                  | RF-30, 31, RNF-03         | 07, 14, 37                 | 3    | Adrián | 005, 014      | En revisión (2026-10-23): [plan](019-indexacion/plan.md) aprobado; [tareas](019-indexacion/tasks.md) T-01 a T-12 hechas (recorrido de la demo T-11 hecho por Adrián); [review](019-indexacion/review.md) ✅ (T-FIX-1 a T-FIX-3 resueltos), PR pendiente de aprobación |
| 020  | agente-con-citas                                                                           | M6                  | RF-32, 33, 34, RNF-03     | 08, 14, 15, 25             | 3    | Adrián | 019, 010      | Pendiente |
| 021  | [optimizador de imágenes](021-optimizador/spec.md) (solo JPEG y PNG, archivo por archivo desde la ficha; el PDF es 021b; WebP y GIF fuera) | M7 | RF-35, 36 (imágenes) | 21, 22, 82, 83 | 3 | Abel | 014, 014b, 010 | En curso (2026-10-28): [plan](021-optimizador/plan.md) y recorte aprobados (2026-10-26); ADR-0036 y DF-82 aceptados; C + glibc aceptada (2026-10-27). Matul/Adrián aprobó después de `7f9285ff` el runtime Trixie/sharp 0.35.5/libvips 8.18.7 y el entorno mínimo, ya implementado (17 claves; PD-135 cerrado, sin enmienda de CA). [Tareas](021-optimizador/tasks.md): T-01…T-08 y T-10 hechas; única tarea pendiente T-09 humana de Abel. `/review 021` después de T-09 y estos ajustes; sin cierre de la spec |
| 021b | optimizador-de-pdf (Ghostscript; PDF firmados, P-6 de 021; cifrados; oyente de versiones en el `worker`, 019 §7.7; `ICommandRunner` a `shared`, DF-80) | M7                  | RF-35, 36 (PDF)           | 21, 80, 82                 | 3    | Abel | 021           | Pendiente |
| 022  | operacion-metricas-y-alertas (observabilidad: Prometheus, Grafana, alertas y respaldos; RF-37 pasó a 022b) | transversal         | RNF-18, 20, 21            | 28, 29                     | 3    | Abel | 000           | Pendiente |
| 022b | tablero-de-operacion (trabajos con reintento y una sola pantalla de bitácoras técnicas y trabajos para Admin, Soporte y Operador; separada de 022 el 2026-10-03, decisión de Adrián) | M8 | RF-37 | 22 | 3 | Fátima | 000, 011 | Pendiente |
| 023  | pruebas-de-carga-y-aislamiento-global                                                      | transversal         | RNF-01, 02, 05, 09        | —                          | 3    | Adrián | 020           | Pendiente |
| 024  | pulido-accesibilidad-manuales-y-diagramas-finales                                          | todos               | RNF-13, 14                | todos los abiertos         | 4    | Todos | —             | Pendiente |

«Pendiente» = aún sin spec creada. Al crearla con `/spec`, el estado pasa a `Borrador`.

## Próximos pasos por integrante (actualizado el 07/10/2026)

Fase 1 cerrada: falta integrar `fix/005-revision` (005) y los bloques 3–6 de 000 (CI, imágenes, staging), que arrancan ahora.
Avance 2 (50 %) el 14/10/2026: no caben 008–018 completas; el alcance mínimo para la demo se decide en el equipo.
Ningún plan de Juan Marcos, Abel o Fátima pasa a código sin la aprobación de Adrián registrada en su `plan.md` §8.

| Integrante  | Ahora (Fase 2)                                                                                                                       | Después (Fase 2 → Fase 3)          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| Adrián      | Integrar `chore/cierre-fase-1`, `fix/005-revision` y `feat/000-ci` → CI de 000 (lint de ciclos, `ci.yml`, protección de `main`) → imágenes y staging → `/spec 014`; `/plan 015` tiempo real (la necesita 016; plan y PR por `workflow.md` §7.1). Revisa planes y PRs del equipo | 014 → 015 → 016 → 019 → 020 → 023 |
| Juan Marcos | 009 en revisión: traer `main` (hecho), ítem «Plan y facturación» y PR; 010 con spec y plan para Adrián | 009 → 010 → 018 |
| Abel        | `/implement 017` desde T-03 (T-01, T-02 y T-05 de habilitación ya hechas por Adrián en `feat/017-previsualizacion`)                  | 022 → 021 (021 depende de 014)     |
| Fátima      | `/tasks 011b` y `/implement 011b` (plan propuesto, rama `spec/011b-ajustes-de-cuenta-y-restauracion`)      | 012 → 013 → 011b → 022b            |

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
