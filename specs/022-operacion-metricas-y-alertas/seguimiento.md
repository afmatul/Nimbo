# 022 — Seguimiento documental del PR #78

2026-11-02 · **Borrador** · [Spec](spec.md) · [Plan](plan.md) · [Tareas](tasks.md)
No es la revisión de la implementación: esa es `review.md`, que escribe `/review` al cerrar la spec.
Antes se llamaba `review.md`; se renombró para no ocupar el nombre del artefacto de `/review` (`workflow.md` §1).
Referencias: [auditoría](https://github.com/afmatul/Nimbo/pull/78#issuecomment-6565436203) y comentarios de Adrián
del 2026-11-02 en el PR #78 (decisiones y ampliación de autorizaciones a `billing`).

## Hallazgos de las auditorías

| Hallazgo | Estado |
| --- | --- |
| B-1 (conflictos con `main`) | Resuelto el 2026-11-01; la rama fusiona sin conflictos con `main` (`ca9dc2b`). |
| B-2 (tamaño) | **Parcial, decide Adrián.** Con la partición (022c, 000) y el corte a 022d, el plan tiene 12 filas, que es el criterio del PR #78. Pero son 35 archivos de autor y ≈ 6,25 días-persona, frente a los 12 archivos y ~3 días de `workflow.md` §4.1 y ADR-0034. Plan §1: (a) excepción, como en 021, o (b) el corte «ver / avisar» (abajo). En los dos casos hace falta la excepción por archivos. |
| B-3 (plan antes de tiempo) | Resuelto: las siete preguntas se cerraron antes de escribir el plan oficial (Modo 2). |
| M-1 (019, 021, `worker-optimizer`) | Resuelto en RN-3 y CA-1. |
| M-2, M-3 (dispersión, catálogo en `shared`) | 022 no instrumenta módulos y `shared` no tiene catálogo de negocio; los catálogos locales por módulo son de 022d. |
| M-4 (tecnología nueva) | Plan: `prom-client`, Prometheus, Grafana (con su alerta por correo) y cAdvisor, con ADR-0040 `Propuesto`. Sin `systemd`, `age` ni `node_exporter`. |
| M-5 (pruebas) | Plan §6: reglas evaluadas contra series sintéticas con tiempo fijo, sin esperar 5 o 10 minutos en CI; la demo real es solo CA-18. |
| M-6 (tareas horizontales) | `tasks.md`: cada tarea lleva señal, panel, regla y prueba juntos. |
| M-7, m-1 a m-4 | Resueltos el 2026-11-01. |
| m-5 (`design-model.md`) | 022 no agrega puertos; DF-29 se actualiza con el plan (PD-166). |
| Observación 1 (descripción del PR) | Pendiente de publicar: la descripción remota sigue hablando de cinco archivos y de plan y tareas. |
| Observación 2 (`review.md`) | Resuelta con este renombre. |
| Observación 3 (propuesta externa) | Las propuestas fuera del repositorio no se usan como fuente; el plan oficial se escribió contra el código actual. |

## Decisiones aplicadas (Adrián, PR #78, 2026-11-02)

- **División**: 022 = RNF-18; 022c = RNF-21 (antiguos CA-19 a CA-22, HU-4 y RN-5), con rama y PR propios; RNF-20
  (antiguos CA-23 y HU-5) al cierre de 000 con su CA-31 (PD-169). Corte por tamaño: CA-4, CA-7, CA-8, CA-17 y los
  grupos de módulo de RN-3 → 022d.
- **Preguntas** P-2, P-3, P-5, P-6, P-7, P-8 y P-11 cerradas en spec §9; PD-168 (agente) a nombre de Adrián.
- **P-11** se anota en `product-context.md` §7 («Nota sobre RNF-18»). La transcripción de la propuesta
  (`PropuestaV2.md`) no se edita porque es el documento entregado; queda como decisión en PD-167 (b).
- **Autorizaciones**: 022 solo toca `shared`, las raíces de composición, `env.schema` y la infraestructura de
  observabilidad que nombra el plan. Las de `identity`, `notifications`, `storage`, `audit`, `editing`, `realtime`,
  `intelligence` y `billing` quedan para el plan de 022d. CA-16 no necesita tocar `billing`: una pasada de
  renovación fallida ya termina como trabajo fallido de su cola (`RenewalRunIncompleteError`).

## Evaluación de 022e (propuesta; no se crea sin autorización de Adrián)

Se recalculó con los archivos reales de §2 y las estimaciones de `tasks.md`. Corte «ver / avisar»:

| | 022 «métricas y tablero» | 022e «sistema y alertas» |
|---|---|---|
| CA | CA-1, CA-2 (app, Prometheus y Grafana), CA-5 (series), CA-6 (tasa de error, p95 y colas), CA-9 (tableros), CA-10 (fuente y tablero) | CA-2 (cAdvisor sin `ports:`), CA-3, CA-5 (anotaciones de alertas), CA-6 (disco y dependencias), CA-9 (el *Viewer* no cambia reglas), CA-10 (seis reglas y canal), CA-11 a CA-16, CA-18; RN-1 y RN-4 |
| Archivos | 28: 12 TS (`MetricsModule`, servidor, middleware, colas y raíces), 9 de configuración (compose, Prometheus, Grafana, `.env.example`, `package.json`), 2 documentos y 5 pruebas | 18: 3 TS (recolector de dependencias, sonda, `health.module.ts`), 7 de configuración (cAdvisor, `alertas.json`, SMTP), 2 documentos, 3 pruebas nuevas y 3 cambiadas |
| Tareas | T-01 sin cAdvisor (0,75), T-02 (0,75), T-04 sin regla (0,75), acceso de T-08 (0,5), demo del tablero (0,25) | spike y cAdvisor (0,85), T-03 (0,75), reglas 3 a 6 (0,75), sonda y recolector (0,4), contacto y reglas en `grafana.int-spec.ts` (0,25), T-09 (0,5) |
| Días | ≈ 3 | ≈ 3,5 |
| Depende de | 000, ADR-0040 | 022 |

- 022d depende solo de la 022 de este corte. No depende de 022e, así que pueden avanzar en paralelo.
- **Costo del corte:** CA-6 y CA-10 se reparten con una tabla de equivalencias. El compose, el tablero y el runbook
  se tocan dos veces, y suma ≈ 0,25 días (6,5 en total).
- **Ventajas sobre el corte anterior:** RN-1 («exactamente seis») queda entera en un PR, y el banco de reglas y
  ADR-0040 no se duplican.
- La prueba de S-5 (las dos plantillas excluidas por la regla 2) lee `alertas.json`, así que en este corte va en
  022e, como cambio de `metrics-endpoint.int-spec.ts` (una de las 3 cambiadas).
- **Lo que no resuelve:** 022e queda en ≈ 3,5 días (dentro del doble de §4.3, no en ~3), y ninguna de las dos partes baja de 12 archivos. Con 12 tendrían que ser cuatro specs que no se
  demuestran por separado.
- Contradice «el núcleo queda en 022» del PR #78. Por eso la opción por defecto es (a).

## Justificación de la excepción de tamaño (opción a) frente al corte (b)

Por qué 022 no baja de 12 archivos ni de ~3 días sin partirse:
- **Infraestructura de base:** compose, dos archivos de Prometheus, tres de aprovisionamiento de Grafana, las reglas y
  `.env.example` son 10 archivos declarativos. Cualquier entrega que se pueda demostrar los necesita.
- **Costo fijo de las pruebas:** el banco de reglas (Prometheus de Testcontainers con `promtool`) y la prueba de
  Grafana con Mailpit cuestan lo mismo con una alerta que con seis.
- **Lógica nueva concentrada:** toda vive en `shared`, en 7 archivos TS nuevos. Los otros 8 TS son cableado.
- **Precedente:** la 021 recibió una excepción por 45 archivos.

| Criterio | (a) Excepción: una spec | (b) 022 «ver» + 022e «avisar» |
|---|---|---|
| Archivos (límite 12) | 35, requiere excepción | 28 + 18 (11 se tocan en las dos), requiere excepción en ambas |
| Días (~3) | ≈ 6,25, más del doble de §4.3 | ≈ 3 + 3,5 = 6,5 (+0,25 por el corte) |
| Rama ≤ 3 días (§4.6) | No | Casi (022e ≈ 3,5) |
| PR y revisión de Adrián | Uno grande (35 archivos, pruebas incluidas) | Dos medianos; el segundo depende del primero |
| CA | Todos en una spec | CA-2, CA-5, CA-6, CA-9 y CA-10 repartidos con tabla de equivalencias |
| RN-1 (seis alertas) | Entera | Entera en 022e |
| Decisión del PR #78 | La respeta («el núcleo queda en 022») | La cambia; requiere autorización |
| Riesgo de calendario | Nada se puede demostrar hasta el final | El tablero (022) se demuestra antes de las alertas |
| Arquitectura | Sin objeción | Sin objeción (`architect`, ciclo 2) |

**Recomendación:**
- **(a)** si Adrián prioriza respetar su partición y revisar todo en una sola pasada.
- **(b)** si prioriza el límite de días por rama y poder demostrar algo antes.

Las dos necesitan excepción por archivos. El plan queda escrito para (a). Con (b), las tareas se reparten según la
tabla de arriba, sin reescribir criterios.

## Supuestos S-1 a S-4: lo verificado y lo que decide Adrián

| Supuesto | Hechos verificados en el código | Qué decide Adrián | Recomendación y consecuencia |
|---|---|---|---|
| S-1 «reintentado 3 veces» | Colas con `attempts: 3`: repetibles, `indexing`, `index-reconcile`, `optimization`, `editing-save`. `mail` tiene `attempts: 6`. `architecture.md` §8 usa las dos convenciones | **Producto:** si «3 veces» son 3 intentos fallidos o 3 reintentos (4 intentos) | 3 intentos fallidos. Con 4, nunca dispara en las colas de 3; con 3, `mail` avisa en su tercer fallo aunque le queden tres intentos |
| S-2 «pendientes» | Los programas repetibles dejan su próxima ejecución en `delayed`, igual que las esperas entre reintentos. `waiting` y `prioritized` son lo listo y no procesado | **Producto:** qué estados cuentan, y si el umbral de 50 es por cola o total | `waiting` + `prioritized`, por cola. Si cuenta `delayed`, cada programa suma uno; si es total, una cola sana con mucho volumen enmascara a otra |
| S-3 ventana mínima | Recolección cada 15 s y evaluación cada 1 min; una muestra perdida basta para cambiar la condición | **Producto (efecto menor):** §7 no da ventana para colas, disco y caída. Con `for: 1m` el aviso llega hasta 1 min más tarde | `for: 1m` en las tres. Evita disparos por una sola muestra; el costo es ≤ 1 min de demora |
| S-4 renovación | La renovación es repetible con 3 intentos y esperas de 30 s y 60 s (`repeatable-job.ts`). `RenewalRunIncompleteError` falla la pasada si una suscripción falló | **Producto:** avisar con el primer fallo o solo al agotar los intentos (unos 90 s después) | Con el primer fallo: toca cobros. Se resuelve sola tras 15 min sin fallos nuevos. La alternativa evita avisos por fallos pasajeros |

## CI del PR (integración en rojo)

El único fallo es `test/isolation/backoffice-trash.iso-spec.ts`, ISO-18 de 011b (`read ECONNRESET`), con 632 de 633
pruebas en verde. Falla en **6 de 6 corridas**: `main` en `977d3ba`, `ca9dc2b` y `894b868` (tras 012b), y los PR #77,
#89 y #78. Este PR solo cambia documentación y no lo causa.

ISO-18 es la única prueba del archivo con peticiones HTTP concurrentes: 8 con `Promise.all`, contra un servidor que el
arnés no pone a escuchar. Supertest 7.2.2 hace que la primera petición abra un puerto efímero y lo cierre al terminar.
Esa es la hipótesis principal, **no demostrada**:
- `register.int-spec.ts` usa el mismo patrón y pasa;
- una reproducción sintética en Windows no falló.

El diagnóstico reproducible, con los experimentos A y B, se entrega a Fátima (011b, PR #85). Aquí no se modifica.

## Verificación de este pase

Solo documentación:
- límites de líneas (spec, plan y tareas) y enlaces locales;
- IDs libres:
  - PD-168 y PD-169 en esta rama; PD-170 a PD-173 en 022c; PD-164 ya es de 012b en `main`;
  - ADR-0040 aquí y ADR-0041 en 022c;
- `git diff --check`;
- aplicación limpia sobre `main` (`894b868`).

Con la 022c, la fusión choca solo en dos filas de índice contiguas (`docs/adr/README.md` 0040/0041 y `specs/README.md`
022c/022d). Se resuelve dejando las dos filas en orden.

No acredita CA implementados, pruebas de runtime, CI verde ni la aprobación del plan.
