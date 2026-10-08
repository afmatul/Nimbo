# Flujo SDD express de Nimbo

Spec-Driven Development: la especificación es el artefacto principal y el código es su consecuencia.
Desde la Fase 2 (30/09/2026) el equipo usa la variante **express**: el **plan es obligatorio y se aprueba antes de
escribir código**, pero cada artefacto es corto, las tareas son pocas y verticales, y cada spec es una rama y un PR.
Las garantías no negociables no cambian: pruebas primero, aislamiento entre cuentas, migraciones reversibles, ADR
para dependencias nuevas, y `design-findings.md` y `pendientes.md` al día. Decisión: ADR-0023 (reemplaza a ADR-0009).
Encaja con Crystal Clear: la reunión de **planificación** de cada fase decide qué specs entran y quién es dueño;
la reunión de **revisión** verifica las specs terminadas.

## 1. Artefactos por spec

```
specs/NNN-slug/
├─ spec.md      # QUÉ y POR QUÉ — historias, criterios de aceptación, reglas, seguridad, UI, fuera de alcance
│                # ≤ 150 líneas. Sin detalles de implementación: el cómo vive en plan.md
├─ plan.md      # CÓMO — obligatorio. Archivos, contratos, migraciones, pruebas y riesgos. ≤ 250 líneas
├─ tasks.md     # EN QUÉ ORDEN — 5 a 12 tareas verticales de medio día a un día
└─ review.md    # cierre — una página: CA → prueba → estado, seguridad y bloqueantes
```

El plan dice qué archivos se tocan y qué se espera de cada uno; **no** es el código escrito en prosa (sin cuerpos de
funciones ni pseudocódigo línea a línea). Las decisiones grandes (dependencia significativa, cambio estructural) van
a un ADR (`docs/adr/`).

## 2. Estados y compuertas

| Estado | Entra cuando | Quién decide | Sale hacia |
|---|---|---|---|
| `Borrador` | `/spec` crea el archivo | planner | `Lista` |
| `Lista` | Spec sin preguntas `[ABIERTA]` bloqueantes, pantallas con mockup o decisión explícita, y `plan.md` **aprobado por Adrián** | **Adrián** | `En curso` |
| `En curso` | Primer commit de `feat/NNN-*` | dueño de la spec | `En revisión` |
| `En revisión` | Tareas marcadas, CI en verde y `/review` corrido | reviewer + Adrián | `Hecha` o vuelve a `En curso` |
| `Hecha` | PR integrado y desplegado en staging (mientras no exista staging: integrado y demostrable en local, §7.2) | Adrián | — |

**Compuertas humanas obligatorias**: aprobar la spec y su plan antes del código, y aprobar el PR. Las dos las da
Adrián (tech lead); sus propios PRs siguen §7.1. `architect` solo interviene, antes de esa aprobación, si el plan
agrega un puerto entre módulos, una tecnología nueva o cambia la arquitectura. Los agentes proponen; el equipo decide.

## 3. Secuencia típica

```
Dueño: /spec "carga de archivos por partes"        → planner → spec.md (Borrador) con preguntas
Dueño responde preguntas
Dueño: /plan 005                                    → planner → plan.md
                                                      (architect, solo si hay puerto nuevo / tecnología nueva)
Adrián revisa spec + plan (Claude le prepara el resumen) → Aprobado → spec en Lista
Dueño: /tasks 005                                   → planner → tasks.md (5–12 tareas)
Dueño: /implement 005                               → developer → prueba roja → código → verde → commit por tarea
Dueño: /review 005                                  → reviewer (+ security-auditor si aplica) → review.md
Dueño abre el PR → CI verde → Adrián aprueba → squash merge → Hecha
```

## 4. Reglas del flujo

1. **Una spec ≈ un entregable demostrable** en ≤ 3 días de una persona. Si es más grande, se divide en dos specs.
2. Las specs se numeran en orden de creación; el orden de implementación lo dan las dependencias en `specs/README.md`.
3. **Tiempos de referencia**: spec 1 h · plan 2 h · revisión del plan 30 min · implementación 1–3 días · revisión
   del PR 1 h. Si algo pasa del doble, el dueño avisa a Adrián en vez de seguir.
4. **Tareas verticales**: 5 a 12 por spec, cada una de medio día a un día, y cada una deja algo probado de punta a
   punta (contrato + dominio + endpoint + prueba, o componente + prueba). Sin tareas de «cierre» ni de
   «actualizar casillas»: el PR integrado es el cierre. Una sola tarea humana: el recorrido de la demo.
5. **Pruebas por riesgo** (el Art. III sigue: pruebas primero, integración contra servicios reales):
   - unitarias para reglas de dominio y políticas;
   - una prueba de integración por endpoint: caso feliz y error principal;
   - aislamiento **siempre** que la spec toque datos de un cliente;
   - componentes web para los estados de la spec §9; E2E solo para los flujos de la demo.
   No se repite el mismo CA en tres capas.
6. **Una spec = una rama `feat/NNN-slug` = un PR** (dos como máximo: `api` y `web`). La rama vive ≤ 3 días y se
   integra con squash. No se abren ramas por bloque de tareas.
7. **Cambios de alcance durante la implementación**: el developer escribe la discrepancia en «Registro de cambios»
   de la spec y se detiene; se corrige spec o plan y Adrián lo aprueba.
8. **Spikes**: solo con límite de tiempo (≤ 1 día) y pregunta concreta. El resultado va a `plan.md` o a un ADR; el
   código del spike se descarta.
9. **Bugs**: si el comportamiento contradice la spec → `fix/` con prueba que reproduce; si la spec no lo cubría → se agrega el criterio primero.
10. **Hallazgos y pendientes**: toda desviación de los diagramas va a `design-findings.md` (DF-xx) y todo lo que
    queda fuera de la spec (diagramas por redibujar, documentos por corregir, decisiones abiertas) va a
    `pendientes.md`, en el mismo PR que lo descubre.

## 5. Trabajo en paralelo

- **Un módulo, un dueño**, de punta a punta (backend y frontend). Asignación en `specs/README.md`. Nadie edita un
  módulo ajeno: si lo necesita, lo pide a su dueño o por un puerto.
- Los únicos archivos compartidos son los listados en `specs/README.md` («Reglas de convivencia»).
- Los mockups se hacen **antes** de que la spec los use (`/mockup`).
- Los contratos (`packages/contracts`, un archivo por módulo) y las migraciones se integran primero para desbloquear a los demás.
- Adrián revisa todos los planes y PRs; nadie más aprueba el trabajo de otro sin él. Sus PRs siguen §7.1.
- Coordinación asíncrona: el estado vive en `specs/README.md`; `/status` resume quién va atrasado y en qué.

## 6. Cierre de fase

En la reunión de revisión:
1. `/status` para listar specs y su estado.
2. Demostrar en staging cada spec `Hecha` (en la Fase 1, en local: §7.2).
3. Registrar lo pendiente y el uso del 20 % de margen (refactor/pruebas).
4. Probar restauración de respaldo (RNF-21) y, desde Fase 2, ensayo de rollback (RNF-20).
5. `/design-check` para confirmar que los diagramas de `docs/design/diagramas/` coinciden con el código; redibujar los que cambiaron.
6. Actualizar la tabla de estado en `CLAUDE.md`.

## 7. Excepciones al flujo

Decididas por el diseñador principal. Son las **únicas** excepciones a este documento, a `conventions.md` y al
Art. XIV de la constitución; cada regla que contradicen remite aquí.

### 7.1 Autoaprobación de PRs del diseñador principal (todo el proyecto)

Vigente desde el 22/09/2026 y durante todo el proyecto. Adrián puede integrar sus propios PRs sin la aprobación de
otro integrante. Todo lo demás se mantiene:

- Los PRs de cualquier otro autor siguen necesitando la aprobación de alguien distinto del autor.
- El PR marca la casilla «Autoaprobado» de la plantilla.
- Antes del merge, el PR pasa la verificación automática: el CI en cuanto exista (§7.2); mientras tanto, el autor
  corre en local `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm test:int` (más `pnpm test:isolation` si la
  spec toca datos de cliente) y pega el resumen en el PR.
- `/review NNN` sin bloqueantes sigue siendo obligatorio para cerrar una spec; si la spec usa dos PRs (§4.6), llega con el
  último bloque, como siempre.
- GitHub no deja al autor pulsar «Approve»: la autoaprobación es un comentario propio en el PR («Autoaprobado,
  `workflow.md` §7.1») seguido del merge. La protección de `main` (spec 000, T-33) lo permite con dos rulesets: uno
  con los checks, sin excepciones para nadie, y otro con la aprobación ajena, que tiene a Adrián como única excepción.

**Cambio respecto de la propuesta**: RNF-19 pide la aprobación de un integrante distinto del autor para que un cambio
llegue a producción. En los PRs del diseñador principal esa aprobación se sustituye por la verificación automática,
`/review` sin bloqueantes y el comentario de autoaprobación. Los PRs del resto del equipo cumplen RNF-19 sin cambios.

### 7.2 CI, imágenes y staging desde el 30/09/2026

La entrega de la Fase 1 se movió al **miércoles 30/09/2026**. Los bloques 4 (CI), 5 (imágenes en ghcr.io) y 6
(staging) de la spec 000 se implementan **a partir de esa fecha**, empezando por el CI. Las imágenes van con ellos
porque las publica el CI y solo las consume staging. El 07/10/2026 se decidió entregar en la Fase 2 solo el CI
(bloque 4); imágenes y staging (bloques 5 y 6) pasan a una fase posterior y la Fase 2 se demuestra en local. Mientras tanto:

- **«CI verde»** se sustituye por las verificaciones locales de §7.1, con su resumen pegado en el PR.
- **`Hecha`** significa integrada en `main` y demostrable en local (`docker compose up -d` + `pnpm dev`). La
  entrega del 30/09 se demuestra en local. Cuando exista staging, las specs `Hecha` de la Fase 1 se despliegan y
  se demuestran ahí sin reabrirlas.
- La spec 000 sigue `En implementación` hasta cerrar el bloque 6. Los bloques 1 y 2 ya están en `main` y bastan
  para implementar las demás specs.
- La compuerta T-27 (aceptar ADR y DF) solo condiciona el merge del PR de CI, así que se mueve con él.

Esta excepción caduca sola, por partes: el CI reemplaza a la verificación local en cuanto el bloque 4 está en `main`,
y staging a la demostración local en cuanto lo está el bloque 6.
