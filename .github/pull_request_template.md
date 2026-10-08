## Spec
- Spec: `specs/NNN-slug/` — Estado: En revisión
- Requisitos: RF-xx, RNF-xx
- Tareas incluidas: T-xx … T-yy

## Qué cambia
<!-- 2–5 líneas: comportamiento nuevo desde el punto de vista del usuario u operador -->

## Cómo probarlo en staging
<!-- Sin staging hasta el bloque 6 de 000: pasos en local (`docker compose up -d` + `pnpm dev`), `workflow.md` §7.2 -->
1.
2.

## Evidencia
<!-- no mostrar en la evidencia lo que no aplica -->
- [ ] **PR parcial** (`workflow.md` §4.8): bloque(s) … de N; `review.md` se entrega en el último PR
- [ ] `review.md` sin bloqueantes — Verificación (CA cubiertos: n/m) · Seguridad (o no aplica) · UI (o no aplica)
- [ ] CI verde: lint · typecheck · unit · integration (migraciones, int, isolation)
- [ ] Cobertura de lógica de negocio ≥ 60 %
- [ ] Constitución Art. IV–VII: SOLID (una razón de cambio, puertos pequeños), YAGNI (nada sin CA que lo pida) y DRY (fuentes únicas, sin números mágicos)

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
- [ ] **Autoaprobado** (`workflow.md` §7.1): solo PRs del diseñador principal

> Aprobación requerida de un integrante distinto del autor (RNF-19). Única excepción: `workflow.md` §7.1.
