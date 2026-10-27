# Spec 020b — Panel del agente (web)

> Qué y por qué, en ≤ 150 líneas. El cómo va en `./plan.md` (obligatorio).

| Campo | Valor |
|---|---|
| Estado | En curso |
| Dueño | Adrián |
| Fase | 3 |
| Requisitos | RF-32, RF-34; RNF-03 (lo que ve el cliente), RNF-09, RNF-13, RNF-14 |
| Depende de | **020** (API del agente: `POST /agent/ask`, `GET /agent/status` y sus contratos), 019 (etiquetas de ubicación), 010 (solo lectura y «Renovar plan»), 008 (pantalla de planes), 003 (rol Cliente). 017 (vista previa) amplía CA-11 cuando llegue |
| Última actualización | 2026-10-25 |

## 1. Contexto y objetivo
La 020 deja el agente funcionando por API; esta spec es lo que el cliente ve. Un panel lateral donde pregunta sobre
sus documentos, ve la respuesta escribirse con sus citas, abre una cita para comprobarla, limita el ámbito a una
carpeta o archivo y sabe cuántas consultas le quedan. Parte de la 020 por tamaño (ADR-0034): las reglas del
servidor (cuota, aislamiento, citas, bitácoras) son de la 020 y aquí solo se muestran.

## 2. Historias de usuario
- **HU-1** Como cliente, quiero un panel donde preguntar y ver la respuesta escribirse con sus citas, para no buscar a mano.
- **HU-2** Como cliente, quiero abrir una cita y ver el lugar citado, para confiar en la respuesta.
- **HU-3** Como cliente, quiero ver cuántas consultas me quedan y qué hacer cuando se acaban.
- **HU-4** Como cliente, quiero limitar la pregunta a una carpeta o a un archivo, también desde su ficha.
- **HU-5** Como rol interno, no veo ninguna entrada al agente.

## 3. Criterios de aceptación
Los números de la 020 (CA-x) indican el criterio del servidor que la pantalla hace visible.

**Panel y consultas**
- **CA-1** (HU-3, RF-34; 020 CA-10) Dado un cliente, cuando abre «Agente Nimbo», entonces el panel muestra «N de L consultas este mes» con L del plan de quien pregunta (Personal 20, Pro 500, Equipo 2 000, Institucional 10 000), la fecha de renovación y el ámbito vigente («Todos mis archivos» por omisión).
- **CA-2** (HU-1, RF-32; 020 CA-7) Dado que no tiene archivos indexados, cuando abre el panel, entonces ve el estado vacío que explica qué formatos se indexan y «Subir archivos»; si pregunta igual, el servidor no descuenta y se muestra su respuesta.
- **CA-3** (HU-1, RF-32, RNF-03; 020 CA-1) Dado una pregunta válida, cuando la envía, entonces su pregunta aparece, el campo se apaga con «Escribiendo…» y «Detener», el texto se va escribiendo y cada cita aparece como chip «archivo · ubicación» antes del texto que la menciona.
- **CA-4** (HU-1, RF-32; 020 CA-1) Dado una respuesta en curso, cuando el cliente pulsa «Detener», entonces la escritura para y se conserva lo recibido; si aún no había texto, el contador queda igual (la consulta se libera, decisión aprobada en la 020).
- **CA-5** (HU-1, RF-32; 020 CA-3) Dado que el servidor responde «No encontré esto en tus documentos», entonces se muestra sin citas, con la pista de ampliar el ámbito y la nota de que cuenta como consulta.
- **CA-6** (HU-1, RF-32; 020 CA-4) Dado una cita de ubicación no certera, entonces su chip lo marca con ícono y borde (no solo color) y con el texto «ubicación aproximada» que trae la etiqueta del servidor, y la respuesta muestra el aviso «La ubicación de esta cita es aproximada».
- **CA-7** (HU-1, RF-32; 020 CA-6) — error: Dado una pregunta vacía o de más de 1 000 caracteres, cuando intenta enviarla, entonces el campo marca el error con cuántos caracteres sobran, la corrección y «no se descontó tu consulta»; el máximo sale de la API y nada se envía si el campo está vacío.
- **CA-8** (HU-3, RF-34; 020 CA-11, CA-14) — error: Dado `AGENT_QUOTA_EXCEEDED`, cuando pregunta, entonces ve «Usaste tus <N> consultas de este mes. Se renuevan el <fecha>.» como aviso (no error), el campo apagado y «Ver planes»; el resto de Nimbo no cambia. En solo lectura sin fecha, ve «Renovar plan» y ninguna fecha.
- **CA-9** (HU-1, RNF-09; 020 CA-15) — error: Dado `AGENT_UNAVAILABLE`, o un fallo a mitad de la respuesta, cuando ocurre, entonces ve «El agente no está disponible. Tus archivos siguen a salvo.» con «Reintentar»; lo ya recibido se conserva y no se descontó la consulta.
- **CA-10** (HU-1) — error: Dado que la sesión caducó durante la pregunta, cuando el servidor responde 401, entonces se renueva una vez y se repite; si no se puede, se cierra la sesión como en el resto de Nimbo y no se muestra el texto a medias.

**Citas**
- **CA-11** (HU-2, RF-32; 020 CA-8) Dado una cita, cuando la abro, entonces se abre la ficha del archivo con «Ubicación citada: <etiqueta>» visible. Con 017, abre la vista previa en esa ubicación con el fragmento resaltado.
- **CA-12** (HU-2, RNF-05; 020 CA-9) — error: Dado una cita a un archivo en la papelera, borrado o ya no accesible, cuando la abro, entonces veo solo «No encontramos este archivo.», sin la ubicación.
- **CA-13** (HU-2, RNF-14) Dado una respuesta con Markdown, HTML, enlaces o imágenes, entonces se muestra como texto plano, sin enlaces activos ni imágenes.

**Ámbito**
- **CA-14** (HU-4, RF-32; RN-9 de 020) Dado el panel abierto, cuando elijo «Una carpeta» y una carpeta, entonces el botón dice «Carpeta <nombre>» y las preguntas siguientes la usan, con sus subcarpetas; «Todos mis archivos» lo restablece.
- **CA-15** (HU-4) Dado la ficha de un archivo o una carpeta, cuando pulso «Preguntar sobre esto», entonces se abre el panel con ese archivo o carpeta como ámbito.
- **CA-16** (HU-4; 020 CA-17) — error: Dado `AGENT_SCOPE_NOT_FOUND` (la carpeta o el archivo ya no existe o no es mío), entonces ve «Esa carpeta o archivo ya no está disponible. Elige otro ámbito.», el ámbito vuelve a «Todos mis archivos» y la pregunta puede reenviarse.

**Sesión y acceso**
- **CA-17** (HU-1; RN-10 de 020) Dado preguntas ya hechas, cuando navego por Mis archivos, Papelera o Espacio, entonces las veo al reabrir el panel; cuando recargo la página, desaparecen. Nada de ellas se guarda en el navegador y el pie dice «Cada pregunta es independiente: no guardamos tus preguntas ni las respuestas».
- **CA-18** (HU-5, RF-05; 020 CA-16) Dado un Administrador, Soporte u Operador, entonces ni el menú ni sus pantallas muestran «Agente Nimbo» ni el panel.
- **CA-19** (RNF-13) Dado cualquier estado, entonces cumple AA, se usa desde 360 px (hoja a pantalla completa con «Cerrar el agente» de 44 px), la respuesta se anuncia de forma educada (`aria-live`) y con reduced-motion no hay animación.

## 4. Reglas de negocio
- **RN-1** Todas las reglas del agente (cuota, periodo, ámbito accesible, citas, 1 000 caracteres) son de la 020; la web no las recalcula: muestra lo que la API devuelve.
- **RN-2** Las citas que se muestran son las que el servidor emite; la web nunca construye una cita a partir del texto de la respuesta.
- **RN-3** Los límites de consultas salen del plan vía la API, nunca de código web.
- **RN-4** Las preguntas y respuestas de la sesión viven solo en memoria (RN-10 de 020).
- **RN-5** Con la cuenta en solo lectura (010) el panel es idéntico, salvo que, agotadas las consultas, ofrece «Renovar plan» en lugar de la fecha.

## 5. Seguridad y privacidad
- ¿Toca datos de un cliente? Muestra contenido propio (preguntas, respuestas, nombres de archivo). **Sin pruebas de aislamiento propias: igual que 020**, que las cubre en el servidor (`test/isolation`).
- Nada de preguntas, respuestas ni nombres de archivo en `localStorage`, `sessionStorage`, URL (salvo la etiqueta de ubicación, sin nombre de archivo), consola ni bitácoras del navegador. La respuesta es texto plano: cierra la exfiltración por imagen o enlace de una inyección.
- La clave del modelo nunca llega al navegador; la web solo habla con la API de Nimbo.
- Roles internos: sin entrada ni panel (CA-18); si llaman a la API reciben 403 (020 CA-16).
- Auditoría (RF-07): no aplica, preguntar no es una acción sobre la cuenta (igual que 020 §5).

## 6. Experiencia de usuario
Rutas relativas a `docs/design/`. `ui-guidelines.md` §7 lista la pantalla (fila «Panel del agente», ahora spec 020b).
| Pantalla | Mockup | Estados requeridos | Estado del mockup |
|---|---|---|---|
| Panel del agente (lateral 420 px; hoja a 360 px) | `mockups/intelligence/panel-agente/` | `inicio`, `vacio`, `respondiendo`, `con-citas`, `sin-resultados`, `cita-incierta`, `limite-alcanzado`, `no-disponible`, `no-disponible-parcial`, `error-pregunta`, `error-pregunta-vacia`, `ambito` | Aprobado por Adrián (12 estados, 360 y 1440 px) |
| «Preguntar sobre esto» y «Ubicación citada» | Patrones existentes de la ficha (014) y de la carpeta (006) | un botón y una línea; la ficha de archivo inexistente ya existe | Decisión explícita: sin mockup nuevo |

- Mensajes clave (tuteo): «Pregunta sobre tus documentos», «No encontré esto en tus documentos», «La ubicación de esta cita es aproximada», CA-8, CA-9, CA-16.
- Del mockup se ignoran: atribución por párrafo (fuera de alcance, §9 del contexto) y sugerencias de preguntas (YAGNI).

## 7. Fuera de alcance
- Todo el servidor del agente: recuperación, cuota, citas, bitácoras, aislamiento (020). Indexar y su estado (019).
- Vista previa en la ubicación (017); aquí solo se conecta la cita cuando exista.
- Historial de conversaciones, exportar respuestas, sugerencias de preguntas, Markdown, generar o editar documentos (§9 del contexto).
- Elegir un archivo cualquiera desde el panel con un buscador (ver S-1).

## 8. Supuestos
- **S-1** «Un archivo» como ámbito se fija desde «Preguntar sobre esto» en su ficha. En el panel, la opción se muestra con el archivo fijado, o apagada con «Elígelo desde su ficha» si no hay ninguno; el panel solo trae un selector de **carpetas**, el de «Mover a…». Evita construir un buscador de archivos que ningún RF pide.
- **S-2** El texto del estado vacío lista los formatos que indexa la 019 (`.docx`, `.pdf` con texto, `.txt`, `.md`, `.xlsx`, `.pptx`); el mockup solo listaba cuatro y se corrige al implementar.
- **S-3** La 020 expone en `GET /agent/status` el máximo de la pregunta (`maxQuestionChars`) para que CA-7 no lo escriba de memoria. Si el contrato aún no lo trae, se pide a la 020; no se cambia aquí.
- **S-4** El cuadro de pregunta sigue activo sin archivos indexados (como el mockup); el servidor no descuenta (020 CA-7).
- **S-5** La etiqueta de la cita llega ya en español y con « (ubicación aproximada)» si no es certera (019); la web no la reescribe ni la duplica.
- **S-6** La cita abre la ficha con `?ubicacion=<etiqueta>` (sin nombre de archivo); con 017 se cambia el destino, no el chip.

## 9. Preguntas
- [RESUELTA] ¿Se acepta S-1 (archivo solo desde su ficha, sin buscador en el panel)? → Sí (2026-10-25, Adrián).
- [RESUELTA] ¿Se crea mockup? → Ya existe y está aprobado: 12 estados (2026-10-25, Adrián).
- [RESUELTA] Sin 017 la cita abre la ficha con la ubicación visible → CA-11 (2026-10-25, Adrián; P-5 de 020).
- [RESUELTA] Solo lectura con cuota agotada → «Renovar plan» y sin fecha → CA-8 (2026-10-25, Adrián; plan 020).
- [RESUELTA] La web pinta texto plano → CA-13 (2026-10-25, Adrián; plan 020).

## 10. Registro de cambios
| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-10-25 | Creación en `Borrador`, con plan y tareas | Parte de la 020 por ADR-0034 (el plan pasaba de 12 archivos) | — |
| 2026-10-25 | Plan aprobado y S-1 aceptado; pasa a `Lista` | Resumen aprobado | Adrián |
