# Spec 020 — Agente con citas

> Qué y por qué, en ≤ 150 líneas. El cómo va en `./plan.md` (obligatorio).

| Campo | Valor |
|---|---|
| Estado | Lista |
| Dueño | Adrián |
| Fase | 3 |
| Requisitos | RF-32, RF-33, RF-34; RNF-03 (primer fragmento < 3 s), RNF-05, RNF-09, RNF-13, RNF-14, RNF-17 |
| Depende de | 019 (fragmentos con procedencia; **aún sin spec**), 010 (periodo y solo lectura), 003 (`Actor`, nodos accesibles), 008 (pantalla de planes). 012 (compartidos) y 017 (vista previa) amplían CA-5 y CA-8 cuando lleguen |
| DF / ADR | DF-08, DF-14, DF-15, DF-25; PD-18 (`IAgentQuota`) |
| Última actualización | 2026-10-25 |

## 1. Contexto y objetivo
El cliente pregunta en lenguaje natural sobre sus documentos y recibe una respuesta que se va escribiendo en pantalla,
con **citas exactas** (archivo y página, sección y párrafo o línea) que puede abrir para comprobarla. El agente solo
lee lo que el cliente puede ver; si no puede ubicar una fuente con certeza, lo dice. Cada plan trae un número de
consultas al mes. Es la tercera diferencia de Nimbo (CLAUDE.md, punto 3).

## 2. Historias de usuario
- **HU-1** Como cliente, quiero preguntar sobre mis documentos y recibir una respuesta con citas, para no buscar a mano.
- **HU-2** Como cliente, quiero abrir una cita y ver el lugar exacto del archivo, para confiar en la respuesta.
- **HU-3** Como cliente, quiero saber cuántas consultas me quedan este mes y qué hacer cuando se acaban.
- **HU-4** Como cliente, quiero que el agente nunca use ni muestre archivos de otras cuentas a los que no tengo acceso.
- **HU-5** Como rol interno, nunca consulto al agente ni veo preguntas o respuestas de clientes.

## 3. Criterios de aceptación
**Preguntar y responder**
- **CA-1** (HU-1, RF-32) Dado un cliente con archivos indexados y consultas disponibles, cuando pregunta, entonces recibe en español una respuesta en streaming basada solo en fragmentos de sus archivos, con al menos una cita por afirmación sobre su contenido.
- **CA-2** (HU-1, RNF-03) Dado el corpus sintético de 019 en local, cuando se pregunta, entonces el primer fragmento de la respuesta llega en < 3 s (p95 de 20 preguntas del corpus).
- **CA-3** (HU-1, RF-32) Dado que ningún fragmento accesible responde la pregunta, cuando el agente contesta, entonces dice «No encontré esto en tus documentos» sin inventar contenido ni citas.
- **CA-4** (HU-1, RF-32) Dado un fragmento cuya ubicación no es certera (019), cuando se cita, entonces la cita lo indica («ubicación aproximada») y la respuesta lo advierte en texto.
- **CA-5** (HU-1, RF-33) Dado un archivo compartido conmigo como Lector o Editor, cuando pregunto, entonces sus fragmentos pueden citarse; al revocarse el acceso, la siguiente pregunta ya no lo cita. Alcanzable al llegar 012.
- **CA-6** (HU-1, RF-32) — error: Dado una pregunta vacía o más larga que el máximo (RN-7), cuando la envío, entonces `422 AGENT_INVALID_QUESTION` con el motivo y no se descuenta consulta.
- **CA-7** (HU-1, RF-32) Dado que todavía no tengo archivos indexados, cuando abro el agente, entonces veo el estado vacío que explica qué formatos se indexan, y no se descuenta consulta si pregunto.

**Citas**
- **CA-8** (HU-2, RF-32) Dado una cita, cuando la abro, entonces se abre el archivo citado en la ubicación exacta (página, sección y párrafo o línea) con el fragmento resaltado; si el formato no tiene vista previa, se abre su ficha con la ubicación visible. La vista previa llega con 017 (P-5).
- **CA-9** (HU-2, RNF-05) — error: Dado una cita a un archivo que después fue a la papelera, borrado o dejó de ser accesible, cuando la abro, entonces se responde como inexistente (igual que 005 CA-16).

**Consultas del plan**
- **CA-10** (HU-3, RF-34) Dado el panel del agente, entonces muestra las consultas usadas y el total del periodo según mi plan (Personal 20, Pro 500, Equipo 2 000, Institucional 10 000).
- **CA-11** (HU-3, RF-34) — error: Dado que agoté las consultas del periodo, cuando pregunto, entonces `429 AGENT_QUOTA_EXCEEDED` con «Usaste tus <N> consultas de este mes. Se renuevan el <fecha>.» y la acción «Ver planes» (008); el resto de Nimbo funciona igual.
- **CA-12** (HU-3, RF-34) Dado una consulta disponible y dos preguntas simultáneas, cuando llegan, entonces solo una se responde y la otra recibe CA-11: el contador nunca supera el límite.
- **CA-13** (HU-3, RF-34) Dado que empieza un periodo nuevo (RN-4), cuando pregunto, entonces el contador vuelve a cero.
- **CA-14** (HU-3, RF-23) Dado una cuenta en solo lectura (010), cuando pregunta, entonces el agente responde igual y consume del plan que conserva (010, P-2 resuelta).

**Degradación y seguridad**
- **CA-15** (HU-1, RNF-09) — error: Dado el proveedor del modelo caído o lento más allá del plazo, cuando pregunto, entonces `503 AGENT_UNAVAILABLE` con «El agente no está disponible. Tus archivos siguen a salvo.», no se descuenta consulta, y subir, descargar, listar y buscar responden con normalidad. Si falla a mitad del streaming, se muestra lo recibido con el aviso y tampoco se descuenta.
- **CA-16** (HU-5, RF-05) — error: Dado un Administrador, Soporte u Operador, cuando llama a cualquier operación del agente, entonces `403 SHARED_FORBIDDEN` y no se procesa nada.
- **CA-17** (HU-4, RNF-05, aislamiento) Dado A y B con documentos distintos, cuando A pregunta por un dato que solo está en un archivo de B, entonces la respuesta no lo contiene ni cita archivos de B, ni aun enviando como ámbito un id de archivo o carpeta de B (se responde como inexistente) (`test/isolation`).
- **CA-18** (HU-4, RNF-17) Dado cualquier consulta, entonces las bitácoras registran correlación, duración, número de fragmentos y resultado, sin la pregunta, la respuesta, fragmentos, nombres de archivo ni la clave del modelo.

## 4. Reglas de negocio
- **RN-1** Pregunta solo el Cliente. Sirven los archivos con nivel Propietario, Editor o Lector (`product-context.md` §2), resueltos dentro de la consulta de datos con los nodos accesibles del actor (RNF-05), nunca filtrando después.
- **RN-2** Solo se consulta la **versión vigente** de cada archivo; versiones anteriores y archivos en la papelera no se usan ni se citan.
- **RN-3** El límite mensual sale del plan de quien pregunta (`IPlanLimitsProvider` / `IAgentQuota`), nunca de código, aunque el archivo citado sea de otra cuenta.
- **RN-4** Periodo del contador: en planes de pago, el periodo de la suscripción (se reinicia al renovar, 010 §7 y DF-25); en Personal, el mes calendario en hora de Guatemala (se reinicia el día 1, P-1).
- **RN-5** Cuenta como consulta toda pregunta respondida, incluida «No encontré esto» (CA-3). No cuenta la rechazada por validación (CA-6), por cuota (CA-11), sin archivos indexados (CA-7) ni la que falla por el proveedor (CA-15).
- **RN-6** Cada cita guarda archivo, versión y la ubicación que registró 019 (`SourceLocation`): página (pdf), sección y párrafo (docx), línea (txt, md); hoja o diapositiva solo si 019 incluye RF-31.
- **RN-7** Longitud máxima de la pregunta configurable por entorno, inicial 1 000 caracteres (P-6).
- **RN-8** El agente no genera ni modifica documentos (§9 del contexto) y no responde con conocimiento externo como si viniera de los archivos.
- **RN-9** Ámbito: por defecto, todos los archivos accesibles; el cliente puede limitarlo a una carpeta (con sus subcarpetas) o a un archivo, también desde la ficha del archivo. Un ámbito no accesible se responde como inexistente (CA-17) (P-2).
- **RN-10** Sin historial: cada pregunta es independiente y no se guarda ni su texto ni la respuesta; el panel muestra solo las de la sesión abierta y se vacían al recargar. Se guarda únicamente el uso para el contador (P-3).

## 5. Seguridad y privacidad
- ¿Toca datos de un cliente? **Sí**, contenido → aislamiento bloqueante (CA-17) y `security-auditor` obligatorio.
- Auditoría (RF-07): preguntar no es una acción sobre la cuenta y no va a la auditoría visible (se registra solo el conteo de uso). Ningún rol interno puede consultar, así que no hay accesos internos que auditar.
- Bitácoras: CA-18. La clave del modelo vive solo en el backend; el navegador nunca habla con el proveedor.
- Al proveedor del modelo solo viajan la pregunta y los fragmentos ya autorizados de quien pregunta.
- Riesgos: instrucciones escondidas dentro de un documento («ignora lo anterior y…») que intenten sacar contenido de otros archivos o cambiar las citas; citas a archivos no accesibles; ids de ámbito ajenos; carrera en el contador (CA-12).

## 6. Experiencia de usuario
Rutas relativas a `docs/design/`: mockup `mockups/intelligence/panel-agente/` (diseño interno, no presentado en la propuesta firmada).
| Pantalla | Estados requeridos | CA | Estado del mockup |
|---|---|---|---|
| Panel del agente (lateral, 420 px; hoja a pantalla completa en 360 px) | `con-citas` | 1, 4, 10 | Borrador |
| | `vacio` (sin archivos indexados), `respondiendo` (streaming), `sin-resultados`, `cita-incierta`, `limite-alcanzado`, `no-disponible`, `error-pregunta`, y el selector de ámbito (RN-9) | 3, 6, 7, 11, 15 | Falta: se crean con `/mockup` antes de `Lista` (P-4) |
| Vista previa en la ubicación citada | resaltado del fragmento | 8 | Cubierto por `con-citas`; lo implementa 017 |

- Componentes de `ui-guidelines.md`: `AgentPanel` (streaming con `aria-live`, sin animación con reduced-motion) y `CitationChip` («archivo · p. 12», aviso de ubicación aproximada); estados con `StateView`.
- Mensajes clave (tuteo): «Pregunta sobre tus documentos», «No encontré esto en tus documentos», «La ubicación de esta cita es aproximada», CA-11, CA-15.
- Del mockup se ignoran: atribución por párrafo (fuera de alcance §9) y sugerencias de preguntas (YAGNI, ningún RF las pide). Su texto de ejemplo dice 2 GB por archivo en Equipo; el catálogo dice 1 GB.

## 7. Fuera de alcance
- Indexar, extraer y fragmentar: 019. Estado de indexación en la ficha del archivo: 019.
- Generar o editar documentos, resúmenes descargables, OCR (§9 del contexto). Sugerencias de preguntas.
- Compartir (012) y vista previa (017): aquí solo se consumen. Tablero del agente en Grafana: 022. Carga: 023.
- Comprar consultas sueltas o ampliar el límite fuera del plan.

## 8. Preguntas
Sin preguntas abiertas.
- [RESUELTA] **P-1** Reinicio del contador de Personal → el día 1 de cada mes, hora de Guatemala → RN-4 (2026-10-25, Adrián)
- [RESUELTA] **P-2** Ámbito → todos los accesibles por defecto; opcional, una carpeta o un archivo → RN-9 (2026-10-25, Adrián)
- [RESUELTA] **P-3** Historial → no se guarda; preguntas independientes; DF-08 deja de aplicar y DF-15 se cierra sin `Conversation` → RN-10 (2026-10-25, Adrián)
- [RESUELTA] **P-4** Mockups → los 7 estados, el selector de ámbito y la versión a 360 px se crean con `/mockup` antes de `Lista` → §6 (2026-10-25, Adrián)
- [RESUELTA] **P-5** Sin 017 → la cita abre la ficha con la ubicación visible; la vista previa se conecta al integrarse 017 → CA-8 (2026-10-25, Adrián)
- [RESUELTA] **P-6** Longitud → 1 000 caracteres, configurable → RN-7 (2026-10-25, Adrián)
- [RESUELTA] **P-7** 019 → se especifica antes de implementar la 020; el plan de la 020 fija lo que consume de 019 (fragmento con procedencia y certeza) y la 019 lo respeta (2026-10-25, Adrián)
- [RESUELTA] **P-8** ¿Agente en solo lectura? → Sí, se permite (010, preguntas resueltas, 2026-10-16) → CA-14.

## 9. Registro de cambios
| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-10-25 | Creación en `Borrador` | `/spec 020` | — |
| 2026-10-25 | P-1…P-7 resueltas con las recomendaciones: RN-4, RN-7, RN-9, RN-10 y §6 | Respuestas de Adrián | Adrián |
| 2026-10-25 | Plan aprobado; pasa a `Lista` | Aprobación del plan con los cambios 1–5 de `architect` | Adrián |
| 2026-10-25 | `tasks.md` generado | `/tasks 020` | — |
