# Revisión 000b — Sistema de Diseño Cielo Sereno y Fundaciones de UI

| Campo | Valor |
|---|---|
| Fecha | 2026-09-22 |
| Rango revisado | `main..HEAD` (`860666e..632d815`) |
| Veredicto | 🔁 Cambios requeridos |

## Resumen
La base visual está bien encaminada: `globals.css` reproduce los tokens de `ui-guidelines.md` §3 con los tonos AA de DF-41 a DF-45, las fuentes y el idioma español están en el layout, y los componentes viven en `apps/web` sin tocar backend ni mockups. Esta revisión independiente no confirma el veredicto ✅ del 2026-09-20: ese informe lo cerró la misma dueña de la rama, y el código todavía se aparta de la constitución en el chip de citas y en el menú móvil.

## Bloqueantes
- **[B-1]** `apps/web/src/components/nimbo/citation-chip.tsx:39` y `:44` — La ubicación usa `text-[11px]` y el aviso de cita incierta usa `bg-amber-500/20`, `text-amber-300`, `text-[10px]` y `py-0.2`. Esos colores no existen en Cielo Sereno y esas medidas no están en la excepción de `ui-guidelines.md` §5 (`border-l-[3px]` y `border-[1.5px]`). — Viola: Art. XIII, spec RN-2, `ui-guidelines.md` §1.3. — Sugerencia: aviso con token semántico (`text-warning-foreground` sobre un fondo derivado de `--warning`) y tamaño `text-xs`. El texto de «ubicación estimada» ya cumple que el color no sea el único diferenciador; hay que quitar la paleta `amber` de Tailwind.

- **[B-2]** `apps/web/src/components/nimbo/app-layout.tsx:91` — El drawer se declara `role="dialog"` y `aria-modal="true"`, pero no mueve el foco al abrirse, no se cierra con Escape, no tiene nombre accesible y el contenido de detrás sigue en el orden de tabulación. `app-layout.spec.tsx` solo comprueba el `aria-label` del botón con el menú cerrado, y `a11y.spec.tsx` no monta `AppLayout`, así que CA-7 no ve este diálogo. — Viola: CA-5 (menú accesible) y RNF-13. — Sugerencia: al abrir, enfocar el diálogo o el primer enlace; cerrar con Escape y al activar un enlace; `aria-labelledby` en el título; `inert` en el resto de la página. Cubrir el menú abierto en la prueba de axe.

## Importantes (no bloquean, deben atenderse antes de cerrar la fase)
- **[I-1]** `apps/web/src/app/globals.spec.ts:46` — Los ratios AA se calculan sobre hexadecimales escritos en la prueba, no sobre los valores de `globals.css`. CA-1 solo busca el nombre de la variable. Cambiar `--primary` no haría fallar CA-2. DF-44 (texto del chip sobre fondo al 12 %) no se mide. — Sugerencia: leer las variables del CSS y contrastar esos valores, incluidos los pares de `--file-*`.

- **[I-2]** `apps/web/src/components/nimbo/state-view.tsx:19` — `type="error"` admite renderizarse sin `action`. La tarea T-10 y `verification.md` dicen que la acción correctiva es obligatoria (RNF-14); el tipo no lo exige y la prueba solo cubre el caso en que el llamador ya pasó el botón. — Sugerencia: unión discriminada que exija `action` cuando `type` es `error`.

- **[I-3]** `apps/web/src/app/layout.spec.tsx:6` — CA-3 queda comprobado con `lang="es"` y la clase `font-sans`. La prueba no afirma Inter, JetBrains Mono ni cifras tabulares. `tabular-nums` no está aplicado a `font-mono` (la guía lo pide para cifras, no como feature global de la fuente). — Sugerencia: afirmar las variables `--font-inter` y `--font-jetbrains-mono` en el markup, y usar `tabular-nums` en cifras (versión de la API, cuotas).

- **[I-4]** `apps/web/src/components/ui/button.tsx:20` y `input.tsx:15` — El alto por defecto es `h-10` (40 px). CA-5 pide 44×44 px en los controles del layout. El menú sí usa `h-11`, pero la navegación usa `min-h-[44px]` y `StateView` usa `min-h-[220px]`: medidas arbitrarias fuera de la excepción de §5. — Sugerencia: alto mínimo `h-11` / `min-h-11` en controles táctiles del layout, y una clase de la escala para la altura del estado vacío.

- **[I-5]** `specs/000b-sistema-de-diseno/plan.md:123` — El plan atribuye Tailwind y los tokens a ADR-0015. Ese ADR es el de dependencias de fundaciones (gitleaks, zod, Pino, Testcontainers). La decisión de UI es ADR-0014, que sigue Pendiente. `design-findings.md` deja DF-41 a DF-48 en Abierto, mientras las notas de `tasks.md` dicen que quedaron resueltos. Además, el ✅ anterior y el commit `632d815` registran la aprobación de la dueña: el Art. XIV exige un integrante distinto del autor. Esta revisión no sustituye esa compuerta humana.

- **[I-6]** `apps/web/src/components/ui/input.tsx:6` — CA-4 pide estado de error con mensaje accesible. El componente marca `aria-invalid` y no asocia un texto de error (`aria-describedby` / `aria-errormessage` propio). El llamador puede hacerlo, pero la pieza base no ofrece el mensaje.

## Sugerencias
- **[S-1]** Parametrizar la navegación de `AppLayout` cuando la consuman 001 y 005. Hoy «Mis Archivos» va fijo como activo y los `href` son anclas (`#archivos`).
- **[S-2]** La fila activa usa `border-l-primary`. La guía §5 dice `border-l-brand`. `primary` contrasta mejor; conviene dejar la diferencia escrita en la spec para no «corregirla» hacia el tono decorativo.
- **[S-3]** `text-white` en el botón destructivo, el badge y el isotipo, y `bg-black/40` en el velo, no son tokens. Equivalen a `text-primary-foreground` y a un token de velo cuando exista.
- **[S-4]** El ícono de PDF es `FileCode`. `FileText` ya está usado por DOCX; un ícono de documento genérico evita leer el PDF como código. `jest-axe` está en `package.json` y la suite importa `axe-core` directo.
- **[S-5]** La spec nombra `AgentQuoteChip` y el código, el plan y `ui-guidelines.md` §4 usan `CitationChip`. Alinear el nombre en la spec.

## Checklist
| Aspecto | Estado |
|---|---|
| Cumple spec y criterios | Parcial: CA-1, CA-3 (carga de fuentes), CA-6 y la paleta de CA-2 están en el código. CA-5 y RN-2 no. |
| SOLID | Sí. Componentes pequeños y variantes con CVA. |
| YAGNI (sin abstracciones ni código especulativo) | Sí en alcance. `jest-axe` queda sin uso. |
| DRY (fuentes únicas respetadas) | Casi: la fuente es `globals.css`, con fugas en `CitationChip` y en `text-white`. |
| Código limpio | Sí en nombres y tipos. Hay utilidades que no salen de la escala. |
| Fronteras de módulos y capas | Sí. Solo `apps/web`; no importa mockups ni toca módulos de API. |
| Seguridad y aislamiento | No aplica a datos de cliente. La página de estado sigue sin filtrar detalles de salud (CA-33 de 000). |
| Bitácoras sin datos sensibles | No aplica. |
| Migraciones reversibles | No aplica. |
| Pruebas suficientes y significativas | Insuficientes para los CA que fallan: el contraste no lee el CSS y el drawer abierto no entra en axe. |
| UI: tokens de `ui-guidelines.md`, sin hex, componentes reutilizados, estados completos | Tokens centrales correctos. Chip de cita y medidas arbitrarias fuera de la guía. |
| Documentación actualizada | `verification.md` y `ui-review.md` dan por cerrado lo que las pruebas no atan. ADR y DF desalineados. |

## Lo que está bien hecho
1. `globals.css` coincide con el bloque de `ui-guidelines.md` §3: primario `#4A6FA5`, atenuado `#5E7389`, semánticos de texto, borde de control `#7F93AA`, panel del agente y fondos de archivo al 12 %. Los tonos decorativos no se usan como texto.
2. `prefers-reduced-motion` está en la hoja global y el documento va en `lang="es"` con Inter y JetBrains Mono vía `next/font`.
3. `Button`, `Input`, `Card`, `Badge`, `FileTypeChip` y `StateView` usan utilidades de token, foco visible y textos en español. El error de `StateView` usa `role="alert"` y la carga usa `role="status"` con `aria-live`.
4. La galería de `/` no rompe los criterios de la página de estado de la spec 000: sigue mostrando ambiente y disponibilidad sin filtrar el cuerpo de `/health/ready`.
5. No hay dependencia nueva de backend, ni hex en los componentes atómicos, ni importación desde `docs/design/mockups/`.
