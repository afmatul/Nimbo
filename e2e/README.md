# Pruebas E2E (marcador)

Aquí vivirán las pruebas de extremo a extremo con Playwright (`e2e/<flujo>.e2e.ts`, `conventions.md` §Pruebas).
Las introducen las specs 000b (accesibilidad con axe) y 023 (carga y aislamiento global).

Hasta entonces, `pnpm test:e2e` ejecuta `scripts/placeholder.mjs` y termina con código `0` (CA-4 de la spec 000).
Las capturas de pruebas automáticas van en `e2e/__screenshots__/`, separadas de `docs/design/capturas/`.
