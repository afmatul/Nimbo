# Revisión 020b — Panel del agente (web)

> Una página. La escribe `reviewer` (con `security-auditor`, `workflow.md` §4) y la aprueba Adrián.

| Campo | Valor |
|---|---|
| Fecha | 2026-10-28 (segunda pasada) |
| Rango revisado | `79784e97..028164fb`, commits `[020b …]` incl. T-FIX-1 (12f3c639) y T-FIX-2 (028164fb) |
| CI (local) | `lint` ✅ · `typecheck` ✅ · `pnpm test`: web ✅ 216 suites / 1858 pruebas; api 7 fallos de temporización bajo carga paralela que pasan solas (34/34) · `test:int` ✅ (165 suites, 1563 pruebas) · `test:isolation` 459/460, único fallo `billing-renewal.iso-spec.ts` (ADR-0031 010a-4, ajeno a la 020; rutas de Windows, I-3) |
| Veredicto | ✅ Sin bloqueantes (I-2 e I-5 aprobados por Adrián y registrados en la spec) |

## Verificación
Todos los CA con prueba nombrada, como en la primera pasada (CA-1 … CA-19). Cambios de esta pasada:
| CA | Prueba | Estado |
|---|---|---|
| CA-3 (enmendado 2026-10-28) | `citation-chip.spec.tsx › CA-3` (texto «archivo·ubicación», ubicación último hijo; nombre `truncate min-w-0`, ubicación `shrink-0 whitespace-nowrap` sin `truncate`) + el resto de CA-3 | ✅ |
| CA-19 | `citation-chip.spec.tsx › CA-19` (`min-h-7 text-xs`, sin `text-[`/`min-h-5`); axe del panel a 360/1440. axe en jsdom no mide contraste: el chip usa los mismos tokens `agent-*` de antes | ✅ |

## Seguridad (security-auditor integrado)
Sin bloqueantes. Respuesta en texto plano, eventos validados con zod, token en memoria, renovación única ante 401, panel bajo `RequireRole(CLIENT_ROLES)`, sin claves del LLM en el cliente, sin `console`; aislamiento cubierto por `agent.iso-spec.ts` de la 020.
- **[SEC-3]** baja, vigente · `file-detail-view.tsx:255-267` (render de «Ubicación citada»), origen `archivo/[fileId]/page.tsx:22-28` y `citation-chip.tsx:25` (arma `?ubicacion=`) · se pinta cualquier `?ubicacion=` sin límite de largo ni patrón: suplantación de contenido con un enlace armado (no es XSS) y el nombre de una hoja queda en URL/historial. Corrección: acotar el largo y aceptar solo etiquetas conocidas («Página n», «sec. n, párr. n», «línea n», hoja/diapositiva), o pasarla por estado. Importante antes del cierre de fase, no bloquea.

## UI
Chip conforme al CA-3 enmendado y al README del mockup actualizado: icono 14 px, nombre en `font-semibold` truncable, «·» decorativo (`aria-hidden`), ubicación al final sin truncar, objetivo 28 px, `title` y `aria-label` completos, borde discontinuo + icono para la aproximada. Escala estándar de Tailwind, sin valores arbitrarios nuevos. Sin regresiones vistas en el resto del diff.

## Bloqueantes
Ninguno. **B-1** corregido (Prettier ✅, `lint` en verde). **B-2** corregido (enmienda aprobada por Adrián registrada en spec, plan D-7, mockup y tasks; prueba restaurada y ampliada).

## Importantes y sugerencias (vigentes)
- **[I-1]** parcial: el chip ya no usa `text-[11px]`. Quedan `agent-panel.tsx:196` `[overflow-wrap:anywhere]` (→ `wrap-anywhere`) y `--agent-panel-width` (`uploads-provider.tsx:69`, `app-layout.tsx:196`, `use-agent-panel-width.ts:13`): registrar el token de layout en `globals.css` y `ui-guidelines.md`.
- **[I-2]** ✅ Resuelto: asa de ancho del panel y Enter para enviar aprobados por Adrián y registrados en la spec (§6 y registro de cambios, 2026-10-28). Queda como sugerencia: entre 901 y 1100 px `main` queda en ~225 px y `aria-valuemax` anuncia 720 sin ser el máximo real.
- **[I-3]** unión de 15 estados duplicada (`agent-screen.ts:15-30` y `agent-panel-notices.tsx:17-32`): re-exportar el tipo.
- **[I-4]** dependencia bidireccional `features/storage` ↔ `features/intelligence`: declararla en plan y `architecture.md` §9, o `AskAgentButton` por slot.
- **[I-5]** ✅ Resuelto: textos nuevos y estado `vacio` del mockup aprobados por Adrián (sin mockups nuevos); ajustes de T-09 y correcciones de la revisión anotados en el registro de cambios de la spec.
- **[S-1]** espacio antes de la puntuación al quitar `[n]` (`agent-answer.tsx`). **[S-2]** rótulo «Respuesta» sobre `<p>` vacío. **[S-3]** ofrecer «Preguntar de nuevo» en `ambito-no-disponible`. **[S-4]** `quotaMessage` sin `limit` dice «Usaste tus 0 consultas».

## DF y pendientes
- DF-xx: ninguno. `pendientes.md`: fila para la sesión del agente que se pierde en `/cuenta/seguridad` (fuera de `(cliente)`) y otra para los dos tests de temporización sensibles a carga (`redact-deep` CA-15, `gemini-embedding`), si se repiten en CI.

## Lo que está bien hecho
Corrección de B-2 por la vía correcta (spec, plan, mockup y prueba en el mismo commit, con aprobación explícita); pruebas del chip que afirman el comportamiento y no la clase por gusto; SSE validado por evento; texto plano sin HTML; 12 estados del mockup más los derivados.
