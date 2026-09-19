# Flujo SDD de Nimbo

Spec-Driven Development: la especificación es el artefacto principal y el código es su consecuencia.
Encaja con Crystal Clear: la reunión de **planificación** de cada fase decide qué specs entran y quién es dueño;
la reunión de **revisión** verifica las specs terminadas.

## 1. Artefactos por spec

```
specs/NNN-slug/
├─ spec.md           # QUÉ y POR QUÉ — historias, criterios de aceptación, fuera de alcance, preguntas
├─ plan.md           # CÓMO — módulos, modelo de datos, contratos, eventos, riesgos, estrategia de pruebas
├─ tasks.md          # EN QUÉ ORDEN — tareas pequeñas, trazadas, con dependencias y paralelismo
├─ contracts/        # fragmentos OpenAPI / DTOs / eventos (opcional)
├─ verification.md   # resultado del tester: cada criterio → prueba → estado
├─ security.md       # resultado del security-auditor (si la spec toca datos de cliente, auth o enlaces)
├─ ui-review.md      # resultado del ui-designer (si la spec tiene interfaz)
└─ review.md         # resultado del reviewer
```

## 2. Estados y compuertas

| Estado | Entra cuando | Quién decide | Sale hacia |
|---|---|---|---|
| `Borrador` | `/spec` crea el archivo | planner | `Aclarada` |
| `Aclarada` | No quedan preguntas `[ABIERTA]` bloqueantes y, si hay UI, cada pantalla tiene mockup o decisión explícita | **humano dueño** | `Planificada` |
| `Planificada` | `plan.md` aprobado por `architect` y `tasks.md` generado | architect + humano | `En implementación` |
| `En implementación` | Primer commit de `feat/NNN-*` | developer | `En verificación` |
| `En verificación` | Todas las tareas marcadas | tester (+ security-auditor) | `En revisión` o vuelve |
| `En revisión` | `verification.md` en verde | reviewer + humano | `Hecha` o vuelve |
| `Hecha` | PR integrado y desplegado en staging | humano | — |

**Compuertas humanas obligatorias**: aclarar la spec, aprobar el plan y aprobar el PR. Los agentes proponen;
el equipo decide.

## 3. Secuencia típica

```
Humano: /spec "carga de archivos por partes con control de cuota"
  └─ planner → specs/005-carga-y-descarga/spec.md (Borrador) + preguntas
Humano responde preguntas, marca Aclarada
Humano: /plan 005
  └─ planner → plan.md
  └─ architect → valida fronteras, dependencias, ADRs → «Aprobación de arquitectura»
Humano: /tasks 005
  └─ planner → tasks.md (T-01…T-n, [P] = paralelizable)
Humano: /implement 005 T-01..T-04      (o sin rango para la siguiente tarea pendiente)
  └─ developer → prueba roja → código → prueba verde → refactor → commit
Humano: /verify 005
  └─ tester → pruebas de aceptación faltantes, corre suites → verification.md
  └─ security-auditor (si aplica) → pruebas de aislamiento → security.md
  └─ ui-designer (si hay UI) → comparación con mockup y capturas, axe → ui-review.md
Humano: /review 005
  └─ reviewer → review.md (bloqueantes / sugerencias)
Humano abre PR → otro integrante aprueba → merge → staging
```

## 4. Reglas del flujo

1. **Una spec ≈ un entregable demostrable** en ≤ 1 semana por una persona. Si es más grande, se divide.
2. Las specs se numeran en orden de creación; el orden de implementación lo dan las dependencias en `specs/README.md`.
3. Una tarea ≈ 1–4 horas y un commit. Si una tarea crece, el developer se detiene y pide al planner dividirla.
4. **Cambios de alcance durante la implementación**: el developer escribe la discrepancia en la sección
   «Registro de cambios» de la spec y se detiene; el planner la actualiza; el humano la aprueba.
5. **Spikes**: permitidos solo con límite de tiempo (≤ 1 día) y pregunta concreta (p. ej. «¿qué campos entrega el
   callback de ONLYOFFICE en nuestra versión?»). El resultado va a `plan.md` o a un ADR; el código del spike se descarta.
6. **Specs transversales** (fundaciones, observabilidad) siguen el mismo flujo.
7. **Bugs**: si el comportamiento contradice la spec → `fix/` con prueba que reproduce; si la spec no lo cubría → se agrega el criterio primero.
8. **PRs parciales**: por defecto una spec = un PR, abierto tras `/verify` y `/review`. Una spec **transversal** cuyo
   plan lo justifique (p. ej. 000, §9b) puede integrarse en varios PRs para desbloquear a otros dueños. Reglas:
   cada PR parcial cubre bloques completos de `tasks.md`, pasa lint/typecheck/unit (y CI cuando exista), lo aprueba
   otro integrante, y marca en la plantilla «PR parcial»; `verification.md`, `security.md`, `ui-review.md` y
   `review.md` se producen una sola vez, al cerrar el último bloque, y la spec pasa a `Hecha` solo entonces.

## 5. Trabajo en paralelo de 4 personas

- Cada integrante es **dueño** de un grupo de módulos (asignación en `specs/README.md`).
- Tareas marcadas `[P]` en distintas specs pueden avanzar a la vez si no tocan los mismos archivos.
- Los mockups se hacen **antes** de planificar la spec que los usa (`/mockup`), y quien diseña una pantalla no tiene que ser quien la implementa.
- Los contratos (`packages/contracts`) y migraciones se integran primero y en PRs pequeños para desbloquear a los demás.
- Quien revisa un PR no es su autor ni el dueño exclusivo del módulo (regla Crystal Clear + RNF-19).
- Coordinación asíncrona: el estado vive en `specs/README.md` y en el tablero del repo; no en la memoria de nadie.

## 6. Cierre de fase

En la reunión de revisión:
1. `/status` para listar specs y su estado.
2. Demostrar en staging cada spec `Hecha`.
3. Registrar lo pendiente y el uso del 20 % de margen (refactor/pruebas).
4. Probar restauración de respaldo (RNF-21) y, desde Fase 2, ensayo de rollback (RNF-20).
5. `/design-check` para confirmar que los diagramas de `docs/design/diagramas/` coinciden con el código; redibujar los que cambiaron.
6. Actualizar la tabla de estado en `CLAUDE.md`.
