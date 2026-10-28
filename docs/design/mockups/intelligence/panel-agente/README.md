# Mockup: Panel del agente

- **Spec**: 020 (agente con citas): CA-1, CA-3, CA-4, CA-6, CA-7, CA-8, CA-10, CA-11, CA-15; RN-5, RN-9, RN-10; RF-32, RF-34.
- **Propuesta presentada**: No presentada (diseño interno).
- **Estado**: Borrador (2026-10-25). Solo el equipo lo pasa a `Aprobado`.
- **Origen**: HTML autocontenido, un archivo por estado, generado con `../../_generadores/panel-agente/generar.js` (tokens,
  botones y marco de la aplicación de `marco/`; ver [`_generadores/README.md`](../../_generadores/README.md)). Solo Inter y los
  tonos AA de `ui-guidelines.md` §2–§3. Referencia visual; `apps/web` no lo importa. `panel-agente--con-citas.html` sustituye
  al paquete de la propuesta (lienzo de ≈ 1490 px, panel claro): se corrigió y ahora sale del generador.
- **Estados incluidos** (`panel-agente--<estado>.html`):
  - con-citas: respuesta completa; cada afirmación lleva su cita. A la izquierda, el fragmento citado resaltado en su documento (CA-1, CA-8, CA-10).
  - inicio: hay archivos indexados y todavía no hay preguntas («Pregunta sobre tus documentos»).
  - vacio: sin archivos indexados. Explica qué formatos se indexan (`.docx`, `.pdf` con texto, `.txt`, `.md`, `.xlsx` y `.pptx`, según S-2 de la 020b), qué no (PDF escaneados e imágenes), y ofrece «Subir archivos» (CA-7).
  - respondiendo: streaming con indicador en vivo («Escribiendo…», punto y cursor), cuadro de pregunta apagado (CA-1, RNF-03).
  - sin-resultados: «No encontré esto en tus documentos», sin citas, con la pista de ampliar el ámbito y la nota de que cuenta como consulta (CA-3, RN-5).
  - cita-incierta: chip con «ubicación aproximada» y el aviso en el texto «La ubicación de esta cita es aproximada», junto a una cita certera (CA-4).
  - limite-alcanzado: «Usaste tus 20 consultas de este mes. Se renuevan el 1 de noviembre.» y «Ver planes»; cuenta Personal; cuadro apagado (CA-11).
  - no-disponible: «El agente no está disponible. Tus archivos siguen a salvo.» con «Reintentar»; no se descontó la consulta (CA-15).
  - no-disponible-parcial: el servicio falla a mitad de la respuesta; se conserva lo recibido y se muestra el mismo aviso (CA-15).
  - error-pregunta: pregunta de más de 1 000 caracteres; contador, mensaje con la corrección y «no se descontó» (CA-6).
  - error-pregunta-vacia: pregunta vacía (CA-6).
  - ambito: selector de ámbito abierto con sus tres opciones (todos mis archivos / una carpeta / un archivo) (RN-9). El selector cerrado se ve en todos los demás estados.
- **Capturas**: `docs/design/capturas/intelligence/panel-agente/panel-agente--<estado>--<360|1440>.png`. axe-core sin violaciones
  `serious` ni `critical` en los 12 estados a 360 y 1440 px; solo quedan `page-has-heading-one` y `landmark-one-main`
  (moderadas, solo a 360 px: la hoja oculta la página de fondo y el `main` lo da el layout de la aplicación). Sin desbordamiento
  horizontal a 360 px, sin errores de consola y sin objetivos menores de 24 px (44 px a 360 px).

## Decisiones de UX
- **Hoja a 360 px de verdad** (≤ 900 px): solo el panel, a pantalla completa y sin marco ni rótulo. Arriba, «Cerrar el agente»
  (44 px), el contador y el ámbito; el cuadro de pregunta queda pegado al pie (`sticky`). No es el lienzo de escritorio reducido.
- **Superficie `agent-bg`** (`ui-guidelines.md` §4: `AgentPanel`). El panel original era claro; manda la guía. El foco dentro
  del panel usa `live` (6.07:1). Los avisos y el cuadro de pregunta son tarjetas claras con los tonos de `Alert` y de campo:
  así los errores usan pares ya verificados y no hace falta un rojo nuevo sobre fondo oscuro.
- **Consultas del plan siempre visibles**: «N de L consultas este mes», medidor (`QuotaBar` por tramos: `agent-accent`,
  `warning` desde 70 %, `destructive-soft` al 100 %) y fecha de renovación; al agotarse, «Sin consultas disponibles» con ícono.
  L sale de la API (plan de quien pregunta, RN-3).
- **Ámbito** (RN-9): menú de tres opciones excluyentes (`menuitemradio`) con el conteo de archivos indexados; la opción activa
  lleva marca y fondo, no solo color. El botón dice siempre el ámbito vigente («Carpeta Finanzas»).
- **Citas** (`CitationChip`): enlace «archivo · ubicación» en texto. La ubicación depende del formato (RN-6): `sec. 5, párr. 2`
  (docx), `p. 4` (pdf), `línea 18` (txt, md), con `aria-label` completo. La aproximada lleva ícono, borde discontinuo y el
  texto «ubicación aproximada»; el aviso en el cuerpo de la respuesta usa `Alert` `warning`.
- **Cada afirmación, su cita** (CA-1): las citas van al final del párrafo que respaldan. Se quitó la lista «Fuentes verificables»
  (repetía los chips) y la cita al `.xlsx`: hoja de cálculo no se indexa (`product-context.md` §4).
- **Sin historial** (RN-10): el pie dice «Cada pregunta es independiente: no guardamos tus preguntas ni las respuestas» y no hay
  lista de conversaciones. `role="log"` con `aria-live="polite"` en la conversación y `aria-busy` mientras llega el streaming.
- **Errores con acción**: el campo marca `aria-invalid`, dice cuántos caracteres sobran, la corrección y que no se descontó
  la consulta. El máximo (1 000, RN-7) viene de la API. Un límite alcanzado es `warning`, no error; el aviso de servicio caído sí es error.
- **Cuadro de pregunta apagado** al responder y al agotar las consultas, con el motivo en texto visible (no solo el marcador).
  Con la cuenta en solo lectura (CA-14) el panel es idéntico: no hay estado propio.
- **Reduced-motion**: el punto en vivo y el cursor quedan quietos; el texto «Escribiendo…» sigue ahí.
- **Contraste de pares nuevos** (WCAG 2.1): `agent-text` sobre `agent-bg` 8.87, `agent-accent` sobre `agent-bg` 6.07, `agent-text`
  sobre `agent-tag` (chips y pregunta) 6.57, blanco sobre `primary` 5.11, borde `input` sobre `agent-bg` 3.63, `warning-foreground`
  sobre `warning` al 10 % sobre `card` 4.87, `destructive` sobre `card` 5.39 y sobre su tinte 5.00, `muted-foreground` sobre `card`
  4.76, `secondary-foreground` sobre `muted` 7.45 y sobre `accent` 6.59, `primary-hover` sobre `brand` al 12 % 6.03.
  `agent-accent` sobre `agent-tag` da 4.50 (al límite): no se usa como texto en hover; ahí el texto cambia a `agent-text`.

## Fuera de esta pantalla
- Selector de carpeta y de archivo del ámbito: reutilizará «Mover a…» de 006; el ámbito desde la ficha del archivo es de la ficha.
- Vista previa en la ubicación citada: llega con 017. Hasta entonces, la cita abre la ficha con la ubicación visible (P-5); el
  mockup muestra el fragmento resaltado como referencia.
- Roles internos (CA-16): no ven el agente ni una entrada hacia él.

## Pendiente
- Botón principal `#6B8DD6` con texto blanco (3.28:1, DF-41) del paquete original: ya usa `primary` (`#4A6FA5`, 5.11:1).
- Aprobación del equipo de los 12 estados.
- Decisión del equipo: ¿el cuadro de pregunta sigue activo con 0 archivos indexados (CA-7 no descuenta) o se apaga? El mockup lo deja activo.
