# Spec 020 — Agente con citas (API)

> Qué y por qué, en ≤ 150 líneas. El cómo va en `./plan.md` (obligatorio).

| Campo | Valor |
|---|---|
| Estado | En curso |
| Dueño | Adrián |
| Fase | 3 |
| Requisitos | RF-32, RF-33, RF-34; RNF-03 (primer fragmento < 3 s), RNF-05, RNF-09, RNF-17 |
| Depende de | 019 (ya en `main`: fragmentos con procedencia y estado `indexacion`), 010 (periodo y solo lectura), 003 (`Actor`, nodos accesibles). 012 (compartidos) amplía CA-5 cuando llegue |
| Consume | **020b** (panel web) lee esta API; RNF-13 y RNF-14 pasaron a 020b |
| DF / ADR | DF-08, DF-14, DF-15, DF-25, DF-27, DF-83, DF-82; PD-18 (`IAgentQuota`); ADR-0036 |
| Última actualización | 2026-10-25 |

## 1. Contexto y objetivo
El servidor del agente: el cliente pregunta en lenguaje natural sobre sus documentos y recibe, por streaming, una respuesta con
**citas exactas** (archivo y página, sección y párrafo, línea, hoja o diapositiva) que el servidor valida. Solo lee lo que el
cliente puede ver; si no puede ubicar una fuente con certeza, lo dice. Cada plan trae un número de consultas al mes que el servidor
cuenta y hace cumplir. La pantalla (panel, chips, ámbito en la ficha) es la spec 020b. Es la tercera diferencia de Nimbo (CLAUDE.md, punto 3).

## 2. Historias de usuario
- **HU-1** Como cliente, quiero preguntar sobre mis documentos y recibir una respuesta con citas, para no buscar a mano.
- **HU-2** Como cliente, quiero que cada cita traiga el lugar exacto del archivo, para poder comprobar la respuesta.
- **HU-3** Como cliente, quiero saber cuántas consultas me quedan este mes y qué pasa cuando se acaban.
- **HU-4** Como cliente, quiero que el agente nunca use ni muestre archivos de otras cuentas a los que no tengo acceso.
- **HU-5** Como rol interno, nunca consulto al agente ni veo preguntas o respuestas de clientes.

## 3. Criterios de aceptación
**Preguntar y responder** (`POST /agent/ask`, flujo de eventos; `GET /agent/status`)
- **CA-1** (HU-1, HU-2, RF-32) Dado un cliente con archivos indexados y consultas disponibles, cuando pregunta, entonces recibe en español una respuesta en streaming basada solo en fragmentos de sus archivos, con al menos una cita por afirmación sobre su contenido; cada cita trae archivo, versión y ubicación que calcula el servidor.
- **CA-2** (HU-1, RNF-03) Dado el corpus sintético de medición (S-5) en local con el modelo real, cuando se pregunta, entonces el primer fragmento de texto llega en < 3 s (p95 de 20 preguntas).
- **CA-3** (HU-1, RF-32) Dado que ningún fragmento accesible responde la pregunta, cuando el agente contesta, entonces dice «No encontré esto en tus documentos» sin inventar contenido ni citas.
- **CA-4** (HU-1, RF-32) Dado un fragmento cuya ubicación no es certera (019), cuando se cita, entonces la cita lo indica («ubicación aproximada», ya en su etiqueta) y la respuesta lo advierte en texto, una sola vez.
- **CA-5** (HU-1, RF-33) Dado un archivo compartido conmigo como Lector o Editor, cuando pregunto, entonces sus fragmentos pueden citarse; al revocarse el acceso, la siguiente pregunta ya no lo cita. Alcanzable al llegar 012.
- **CA-6** (HU-1, RF-32) — error: Dado una pregunta vacía o más larga que el máximo (RN-7), cuando la envío, entonces `422 AGENT_INVALID_QUESTION` con el motivo (`empty` o `too_long`) y no se descuenta consulta.
- **CA-7** (HU-1, RF-32) Dado que ninguno de mis archivos tiene su versión vigente indexada, cuando consulto el estado, entonces `hasIndexedFiles` es falso; y si pregunto igual, entonces se responde S-2 sin llamar al modelo y sin descontar consulta. *(El estado vacío visible pasó a 020b.)*

**Citas**
- **CA-8** — *Movido a 020b* (abrir la cita en la ficha o la vista previa). Aquí la cita solo entrega los datos de CA-1.
- **CA-9** (HU-2, RNF-05) — error: Dado un archivo citado que después fue a la papelera, se borró o dejó de ser accesible, cuando vuelvo a preguntar, entonces ya no se recupera ni se cita (RN-2); abrirlo responde como inexistente (igual que 005 CA-16, ya implementado). *(Cómo se ve al abrirla: 020b.)*

**Consultas del plan**
- **CA-10** (HU-3, RF-34) Dado un cliente, cuando consulta `GET /agent/status`, entonces recibe consultas usadas, total del periodo según su plan (Personal 20, Pro 500, Equipo 2 000, Institucional 10 000), fecha de renovación y `hasIndexedFiles`. *(Mostrarlo en el panel: 020b.)*
- **CA-11** (HU-3, RF-34) — error: Dado que agoté las consultas del periodo, cuando pregunto, entonces `429 AGENT_QUOTA_EXCEEDED` con «Usaste tus <N> consultas de este mes. Se renuevan el <fecha>.» y `details` con `limit` y `resetsAt`; el resto de Nimbo funciona igual. *(La acción «Ver planes»: 020b.)*
- **CA-12** (HU-3, RF-34) Dado una consulta disponible y dos preguntas simultáneas, cuando llegan, entonces solo una se responde y la otra recibe CA-11: el contador nunca supera el límite.
- **CA-13** (HU-3, RF-34) Dado que empieza un periodo nuevo (RN-4), cuando pregunto, entonces el contador vuelve a cero.
- **CA-14** (HU-3, RF-23) Dado una cuenta en solo lectura (010), cuando pregunta, entonces el agente responde igual y consume del plan que conserva (P-8).

**Degradación y seguridad**
- **CA-15** (HU-1, RNF-09) — error: Dado el proveedor del modelo caído o lento más allá del plazo, cuando pregunto, entonces `503 AGENT_UNAVAILABLE` con «El agente no está disponible. Tus archivos siguen a salvo.», no se descuenta consulta, y subir, descargar, listar y buscar responden con normalidad. Si falla a mitad del flujo, llega un evento `error` después de lo ya enviado y tampoco se descuenta.
- **CA-16** (HU-5, RF-05) — error: Dado un Administrador, Soporte u Operador, cuando llama a cualquier operación del agente, entonces `403 SHARED_FORBIDDEN` y no se procesa nada.
- **CA-17** (HU-4, RNF-05, aislamiento) Dado A y B con documentos distintos, cuando A pregunta por un dato que solo está en un archivo de B, entonces la respuesta no lo contiene ni cita archivos de B, ni aun enviando como ámbito un id de archivo o carpeta de B (`404 AGENT_SCOPE_NOT_FOUND`, igual que uno inexistente) (`test/isolation`).
- **CA-18** (HU-4, RNF-17) Dado cualquier consulta, entonces las bitácoras registran correlación, duración, número de fragmentos y resultado, sin la pregunta, la respuesta, fragmentos, nombres de archivo ni la clave del modelo.

## 4. Reglas de negocio
- **RN-1** Pregunta solo el Cliente. Sirven los archivos con nivel Propietario, Editor o Lector (`product-context.md` §2), resueltos dentro de la consulta de datos con los nodos accesibles del actor (RNF-05), nunca filtrando después.
- **RN-2** Solo se consulta la **versión vigente** de cada archivo; versiones anteriores y archivos en la papelera no se usan ni se citan.
- **RN-3** El límite mensual sale del plan de quien pregunta (`IAgentQuota`, por `PlanLimits`), nunca de código, aunque el archivo citado sea de otra cuenta.
- **RN-4** Periodo del contador: en planes de pago, el periodo de la suscripción (se reinicia al renovar, 010 §7 y DF-25); en Personal, el mes calendario en hora de Guatemala (se reinicia el día 1, P-1).
- **RN-5** Cuenta como consulta toda pregunta respondida, incluida «No encontré esto» (CA-3). No cuenta la rechazada por validación (CA-6), por cuota (CA-11), sin archivos indexados (CA-7) ni la que falla por el proveedor (CA-15).
- **RN-6** Cada cita guarda archivo, versión y la ubicación que registró 019 (`SourceLocation`): página (pdf), sección y párrafos (docx), líneas (txt, md), hoja (xlsx) o diapositiva (pptx), con su certeza.
- **RN-7** Longitud máxima de la pregunta configurable por entorno, inicial 1 000 caracteres (P-6); `GET /agent/status` la informa.
- **RN-8** El agente no genera ni modifica documentos (§9 del contexto) y no responde con conocimiento externo como si viniera de los archivos.
- **RN-9** Ámbito: por defecto, todos los archivos accesibles; la petición puede limitarlo a una carpeta (con sus subcarpetas) o a un archivo. Un ámbito no accesible se responde como inexistente (CA-17) (P-2).
- **RN-10** Sin historial: cada pregunta es independiente y el servidor no guarda ni su texto ni la respuesta. Se guarda únicamente el uso para el contador (P-3).

## 5. Seguridad y privacidad
- ¿Toca datos de un cliente? **Sí**, contenido → aislamiento bloqueante (CA-17) y `security-auditor` obligatorio.
- Auditoría (RF-07): preguntar no es una acción sobre la cuenta y no va a la auditoría visible (se registra solo el conteo de uso). Ningún rol interno puede consultar, así que no hay accesos internos que auditar.
- Bitácoras: CA-18. La clave del modelo vive solo en el backend; el navegador nunca habla con el proveedor.
- Al proveedor del modelo solo viajan la pregunta y los fragmentos ya autorizados de quien pregunta, sin nombres ni ids.
- Riesgos: instrucciones escondidas dentro de un documento («ignora lo anterior y…») que intenten sacar contenido de otros archivos o cambiar las citas; citas a archivos no accesibles; ids de ámbito ajenos; carrera en el contador (CA-12).

## 6. Experiencia de usuario
Sin interfaz: la consume 020b (panel, chips de cita, ámbito desde la ficha, estados vacío/límite/no disponible, «Ubicación citada»).
Mensajes del servidor (tuteo): «No encontré esto en tus documentos», CA-11, CA-15 y la advertencia de ubicación aproximada (CA-4).

## 7. Fuera de alcance
- Indexar, extraer y fragmentar: 019 (ya hecha). Panel y todo lo visual: 020b.
- Generar o editar documentos, resúmenes descargables, OCR (§9 del contexto). Sugerencias de preguntas.
- Compartir (012) y vista previa (017): aquí solo se consumen. Tablero del agente en Grafana: 022. Carga: 023.
- Comprar consultas sueltas o ampliar el límite fuera del plan. Historial de conversaciones (RN-10).

## 8. Supuestos
- **S-1** La cita lleva `fileName` y la etiqueta al navegador del dueño; nunca al modelo ni a bitácoras.
- **S-2** Sin archivos indexados se responde la misma frase fija de CA-3; la explicación de formatos es de 020b.
- **S-3** `GET /agent/status` incluye `maxQuestionChars` (lo pide 020b S-3).
- **S-4** Un abort del cliente antes del primer fragmento libera la consulta; después, cuenta (decisión aprobada con el plan, P-9).
- **S-5** No hay corpus sintético (`pnpm seed` es un marcador). La medición de CA-2 usa un script opt-in que genera su propio corpus con los generadores de `test/support/*-fixture.ts` y el embedding real; no entra en CI.
- **S-6** La similitud mínima de CA-3 se calibra con ese script y el embedding real: el doble determinista no sirve para eso.

## 9. Preguntas
Sin preguntas abiertas.
- [RESUELTA] **P-1** Reinicio del contador de Personal → día 1 de cada mes, hora de Guatemala → RN-4 (2026-10-25, Adrián)
- [RESUELTA] **P-2** Ámbito → todos los accesibles; opcional, una carpeta o un archivo → RN-9 (2026-10-25, Adrián)
- [RESUELTA] **P-3** Historial → no se guarda → RN-10 (2026-10-25, Adrián)
- [RESUELTA] **P-4** Mockups → pasan a 020b junto con la UI (2026-10-25, Adrián)
- [RESUELTA] **P-5** Sin 017 la cita abre la ficha con la ubicación visible → ahora CA-8 de 020b (2026-10-25, Adrián)
- [RESUELTA] **P-6** Longitud → 1 000 caracteres, configurable → RN-7 (2026-10-25, Adrián)
- [RESUELTA] **P-7** 019 → ya implementada y en `main`; el plan consume su contrato real (2026-10-25, Adrián)
- [RESUELTA] **P-8** Agente en solo lectura → sí (010, 2026-10-16) → CA-14
- [RESUELTA] **P-9** Cancelar antes del primer fragmento libera la consulta; sin cita válida cuenta como respondida con el aviso del servidor; en solo lectura agotada `resetsAt` es nulo; límite de tasa por cuenta además de la cuota → S-4, plan D-5 y D-3 (2026-10-25, Adrián, aprobación del plan)

## 10. Registro de cambios
| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-10-25 | Creación en `Borrador`; P-1…P-7 resueltas; plan aprobado y spec en `Lista`; `tasks.md` generado | `/spec 020`, `/plan 020`, `/tasks 020` | Adrián |
| 2026-10-25 | **Partida en 020 (API) y 020b (panel web)** por ADR-0034: el plan pasaba de 12 archivos y de una pantalla. Vuelve a `Borrador` hasta aprobar el resumen | Decisión de Adrián | pendiente |
| 2026-10-25 | CA-8 movido a 020b (abrir la cita); CA-7, CA-9, CA-10 y CA-11 reformulados como respuesta de la API (la parte visible: 020b CA-2, 12, 1, 8); RN-9 y RN-10 conservan solo la parte del servidor; RNF-13 y RNF-14 pasan a 020b; §6 sin interfaz; P-4/P-5 trasladadas | Partición | pendiente |
| 2026-10-25 | 019 ya implementada: RN-6 cubre hoja y diapositiva (RF-31 indexado); P-7 resuelta de otra forma; CA-2 usa el corpus de medición (S-5) en lugar del «corpus de 019», que no existe | Reconciliar con la 019 real | pendiente |
| 2026-10-25 | Decisiones aprobadas del plan anterior pasan a P-9 y S-4; nuevos S-1…S-3, S-5, S-6; `maxQuestionChars` en el estado (S-3) | ADR-0034 (supuestos) y petición de 020b | Adrián |
| 2026-10-25 | Plan aprobado tras la partición; pasa a `Lista` | Resumen aprobado | Adrián |
| 2026-10-25 | **Propuesta (T-06)**: el plan no fija de dónde sale `fileName` de la cita (S-1) y ADR-0036 no permite leer `archivo.nombre`; se decide antes de T-07 (PD-136). **Decidido**: enmienda de ADR-0036, `intelligence` lee `archivo.nombre` en la misma consulta; se aplica en T-07 | Hueco detectado al implementar | Adrián |
