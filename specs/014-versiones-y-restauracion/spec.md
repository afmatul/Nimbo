# Spec 014 — Versiones y restauración

> Qué y por qué, en ≤ 150 líneas. El cómo va en `./plan.md` (obligatorio).

| Campo | Valor |
|---|---|
| Estado | Lista |
| Dueño | Adrián (1) |
| Fase | 2 |
| Requisitos | RF-13, RF-29 (principales); aplican RF-07, RF-09, RF-12, RNF-05, RNF-06, RNF-07, RNF-13, RNF-14, RNF-17 |
| Depende de | 005 (`archivo`, `version_archivo`, cuota, descarga firmada), 003 (`Actor`, `accessibleNodes`, RLS), 006a (`versiones_retenidas` vía `IPlanLimitsProvider`), 004 (`IAuditLogger`). Conviven con 006 (papelera) y 007 (conciliación de cuota) |
| Módulo | M2 `storage` (dueño del ciclo de vida de versiones; la autoría por sesión llega de M5 en 016) |
| DF | DF-17 y DF-18 (ADR-0012, Propuesto: composición con `origen`), DF-38 (014 ajusta `espacio_usado`); DF-05 y DF-39 son de 016 |
| Última actualización | 2026-10-07 |

## 1. Contexto y objetivo

Hoy cada archivo tiene una sola versión (la que escribe 005). RF-13 pide que Nimbo conserve versiones restaurables según
la retención del plan y RF-29 que el historial muestre quién participó y permita restaurar. Esta spec entrega el **ciclo
de vida de las versiones**: crearlas al reemplazar un archivo, listarlas con su autoría, restaurar una anterior, bajarla,
y podar las que excedan lo que el plan retiene. Es la base de 016 (versión al cerrar una sesión de edición, RF-28), 019
(reindexar por versión) y 021 (versión optimizada, original restaurable).

**Frontera con 016.** 014 no abre sesiones de edición, ni conoce ONLYOFFICE, ni registra participantes. Deja una operación
única de «registrar versión nueva» (con numeración, cuota y retención) que 014 usa para reemplazar y restaurar, y que
016 y 021 reutilizan con origen `edicion` y `optimizacion`. Los participantes de una sesión los aporta 016.

## 2. Historias de usuario

- **HU-1** Como cliente, quiero reemplazar un archivo subiendo otro con el mismo nombre, para conservar el anterior como versión.
- **HU-2** Como cliente, quiero ver el historial de un archivo (cuándo, quién, cuánto cambió), para saber qué pasó.
- **HU-3** Como cliente, quiero restaurar una versión anterior, para deshacer un cambio sin perder nada.
- **HU-4** Como cliente, quiero descargar una versión anterior, para recuperar su contenido sin restaurarla.
- **HU-5** Como cliente, quiero que Nimbo retenga tantas versiones como mi plan permite y me avise antes de perder la más antigua.
- **HU-6** Como equipo, queremos que nadie vea, baje ni restaure versiones de archivos a los que no tiene acceso.
- **HU-7** Como equipo, queremos un único registro de versiones que 016 y 021 reutilicen sin duplicar reglas.

## 3. Criterios de aceptación

> Valores (versiones retenidas, cuota) salen de `PlanLimits` (catálogo de `product-context.md` §3). Códigos `STORAGE_*`; el plan fija los nuevos.

### Crear versiones (HU-1, HU-7)
- **CA-1** (HU-1, RF-13) Dado un archivo propio, cuando sube otro con el mismo nombre en la misma carpeta y elige «Reemplazar» (tercera opción del diálogo de 005), entonces el archivo conserva su `id` y nombre, la nueva carga pasa a ser la versión actual, la anterior queda intacta en el historial y la descarga entrega el contenido nuevo.
- **CA-2** (HU-1, RF-12) — error: Dado que el tamaño nuevo excede la cuota o el máximo por archivo del plan, cuando inicia el reemplazo, entonces `422` `STORAGE_QUOTA_EXCEEDED` / `STORAGE_FILE_TOO_LARGE` con los mensajes de 005 y la versión actual no cambia.
- **CA-3** (HU-1, RF-14) — error: Dado un reemplazo cuyo contenido contradice su extensión, cuando se completa, entonces `422` `STORAGE_INVALID_FILE_TYPE` como en 005, no se crea versión y la actual sigue igual.
- **CA-4** (HU-1) Dos reemplazos simultáneos del mismo archivo producen dos versiones con números consecutivos distintos; la que completa al final queda como actual.
- **CA-5** (HU-7) Dado el registro de versión, cuando lo usa un reemplazo, una restauración o un origen `edicion`/`optimizacion` (probado con un doble), entonces aplica la misma numeración, cuota y retención, sin indexar nada (el evento `FileVersionCreated` lo agrega 019, D-11).

### Historial y descarga (HU-2, HU-4)
- **CA-6** (HU-2, RF-29) Dado un archivo con varias versiones, cuando el propietario abre su historial, entonces ve de la más reciente a la más antigua: número, fecha, autor de la acción, tamaño, cambio de tamaño frente a la anterior retenida (sin comparación si la anterior ya se podó; «Primera versión» para la 1), origen (carga, restauración, edición, optimización; la restauración indica el número de la versión de origen aunque esta ya se haya podado) y cuál es la actual.
- **CA-7** (HU-2, RF-29) Dado una versión con origen `edicion` que tiene participantes (aportados por 016), cuando se muestra, entonces lista a todos; sin participantes (cargas y restauraciones) muestra solo al autor de la acción.
- **CA-8** (HU-4, RF-09) Dado una versión retenida, cuando el propietario pide descargarla, entonces recibe una URL firmada de 5 min a un solo objeto, con descarga forzada y el nombre del archivo (reglas de 005 CA-13 a CA-15).

### Restaurar (HU-3)
- **CA-9** (HU-3, RF-13, RF-29) Dado una versión anterior, cuando se restaura, entonces se crea una **versión nueva** (origen `restauracion`, que guarda el número de la versión de origen) con ese contenido, que pasa a ser la actual; ninguna versión existente cambia ni se borra por restaurar, y `espacio_usado` sube en su tamaño.
- **CA-10** (HU-3) — error: Dado la versión que ya es la actual, cuando se restaura, entonces `409` `STORAGE_VERSION_ALREADY_CURRENT` «Esta ya es la versión actual.» y no cambia nada.
- **CA-11** (HU-3) — error: Dado una versión inexistente, ya podada o de otro archivo, cuando se restaura o descarga, entonces `404` `STORAGE_VERSION_NOT_FOUND`.
- **CA-12** (HU-3, RF-12) — error: Dado que el tamaño de la versión a restaurar no cabe en la cuota libre, cuando se restaura, entonces `422` `STORAGE_QUOTA_EXCEEDED` «Te faltan {bytes} de espacio para restaurar esta versión. Libera espacio o cambia de plan.» y no cambia nada.

### Retención (HU-5)
- **CA-13** (HU-5, RF-13) Dado un archivo que ya tiene las versiones retenidas de su plan (Personal 3, Pro 30, Equipo 60, Institucional 100), cuando se registra una nueva, entonces se elimina la más antigua (objeto y registro), nunca la actual, y `espacio_usado` baja en sus bytes.
- **CA-14** (HU-5) — error: Dado que falla el borrado del objeto de una versión podada, entonces su registro y el espacio no cambian, el error se registra sin nombres y el siguiente intento lo reintenta (patrón de 006 CA-20); nunca queda un registro sin objeto.
- **CA-15** (HU-5) Dado un archivo en el límite de retención, cuando el cliente va a reemplazar o restaurar, entonces la interfaz avisa qué versión se eliminará antes de confirmar.

### Papelera, aislamiento y roles (HU-6)
- **CA-16** (HU-6, RF-11) Dado un archivo en la papelera, cuando se pide su historial, descarga o restauración de versión, entonces `404` `STORAGE_NODE_NOT_FOUND`; al restaurarlo de la papelera conserva su historial completo.
- **CA-17** (HU-6, RNF-05) Dado dos clientes A y B, cuando B lista, descarga o restaura versiones de un archivo de A, o reemplaza un archivo de A, entonces todo responde `404` idéntico salvo `correlationId`, resuelto con `accessibleNodes(actor)` en la consulta. Se añade a `pnpm test:isolation`.
- **CA-18** (HU-6, RF-05) Dado un Administrador, Soporte u Operador, cuando llama cualquier ruta de versiones, entonces `403` `SHARED_FORBIDDEN`; sin token, `401` `SHARED_UNAUTHENTICATED`.
- **CA-19** (HU-6, RF-07, RNF-17) Dado un reemplazo, una restauración y una poda, cuando se revisan auditoría y bitácoras, entonces cada una deja un evento por `IAuditLogger` con actor, tipo, UUID del archivo y de la versión, número, bytes y `correlationId`, y **nunca** nombres de archivo, contenido, URLs firmadas ni claves de objeto.

### Interfaz (RNF-13, RNF-14)
- **CA-20** (HU-2, HU-3, HU-4) Dado la ficha del archivo, cuando el cliente la abre, entonces ve el historial (CA-6) con «Descargar» en cada versión y «Restaurar» en todas salvo la actual; restaurar pide confirmación que indica el espacio que usará; estados: historial con una sola versión, restaurando (> 2 s), error con «Reintentar»; a 360 y 1440 px, en español, sin violaciones serias de axe.

## 4. Reglas de negocio

- **RN-1** Versiones retenidas por plan: de `PlanLimits` (`IPlanLimitsProvider`), nunca en código. Cuenta la versión actual (D-2).
- **RN-2** Una versión es inmutable: nunca se edita, solo se crea o se poda. Restaurar copia contenido a una versión nueva.
- **RN-3** Todas las versiones cuentan en `espacio_usado` (D-1); registrar suma y podar resta (DF-38). La cuota se valida al iniciar, antes de transferir bytes (005 CA-4), sin descontar una poda futura.
- **RN-4** Número de versión consecutivo por archivo (1, 2, 3…), sin reutilizarse tras una poda.
- **RN-5** Autoría: toda versión guarda quién ejecutó la acción; los participantes de edición los aporta 016.
- **RN-6** El historial muestra el cambio de **tamaño**; no hay comparación de contenido ni atribución párrafo a párrafo (§9).
- **RN-7** Solo el propietario ve, descarga, restaura y reemplaza (nivel Propietario; D-5). Sin suplantación.
- **RN-8** Tamaños en `bigint`, identificadores UUID, `clave_objeto` nunca sale de la API.
- **RN-9** Restaurar valida solo la cuota, no el máximo por archivo: el contenido ya estaba guardado (D-8). Reemplazar valida ambos (CA-2).
- **RN-10** Las versiones solo las elimina la poda por retención o la purga del archivo; no hay borrado manual (D-6).

## 5. Seguridad y privacidad

- **¿Toca datos de un cliente?** Sí, contenido y metadatos de versiones → pruebas de aislamiento (CA-17) en `pnpm test:isolation`; RLS de `version_archivo` ya existe (005) y sigue sin política para roles internos.
- **Auditoría (RF-07):** reemplazo, restauración y poda (CA-19). **Nunca** en bitácoras: nombres, contenido, URLs firmadas, claves de objeto.
- **Roles internos:** `403` en todo (CA-18). Soporte restaura papelera (011), no versiones, y no ve contenido.
- **Límite de tasa:** descarga de versión y reemplazo reutilizan los de 005 (RNF-07); las cifras las fija el plan.
- **Integridad:** el reemplazo valida tipo y tamaño reales como en 005; una versión podada no se puede reconstruir.

## 6. Experiencia de usuario

| Pantalla | Mockup (`docs/design/mockups/…`) | Estados requeridos | Estado del mockup |
|---|---|---|---|
| Ficha de archivo con historial de versiones | `storage/ficha-archivo/` (ya cubre «Historial con autoría», inventario §7) | default, una-version, cargando, error, confirmar-restauracion, aviso-de-poda, restaurando, restaurada, error-cuota, error-version-no-encontrada, no-encontrado, descarga-preparando | Borrador; completo (360 y 1440 px, axe sin violaciones) |
| Diálogo de nombre repetido (005) con «Reemplazar» | `storage/carga/` (`nombre-repetido`) | nombre-repetido, nombre-repetido-varios, nombre-repetido-poda | Borrador; completo (360 y 1440 px) |

- Mensajes clave (español, tuteo, con acción): «Esta ya es la versión actual.» · «Te faltan {bytes} de espacio para restaurar esta versión. Libera espacio o cambia de plan.» · confirmar: «Se creará una versión nueva con el contenido de la versión {n}. Usará {tamaño} de tu espacio.» · poda al restaurar: «Tu plan conserva {n} versiones. Al continuar se eliminará la versión {k}, la más antigua.» · poda al reemplazar: «Al reemplazar se eliminará la versión {k}, la más antigua.» · éxito: «Restauraste la versión {n} como versión {m}.» (no menciona la poda: ocurre después y puede reintentarse)
- Mockups completados por ui-designer (2026-10-08); el paquete anterior queda como histórico en `ficha-archivo--vision.html`.
- El diálogo de nombre repetido pasa a tres acciones: «Cancelar», «Reemplazar (nueva versión)» y «Conservar ambos» (principal, con el foco inicial) (D-4); su título pasa a «Ya tienes un archivo con este nombre» (cambia la decisión 3 de 005, D-12); «Reemplazar» avisa qué versión se eliminará si el archivo está en el límite (CA-15). Con «Aplicar a los demás» y «Reemplazar», cada archivo que esté en su límite vuelve a preguntar con su propio aviso (matiza la decisión 11 de 005, D-12).

## 7. Fuera de alcance

- Sesiones de edición, participantes, `sesion_edicion_id`, `UNIQUE` por sesión (DF-05), callbacks de ONLYOFFICE y presencia (016, 015).
- Indexar o reindexar versiones (019); optimizar y conservar el original (021); vista previa de versiones (017).
- Comparar contenido entre versiones, atribución párrafo a párrafo y reportes de contribución (`product-context.md` §9).
- Borrar versiones sueltas a mano; fijar o «proteger» versiones; nombrar versiones.
- Roles de editor y lector sobre versiones (llegan con 012; hoy solo existe el propietario).
- Bloqueo de reemplazo y restauración en cuenta vencida (solo lectura): lo añade 010 (RF-23), como pasó con 005.
- Cambiar los valores del catálogo o aplicar la poda de inmediato al bajar de plan (010).

## 8. Preguntas

Sin preguntas abiertas. Decisiones de Adrián (2026-10-07), con la razón y la fuente de cada una:

- [RESUELTA] **D-1 Cuota:** todas las versiones cuentan; registrar suma, podar resta, y la validación inicial no descuenta una poda futura → RN-3. Fuente: DF-38, plan 007 D-3 y D-11.
- [RESUELTA] **D-2 Retención:** «versiones retenidas» incluye la actual (Personal 3 = actual + 2); al registrar la N+1 se poda la más antigua → RN-1, CA-13. Fuente: `product-context.md` §3.
- [RESUELTA] **D-3 Restaurar:** crea versión nueva (`origen = restauracion`), no mueve el puntero → CA-9. Fuente: mockup `ficha-archivo`, `design-model.md`, `product-context.md` §5. Se matiza «ninguna se borra» con la poda (§6).
- [RESUELTA] **D-4 «Reemplazar»:** se añade al diálogo de nombre repetido de 005 → CA-1, §6. Fuente: 005 RN-5 y §11.
- [RESUELTA] **D-5 Roles:** solo el propietario restaura y reemplaza; editor y lector llegan con 012/016 → RN-7, §7. Fuente: `product-context.md` §2.
- [RESUELTA] **D-6 Borrado manual:** no se borran versiones sueltas → RN-10. Fuente: YAGNI (Art. V), RF-13/RF-29.
- [RESUELTA] **D-7 Descarga y vista previa:** descarga sí (CA-8), vista previa no (017). Fuente: RF-09, RNF-06.
- [RESUELTA] **D-8 Restaurar y máximo por archivo:** solo cuota → RN-9, CA-12. Fuente: el contenido ya estaba guardado.
- [RESUELTA] **D-9 Participantes antes de 016:** solo el autor de la acción → CA-7. Fuente: DF-17/DF-18.
- [RESUELTA] **D-10 Interfaz:** el historial vive en la ficha de archivo, sin panel lateral → CA-20, §6. Fuente: `ui-guidelines.md` §7. Pendiente como tarea (no pregunta): estados del mockup antes de `Lista` (§6).
- [RESUELTA] **D-11 Evento de versión nueva:** se difiere a 019, su primer consumidor; 014 no publica eventos. Fuente: YAGNI (Art. V.2), decisión de Adrián en el plan.
- [RESUELTA] **D-12 Ajustes de los mockups:** número de origen persistente y cambio de tamaño nulo sin anterior retenida (CA-6); la versión actual no ofrece «Restaurar» (CA-20); textos y título del diálogo de nombre repetido y nueva pregunta por archivo en el límite con «Aplicar a los demás» (§6). Fuente: revisión de mockups, decisión de Adrián.
- [RESUELTA] Papelera: las versiones se conservan (006 CA-10); el historial no es accesible mientras está en ella (006 RN-4) y la purga las elimina todas → CA-16.
- [RESUELTA] Medidor de 007: la conciliación ya suma todas las versiones (007 plan D-11); 014 mantiene el contador (RN-3).

## 9. Registro de cambios

| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-10-07 | Creación en `Borrador` con 10 preguntas abiertas (4 bloqueantes) | `/spec 014` | — |
| 2026-10-07 | Las 10 preguntas pasan a decisiones D-1 a D-10 (se aceptan las opciones recomendadas); se agregan RN-9 y RN-10; el pendiente del mockup queda como tarea previa a `Lista` (§6) | Respuesta de Adrián | Adrián |
| 2026-10-08 | CA-5 sin el evento `FileVersionCreated` (D-11, se difiere a 019); plan aprobado | Revisión del plan | Adrián |
| 2026-10-08 | Ajustes tras los mockups (D-12): CA-6, CA-9, CA-20 y §6 (estados completos, textos, título del diálogo, «Aplicar a los demás»); estado → `Lista` | Revisión de mockups | Adrián |
