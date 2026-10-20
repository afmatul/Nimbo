# Revisión 011 — Administración y soporte

> Spec: `./spec.md` · Plan: `./plan.md` (aprobado por Adrián, 2026-10-08) · Tareas: `./tasks.md`
> PR: **#67** (`feat/011-cuentas-catalogo-y-metricas`, PR-B) · Revisión: 20/10/2026 (Fátima)
> El PR-A (T-01 a T-08) ya está en `main` (`586064b`).

## Veredicto

**Aprobada para integrar**, con lo que queda anotado más abajo. La spec cumple sus criterios: el control de cuentas,
altas, catálogo y métricas; las pantallas internas; el aislamiento; y la auditoría que ve el cliente.

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

- Las respuestas salen por lista blanca y las bitácoras solo llevan ids y roles: nunca un correo, un nombre de archivo,
  un código de empleado, un token ni un enlace (RNF-17). La línea `http.request` quita la cadena de consulta, así que
  `?email=` no se registra.
- Un `:id` que no es UUID da el mismo `404` que una cuenta inexistente, y un correo de una interna el mismo `404` que
  uno inexistente (003 D-6), sin auditar.
- El límite de tasa por cuenta interna (T-14) cierra el sondeo de correos: 60 peticiones por minuto y por cuenta, con
  `429 SHARED_TOO_MANY_REQUESTS` y su bitácora, sin correo ni IP.
- Los cambios de catálogo se auditan **sin cliente afectado**: nadie los ve en «Mi actividad» (RN-2).

## Interfaz

- Las pantallas siguen sus mockups (`backoffice/admin`, `alta-interna`, `catalogo`, `metricas`, `soporte`), con los
  estados de la §6 de la spec y axe sin violaciones a 360 y 1440 px.
- Separadores y cifras: los conteos usan el separador de miles del catálogo (`formatCount`) y los porcentajes la coma
  decimal, como los bytes (PD-91); el texto concuerda con la cantidad («la 1 cuenta» / «las 12 cuentas»).
- Un solo `PlanCard` con sus dos variantes (PD-83): `/planes` (008) no cambia y el catálogo de administración añade
  los seis límites, el estado y el conteo de cuentas. La componente se apoya en la forma de la rama de la 010 que
  propuso Juan Marcos (mismo `badge`, mismo distintivo junto al título, mismo borde destacado).
- Desviaciones del mockup aceptadas: la tarjeta no muestra la fecha de creación del plan (el contrato no la trae y
  CA-8 no la pide; sí la de desactivación); el formulario deja el nombre vacío al copiar un plan, porque tiene que
  ser distinto del de origen; y **Personal no se puede usar como plan de origen** (CA-9 dice «un plan activo», pero
  Personal no se desactiva y no tiene sentido offersarlo como origen).

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
| **N-1** | **El alta de un plan no mostraba ningún error del servidor (CA-17)** | **Corregido (20/10): el `403` lleva a «Sin permiso» y un error sin campos se muestra con su aviso; con pruebas** |
| **N-2** | **Un precio con coma decimal creaba un plan 100 veces más caro (RN-4)** | **Corregido (20/10): la coma es el separador decimal y lo que no se puede traducir se rechaza; con prueba** |
| **N-3** | **Si fallaba la desactivación, la pantalla no decía nada (CA-10, CA-17)** | **Corregido (20/10): el fallo se muestra con su aviso; con prueba** |
| N-4 | Un solo número mal escrito marcaba los siete campos numéricos | Corregido: cada campo se valida con su propio traductor |
| N-5 | Diez funciones nuevas de más de 30 líneas | Corregido: todas quedan en 30 líneas o menos |
| N-6 | Faltaba «ofrecer desactivar el plan de origen» tras crear uno | Corregido: tras crear, se ofrece desactivar el de origen; y se corrigieron sus tres fallos (H-1 a H-3) |
| N-7 | Este `review.md` afirmaba correcciones que no estaban hechas | Corregido (20/10) y revisado de nuevo tras N-1 a N-6 |
| **H-1** | **Al volver a «Empezar de cero» seguía el plan de origen y se ofrecía desactivarlo** | **Corregido: al volver a cero se limpia el origen sin borrar lo escrito** |
| **H-2** | **Tras desactivar el plan de origen no salía ningún aviso** | **Corregido: sale el aviso de éxito y el botón desaparece** |
| **H-3** | **Un `403` al desactivar el plan de origen no mostraba nada** | **Corregido: lleva a «Sin permiso», con prueba** |
| **H-4** | **El recorrido del catálogo declaraba una demo que no podía ser cierta** | **Corregido: el recorrido se repitió el 20/10/2026 sobre el commit final y queda anotado con su fecha real en `tasks.md` y aquí** |
| H-5 | El artículo del diálogo seguía fijo («Las 1 cuenta…») | Corregido: el artículo y el verbo concuerdan con la cantidad |
| H-6 | Las unidades estaban repetidas en el formulario | Corregido: se usan las constantes `QUOTA_UNITS` y `MAX_FILE_UNITS` |
| H-7 | Cada número se traducía dos veces | Corregido: `parsePlanForm` traduce una sola vez y devuelve el cuerpo o los campos que fallan |
| H-8 | Una copia podía quedar inválida si el valor no daba entero | Corregido: si no hay unidad exacta, el campo queda vacío para que lo escriba la persona |
| m-1 a m-7 | Menores (diálogo que se cerraba durante el envío, plurales a mano, «Volver» repetido, la copia que perdía valores, la alineación de la tarjeta, erratas, `highlighted` sin usar) | Corregidos los que son de la 011; `highlighted` se queda porque viene de la 010, que está en revisión |
| m-7 | La descripción del PR seguía diciendo que `backoffice` escribe `identity.session.revoked` | Corregido: lo escribe `identity` (lo llama `backoffice` después del commit) |

## Verificación local (20/10, Node 22)

- `pnpm lint` ✅ · `pnpm typecheck` ✅
- `pnpm test` ✅ — api 2 146, web 1 573, contratos 449, config 244
- `pnpm test:int` ✅ — 143 suites, 1 314 pruebas
- `pnpm test:isolation` ✅ — 24 suites, 400 pruebas
- Recorrido humano de la demo (T-12, 20/10/2026) ✅ — nota en `tasks.md`: cuentas, alta interna, metadatos desde la ficha, «Mi actividad» con el rol, métricas como Admin y como Operador, el «sin permiso», los 360 px y el catálogo completo (crear un plan desde otro con la coma decimal, volver a «Empezar de cero», desactivar con su confirmación y su aviso).

## Lo que queda pendiente (no bloquea la integración)

- **Visto bueno de Adrián (R-8)** a los tres errores que exporta `identity/index.ts` y a los archivos de
  `features/access` y `test/support/full-api-test-app.ts`.
- **Juan Marcos**: revisar los cambios de su módulo (`Plan.isDefault` y el mensaje de `PlanNotFoundError`) y la
  variante de administración del `PlanCard`.
- **Pulido de la Fase 4**: `ServerErrorAlert` y `useFocusOnMount` en un lugar común; `formatBytes(Number(...))` pierde
  precisión por encima de 2⁵³ bytes (anotado en PD-91).

## Aprobación

> Aprobación humana requerida de **Adrián** (RNF-19, `workflow.md` §7). Fátima no se autoaprueba.
