# Tareas 000b — Sistema de Diseño Cielo Sereno y Fundaciones de UI

> Spec: `./spec.md` · Plan: `./plan.md`
> Leyenda: `[P]` paralelizable con otras `[P]` del mismo bloque · Cada tarea ≈ 1–2 h y un commit.

## Bloque 0 — Preparación y utilidades
- [x] **T-01** Instalar dependencias en `apps/web` (`tailwindcss`, `@tailwindcss/postcss`, `clsx`, `tailwind-merge`, `class-variance-authority`, `lucide-react`, `jest-axe`, `@types/jest-axe`) y configurar `postcss.config.mjs` — CA: n/a — Archivos: `apps/web/package.json`, `apps/web/postcss.config.mjs`
- [x] **T-02** Helper `cn(...)` en `apps/web/src/lib/utils.ts` con prueba unitaria — CA: n/a — Archivos: `apps/web/src/lib/utils.ts`, `apps/web/src/lib/utils.spec.ts`

## Bloque 1 — Tokens y tipografías (pruebas primero)
- [x] **T-03** [P] Prueba matemática de contraste WCAG AA (`globals.spec.ts`) y definición centralizada de tokens en `apps/web/src/app/globals.css` (Cielo Sereno con ajustes DF-41 a DF-45 y `prefers-reduced-motion`) — CA: CA-1, CA-2, CA-6 — Archivos: `apps/web/src/app/globals.css`, `apps/web/src/app/globals.spec.ts`
- [x] **T-04** [P] Configuración de tipografías `Inter` y `JetBrains Mono` con `next/font/google`, `lang="es"` y variables CSS en `apps/web/src/app/layout.tsx` con prueba unitaria — CA: CA-3 — Archivos: `apps/web/src/app/layout.tsx`, `apps/web/src/app/layout.spec.tsx`

## Bloque 2 — Componentes atómicos base
- [x] **T-05** [P] Prueba y componente `Button` (`apps/web/src/components/ui/button.tsx`) con variantes (`default`, `destructive`, `outline`, `secondary`, `ghost`, `link`), tamaños, estados hover/focus/disabled y estado `loading` accesible — CA: CA-4 — Archivos: `apps/web/src/components/ui/button.tsx`, `apps/web/src/components/ui/button.spec.tsx`
- [x] **T-06** [P] Prueba y componente `Input` (`apps/web/src/components/ui/input.tsx`) con borde accesible `#7F93AA` (DF-45), foco con anillo y soporte para estados de error accesible (`aria-invalid`) — CA: CA-4 — Archivos: `apps/web/src/components/ui/input.tsx`, `apps/web/src/components/ui/input.spec.tsx`
- [x] **T-07** [P] Prueba y componentes `Card` (`card.tsx`) y `Badge` (`badge.tsx`) con variantes, sombras suaves y bordes de Cielo Sereno — CA: CA-4 — Archivos: `apps/web/src/components/ui/card.tsx`, `apps/web/src/components/ui/card.spec.tsx`, `apps/web/src/components/ui/badge.tsx`, `apps/web/src/components/ui/badge.spec.tsx`

## Bloque 3 — Componentes de dominio Nimbo
- [ ] **T-08** [P] Prueba y componente `FileTypeChip` (`apps/web/src/components/nimbo/file-type-chip.tsx`) para extensiones (`.docx`, `.xlsx`, `.pptx`, `.pdf`, imagen, otro) con texto oscuro contrastado y fondo al 12% (DF-44) — CA: CA-4 — Archivos: `apps/web/src/components/nimbo/file-type-chip.tsx`, `apps/web/src/components/nimbo/file-type-chip.spec.tsx`
- [ ] **T-09** [P] Prueba y componente `CitationChip` (`apps/web/src/components/nimbo/citation-chip.tsx`) para citas del agente en superficie oscura (`#2C3A52`) con soporte de teclado y foco visible — CA: CA-4 — Archivos: `apps/web/src/components/nimbo/citation-chip.tsx`, `apps/web/src/components/nimbo/citation-chip.spec.tsx`
- [ ] **T-10** [P] Prueba y componente `StateView` (`apps/web/src/components/nimbo/state-view.tsx`) para estados vacío (`empty`), cargando (`loading`) y error (`error`) con mensaje y acción correctiva obligatoria (RNF-14) — CA: CA-4 — Archivos: `apps/web/src/components/nimbo/state-view.tsx`, `apps/web/src/components/nimbo/state-view.spec.tsx`

## Bloque 4 — Layout, accesibilidad integral y verificación
- [ ] **T-11** Layout base `AppLayout` (`apps/web/src/components/nimbo/app-layout.tsx`) responsivo desde 360 px con navegación colapsable y sin desbordamiento horizontal — CA: CA-5 — Archivos: `apps/web/src/components/nimbo/app-layout.tsx`, `apps/web/src/components/nimbo/app-layout.spec.tsx`
- [ ] **T-12** Suite de auditoría de accesibilidad automatizada con `jest-axe` evaluando 0 violaciones WCAG AA en toda la biblioteca de componentes — CA: CA-7 — Archivos: `apps/web/src/components/a11y.spec.tsx`
- [ ] **T-13** Integrar galería de demostración de componentes en la página principal `apps/web/src/app/page.tsx`, pasando suite de linter (`pnpm lint`), tipos (`pnpm typecheck`) y pruebas unitarias (`pnpm test`) — CA: CA-1..CA-7 — Archivos: `apps/web/src/app/page.tsx`, `apps/web/src/app/page.spec.tsx`

## Notas del developer
- Se resuelven formalmente los hallazgos DF-41 a DF-48.
- No se introducen dependencias fuera de las autorizadas en la spec aclarada.
