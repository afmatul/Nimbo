# Spec 006 — Carpetas y papelera

> Qué y por qué. El cómo irá en `./plan.md` (obligatorio). Las decisiones de Adrián del 2026-09-30 sobre las preguntas de la v1 están incorporadas (ver §9).

| Campo | Valor |
|---|---|
| Estado | En curso (2026-09-30: T-01 y T-02 hechas en `feat/006-carpetas-y-papelera`; plan aprobado por Adrián el 2026-09-30) |
| Dueño | Adrián (1) |
| Fase | 1 |
| Requisitos | RF-10, RF-11 (principales); aplican RF-07, RF-12 (parcial), RNF-05, RNF-13, RNF-14, RNF-17 |
| Depende de | 005 (archivos, cargas, cuota, `FileService`), 003 (`Actor`, `accessibleNodes`, RLS), 006a (retención en papelera por plan), 004 (solo el puerto `IAuditLogger`, ya declarado por 005) |
| DF | DF-15 (`FoldersController`), DF-33 (`carpeta_id`, `carpeta_destino_id`), DF-40 (ADR-0011: tablas `archivo` y `carpeta` separadas), DF-52 y PD-19 (purga bajo RLS, patrón ya usado por 005) |
| Última actualización | 2026-09-30 |

## 1. Contexto y objetivo
005 dejó todos los archivos en una sola raíz y sin forma de borrarlos. Esta spec permite organizar el espacio en carpetas
jerárquicas (RF-10) y eliminar sin perder nada de inmediato: lo eliminado va a una papelera donde se restaura hasta que
vence la retención del plan y luego se purga (RF-11). Resultado observable: el cliente crea, renombra, mueve y elimina
carpetas y archivos, sube a la carpeta que tiene abierta, restaura desde la papelera y recupera espacio cuando algo se purga.

## 2. Historias de usuario
- **HU-1** Como cliente, quiero crear, renombrar y navegar carpetas anidadas, para ordenar mis archivos.
- **HU-2** Como cliente, quiero subir y mover archivos y carpetas a la carpeta que elija, para que cada cosa quede donde corresponde.
- **HU-3** Como cliente, quiero que eliminar mande el elemento a una papelera y poder restaurarlo, para corregir errores.
- **HU-4** Como cliente, quiero saber cuánto tiempo queda a cada elemento y cuánto espacio ocupa la papelera, y vaciarla si necesito espacio.
- **HU-5** Como equipo, queremos que ninguna cuenta vea ni toque carpetas o papelera de otra, y que ningún rol interno acceda a ellas.

## 3. Criterios de aceptación
> Valores (retención, tamaño, profundidad máxima) salen del catálogo o de la configuración (`PlanLimits`/`IPlanLimitsProvider`), nunca del código. Códigos `STORAGE_*` (003 D-6); el plan fija los nuevos.

### Carpetas (HU-1, HU-2, RF-10)
- **CA-1** (HU-1) Dado un cliente con sesión, cuando crea una carpeta en la raíz o dentro de otra propia, entonces aparece vacía en esa ubicación, con `id` UUID.
- **CA-2** (HU-1) — error: Dado un nombre vacío, de solo espacios, con separadores de ruta o de más de 255 caracteres, cuando crea o renombra, entonces se responde `400` con el campo en falla (`fields`) y no cambia nada.
- **CA-3** (HU-1) — error: Dado que ya existe una carpeta con ese nombre en la misma carpeta (sin distinguir mayúsculas; las de la papelera no cuentan), cuando crea, renombra o mueve una carpeta, entonces se responde `409` `STORAGE_NAME_CONFLICT` con «Ya existe una carpeta llamada «{nombre}» aquí. Elige otro nombre.» y no se fusiona nada. Al **mover** una carpeta, el mensaje es «Ya existe una carpeta llamada «{nombre}» en {destino}. Elige otro destino o cambia el nombre de la carpeta.» Un archivo y una carpeta sí pueden compartir nombre en la misma carpeta (la unicidad es por tipo).
- **CA-4** (HU-1) Dado un archivo o carpeta propios, cuando se renombra, entonces el nuevo nombre se ve en el explorador; los archivos siguen la regla de nombre repetido de 005 (CA-6) en su carpeta. Al renombrar un archivo la extensión queda fija (se muestra como sufijo del campo, no editable) y el tipo no cambia.
- **CA-5** (HU-1) Dado una carpeta propia, cuando se abre, entonces se listan sus subcarpetas y archivos directos (carpetas primero) con migas desde la raíz; carpeta ajena, inexistente o en la papelera responde `404` `STORAGE_NODE_NOT_FOUND`.
- **CA-6** (HU-2) Dado que el cliente tiene una carpeta abierta, cuando sube archivos, entonces quedan en esa carpeta y el nombre repetido (CA-6 de 005) se evalúa en ella, no en la raíz. Si el destino es ajeno, inexistente o está en la papelera, `404` y no se crea carga; si pasa a la papelera durante la carga, al completar responde `404`, se elimina lo subido y se libera la reserva.
- **CA-7** (HU-2) Dado un archivo o carpeta propios, cuando se mueve a otra carpeta propia o a la raíz, entonces aparece en el destino y deja el origen; el tamaño de la carpeta, `espacio_usado` y las versiones no cambian. Nombre repetido en destino: carpeta → `409` `STORAGE_NAME_CONFLICT` con el mensaje de mover de CA-3; archivo → «Conservar ambos» / «Cancelar», como 005. El diálogo «Mover a…» permite crear una carpeta nueva dentro del nodo seleccionado del árbol, con la misma operación y validaciones de CA-1, CA-2, CA-3 y CA-9; al crearla queda seleccionada como destino.
- **CA-8** (HU-2) — error: Dado mover una carpeta dentro de sí misma o de uno de sus descendientes, cuando se envía, entonces `422` `STORAGE_INVALID_MOVE` con «No puedes mover una carpeta dentro de sí misma.» y nada cambia.
- **CA-9** (HU-1) — error: Dado que la carpeta destino ya está a la profundidad máxima configurable (por ejemplo 10 niveles; el valor lo fija el plan como configuración, no como regla de negocio), cuando se crea o se mueve una carpeta dentro, entonces `422` `STORAGE_FOLDER_DEPTH_EXCEEDED` con «Llegaste al máximo de {n} niveles de carpetas. Crea la carpeta en otro lugar.»

### Papelera (HU-3, HU-4, RF-11)
- **CA-10** (HU-3) Dado un archivo propio, cuando se usa «Mover a la papelera» (sin confirmación previa), entonces sale del explorador y su descarga responde `404`; sus bytes y versiones se conservan, `espacio_usado` no cambia, aparece en la papelera con su fecha de purga y se muestra el aviso «Movimos «{nombre}» a la papelera.» con «Ver papelera».
- **CA-11** (HU-3) Dado una carpeta propia con contenido, cuando se usa «Mover a la papelera», entonces la carpeta y todo su subárbol salen del explorador y de toda descarga (`404`) y la papelera muestra **un solo elemento** (la carpeta) con el tamaño total de su contenido (suma en `bigint`).
- **CA-12** (HU-4) Dado un cliente con elementos eliminados, cuando abre la papelera, entonces ve, por elemento: nombre, tipo, ubicación original, tamaño, fecha de eliminación y días restantes; arriba, el espacio total que ocupa la papelera y la retención de su plan; paginada y de lo más reciente a lo más antiguo. No hay descarga ni vista previa desde la papelera.
- **CA-13** (HU-3) Dado un elemento en la papelera con retención vigente, cuando se restaura, entonces vuelve a su ubicación original con su contenido y versiones; un archivo eliminado antes por separado dentro de una carpeta restaurada sigue en la papelera.
- **CA-14** (HU-3) Dado que al restaurar ya existe un elemento del mismo tipo con ese nombre en la ubicación, entonces se restaura como «nombre (n)» (primer número libre) y se informa «Restauramos «{nombre}» como «{nuevo}» porque ya existía uno con ese nombre.»
- **CA-15** (HU-3) Dado que la carpeta original ya no existe o está en la papelera, cuando se restaura, entonces el elemento vuelve a la raíz con el aviso «La carpeta original ya no está disponible. Restauramos «{nombre}» en Mis archivos.» Si la carpeta original existe pero restaurar superaría la profundidad máxima (CA-9), `422` `STORAGE_FOLDER_DEPTH_EXCEEDED` con «No podemos restaurar «{nombre}» aquí porque superaría {n} niveles de carpetas. Mueve la carpeta original a un nivel más alto y vuelve a intentarlo.» y nada cambia.
- **CA-16** (HU-3) — error: Dado un identificador inexistente, ajeno o ya purgado, cuando se restaura o elimina definitivamente, entonces `404` `STORAGE_NODE_NOT_FOUND`.
- **CA-17** (HU-3, HU-4) Dado una selección de varios elementos, cuando se restaura, entonces cada uno sigue CA-13 a CA-15 y se informa el resultado por elemento.
- **CA-18** (HU-4) Dado un elemento de la papelera o la papelera completa, cuando el cliente confirma «Eliminar definitivamente» o «Vaciar papelera» (diálogo «Esta acción no se puede deshacer. Liberarás {tamaño} de espacio.»), entonces se eliminan sus objetos y registros y `espacio_usado` baja en esos bytes; sin confirmación no ocurre nada. Un elemento suelto se elimina al momento. Al vaciar, sus elementos se muestran como «Vaciando…» y el espacio baja cuando termina la purga.
- **CA-19** (HU-4, RF-11) Dado un elemento eliminado, entonces su fecha de purga queda fijada al eliminar (eliminación + retención del plan vigente en ese momento: 7, 30, 60 o 90 días según Personal, Pro, Equipo o Institucional) y no cambia si luego cambia el plan; cuando esa fecha pasa y corre la purga programada, entonces se eliminan sus objetos, versiones y registros y `espacio_usado` baja en sus bytes, **aunque la cuenta esté vencida**; antes de esa fecha no se toca. Una carpeta se purga con todo su contenido.
- **CA-20** (HU-4) — error: Dado que falla el borrado de un objeto durante una purga, entonces el registro y el espacio de ese elemento no cambian, el error se registra sin nombres y el siguiente ciclo lo reintenta; nunca queda `espacio_usado` menor al real ni un registro sin objeto.
- **CA-21** (HU-3, RF-12) Dado el ciclo eliminar → restaurar → eliminar → purgar, entonces `espacio_usado` solo cambia en la purga y la papelera cuenta contra la cuota total (005, CA-4) hasta entonces.

### Aislamiento, roles y auditoría (HU-5, RNF-05, RF-07, RNF-17)
- **CA-22** (HU-5, RNF-05) Dado dos clientes A y B, cuando B intenta listar, crear dentro de, renombrar, mover, eliminar, restaurar o purgar carpetas, archivos o papelera de A, o mover algo propio a una carpeta de A, entonces todo responde `404` idéntico salvo `correlationId`; el acceso se resuelve con `accessibleNodes(actor)` dentro de la consulta, que ahora incluye carpetas y excluye el subárbol en la papelera. Se añade a `pnpm test:isolation`.
- **CA-23** (HU-5, RF-05) Dado un Administrador, un Soporte o un Operador, cuando llaman cualquier ruta de esta spec, entonces `403` `SHARED_FORBIDDEN`; sin token, `401` `SHARED_UNAUTHENTICATED`.
- **CA-24** (RF-07, RNF-17) Dado eliminar, restaurar, eliminar definitivamente, vaciar y purgar (manual o programada), cuando se revisan auditoría y bitácoras, entonces cada una deja un evento por `IAuditLogger` con actor, tipo, UUID del recurso, cantidad de elementos, bytes y `correlationId`, y **nunca** nombres de archivos o carpetas. Crear, renombrar y mover no se auditan.
- **CA-25** (RNF-13, RNF-14) Dado la interfaz de carpetas y papelera, cuando se usa a 360 y 1440 px, entonces cada estado de §6 existe en español, con causa y acción correctiva, sin violaciones serias de axe.

## 4. Reglas de negocio
- **RN-1** Retención en papelera: 7/30/60/90 días del catálogo (`product-context.md` §3), leída de `PlanLimits`; nunca escrita en código ni en esta spec como constante. Hoy `PlanLimits` solo trae cuota y máximo por archivo: el plan decide cómo se amplía (DF-51).
- **RN-2** Eliminar es lógico y reversible hasta la purga; solo la purga borra bytes y libera cuota (DF-38: 006 reduce `espacio_usado`).
- **RN-3** Eliminar una carpeta lleva todo su subárbol con **la misma fecha de eliminación** (y de purga); restaurarla devuelve solo lo que se eliminó con ella.
- **RN-4** Un archivo o carpeta en la papelera no se lista, descarga, mueve ni cuenta para nombres repetidos; solo se restaura o purga.
- **RN-5** Nombres: sin distinguir mayúsculas, únicos entre hermanos vivos **del mismo tipo**, máximo 255 caracteres, sin separadores de ruta.
- **RN-6** Tamaños y `espacio_usado` en `bigint`; identificadores UUID; el tamaño de una carpeta se calcula, no se guarda.
- **RN-7** Solo el propietario elimina, restaura y purga (nivel Propietario). Soporte restaura con motivo desde 011.
- **RN-8** La purga corre sin actor sobre RLS con el patrón de 005 (función mínima + `withActor` por dueño); no se da `BYPASSRLS`.

## 5. Seguridad y privacidad
- **¿Toca datos de cliente?** Sí → pruebas de aislamiento (CA-22) y de la purga bajo RLS (DF-52).
- **Auditoría (RF-07):** CA-24. Auditar crear, renombrar y mover podría agregarse en el futuro; no se implementa ahora (YAGNI). **Nunca en bitácoras:** nombres de archivos o carpetas, contenido, claves de objeto, URLs firmadas.
- **Roles internos:** `403` en todo (CA-23). La restauración limitada de Soporte (matriz, nota ¹) llega con 011; aquí no existe.

## 6. Experiencia de usuario
| Pantalla | Mockup (`docs/design/mockups/…`) | Estados requeridos | Estado del mockup |
|---|---|---|---|
| Papelera | `storage/papelera/` | default, vacio, cargando, error, restaurar-con-aviso, confirmar-eliminar-definitivo, vaciar | En elaboración por `ui-designer` (`/mockup`, logos y sistema Cielo Sereno); propuesta p. 11 como base |
| Mis archivos con carpetas | `storage/explorador/` | contenido de carpeta, migas, carpeta-vacia, nueva-carpeta, renombrar, mover (selector de destino), error-nombre, error-mover | En elaboración por `ui-designer`; propuesta p. 08–09 como base |

- **Dependencia para pasar a `Lista`:** mockups y capturas de ambas pantallas en `docs/design/mockups/` con todos los estados de la tabla, revisados por Adrián.
- **Mensajes clave** (español, tuteo, con acción): papelera vacía «La papelera está vacía» / «Lo que elimines aparecerá aquí durante {días} días, la retención de tu plan.»; aviso de purga próxima (umbral fijo de 7 días en la UI) «{n} elementos se eliminarán definitivamente en los próximos 7 días. Restáuralos antes de esa fecha si los necesitas.»; tras eliminar «Movimos «{nombre}» a la papelera.» con «Ver papelera».
- **Cambios frente al mockup firmado de la papelera:** se corrige el texto «descárgalos» (no se descarga desde la papelera); sin «Eliminado por», «Eliminados por mí» ni «se vuelven a indexar» (futuro, ver §7); el botón principal usa el token corregido (DF-41).
- **Menú de la fila:** la acción se llama «Mover a la papelera» (no «Eliminar») y no usa color destructivo; el rojo queda solo para «Eliminar definitivamente» en la papelera.
- **Avisos** (p. ej. «Movimos «{nombre}» a la papelera.»): aviso no bloqueante (`role="status"`, ≥ 8 s), con `sonner` (ADR-0024).
- La barra lateral de 005 recupera «Carpetas» y el contador de la Papelera (`mockups/storage/explorador/README.md`).

## 7. Fuera de alcance
- Compartir carpetas, permisos heredados, «Eliminado por» y «Eliminados por mí» (012); enlaces públicos (013); versiones y restaurar versión (014).
- Cuota mostrada, desglose por tipo, ordenar, filtros, cuadrícula y selección múltiple del explorador (007); búsqueda (018); aviso «se vuelven a indexar» y reindexación al restaurar (019).
- Descargar carpetas o `.zip`; descargar desde la papelera; mover por arrastre; copiar; favoritos y recientes; «Deshacer» flotante; auditar crear, renombrar y mover.
- Restauración por Soporte (011); bloqueo en solo lectura por plan vencido (010); conciliación nocturna de `espacio_usado` (007).
- Carpetas inteligentes y todo lo de `product-context.md` §9.

## 8. Preguntas
Sin preguntas abiertas. Pendiente no es una pregunta sino una dependencia: los mockups de §6 (en curso) para pasar a `Lista`. El valor exacto de la profundidad máxima y el modo de ampliar `PlanLimits` se deciden en el plan.

## 9. Registro de cambios
| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-09-30 | Creación en `Borrador`; 005 §11 y su RN-4 (solo raíz) pasan a esta spec: carga y listado con carpeta destino | `/spec 006` | — |
| 2026-09-30 | Resueltas P-1 a P-12 y quitadas sus marcas: mockups con `/mockup` como dependencia (P-1); eliminar definitivamente y vaciar con confirmación (P-2); fecha de purga fijada al eliminar y purga con cuenta vencida (P-3, CA-19); restaurar con «(n)», a la raíz y subárbol con misma fecha (P-4); mover y renombrar entran (P-5); profundidad configurable (P-6, CA-9); unicidad por tipo (P-7, CA-3, RN-5); 409 en carpetas sin fusionar (P-8); sin descarga desde papelera y corrección de «descárgalos» (P-9); «Eliminado por», «Eliminados por mí» e indexación al futuro (P-10); sin auditar crear/renombrar/mover (P-11); eliminar sin confirmación con «Ver papelera» (P-12, CA-10) | Respuestas de Adrián | Adrián |
| 2026-09-30 | CA-15: restaurar por encima de la profundidad máxima responde `422` y sugiere mover la carpeta original. CA-18: «Vaciar» es diferido («Vaciando…»). Estado `Lista` | Aprobación del plan | Adrián |
| 2026-09-30 | Estado `En curso`: T-01 (migraciones, entidades y fragmentos de `access`) en la rama | `/implement 006` | — |
| 2026-09-30 | UX sobre los mockups: extensión fija al renombrar archivos (CA-4); mensaje 409 al mover carpeta (CA-3, CA-7); crear carpeta desde «Mover a…» (CA-7); acción «Mover a la papelera» sin color destructivo (CA-10, CA-11, §6); avisos con `sonner`, `role="status"`, ≥ 8 s (§6) | Revisión de mockups | Adrián |
| 2026-09-30 | UX de la papelera aprobada (decisiones 9–14 del mockup): resumen en dos bloques sobre la lista, «Restaurar» visible y «Eliminar definitivamente» en ⋮; aviso de purga próxima a 7 días; resultado de restaurar en aviso (uno sin cambios) o panel por elemento; la selección solo restaura; texto de papelera vacía con los días; «Eliminando…» si tarda > 2 s (§6) | Revisión de mockups | Adrián |
