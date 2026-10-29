# Plan 020b — Panel del agente (web)

> Spec: `./spec.md` · Estado del plan: Aprobado (Adrián, 2026-10-25)
> Solo `apps/web`. Consume los contratos y endpoints de la 020; no toca `api`, `packages/contracts` ni migraciones.

## 1. Resumen técnico y decisiones
Un panel lateral montado una sola vez en el layout del Cliente, abierto desde «Agente Nimbo» y desde «Preguntar sobre esto».
Un cliente de `fetch` lee la respuesta SSE de `POST /agent/ask`; un hook guarda la sesión **solo en memoria** y deriva el estado de pantalla;
el panel es presentacional y pinta los 12 estados del mockup con `StateView`, `Alert` y `CitationChip`.

- **D-1 Transporte** (plan 020 D-6). `streamAnswer` usa `fetch` con `Authorization` y `AbortController` (`EventSource` no admite POST). Antes del primer marco, un
  estado no-2xx se lee como JSON `errorResponseSchema` y se lanza como `ApiClientError` con `code` (422, 404, 429, 503, 403); el catálogo de errores traduce por `code`.
  Ante `401 SHARED_UNAUTHENTICATED` renueva **una vez** y repite, igual que `createAuthFetch` (`authFetch` solo lee JSON, por eso no sirve para el flujo; la lógica de renovar-una-vez se
  repite por segunda vez, no por tercera: no se extrae todavía, Art. VI.2).
- **D-2 Lector SSE**. Acumula bytes, parte por línea en blanco, parsea `data:` como JSON y valida cada marco con `agentEventSchema` (zod, de la 020). Un marco inválido o un corte
  de red a mitad se trata como `error` en curso (conserva lo recibido, CA-9). Marcos partidos entre trozos son el caso de prueba central. Función pura `parseSseFrames` aparte del `fetch`.
- **D-3 Estado**. `useAgentConversation` mantiene `turns[]` (pregunta, texto acumulado, citas por ordinal, resultado), `status` (`idle | streaming | …`), ámbito y `AbortController`; sin
  `localStorage`/`sessionStorage` (RN-4, CA-17). La vista deriva el estado del mockup de `status`, `turns`, `GET /agent/status` y el último error por `code`. Es un reductor inmutable.
- **D-4 Proveedor y entrada**. `AgentProvider` (en el layout del Cliente) sostiene el hook, así navegar conserva la sesión y recargar la vacía (CA-17). `components/nimbo` no importa `features`:
  `AgentEntry` (contexto, patrón de `HeaderAccountProvider`) recibe el panel y `open()`; el proveedor lo llena. «Agente Nimbo» pasa de `href: '#agente'` a abrir el panel (`NavItem` gana `onSelect?` opcional; sin él es enlace).
  Los roles internos usan otro layout y nunca montan el proveedor (CA-18).
- **D-5 Panel**. Escritorio (> 900 px): complemento no modal de 420 px a la derecha, bajo el encabezado; `main` reserva ese ancho. ≤ 900 px: hoja a pantalla completa, modal (`inert` el fondo, foco atrapado,
  «Cerrar el agente» de 44 px). Al cerrar, el foco vuelve a quien lo abrió. Conversación en `role="log"` con `aria-live="polite"` y `aria-busy` al llegar texto; con reduced-motion el punto y el cursor quedan quietos.
- **D-6 Respuesta en texto plano** (CA-13). El texto va como nodos de texto de React (nunca `dangerouslySetInnerHTML`, sin Markdown ni autoenlace). Cada `[n]` del texto se sustituye por el `CitationChip` del ordinal
  `n` recibido en un evento `citation`; un `[n]` sin cita se deja como texto. La web no construye citas (RN-2).
- **D-7 `CitationChip`**. Ya existe. Cambia: muestra «nombre del archivo · `label`» con la etiqueta siempre visible al final (se trunca el nombre, nunca la etiqueta; `min-h-7 text-xs`, objetivo táctil ≥ 24 px), `label` tal como llega (019 añade « (ubicación aproximada)»; el chip **no** repite el texto), conserva ícono y borde discontinuo para `!isCertain`, y su `aria-label` deja de agregar «(ubicación estimada)».
  Su clic navega a `/archivos/archivo/<fileId>?ubicacion=<etiqueta>`; con 017 solo cambia el destino (S-6).
- **D-8 Ámbito** (RN-9 de 020, S-1). El botón dice el ámbito vigente. «Una carpeta» abre el árbol de «Mover a…» (`useFolderTree`, `MoveFolderTree`) con selección única y sin celdas deshabilitadas. «Un archivo» muestra el archivo fijado desde la ficha o aparece apagada.
  `useTreeFocus` hoy es local de `move-dialog.tsx`; al ser su segundo uso se **mueve** a `hooks/use-tree-focus.ts` (no se copia) y `move-dialog.tsx` lo importa.
- **D-9 Cuota visible**. `GET /agent/status` (con `authFetch`) al abrir y al terminar cada respuesta; el medidor usa `QuotaBar` por tramos del mockup. «Ver planes» va a `PLANS_PATH`; «Renovar plan», a `RENEW_PATH` (`features/billing/routes.ts`).
- **E2E**: Playwright sigue siendo marcador (`pnpm test:e2e`, hasta 000b/023); no se agrega aquí. El recorrido de la demo (T-09) es humano.

## 2. Módulos, archivos y diseño
| Módulo / capa | Archivo (nuevo o cambiado) | Responsabilidad |
|---|---|---|
| web/intelligence | `features/intelligence/agent-api.ts`, `agent-stream.ts` | `getStatus` con `authFetch` (zod); `streamAnswer({request, signal, auth})` → iterable de eventos validados; `parseSseFrames` pura; renueva una vez ante `401` |
| web/intelligence | `features/intelligence/hooks/use-agent-conversation.ts`, `components/agent-provider.tsx` | Reductor de la sesión (solo memoria), ámbito, cancelar/reintentar, estado derivado; el proveedor lo monta y llena `AgentEntry` |
| web/nimbo | `components/nimbo/agent-panel.tsx` | `AgentPanel` presentacional: cabecera con contador y ámbito, conversación, campo con contador de caracteres, 12 estados con `StateView`/`Alert`, hoja a 360 px |
| web/nimbo | `components/nimbo/agent-answer.tsx` | Una pregunta y su respuesta: texto plano, `[n]` → `CitationChip`, aviso de ubicación aproximada, «Escribiendo…» y «Detener» |
| web/intelligence | `features/intelligence/components/agent-scope-picker.tsx` | Menú de tres opciones (`menuitemradio`) y árbol de carpetas reutilizado; entrega `AgentScope` (`all \| folder \| file`) |
| web/storage | `features/storage/hooks/use-tree-focus.ts`, `components/move-dialog.tsx` | Extrae `useTreeFocus` sin cambiar su comportamiento; `move-dialog.tsx` solo cambia el import (sus pruebas deben seguir en verde) |
| web/nimbo | `components/nimbo/citation-chip.tsx` | D-7: etiqueta del servidor sin texto duplicado, `onOpen` por `onClick` |
| web/nimbo | `components/nimbo/agent-entry.tsx`, `app-layout.tsx` (+ `app-sidebar.tsx`) | Contexto `AgentEntry`; «Agente Nimbo» abre el panel (`NavItem.onSelect?`); `main` reserva 420 px con el panel abierto |
| web/app | `app/(app)/(cliente)/layout.tsx` | Monta `AgentProvider` dentro de `RequireRole` (junto a `SessionUploadsProvider`) |
| web/storage | `features/storage/components/file-detail-view.tsx` | «Preguntar sobre esto» (ámbito archivo) y línea «Ubicación citada: <etiqueta>» desde `?ubicacion=`; archivo ajeno o en papelera sigue en la vista «No encontramos este archivo.» (sin ubicación) |
| web/storage | `features/storage/components/file-explorer.tsx` | «Preguntar sobre esto» en la carpeta abierta (ámbito carpeta) |
| web/lib | `lib/error-catalog.ts` | Mensajes por `code` del agente (`AGENT_INVALID_QUESTION`, `AGENT_SCOPE_NOT_FOUND`, `AGENT_QUOTA_EXCEEDED`, `AGENT_UNAVAILABLE`) con causa y corrección (RNF-14) |

- 12 filas. Pruebas: §6. Fuente: `docs/design/mockups/intelligence/panel-agente/`; la fila de `ui-guidelines.md` §7 ya dice 020b.
- **Puertos nuevos: ninguno** (`architect` no interviene). **Dependencias entre módulos**: ninguna nueva en `api`; en la web, `features/intelligence` usa `features/storage` (árbol de carpetas) y `features/billing/routes`
  solo por sus índices públicos. Sin dependencias npm nuevas.
- Reutiliza (Grep hecho): `authFetch`/`useAuthFetch`, `requestJson`/`ApiClientError`, `StateView`, `Alert`, `QuotaBar`, `CitationChip`, `useFolderTree`/`MoveFolderTree`, `messageForCode`/`storageMessage`.
- Funciones ≤ 30 líneas y ≤ 3 parámetros (objetos de entrada: `StreamRequest`, `PanelProps`). El panel se divide en subcomponentes por estado si se acerca al límite.

## 3. Datos
Sin migraciones ni tablas. Estado solo en memoria del navegador; nada en `localStorage`/`sessionStorage` (CA-17).

## 4. Contratos
Consumidos de la 020 (`packages/contracts/src/intelligence/`), sin redefinirlos:
| Método | Ruta (`/api/v1`) | Uso en la web | Errores (`code`) que la web traduce |
|---|---|---|---|
| POST | `/agent/ask` | `{question, scope?}` → SSE `citation`, `delta`, `done`, `error` | 422 `AGENT_INVALID_QUESTION`; 404 `AGENT_SCOPE_NOT_FOUND`; 429 `AGENT_QUOTA_EXCEEDED` (`limit`, `resetsAt`); 429 `SHARED_TOO_MANY_REQUESTS`; 503 `AGENT_UNAVAILABLE`; 401 `SHARED_UNAUTHENTICATED` (renueva); 403 `SHARED_FORBIDDEN` |
| GET | `/agent/status` | `{used, limit, resetsAt \| null, hasIndexedFiles, maxQuestionChars}` para el contador, el estado vacío y la validación de la pregunta (la 020 lo confirma en su S-3) | 403 `SHARED_FORBIDDEN` |

- Eventos: `citation {ordinal, fileId, versionId, fileName, label, isCertain}` (antes del `delta` que lo menciona); `delta {text}`; `done {outcome, used, limit}`; `error {code: 'AGENT_UNAVAILABLE'}` a mitad de flujo.
- Códigos de error: se importan de `INTELLIGENCE_ERROR_CODES` (la 020 los suma ahí; no existe `AGENT_ERROR_CODES`).
- Supuestos para la 020 (no se cambian aquí): `resetsAt: null` en solo lectura agotada, ya decidido en su plan. `SHARED_TOO_MANY_REQUESTS` se muestra con el mensaje genérico del catálogo («Demasiadas solicitudes…»).
- Ruta de la cita: `/archivos/archivo/<fileId>?ubicacion=<etiqueta>`; ficha existente (014). Sin eventos Socket.IO.

## 5. Seguridad y operación
- Sin aislamiento propio: **igual que 020** (`test/isolation/agent.iso-spec.ts` cubre ámbitos ajenos, papelera y modelo malicioso en el servidor). La web agrega: texto plano (D-6), nada persistido (CA-17), y el panel solo en el layout del Cliente (CA-18).
- Ni preguntas, respuestas ni nombres de archivo van a la consola ni a ninguna telemetría del navegador; los errores se registran por `code` y `correlationId`.
- `?ubicacion=` lleva solo la etiqueta (por ejemplo «Página 3»), nunca el nombre del archivo. Se pinta como texto, no como HTML.
- Sin bitácoras ni auditoría nuevas en esta spec (las de la consulta son de la 020).

## 6. Estrategia de pruebas (por riesgo)
| CA | Nivel | Archivo |
|---|---|---|
| 3, 9, 10 | unit: `parseSseFrames` (marco partido, dos marcos en un trozo, marco inválido, corte a mitad), error previo al flujo → `ApiClientError` con `code`, `401` renueva una vez, abortar | `features/intelligence/agent-stream.spec.ts`, `agent-api.spec.ts` |
| 4, 14, 16, 17 | hook: reductor, detener antes y después del texto, ámbito y su restablecimiento, reintentar, **sin** `localStorage`/`sessionStorage` | `hooks/use-agent-conversation.spec.tsx` |
| 1, 2, 3, 5, 7, 8, 9 | componentes: los 12 estados del mockup (con `StateView`), contador y fecha, «Ver planes»/«Renovar plan» sin fecha, contador de caracteres, campo apagado con su motivo, foco al cerrar, `aria-live`, **axe** a 360 y 1440 px | `components/nimbo/agent-panel.spec.tsx` |
| 3, 6, 13 | componentes: `[n]` → chip, `[n]` sin cita queda texto, HTML/Markdown/enlaces como texto, chip de ubicación aproximada sin texto duplicado | `agent-answer.spec.tsx`, `citation-chip.spec.tsx` |
| 14, 16 | componente: menú de tres opciones, árbol de carpetas, archivo fijado o apagada (S-1) | `agent-scope-picker.spec.tsx` |
| 11, 12, 15 | componentes: ficha con «Ubicación citada» y «Preguntar sobre esto»; archivo inexistente → solo «No encontramos este archivo.»; botón de la carpeta | `file-detail-view.spec.tsx`, `file-explorer.spec.tsx` |
| 18 | componente: `AppLayout` sin proveedor no muestra el panel; layout interno sin entrada | `app-layout.spec.tsx` |
| regresión | `move-dialog.spec.tsx` y `app-layout.spec.tsx` actuales siguen en verde tras extraer `useTreeFocus` y `onSelect?` | (existentes) |
| 19 | axe y reduced-motion dentro de `agent-panel.spec.tsx`; capturas del mockup son la referencia visual | — |

- Sin E2E nueva (Playwright es marcador); sin repetir un CA en tres capas. Pruebas primero en lógica (lector, reductor). Cobertura de lógica ≥ 60 %.
- Los dobles de `fetch` usan fixtures SSE con los 4 eventos; los textos del servidor vienen del contrato de la 020.

## 7. Riesgos y coherencia con el diseño
1. **La 020 cambia sus contratos o eventos** mientras se parte: esta spec depende de ellos; T-01 verifica que existen en `packages/contracts` y falla con un mensaje claro. Se ordena después de las tareas de contrato de la 020.
2. **Streaming con `fetch`** en navegadores y detrás de Traefik: depende del humo de la 020 (`curl -N`). Si un proxy acumula, el texto llegaría de golpe; la prueba humana (T-09) lo comprueba en local.
3. **Panel no modal junto a la ficha**: el foco y el orden de tabulación se pueden romper; se prueban (cierre devuelve el foco, hoja modal en 360 px).
4. **Extraer `useTreeFocus`** toca 006: riesgo de regresión; mitigado moviendo sin cambios y con las pruebas de `move-dialog` como red.
5. **Etiquetas de 019** (hoja, diapositiva, « (ubicación aproximada)») pueden crecer: la web las pinta tal cual, así que no hay casos por formato en la web.
6. **Estado vacío vs. mockup** (S-2, cuatro formatos en el mockup): se avisa a `ui-designer` para actualizar la captura cuando se implemente.
- Desviaciones de los diagramas: ninguna (el panel no está en los diagramas de clases; M6 lo cubre la 020). Sin `DF-xx` nuevo.
- Pendientes que deja fuera: conectar la cita a la vista previa cuando 017 llegue (ya es PD-134 de la 020). Sin fila nueva.
- ADR requeridos: ninguno (sin dependencia nueva ni cambio de arquitectura).

## 8. Aprobación
- `architect`: no aplica (sin puerto nuevo entre módulos, sin tecnología nueva ni cambio de arquitectura).
- Adrián (2026-10-25): **Aprobado** sobre el resumen de ≤ 15 líneas, con S-1 aceptado (archivo como ámbito solo desde su ficha).

## 9. Registro de cambios
| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-10-25 | Plan inicial | Parte de la 020 por ADR-0034 | — |
| 2026-10-28 | D-7: chip «nombre del archivo · ubicación» con la ubicación al final y sin truncar | Enmienda de CA-3 (revisión B-2) | Adrián |
