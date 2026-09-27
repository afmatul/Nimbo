# Pendientes transversales

Lista de trabajo que quedó fuera de una spec y que nadie tiene en su `tasks.md`: diagramas por redibujar, documentos
que contradicen una decisión ya tomada, decisiones abiertas y ajustes de código o configuración. Sirve para que nada
de eso se pierda entre ramas.

**Qué no va aquí:**
- las preguntas de una spec, que van en su §15;
- los hallazgos de diseño, que van en `design-findings.md` (aquí solo se anota la *acción* que falta sobre un DF);
- los ADR sin redactar, que están en `docs/adr/README.md`;
- las tareas de una spec, que van en su `tasks.md`.

**Cómo se usa**
- Quien encuentra algo pendiente lo agrega con el siguiente `PD-NN`, sin reutilizar números.
- Quien lo termina lo mueve a «Cerrados» con la fecha y el commit o PR. No se borra.
- «Resolver antes de» es la compuerta que se bloquea si el pendiente sigue abierto. «—» significa que no bloquea nada.
- `/status` y el `architect` revisan esta lista al cerrar cada fase.

Última actualización: 2026-09-27.

## Diagramas por redibujar

Los diagramas originales están en `docs/design/diagramas/`. Cuando un diagrama queda redibujado, sus DF pasan de
`Aceptado` a `Resuelto`. Los textos (`architecture.md`, `design-model.md`, `design-findings.md`) ya reflejan estas
decisiones; solo faltan los diagramas.

| ID | Qué falta | Origen | Resolver antes de | Responsable | Estado |
|---|---|---|---|---|---|
| PD-01 | Clases M3: separarlo en M3a `access` (`PermissionResolver`, `IAccessPolicy`, `accessibleNodes`) y M3b `sharing` | ADR-0010, DF-02 | — | Adrián | Abierto |
| PD-02 | Clases M8: sacar `AuditService`/`AuditEntry` (van a T2 `audit`) y `RolesGuard` (va a `shared`) | ADR-0010, DF-03, DF-50 | — | Adrián | Abierto |
| PD-03 | Clases M5: sin `PresenceGateway` propio; la presencia va por el gateway único de `realtime` | ADR-0010, DF-30 | — | Adrián | Abierto |
| PD-04 | Clases M1 y M4: `IMailer` e `INotifier` declarados por `notifications`, no por el consumidor | ADR-0010, DF-34 | — | Adrián | Abierto |
| PD-05 | Bloques transversales T1–T4 y diagrama de Arquitectura | ADR-0010, DF-28 (c) | — | Adrián | Abierto |
| PD-06 | Clases M1 y E-R con las decisiones de la 001: rol como enum en `usuario.rol` sin tabla `rol` (DF-13), sin `subscriptionId` en `ClientUser` (DF-35) y columnas nuevas de `usuario` (DF-33) | Spec 001 D-1, D-2, D-3 | — | Adrián | Abierto |
| PD-07 | Clases M1 y E-R con las decisiones de la 002: clase `Device` y tabla `dispositivo` con hash (DF-11), y `SessionsController` (DF-15) | Spec 002 D-4, D-8 | — | Adrián | Abierto |
| PD-08 | Firmas con `actor: Actor` en M2, M3, M5 y M8 (DF-01) y `accessibleNodes(actor)` (DF-32) | Spec 003 D-9, D-1 | — | Adrián | Abierto |

## Documentos por actualizar

| ID | Qué falta | Dónde | Origen | Resolver antes de | Responsable | Estado |
|---|---|---|---|---|---|---|
| — | Ninguno abierto | — | — | — | — | — |

## Decisiones abiertas

| ID | Qué hay que decidir | Origen | Resolver antes de | Responsable | Estado |
|---|---|---|---|---|---|
| PD-18 | Ciclo `storage ↔ billing` y la convención de §5 para `IPlanLimitsProvider`, `IAgentQuota` e `IIndexQueue`. Las opciones están en DF-51 | DF-51 | Plan de 006a | Fátima con Adrián | Abierto |
| PD-19 | Trabajos del worker sin actor bajo RLS, sin `BYPASSRLS` (purga de la papelera, conciliación de `espacio_usado`). Las opciones están en DF-52 | DF-52 | Plan de 005 | Abel con Adrián | Abierto |
| PD-20 | `sharing` necesita `IPasswordHasher` de `identity` (DF-10), y ADR-0010 no permite `sharing → identity`. Hay dos salidas: un ADR que enmiende 0010 y `boundaries.js`, o mover el hasher a `shared` | ADR-0010, DF-10 | Spec 012 | Adrián | Abierto |
| PD-21 | Cambios opcionales al flujo: implementar cuando los antecesores están en `Planificada` y ampliar los PR parciales de §4.8 | Conversación del 26/09 | — | Adrián | Abierto |
| PD-22 | ¿Se carga Inter 800? Las hojas empaquetadas recientes lo traen; los mockups hechos a mano usan hasta 700 | `fix/000b-solo-inter` | — | Adrián | Abierto |
| PD-31 | `INodeMetadataReader` figura como «backoffice → storage». Si `storage` lo implementa importándolo, se forma `storage → backoffice → storage`. Sigue la misma convención que DF-51, así que conviene sumarlo a ese hallazgo | `architecture.md` §5, DF-51 | Plan de 005 | Abel con Adrián | Abierto |
| PD-32 | `@nestjs/throttler` no tiene ADR. El ADR menor del plan de 001 (`passport`, `jwt`) debe incluirlo. La 001 ya no lo deja condicionado (R-10, D-15) | Spec 000 D-9, 001 D-15, 002 D-11 | Plan de 001 | Adrián | Abierto |

## Código y configuración

| ID | Qué falta | Dónde | Origen | Resolver antes de | Responsable | Estado |
|---|---|---|---|---|---|---|
| PD-24 | `boundaries.js` con las reglas de ADR-0010, `import-x/no-cycle` y los fixtures negativos `realtime-imports-identity.ts` y `access-imports-storage.ts` | `packages/config/eslint/` | ADR-0010, T-28 de 000 | PR de CI de 000 | Adrián | Abierto |
| PD-25 | Segundo rol de BD (`nimbo_app`, que no es dueño) y `DATABASE_MIGRATION_URL`: script de inicio de Postgres en compose, `.env.example`, `env:check` y secretos de staging | `compose.yml`, `.env.example`, `apps/api` | ADR-0005 | Plan de 003 | Adrián | Abierto |
| PD-26 | Regla de lint que prohíba `set_config` fuera de `withActor()` | `packages/config/eslint/` | ADR-0005 | Plan de 003 | Adrián | Abierto |
| PD-27 | Token del velo de los diálogos: el mockup de «Seguridad» usa `agent-bg` al 45 % | `apps/web/src/components/nimbo/app-layout.tsx` (TODO #6), `ui-guidelines.md` | Mockup de «Seguridad» | Plan de 002 | Adrián | Abierto |

## Diseño y UX

| ID | Qué falta | Origen | Resolver antes de | Responsable | Estado |
|---|---|---|---|---|---|
| PD-28 | Aprobar las decisiones de UX del mockup del layout (`mockups/shared/layout/`, en `Borrador`; detalle en su README): (1) «Cerrar sesión» también pide confirmación desde el menú de la cuenta, y si se aprueba, CA-14 de 002 lo dice para los dos lugares; (2) texto del aviso de solo lectura (lo fija 010); (3) el aviso se ve en todas las vistas y no se cierra; (4) el correo va debajo del nombre en el menú; (5) los cambios respecto del marco de las p. 08 y p. 17 | Mockup del layout | Implementación de 002 | Adrián | Abierto |
| PD-33 | `AppLayout` no coincide con el mockup del layout: el ítem activo da 4.05 de contraste (`text-primary` sobre `bg-accent`, **por debajo de AA**), falta `aria-current="page"`, y cambian la estructura (cabecera a todo lo ancho frente a barra lateral de altura completa), los nombres de la navegación, las piezas (ruta, menú de la cuenta, cuota, carpetas, plan, aviso de solo lectura) y el velo (`bg-black/40`, PD-27) | `apps/web/src/components/nimbo/app-layout.tsx` | Implementación de 002 (el contraste, antes si se puede) | Fátima (000b) con Adrián | Abierto |
| PD-34 | «Recientes» y «Favoritos» están en la propuesta firmada y en la navegación, pero no hay RF que los respalde (constitución, Art. II): agregar un RF o quitarlos | `product-context.md`, mockup del layout | Plan de 007 | Adrián | Abierto |
| PD-35 | El mockup aprobado de «Seguridad» tiene los dos fallos que se corrigieron en el layout: la cifra de un ítem al pasar el puntero da 4.39 (`muted-foreground` sobre `muted`) y el logo mide 36 px en móvil (menos de 44). Se corrige al implementar, sin tocar el mockup aprobado | Mockup del layout | Implementación de 002 | Adrián | Abierto |
| PD-29 | Textos finales de Términos y Política de privacidad (los propone el plan) y la mención a la Universidad Rafael Landívar | Spec 001 D-22 | Plan de 001 | Adrián | Abierto |

## Cerrados

| ID | Qué era | Cerrado | Dónde |
|---|---|---|---|
| PD-09 | DF-13, DF-35 y DF-33 (`usuario`) a `Aceptado` por la spec 001 | 2026-09-27 | `chore/adr-fase-1` |
| PD-10 | DF-11 y DF-15 (sesiones) a `Aceptado` por la spec 002; DF-15 queda parcial a propósito | 2026-09-27 | `chore/adr-fase-1` |
| PD-11 | DF-50 registrado; DF-01 y DF-32 a `Aceptado` por la spec 003 | 2026-09-27 | `chore/adr-fase-1` |
| PD-12 | `RolesGuard` fuera de M8: `design-model.md`, README e `index.ts` de `backoffice`, README de `shared` y fila 003 del backlog | 2026-09-27 | `chore/adr-fase-1` y `spec/003-roles-y-acceso` |
| PD-13 | Subsección T4 `notifications` y «Puertos que consume» en M1, M3b y M4 | 2026-09-27 | `chore/adr-fase-1` |
| PD-14 | `SET LOCAL` pasa a `set_config(…, true)` dentro de `withActor()` en la spec 003; CA-12 admite el valor vacío | 2026-09-27 | `spec/003-roles-y-acceso` |
| PD-15 | `ThrottlerModule` y `CORS_ORIGIN` entran con la 001 (spec y plan de 000) | 2026-09-27 | `chore/adr-fase-1` |
| PD-16 | Nota de origen de los mockups en `ui-guidelines.md` §7 | 2026-09-27 | `chore/adr-fase-1` |
| PD-17 | Nota en `design-cielo-sereno.md`: Inter como única familia | 2026-09-27 | `chore/adr-fase-1` y `fix/000b-solo-inter` |
| PD-23 | Error de `tsc` en `apps/web/src/app/globals.spec.ts`; `typecheck` del monorepo en verde | 2026-09-27 | `fix/000b-solo-inter` |
| PD-30 | `IRateLimiter` pasa de `sharing` a `shared` (lo consumen `identity` desde 001 y `sharing` desde 012): `architecture.md` §3 y §5, `design-model.md` (M1, M3b, T1), ADR-0010, README de `shared` y 001 D-15 | 2026-09-27 | `chore/adr-fase-1` y `spec/001-registro-y-verificacion` |
