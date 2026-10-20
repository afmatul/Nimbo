# Revisión 011 — Administración y soporte

> Spec: `./spec.md` · Plan: `./plan.md` (aprobado por Adrián, 2026-10-08) · Tareas: `./tasks.md`
> PR: **#67** (`feat/011-cuentas-catalogo-y-metricas`, PR-B) · Revisión: 20/10/2026 (Fátima)
> El PR-A (T-01 a T-08) ya está en `main` (`586064b`).

## Veredicto

**Aprobada para integrar**, con lo que queda anotado más abajo. La spec cumple sus criterios: los内部控制 de
cuentas, altas, catálogo y métricas; las tres pantallas internas; el aislamiento; y la auditoría que ve el cliente.

| CA | Cómo se cumple | Dónde |
|---|---|---|
| CA-1 a CA-6 | Rutas de cuentas con el candado del padrón, el actor activo y el evento en la misma transacción | `backoffice/application/admin.service.ts`, `identity/application/{account-administration,internal-account-enrollment}.ts` |
| CA-7 | El primer Administrador, por comando, con un solo `ITransactionRunner.run` sin actor | `backoffice/application/initial-admin-bootstrapper.ts`, `apps/api/src/scripts/bootstrap-admin.ts` |
| CA-8 a CA-11 | Catálogo: lista, alta y desactivación; las reglas del plan las valida `billing` y no se revalidan | `backoffice/application/catalog-admin.service.ts`, `billing/domain/plan.entity.ts` |
| CA-12 | Métricas agregadas: totales y conteos, nunca filas de una cuenta | `backoffice/application/metrics.service.ts` |
| CA-13 | Metadatos por SQL, sin `version_archivo`, `clave_objeto` ni `carga` | `storage/infrastructure/persistence/sql-node-metadata.reader.ts` |
| CA-14 | Matriz rol × ruta (10 rutas) y `403 SHARED_FORBIDDEN` | `test/int/backoffice/roles-matrix.int-spec.ts` |
| CA-15 | Aislamiento: ninguna respuesta trae contenido, texto, URL, clave de objeto ni versiones | `test/isolation/backoffice.iso-spec.ts` (24 suites, 400 pruebas) |
| CA-16 | El cliente ve la acción y el rol, nunca el nombre ni el correo | `audit/presentation/audit-event-response.ts` |
| CA-17 | Estados de cada pantalla, axe a 360 y 1440 px, «sin permiso» y 360 px | `features/backoffice/a11y.spec.tsx` |

## Seguridad y privacidad

- Las respuestas salen por lista blanca y los bitsácors solo llevan ids y roles: nunca un correo, un nombre de archivo,
  un código de empleado, un token ni un enlace (RNF-17). La línea `http.request` quita la cadena de consulta, así que
  `?email=` no se registra.
- Un `:id` que no es UUID da el mismo `404` que una cuenta inexistente, y un correo de una interna el mismo `404` que
  uno inexistente (003 D-6), sin auditar.
- El límite de tasa por cuenta interna (T-14) cierra el sondeo de correos: 60 peticiones por minuto y por cuenta, con
  `429 SHARED_TOO_MANY_REQUESTS` y su bitácora, sin correo ni IP.
- Los cambios de catálogo se auditan **sin cliente afectado**: nadie los ve en «Mi actividad» (RN-2).

## Interfaz

- Las pantallas siguen sus mockups (`backoffice/admin`, `alta-interna`, `catalogo`, `metricas`, `soporte`), con todos
  los estados de la §6 de la spec y axe sin violaciones a 360 y 1440 px.
- Separadores y cifras: los conteos usan el separador de miles del catálogo (`formatCount`) y los porcentajes la coma
  decimal, como los bytes (PD-91); el texto concuerda con la cantidad («la 1 cuenta» / «las 12 cuentas»).
- Un solo `PlanCard` con sus dos variantes (PD-83): `/planes` (008) no cambia y el catálogo de administración añade
  los seis límites, el estado y el conteo de cuentas.
- Desviaciones del mockup aceptadas: la tarjeta no muestra la fecha de creación del plan (el contrato no la trae y
  CA-8 no la pide; sí la de desactivación) y el formulario muestra la fecha de creación en el catálogo, no en la
  tarjeta.

## Hallazgos y correcciones

| # | Hallazgo | Corrección |
|---|---|---|
| I-1 | Separadores contradictorios en la tarjeta de métricas («1,284» junto a «39,4 TB») | Los conteos usan `formatCount` y los porcentajes la coma; el paginador también (revisión del PR, 19/10) |
| I-2 | Plural fijo: «Las 1 cuentas internas no tienen plan» | Ayudante `quantity` («la 1 cuenta» / «las 12 cuentas»), con el verbo concordado y su prueba |
| I-3 | El README de `identity` (web) describía el marcador del área interna | Línea corregida con las rutas actuales |
| I-4 | El pie de una tabla sin filas decía «0 · 100 %» | Dice «0 %», con su prueba |
| S-1 a S-5 | Encabezado, prueba vacía, esqueleto del mockup y dos limpiezas de tipos | Aplicados (revisión del PR, 19/10) |
| B-1 | Las rutas `/backoffice/plans*` no estaban en la matriz ni en el aislamiento | Añadidas (12 casos en la matriz, 9 en el aislamiento) |
| M-1 a M-4 | `PlanCard` y la lista con más de 30 líneas; el esqueleto repetido; el modelo sin el limitador; el doble *cast* del alta | Corregidos: piezas cortas, `SkeletonLine` y `LoadingStatus` comunes, M8 actualizado y el resolver propio del alta |
| m-1 a m-7 | Menores (diálogo que se cerraba durante el envío, `round1` duplicado, código normalizado, condición redundante) | Corregidos o anotados para el pulido de la Fase 4 |

## Verificación local (20/10, Node 22)

- `pnpm lint` ✅ · `pnpm typecheck` ✅
- `pnpm test` ✅ — api 2 146, web 1 573, contratos 449, config 244
- `pnpm test:int` ✅ — 143 suites, 1 314 pruebas
- `pnpm test:isolation` ✅ — 24 suites, 400 pruebas
- Recorrido humano de la demo (T-12, 19/10) ✅ — nota en `tasks.md`

## Lo que queda pendiente (no bloquea la integración)

- **T-12bis**: repetir el recorrido de la demo con la web del catálogo (antes no existía) y con el límite de tasa.
- **Visto bueno de Adrián (R-8)** a los tres errores que exporta `identity/index.ts` y a los archivos de
  `features/access` y `test/support/full-api-test-app.ts`.
- **Juan Marcos**: revisar los cambios de su módulo (`Plan.isDefault` y el mensaje de `PlanNotFoundError`) y la
  variante de administración del `PlanCard`.
- **Pulido de la Fase 4**: `ServerErrorAlert` y `useFocusOnMount` en un lugar común; `formatBytes(Number(...))` pierde
  precisión por encima de 2⁵³ bytes (anotado en PD-91).

## Aprobación

> Aprobación humana requerida de **Adrián** (RNF-19, `workflow.md` §7). Fátima no se autoaprueba.
