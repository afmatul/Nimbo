# ADR-0009 — Crystal Clear + Spec-Driven Development (SDD) como proceso del equipo

| Campo | Valor |
|---|---|
| Estado | Aceptado (2026-09-26, Adrián) |
| Fecha | 2026-09-15 |
| Decisores | equipo Nimbo (4 integrantes) |
| Specs relacionadas | 000 (materializa CI, protección de `main`, plantillas y flujo de PR); todas |

## Contexto

Cuatro personas, diez semanas, cada una dueña de dos o tres módulos y con horarios distintos. El curso pide un
Documento de Diseño con diagramas que coincidan con el código, evidencia de pruebas y una defensa de la arquitectura.
Los agentes (`planner`, `architect`, `reviewer`, …) necesitan artefactos con estructura fija para actuar sin
supervisión constante. El riesgo principal no es técnico sino de coordinación: cuatro módulos construidos con
criterios distintos que no encajan al integrarse.

## Opciones consideradas

1. **Crystal Clear (Cockburn) + SDD con compuertas por artefacto (`spec.md → plan.md → tasks.md → verification.md`)**
   - Pros: Crystal Clear está pensado para equipos de 2–6 personas: comunicación osmótica, entregas frecuentes,
     seguridad personal y poca ceremonia. SDD aporta lo que Crystal no impone: cada cambio nace de una spec con
     criterios Dado/Cuando/Entonces trazables a RF/RNF (Art. I, II), un plan revisado por el `architect`, tareas
     pequeñas y una verificación con evidencia. Las plantillas de `docs/sdd/templates/` hacen que los agentes y las
     personas produzcan lo mismo.
   - Contras: escribir la spec y el plan antes de codificar cuesta 1–2 días por spec; hay que disciplinarse para
     actualizar la spec cuando la implementación descubre un error (Art. I.3).
2. **Scrum con sprints de dos semanas**
   - Pros: conocido; ceremonias claras.
   - Contras: cinco sprints en total; la ceremonia (planning, review, retro, daily) consume tiempo que el equipo no
     tiene; las historias de usuario sin criterios ejecutables no sirven a los agentes; el rol de Scrum Master sobra.
3. **Kanban sin especificación previa («issues y PRs»)**
   - Pros: mínima fricción.
   - Contras: sin spec no hay trazabilidad a RF/RNF ni fuente para las pruebas de aceptación; la arquitectura se
     decide en cada PR; el Documento de Diseño se escribe al final y no coincide con el código.
4. **Posponer la formalización hasta la Fase 2**
   - Contras: 000 ya fija CI, protección de `main`, plantillas de PR y flujo de revisión; cambiar el proceso después
     de que cuatro personas lo hayan interiorizado cuesta más que definirlo ahora.

## Decisión

Opción 1. Reglas operativas que 000 deja en el repositorio:

- Flujo por spec: `specs/NNN-slug/spec.md` (Borrador → Aclarada) → `plan.md` (con §11 «Aprobación de arquitectura»
  del `architect`) → `tasks.md` → implementación con pruebas primero (Art. III) → `review.md` del `reviewer` →
  `verification.md` en verde → desplegado en staging (Art. XIV).
- Trunk-based con ramas cortas, Conventional Commits en español con alcance de módulo y merge por *squash*
  (`conventions.md` §Git). `main` protegido: PR obligatorio, seis *status checks*, una aprobación ajena (D-2).
- Entregas frecuentes: cada spec termina desplegada en staging; demo al cierre de cada fase.
- Comunicación osmótica: un canal único del equipo; decisiones que cambian estructura → ADR; desviaciones de los
  diagramas → `design-findings.md` (Art. VIII.6).
- La constitución (`docs/sdd/constitution.md`) es la única fuente de principios; cambiarla requiere ADR y acuerdo de
  los cuatro.

## Consecuencias

- Positivas: cualquier integrante (o agente) puede tomar una spec ajena y saber qué construir, cómo y cómo probarlo;
  el Documento de Diseño se produce a lo largo del proyecto, no al final; la revisión ajena obligatoria evita que un
  módulo se cierre sobre su dueño.
- Negativas / deuda aceptada: tiempo de especificación por adelantado; riesgo de que la spec se vuelva letra muerta
  si nadie la actualiza (mitigado por Art. I.3 y por la revisión del `reviewer`).
- Cómo sabremos si fue un error: si más de una spec por fase se implementa sin plan aprobado, o si `verification.md`
  se rellena después del despliegue en lugar de guiarlo.
