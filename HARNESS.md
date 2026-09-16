# Harness de Nimbo — Cómo instalarlo y usarlo

Este paquete configura Claude Code para que el equipo trabaje Nimbo con **Spec-Driven Development**
y siete subagentes especializados.

## Instalación

1. Copien todo el contenido en la raíz del repositorio (respetando las carpetas ocultas `.claude/` y `.github/`).
2. La sección «Comandos del repositorio» de `CLAUDE.md` ya refleja el `package.json` raíz (spec 000, PR-1); actualícenla si cambian los scripts.

## Estructura

```
CLAUDE.md                         contexto raíz (se carga siempre)
HARNESS.md                        este archivo
.claude/agents/                   planner, architect, developer, tester, security-auditor, ui-designer, reviewer
.claude/commands/                 /spec /plan /tasks /implement /verify /review /status /adr /design-check /mockup
docs/sdd/constitution.md          principios no negociables (SOLID, YAGNI, DRY, clean code, seguridad…)
docs/sdd/product-context.md       la propuesta resumida para agentes
docs/sdd/architecture.md          monolito modular, módulos, capas, flujos críticos
docs/sdd/design-model.md          diagramas de clases y E-R en texto + mapeo clase ↔ tabla
docs/sdd/design-findings.md       48 hallazgos de diagramas y sistema de diseño (DF-xx) por resolver
docs/design/diagramas/            PDFs de arquitectura, clases y E-R
docs/design/design-system/        sistema de diseño Cielo Sereno (original)
docs/design/mockups/              mockups en código por módulo/pantalla
docs/design/capturas/             capturas PNG de los mockups (360 y 1440 px)
docs/sdd/ui-guidelines.md         cómo aplicar Cielo Sereno en Next.js + shadcn, inventario de pantallas
docs/sdd/conventions.md           código, API, BD, git, PR
docs/sdd/workflow.md              estados, compuertas y trabajo en paralelo
docs/sdd/templates/               spec, plan, tareas, ADR, verificación, revisión
docs/adr/README.md                índice de decisiones
specs/README.md                   backlog, dueños e hitos
.github/pull_request_template.md  plantilla de PR
```

## Ciclo de una funcionalidad

```
/mockup storage/explorador 005     ← si la pantalla aún no tiene mockup
/spec carga de archivos por partes con control de cuota
   (responder preguntas, marcar Aclarada)
/plan 005
   (confirmar plan)
/tasks 005
/implement 005            ← repetir hasta terminar
/verify 005
/review 005
   (abrir PR, otro integrante aprueba, merge, staging)
```

## Primeros pasos recomendados (estamos en Fase 1)

0. ✅ Hecho: los mockups de Claude Design están en `docs/design/mockups/<modulo>/<pantalla>/` con sus capturas en `docs/design/capturas/…` y estado `Borrador` en `docs/sdd/ui-guidelines.md` §7. Faltan los estados mínimos (vacío, error, cargando…) y las pantallas de `identity` y `backoffice`: se agregan con `/mockup` antes de aclarar cada spec.
   0b. Reunión corta para decidir los hallazgos de `design-findings.md` que bloquean la Fase 1 (columna «Resolver antes de»: 000–007).
1. `/adr monolito modular con worker separado` y el resto de ADRs iniciales en paralelo con la spec 000.
2. `/spec 000 fundaciones` — sin monorepo, CI y ambientes nadie más puede integrar.
3. En cuanto 000 tenga contratos y compose listos: Juan Marcos arranca 001–002 y 006a, Abel arranca 005, Adrián arranca 003 y Fátima arranca 000b.
4. `/status` al abrir y cerrar cada reunión de fase.

## Por qué estos siete agentes

| Agente           | Por qué existe separado                                                                                                |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| planner          | Separa el «qué» del «cómo»; evita que se programe sin criterios verificables                                           |
| architect        | La arquitectura debe defenderse en la exposición; alguien debe cuidar fronteras y ADRs                                 |
| developer        | Implementa con TDD dentro de límites claros                                                                            |
| tester           | Verifica contra la spec, no contra lo que el developer creyó entender                                                  |
| security-auditor | El aislamiento entre cuentas y la privacidad en soporte son el diferenciador y el mayor riesgo                         |
| ui-designer      | Se evalúa la experiencia de usuario; alguien debe cuidar Cielo Sereno, los mockups, las capturas y la accesibilidad AA |
| reviewer         | Revisión de solo lectura que prepara la aprobación humana obligatoria                                                  |

Aplicando YAGNI al propio harness, no se incluyó un agente documentador: la documentación se actualiza en cada PR
(Definición de terminado). Si en la Fase 4 los manuales se vuelven cuello de botella, agréguenlo entonces.
