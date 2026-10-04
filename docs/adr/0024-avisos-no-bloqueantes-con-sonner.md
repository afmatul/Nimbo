# ADR-0024 — Avisos no bloqueantes con `sonner` (componente toast de shadcn/ui)

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-09-30 |
| Decisores | Adrián (aprobó la decisión el 2026-09-30; flujo `workflow.md` §2, ADR para dependencia nueva) |
| Specs relacionadas | 006 (y las que confirmen acciones: 007, 008, 010) |

## Contexto

La spec 006 necesita avisos no bloqueantes con acción: «Movimos … a la papelera» + «Ver papelera», «Restauramos…» + «Abrir carpeta», «Vaciaste la papelera». Hoy `apps/web` no tiene ningún componente de toast (solo `alert-dialog` y `dropdown-menu` de Radix). Constitución y `ui-guidelines.md` exigen: AA, foco visible, colores solo por tokens de Cielo Sereno, y que ninguna información dependa de algo efímero sin alternativa.

Requisitos del aviso:
- `role="status"` / `aria-live="polite"`, nunca asertivo.
- Duración de al menos 8 s; se pausa con hover y con foco.
- La acción se alcanza y activa con teclado.
- Solo colores por tokens (`bg-card`, `text-foreground`, `border-border`, …), sin hex.
- Los **errores no son toast**: siguen como `Alert` persistente (RNF-14: acción correctiva visible).

Versión del repo: React 19.3.0, Next 15.5.25 (App Router), Tailwind v4, shadcn/ui.

## Opciones consideradas

1. **`sonner` vía `npx shadcn add sonner`** — es el componente toast vigente de shadcn/ui. Pros: una sola dependencia pequeña sin dependencias de runtime, peer `react ^18 || ^19` (compatible con 19.3.0), API imperativa `toast(msg, { action, duration })` sin provider por pantalla (un `<Toaster />` en el layout), región `aria-live="polite"`, pausa con hover, botones nativos de acción, cola y apilado resueltos, estilos reemplazables por clases Tailwind. Contras: dependencia nueva; su estilo por defecto hay que mapearlo a tokens; la pausa por foco y el rol exacto hay que verificarlos con prueba, no suponerlos.
2. **Radix Toast (`@radix-ui/react-toast`)** — pros: misma familia que las dependencias Radix actuales, `role="status"`, pausa por hover/foco y atajo F8 nativos. Contras: shadcn lo marcó como reemplazado por sonner, así que ya no hay generador mantenido; exige `ToastProvider` + estado propio para la cola y el disparo imperativo; más código para el mismo resultado.
3. **Componente propio** — pros: cero dependencias. Contras: reimplementar cola, temporizadores con pausa, región live, apilado y reduced-motion con un equipo de 4 y 10 semanas; riesgo de accesibilidad que nadie más revisa. Viola YAGNI/«no reinventar».
4. **Posponer** — pros: ninguno real; la 006 no puede cerrar sus CA de aviso y se caería a `alert()` o a Alert persistente en pantalla, con peor UX.

## Decisión

Adoptar la opción 1: **`sonner` 2.0.8** (última estable a 2026-09-30; fijada exacta como el resto de dependencias del repo), añadida con el generador de shadcn en `apps/web/src/components/ui/sonner.tsx`.

Reglas:
- Un único `<Toaster />` en el layout raíz, envuelto por un componente `Nimbo` mínimo (`components/nimbo/`) o configurado en `ui/sonner.tsx` con `duration` ≥ 8000 ms, `position` fija, `closeButton`, y `toastOptions.classNames` solo con utilidades de tokens (`bg-card text-foreground border-border`, acción `bg-primary text-primary-foreground`). Sin `richColors` por defecto de la librería ni hex.
- Se usa solo para confirmaciones de éxito con acción opcional. **Los errores y los estados que el usuario debe poder releer siguen como `Alert`/`ErrorState`.** Ninguna información vital vive solo en un toast: el resultado también es visible en la pantalla (la carpeta ya no lista el elemento, la papelera lo muestra).
- Los textos están en español en el componente que dispara el aviso, no en la librería.
- Obligatorio en la prueba del componente (jest-axe + user-event): región `aria-live="polite"`, la acción se activa con Enter/Espacio, el aviso no desaparece mientras tiene hover o foco, y respeta `prefers-reduced-motion`. Si la pausa por foco no la da la librería, se resuelve en el wrapper (pausar al `onFocus` del contenedor) o se vuelve a abrir este ADR.
- Se agrega una línea en `ui-guidelines.md` §4 que remite a este ADR.

## Consecuencias

- Positivas: una dependencia pequeña mantenida y alineada con shadcn; confirmaciones accionables sin bloquear; patrón reutilizable por 007, 008 y 010; sin lógica propia de temporizadores.
- Negativas / deuda aceptada: dependencia significativa nueva (por eso este ADR); hay que mantener el mapeo a tokens al actualizar shadcn; el toast es efímero, de ahí la regla de que nunca sea el único canal.
- Cómo sabremos si fue un error: la prueba de accesibilidad de la 006 no logra cumplir pausa por foco o `aria-live` sin parches grandes; axe reporta violaciones atribuibles a la librería; o aparecen usos para errores. En ese caso se migra a Radix Toast (opción 2), cuya superficie en la app es un solo wrapper.
