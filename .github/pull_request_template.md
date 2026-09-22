## Spec
- Spec: `specs/NNN-slug/` — Estado: En revisión
- Requisitos: RF-xx, RNF-xx
- Tareas incluidas: T-xx … T-yy

## Qué cambia
<!-- 2–5 líneas: comportamiento nuevo desde el punto de vista del usuario u operador -->

## Cómo probarlo en staging
<!-- Fase 1: sin staging; pasos en local (`docker compose up -d` + `pnpm dev`), `workflow.md` §7.2 -->
1.
2.

## Evidencia
<!-- no mostrar en la evidencia lo que no aplica -->
- [ ] **PR parcial** de spec transversal (plan §9b, `workflow.md` §4.8): bloque(s) … de N; la evidencia de abajo se entrega en el último PR
- [ ] `verification.md` (CA cubiertos: n/m)
- [ ] `security.md` o no aplica porque: …
- [ ] `ui-review.md` o no aplica porque: …
- [ ] `review.md` sin bloqueantes
- [ ] CI verde: lint · typecheck · unit · int · isolation · migraciones
  <!-- Fase 1: sin CI; pegar el resumen de lint, typecheck, test y test:int corridos en local (`workflow.md` §7.2) -->
- [ ] Cobertura de lógica de negocio ≥ 60 %

## Cambios de datos y contratos
<!-- no mostrar en el PR lo que no aplica -->
- [ ] Migraciones con `down` probado (`run → revert → run`)
- [ ] OpenAPI / `packages/contracts` actualizados
- [ ] `.env.example` actualizado
- [ ] ADR creado/actualizado: …

## Operación
<!-- no mostrar en el PR lo que no aplica -->
- [ ] Bitácoras con `correlationId` y sin datos sensibles
- [ ] Métricas nuevas: …
- [ ] Degradación controlada si depende de indexación, optimizador u ONLYOFFICE

## Documentación
<!-- no mostrar en el PR lo que no aplica -->
- [ ] Spec actualizada (registro de cambios si hubo desviaciones)
- [ ] Manual técnico / de usuario afectado actualizado

## Interfaz
<!-- no mostrar en el PR lo que no aplica -->
- Mockup: `docs/design/mockups/<modulo>/<pantalla>/`
- [ ] Todos los estados de la spec §9 implementados
- [ ] Solo tokens de `ui-guidelines.md` (sin hex ni valores arbitrarios)
- [ ] axe sin violaciones serias a 360 y 1440 px

<!-- Capturas de la implementación (360 px y 1440 px) junto a las del mockup -->

## Aprobación
<!-- no mostrar en el PR lo que no aplica -->
- [ ] **Autoaprobado** (excepción de Fase 1, `workflow.md` §7.1): solo PRs del diseñador principal, hasta el 25/09/2026

> Aprobación requerida de un integrante distinto del autor (RNF-19). Única excepción: `workflow.md` §7.1.
