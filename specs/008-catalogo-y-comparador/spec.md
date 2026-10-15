# Spec 008 — Catálogo y Comparador

> Qué y por qué, en ≤ 150 líneas. El cómo va en `./plan.md` (obligatorio).

| Campo | Valor |
|---|---|
| Estado | Hecha |
| Dueño | Juan Marcos |
| Fase | 2 |
| Requisitos | RF-19 |
| Depende de | 006a |
| Última actualización | 2026-10-14 |

## 1. Contexto y objetivo
Permitir a los visitantes ver los planes de suscripción disponibles y compararlos lado a lado antes de contratar. El resultado observable es una vista pública de catálogo y tabla comparativa, alimentada por la tabla `plan` que `billing` ya tiene desde la spec 006a.

## 2. Historias de usuario
- **HU-1** Como visitante, con o sin sesión, quiero ver cada plan con su nombre, su descripción, su precio en quetzales y su vigencia mensual, para conocer las opciones antes de contratar.
- **HU-2** Como visitante, quiero ver los mismos planes lado a lado, para comparar almacenamiento, tamaño de archivo, edición, consultas, versiones y papelera.

## 3. Criterios de aceptación
> Dado/Cuando/Entonces en una o dos líneas. Cada criterio es verificable por una prueba y rastrea a un requisito.

- **CA-1** (HU-1, RF-19) Dado el catálogo de `plan`, cuando cualquiera lo consulta, con o sin sesión, entonces la respuesta es `200` con los planes **activos** ordenados por `precio_centavos` ascendente y, en empate, por `slug`. Mientras `plan` no tenga `desactivado_en` (llega con la T-09 de la 011) todas las filas son activas; desde entonces el catálogo filtra `desactivado_en IS NULL`. Cada plan trae `id`, `slug`, `name`, `description`, `priceCents` (entero) y los límites `quotaBytes`, `maxFileBytes`, `maxEditors`, `agentQueriesPerMonth`, `retainedVersions` y `trashRetentionDays`. Los bytes viajan como cadena decimal (ADR-0016). La respuesta no indica plan actual ni depende de la cuenta. Si no hay planes activos, la respuesta es `200` con lista vacía.
- **CA-2** (HU-2, RF-19) Dado ese catálogo, cuando se abre la pantalla, entonces se ven las tarjetas y una tabla con las mismas filas. El precio se muestra en quetzales, con «al mes». Las filas de la tabla son: precio mensual, almacenamiento, tamaño máximo por archivo, edición `.docx`, editores simultáneos, consultas al agente, historial de versiones con autoría, versiones retenidas y retención en papelera. Ningún precio ni límite está escrito en el frontend: salen de CA-1. Edición `.docx` muestra «Solo lectura» cuando `maxEditors` es 0 y «Sí» en cualquier otro caso. «Historial de versiones con autoría» es «Sí» en todos los planes (copy fijo, no es columna).
- **CA-3** (HU-1, RF-19) — error: Dado un fallo de lectura de `plan`, cuando se consulta el catálogo, entonces se responde `500` con código `BILLING_PLAN_CATALOG_UNAVAILABLE` y no se escribe nada. La pantalla muestra «No pudimos cargar los planes. Intenta recargar la página.»

## 4. Reglas de negocio
- **RN-1** El dinero se maneja en centavos enteros y el almacenamiento en bytes (ADR-0016). El formato en quetzales y en unidades legibles es solo de presentación, en `web`.
- **RN-2** El orden es `precio_centavos` ascendente y después `slug`. No hay columna de jerarquía. Se muestran solo los planes activos (CA-1); el catálogo no depende de `slug` fijos de la semilla.
- **RN-3** Nombre, descripción, precio y límites salen solo de `plan`. El copy fijo permitido en la pantalla es: «al mes» / «cobro mensual», «Historial de versiones con autoría: Sí», y el subtítulo de que todos los planes incluyen indexación, historial con autoría y cifrado en reposo. Ese copy no se guarda en base de datos.
- **RN-4** El catálogo es público y global: no depende de la sesión ni de la cuenta, y no marca un «plan actual».
- **RN-5** La vigencia de RF-19 es el cobro mensual. No se agrega columna.
- **RN-6** La edición `.docx` de la tabla se deriva de `max_editores`, como dice CA-2. No es una columna nueva.
- **RN-7** Esta lectura no usa `IPlanLimitsProvider`. Ese puerto sigue con `limitsFor(actor)` y `PlanLimits` de dos campos (006a CA-6, ADR-0022). Lo lee `billing` en su propia tabla.
- **RN-8** `GET /api/v1/billing/plans` es el único catálogo público. El registro (001, `features/identity/plan-catalog.ts`) lo lee con `fetchPlanCatalog` y deriva la marca de gratuito de `priceCents = 0` (cierra PD-48); no existe otra ruta `GET /plans`.

## 5. Seguridad y privacidad
- No toca datos de un cliente. No hay pruebas de aislamiento.
- No hay auditoría RF-07. El fallo de lectura se anota en la bitácora técnica con el `code`, sin datos de usuario ni SQL.
- Anónimo, cliente y roles internos reciben el mismo catálogo. No hay contenido de archivos.

## 6. Experiencia de usuario
| Pantalla | Mockup | Estados | Estado del mockup |
|---|---|---|---|
| Catálogo y comparador | `docs/design/mockups/billing/planes/` | cargando, éxito, error, vacío | Borrador (`plan-actual` solamente) |

Decisión: se usa ese mockup solo como referencia de tarjetas, precios en quetzales y tabla. No se implementan la barra de la app, la cuota, la marca «Tu plan actual» ni los botones «Plan gratuito», «Bajar a Pro», «Tu plan actual» y «Hablar con ventas». Esos pertenecen al estado `plan-actual`, que depende de la suscripción (009 y 010). La pantalla de esta spec es pública y se ve igual con o sin sesión.

- Error: «No pudimos cargar los planes. Intenta recargar la página.»
- Vacío: «Ahora no hay planes para mostrar.»

## 7. Fuera de alcance
- Contratar o cambiar de plan, y el pago simulado (009 y 010).
- Mostrar el plan actual del usuario.
- El flujo de «Hablar con ventas» del plan Institucional.
- Crear o desactivar planes desde administración (011); un plan no se edita.
- El botón de cada tarjeta hacia el pago. La 009 lo agrega cuando exista el flujo.
- La suscripción Personal y la conciliación de PD-40 (009).
- Columnas nuevas en `plan`: la 008 no agrega columnas (`desactivado_en` es de la 011).

## 8. Preguntas
- [RESUELTA] ¿Planes activos? → Se listan los activos. Hasta la T-09 de la 011 no existe `desactivado_en` y todas las filas son activas; desde entonces se filtra `desactivado_en IS NULL` (PD-76). (2026-10-09)
- [RESUELTA] ¿`IPlanLimitsProvider`? → No. Lectura de `plan` dentro de `billing`. (2026-10-04)
- [RESUELTA] ¿Botón al pago? → No en esta spec. (2026-10-04)
- [RESUELTA] ¿Mockup `default`? → Se implementa la pantalla pública con la referencia de `planes` y sin el cromo de `plan-actual`, como queda en la sección 6. (2026-10-04)

## 9. Registro de cambios
| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-10-03 | Creación inicial de la spec | Arranque de la Fase 2 | Borrador (pendiente Adrián) |
| 2026-10-04 | Se unifican las dos copias. RF-19 queda con nombre, descripción, precio y vigencia mensual. Se fijan las filas de la tabla y la pantalla pública | La spec estaba duplicada y se contradecía con el plan | Pendiente Adrián |
| 2026-10-09 | CA-1 lista los planes activos sin fijar cuatro filas (filtro `desactivado_en IS NULL` desde la T-09 de la 011); claves del contrato en inglés; RN-8: el registro lee este catálogo (PD-48); código `BILLING_PLAN_CATALOG_UNAVAILABLE`; §7: un plan no se edita y la 008 no agrega columnas | Revisión del PR #49 (06/10), PD-76 y PD-83 (alineación con la 011) | Adrián |
| 2026-10-14 | Estado `Hecha`: revisión sin bloqueantes y PD-92 decidido («Ver planes» espera a la 009) | Cierre de la spec | Adrián |
