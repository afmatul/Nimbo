# Spec 007 — Cuota y explorador

> Qué y por qué, en ≤ 150 líneas. El cómo va en `./plan.md` (obligatorio).

| Campo | Valor |
|---|---|
| Estado | En revisión (2026-10-02; plan aprobado por Adrián el 2026-10-01) |
| Dueño | Adrián (1) |
| Fase | 1 |
| Requisitos | RF-12, RNF-14 (principales); aplican RNF-05, RNF-13, RNF-17 |
| Depende de | 005 (archivos, cuota reservada, descarga), 006 (`GET /folders/contents` con migas y paginación por cursor; papelera), 006a (`PlanLimits`, `IPlanLimitsProvider`) |
| Módulo | M2 `storage` |
| Casos de uso | CU-26 «consultar espacio», CU-38 «explorar archivos» |
| Última actualización | 2026-10-01 |

## 1. Contexto y objetivo
RF-12 pide mostrar el espacio consumido y bloquear el exceso de cuota o tamaño. **El bloqueo ya lo entrega 005**
(CA-3, CA-4, CA-23: tamaño máximo, cuota total y reserva concurrente al iniciar la carga); 007 **no lo repite**. Lo que
aporta 007: (1) el **medidor** de espacio (usado, plan, disponible, desglose por tipo), (2) **orden** del explorador
sobre `GET /folders/contents` de 006 (que ya trae migas y paginación por cursor), con sus estados de carga y error
(RNF-14) y (3) la **conciliación** de `espacio_usado` que 005 difirió (plan 005 D-14, ADR-0021). Resultado: el cliente
sabe cuánto espacio tiene, en qué se va y qué liberar, y encuentra sus archivos en listas largas.

## 2. Historias de usuario
- **HU-1** Como cliente, quiero ver cuánto espacio uso, cuánto me queda y en qué se va (por tipo), para decidir qué liberar.
- **HU-2** Como cliente, quiero que el medidor se actualice tras subir, eliminar o purgar, para confiar en la cifra.
- **HU-3** Como cliente, quiero ordenar mis archivos y recorrerlos por páginas, para encontrar lo que busco en carpetas grandes.
- **HU-4** Como cliente, quiero un aviso claro cuando mi cuota se acerca al límite, con una acción para liberar espacio.
- **HU-5** Como equipo, queremos que la cifra de espacio coincida con la realidad y que ninguna cuenta vea el espacio o los archivos de otra.

## 3. Criterios de aceptación
> Cuota y máximo por archivo salen de `IPlanLimitsProvider` (catálogo en BD). Esta spec no fija cifras de plan: el catálogo se revisará más adelante y ninguna prueba depende de un valor concreto.

### Medidor de espacio (HU-1, HU-2, HU-4, RF-12)
- **CA-1** (HU-1, RF-12) Dado un cliente con archivos propios, cuando abre el resumen, entonces ve el nombre de su plan («Tu plan»), espacio usado, cuota de su plan, espacio disponible y porcentaje, con los valores que entrega `IPlanLimitsProvider`, bytes exactos en `bigint` formateados a GB/MB, y sin ofertas de ampliación.
- **CA-2** (HU-1) Dado archivos de varios formatos, cuando abre el resumen, entonces ve el desglose en Documentos (`.docx`, `.pdf`, `.txt`, `.md`, `.xlsx`, `.pptx`), Imágenes y Otros, y la suma de segmentos más la papelera coincide con el espacio usado.
- **CA-3** (HU-1, 006 CA-21) Dado elementos en la papelera, cuando abre el resumen, entonces el espacio de la papelera se muestra como segmento aparte, cuenta dentro del usado y de la cuota total, y baja solo cuando se purga. Lo arrastrado por una carpeta eliminada se cuenta una sola vez.
- **CA-4** (HU-2, RF-12) Dado que el cliente completa una carga, manda algo a la papelera o purga, cuando el medidor se vuelve a pedir tras esa operación, entonces la cifra refleja el cambio sin recargar la sesión. No hay empuje por `realtime` (015), como en DF-58.
- **CA-5** (HU-4, RF-12) Dado un uso en los tramos de `QuotaBar` de `ui-guidelines.md` §4 (70–89 % y 90–100 %), cuando el cliente ve el medidor o la barra lateral, entonces aparece el texto de aviso de ese tramo («Tu cuota está al X %» / «Espacio casi agotado»; al 100 %, «Espacio agotado.») con la acción «Liberar espacio», y el color nunca es el único indicador.
- **CA-6** (HU-1) Dado el plan del cliente, cuando abre el resumen, entonces recibe también su tamaño máximo por archivo (`PlanLimits.maxFileBytes`), con el que el explorador de 005 completa el `{máximo}` de sus estados vacío y arrastre.
- **CA-7** (HU-4, 005 CA-4) Dado un rechazo por cuota en la carga, cuando el cliente pulsa «Liberar espacio», entonces llega al resumen de espacio (el destino que 005 dejó provisional en Mis archivos).
- **CA-8** (RNF-14) — error: Dado que falla la carga del resumen, cuando se muestra, entonces el cliente ve la causa («No pudimos calcular tu espacio. Tus archivos siguen guardados.») y «Reintentar»; mientras carga ve un estado de carga; el resto de la app sigue usable.

### Explorador: orden y paginación (HU-3, RNF-14)
- **CA-9** (HU-3) Dado una carpeta con más elementos que una página, cuando el cliente la abre y pide más, entonces recorre todas las páginas con el `nextCursor` de `GET /folders/contents`, carpetas primero (006 CA-5), sin duplicados ni omisiones.
- **CA-10** (HU-3) Dado el listado, cuando el cliente ordena por nombre, tamaño, fecha de modificación o fecha de creación, ascendente o descendente, entonces el orden se aplica dentro del grupo de carpetas y del de archivos y se conserva al paginar. Sin pedir orden, es el de 006: fecha de creación descendente (más recientes primero), carpetas primero. Las carpetas no tienen tamaño (006 RN-6): el orden por tamaño aplica a archivos.
- **CA-11** (HU-3) — error: Dado un `sort` (distinto de `name`, `size`, `updated` o `created`), un `dir` o un `cursor` inválidos (campo desconocido, o un cursor emitido para otro orden), cuando se envía, entonces se responde `400` `STORAGE_INVALID_QUERY` con el campo en falla (`fields`) y no cambia nada. Un `limit` fuera de rango no es error: se ajusta al rango permitido, como en 006.
- **CA-12** (RNF-14) Dado un listado que tarda más de 2 s, cuando el cliente espera, entonces ve «Cargando tus archivos…» (005) sin bloquear la subida; si falla, ve causa y «Reintentar» (005 CA-21); cambiar el orden o pedir más páginas conserva lo ya visible mientras llega la respuesta.

### Conciliación (HU-5, RF-12)
- **CA-13** (HU-5, RF-12) Dado una cuenta cuyo `espacio_usado` difiere de la suma real (archivos vivos y en papelera), cuando corre la conciliación programada, entonces `espacio_usado` queda igual a la suma real y se registra un evento técnico con el UUID de la cuenta y la diferencia, sin nombres de archivos.
- **CA-14** (HU-5) Dado una cuenta ya coherente, cuando corre la conciliación, entonces no cambia nada. Una cuenta con carga en curso no pierde su reserva ni se cuenta dos veces (005 CA-23).
- **CA-15** (HU-5, RF-12) — error: Dado que la conciliación falla para una cuenta, entonces las demás se procesan, esa cuenta conserva su valor y el siguiente ciclo la reintenta.

### Aislamiento y roles (HU-5, RNF-05)
- **CA-16** (HU-5, RNF-05) Dado dos clientes A y B, cuando B pide el resumen o un listado ordenado, entonces solo recibe cifras y archivos propios; el listado de una carpeta de A responde `404` idéntico a una inexistente (`accessibleNodes(actor)` dentro de la consulta). Se añade a `pnpm test:isolation`.
- **CA-17** (RF-05) Dado un Administrador, un Soporte o un Operador, cuando llaman el resumen o el listado, entonces `403` `SHARED_FORBIDDEN`; sin token, `401` `SHARED_UNAUTHENTICATED`.

## 4. Reglas de negocio
- **RN-1** Cuota y máximo por archivo salen de `IPlanLimitsProvider`; el cálculo de «cabe o no» al subir sigue siendo de 005 (`QuotaService`).
- **RN-2** El espacio usado cuenta archivos vivos y los de la papelera hasta su purga (006 RN-2, CA-21); las reservas de cargas activas se tratan como en 005 RN-13.
- **RN-3** Tamaños en `bigint` y UUID (DF-06); el desglose y los porcentajes se calculan sobre bytes exactos, nunca sobre texto formateado.
- **RN-4** Los tramos de aviso y sus textos son los de `QuotaBar` (`ui-guidelines.md` §4); no se inventan umbrales. Al 100 % el título es «Espacio agotado.».
- **RN-5** El tamaño de una carpeta se calcula, no se guarda (006 RN-6); ordenar por tamaño aplica a archivos.
- **RN-6** El tamaño de página es configuración técnica, no regla de negocio; lo fija el plan. El orden inicial es el de 006: fecha de creación descendente, con las carpetas primero.

## 5. Seguridad y privacidad
- ¿Toca datos de cliente? **Sí**: cifras de espacio y nombres de archivos propios → pruebas de aislamiento (CA-16) y de la conciliación bajo RLS (patrón ADR-0021; sin `BYPASSRLS`).
- Auditoría (RF-07): leer el resumen o el listado no se audita. La corrección de `espacio_usado` deja un evento técnico (CA-13). **Nunca** en bitácoras: nombres de archivos o carpetas, contenido, claves de objeto.
- Roles internos: `403` en todo (CA-17); su vista de metadatos de un cliente es de 011, no de esta spec.

## 6. Experiencia de usuario
| Pantalla | Mockup (`docs/design/mockups/…`) | Estados requeridos | Estado del mockup |
|---|---|---|---|
| Resumen de espacio | `storage/resumen-espacio/` | default, cargando, error, tramo 70–89 %, tramo 90–100 %, cuota llena, papelera con espacio | Corregido y completo (decisiones aprobadas el 2026-10-01 en su README) |
| Explorador: orden y «Cargar más» | `storage/explorador/` (lista) | default, ordenado, más páginas, cargando, error (los de 005 y 006 se reutilizan) | Definidos; el menú de orden se actualiza para que el valor por defecto sea «Fecha de creación, más recientes primero» |
| Barra lateral: tarjeta de cuota | `shared/layout/` | tramos 70 y 90 % | Los dibuja 007 (README del layout) |

- Mensajes clave (español, tuteo, con acción): «Tu cuota está al X %.» · «Espacio casi agotado.» (90–99 %) · «Espacio agotado.» (100 %) · «No pudimos calcular tu espacio. Tus archivos siguen guardados.» con «Reintentar».
- Sin cifras de plan ni «Ampliar plan» en el resumen; «Ver planes» sigue oculto hasta 008. A 360 y 1440 px, AA, sin violaciones serias de axe (RNF-13).

## 7. Fuera de alcance
- Bloqueo por tamaño o cuota al subir y reserva concurrente (005); eliminar, restaurar y purgar (006).
- Filtros del explorador (pasan a 018, búsqueda); cuadrícula y selección múltiple (se difieren por YAGNI; 006 §7 los asignaba a 007).
- Consultas al agente del ciclo (RF-34, 020), renovación y vencimiento (010), ofertas de ampliación (008) y optimizador (021): el mockup anterior los mostraba y se retiran de 007.
- Recientes y Favoritos (PD-34, sin RF); compartidos (012); espacio de versiones anteriores de un archivo (014); ajuste de cuota por el Administrador (011, DF-26).
- Empuje en tiempo real del medidor a otras pestañas (015); conciliación a pedido (solo programada). Todo lo de `product-context.md` §9.

## 8. Preguntas
Sin preguntas abiertas.
- [RESUELTA] P-1 Se corrige el mockup `resumen-espacio` y se completan sus estados (`ui-designer`); la spec no fija cifras de plan ni ofertas de ampliación, el catálogo se revisará más adelante → CA-1, §6, §7 (2026-10-01, Adrián)
- [RESUELTA] P-2 El medidor se actualiza tras cada operación del propio cliente, sin empuje de `realtime` (015), como en DF-58 → CA-4 (2026-10-01, Adrián)
- [RESUELTA] P-3 Tres categorías: Documentos (docx, pdf, txt, md, xlsx, pptx), Imágenes y Otros; la papelera como segmento aparte → CA-2, CA-3 (2026-10-01, Adrián)
- [RESUELTA] P-4 007 solo agrega orden y paginación al explorador; filtros a 018; cuadrícula y selección múltiple diferidas → CA-9, CA-10, §7 (2026-10-01, Adrián)
- [RESUELTA] P-5 Tamaño de página como configuración (lo fija el plan); orden inicial el de 006 (fecha de creación descendente, carpetas primero), corregido por Adrián el 2026-10-01 → RN-6, CA-10
- [RESUELTA] P-6 `{máximo}` del explorador sale del resumen → CA-6 (2026-10-01, Adrián)
- [RESUELTA] P-7 CU-26 es «consultar espacio» y CU-38 es «explorar archivos» → cabecera (2026-10-01, Adrián)
- [RESUELTA] P-8 La conciliación es solo programada → §7 (2026-10-01, Adrián)
- [RESUELTA] P-9 Un `limit` fuera de rango se sigue ajustando (`clampLimit`, sin romper 006); solo `sort`, `dir` o cursor inválidos responden `400` con `fields` → CA-11 (2026-10-01, Adrián)
- [RESUELTA] P-10 Se ordena por nombre, tamaño o fecha de modificación; los índices los decide el plan verificando RNF-14 (≤ 2 s) → CA-10 (2026-10-01, Adrián)
- Nota para el plan (no es pregunta): caché de límites de plan (PD-58) si el medidor lo pide en cada operación.

## 9. Registro de cambios
| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-10-01 | Creación en `Borrador` con 17 CA y 8 preguntas | `/spec 007` | — |
| 2026-10-01 | Resueltas P-1 a P-10. «Depende de» y CA-9 a CA-12 usan `GET /folders/contents` (006 reemplazó `GET /files`) con `sort`/`dir`; CA-11 deja el `limit` ajustable (P-9); CA-1 y §6 sin cifras de plan ni ofertas; §7 con filtros → 018 y cuadrícula/selección múltiple diferidas | Respuestas de Adrián | Adrián |
| 2026-10-01 | Corrección de Adrián: P-5, RN-6 y CA-10 vuelven al orden de 006 (`created` descendente, carpetas primero); `created` se agrega a los valores de orden (CA-10, CA-11). RN-4, CA-5 y §6: al 100 % el título es «Espacio agotado.». Estado `Lista` tras aprobar el plan | Decisiones de Adrián sobre el orden y el mockup `resumen-espacio` | Adrián |
| 2026-10-01 | CA-1: el resumen trae también el nombre del plan (`planName`) para la tarjeta «Tu plan» | La web no podía mostrarlo con el contrato de T-01 | Adrián |
