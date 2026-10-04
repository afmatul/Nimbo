# Spec 008 — Catálogo y Comparador

> Qué y por qué, en ≤ 150 líneas. El cómo va en `./plan.md` (obligatorio).

| Campo | Valor |
|---|---|
| Estado | Borrador |
| Dueño | Juan Marcos |
| Fase | 2 |
| Requisitos | RF-19 |
| Depende de | 006a |
| Última actualización | 2026-10-03 |

## 1. Contexto y objetivo
Permitir a los usuarios visualizar los planes de suscripción disponibles y comparar sus características y límites lado a lado, facilitando la elección del plan adecuado antes de la contratación. El resultado observable es una vista pública de catálogo y tabla comparativa, alimentada por los planes y límites que `billing` ya guarda en la tabla `plan` (spec 006a).

## 2. Historias de usuario
- **HU-1** Como usuario no autenticado o cliente, quiero ver el catálogo público de planes con sus precios y límites de almacenamiento, para conocer las opciones disponibles.
- **HU-2** Como usuario, quiero comparar las características de los diferentes planes en una vista detallada, para decidir qué plan se adapta mejor a mis necesidades.

## 3. Criterios de aceptación
> Dado/Cuando/Entonces en una o dos líneas. Cada criterio es verificable por una prueba y rastrea a un requisito.

- **CA-1** (HU-1, RF-19) Dado el sistema inicializado, cuando cualquier visitante, con o sin sesión, consulta el catálogo de planes, entonces se devuelven todos los planes ordenados de menor a mayor precio, con el precio en centavos y todos sus límites (cuota de almacenamiento, tamaño máximo de archivo, editores, consultas del agente, versiones retenidas y retención de papelera), leídos de la tabla `plan` de `billing`.
- **CA-2** (HU-2, RF-19) Dado el catálogo disponible, cuando el usuario accede a la vista de comparación, entonces se renderiza una tabla o matriz contrastando las características de todos los planes del catálogo, con los precios mostrados en quetzales.
- **CA-3** (HU-1, RF-19) — error: Dado un fallo en la lectura del catálogo, cuando se solicita, entonces se responde `500` con el código `PLAN_CATALOG_UNAVAILABLE` y el mensaje «Error al recuperar los límites del catálogo», y no se altera el estado del sistema.

## 4. Reglas de negocio
- **RN-1** El dinero se maneja en centavos enteros y el almacenamiento en bytes (ADR-0016). El formato en quetzales y en unidades legibles es solo de presentación, en `web`.
- **RN-2** La jerarquía de los planes es el orden ascendente por precio.
- **RN-3** Ningún valor del catálogo (nombres, precios, límites) vive en código de producción: todo sale de la tabla `plan`.
- **RN-4** El catálogo es público y global: no depende de la sesión ni de la cuenta, y no marca un «plan actual».

## 5. Fuera de alcance
- Contratar o cambiar de plan y el pago simulado (spec de suscripción y pago).
- Mostrar el plan actual del usuario (requiere la suscripción).
- El flujo de «Hablar con ventas» del plan Institucional: no tiene flujo en los requisitos.
- Crear, editar o desactivar planes desde una interfaz de administración.

## 6. Decisiones abiertas
- **Planes «activos»**: la tabla `plan` no tiene columna de estado. Se propone tratar todos los planes como activos; si hace falta desactivar planes, se agrega una columna y su migración.
- **Fuente de los límites**: se leen directo de la tabla `plan` y no mediante `IPlanLimitsProvider`, porque ese puerto solo expone dos límites del plan de un actor. Se registra en `design-findings.md`.
- **Mockup**: `billing/planes` solo trae el estado `plan-actual`; falta el estado `default` (sin plan actual), que es el que ve el usuario público.# Spec 008 — Catálogo y Comparador

> Qué y por qué, en ≤ 150 líneas. El cómo va en `./plan.md` (obligatorio).

| Campo | Valor |
|---|---|
| Estado | Borrador |
| Dueño | Juan Marcos |
| Fase | 2 |
| Requisitos | RF-19 |
| Depende de | 006a |
| Última actualización | 2026-10-03 |

## 1. Contexto y objetivo
Permitir a los usuarios visualizar los planes de suscripción disponibles y comparar sus características y límites lado a lado, facilitando la elección del plan adecuado antes de la contratación. El resultado observable es una vista pública de catálogo y tabla comparativa integrada con los límites del sistema.

## 2. Historias de usuario
- **HU-1** Como usuario no autenticado o cliente, quiero ver el catálogo público de planes con sus precios en centavos y límites de almacenamiento, para conocer las opciones disponibles.
- **HU-2** Como usuario, quiero comparar las características de los diferentes planes en una vista detallada, para decidir qué plan se adapta mejor a mis necesidades.

## 3. Criterios de aceptación
> Dado/Cuando/Entonces en una o dos líneas. Cada criterio es verificable por una prueba y rastrea a un requisito.

- **CA-1** (HU-1, RF-19) Dado el sistema inicializado, cuando se consulta el catálogo de planes activos, entonces se devuelven los planes ordenados por jerarquía con precios en centavos y sus límites asociados mediante el proveedor de la Spec 006a.
- **CA-2** (HU-2, RF-19) Dado el catálogo disponible, cuando el usuario accede a la vista de comparación, entonces se renderiza una tabla o matriz contrastando las características de todos los planes activos.
- **CA-3** (HU-1, RF-19) — error: Dado un fallo temporal en el proveedor de límites, cuando se solicita el catálogo, entonces se responde `500` con «Error al recuperar los límites del catálogo» y no altera el estado del sistema.

## 4. Reglas de negocio
- **RN-1** Los precios de los planes se manejan estrictamente en centavos de la moneda base (conforme al ADR-0016).
- **RN-2** La visualización de límites debe consumir directamente el `IPlanLimitsProvider` definido en la Spec 006a sin duplicar lógica de negocio.

## 5. Seguridad y privacidad
- ¿Toca datos de un cliente? no → no requiere pruebas de aislamiento de datos sensibles de usuarios.
- ¿Qué va a auditoría (RF-07)? La consulta de planes públicos no requiere registro detallado en auditoría de acciones de usuario.
- ¿Qué roles internos intentan esto y qué reciben? Tanto usuarios anónimos como autenticados de cualquier rol pueden acceder al catálogo público.

## 6. Experiencia de usuario
| Pantalla | Mockup (`docs/design/mockups/…`) | Estados requeridos | Estado del mockup |
|---|---|---|---|
| Catálogo y Comparador de Planes | `docs/design/mockups/billing/catalogo-comparador.png` | Cargando, Éxito, Error | Pendiente de diseño |

- Mensajes clave (español, tuteo, con acción correctiva): «No pudimos cargar los planes disponibles. Intenta recargar la página.»
- Sin interfaz: no aplica

## 7. Fuera de alcance
- La pasarela de pago, procesamiento de tarjetas o creación efectiva de la suscripción (esto pertenece a la Spec 009).
- Modificación de límites o administración interna de planes (pertenece a Fátima en módulos de backoffice/catálogo).

## 8. Preguntas
- [RESUELTA] ¿El comparador debe soportar selección directa hacia el flujo de pago? → Sí, mediante un botón de acción en cada tarjeta que enlazará con la Spec 009 (2026-10-03, Juan Marcos).

## 9. Registro de cambios
| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-10-03 | Creación inicial de la spec | Arranque de la Fase 2 | Borrador (Pendiente Adrián) |
