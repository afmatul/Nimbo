# 022 — Seguimiento documental de la auditoría del PR #78

2026-11-01 · **Borrador** · [Spec](spec.md) · Sin revisión de implementación ni aprobación.
Referencia: [última auditoría](https://github.com/afmatul/Nimbo/pull/78#issuecomment-6565436203).

## Correcciones y límites

| Hallazgo | Resultado de este pase |
| --- | --- |
| B-1, m-1 | Referencias actualizadas y main conciliado localmente; conflictos de pendientes/backlog resueltos preservando registros ajenos. Sin hashes de base caducables en la spec. |
| B-2 | **Pendiente de Adrián.** Partición y destino de CA-23 solo propuestos en spec §8. Reducir líneas o agrupar archivos no prueba ≤ 12 archivos, una pantalla ni ≤ 3 días. |
| B-3 | Originales de plan/tareas copiados y verificados fuera del repo antes de retirarlos del árbol; no hay planificación oficial con preguntas bloqueantes. |
| M-1 | RN-3 y CA-1 incluyen duración/cola de 019, señales diferidas por 021 y los tres procesos, incluido `worker-optimizer`. |
| M-2, M-3 | Propuesta externa corregida: decoradores de loggers por módulo y catálogo local; shared solo puerto/adaptador técnico. Los loggers existentes son en su mayoría tipos, no clases ya instrumentadas. |
| M-4 | Propuesta externa reduce a la base Prometheus/Grafana, librería y exporter justificado; elimina systemd/cifrador elegidos de antemano y herramientas duplicadas. ADR y arquitectura siguen pendientes. |
| M-5, M-6 | Cortes externos llevan señal, panel, regla aplicable y verificación juntos; reutilizan suites existentes y cuatro familias compartidas por riesgo. Sin espera de 5/10 minutos en cada CI ni doble demo de CA-18. |
| M-7 | PD-60/62 conservan texto técnico, responsable y estado; solo su compuerta pasa de 021/022 a 023 (k6). PD-67 conserva contador y alerta como pendiente de decisión separada, sin declararla descartada. |
| m-2, m-3 | Registro de cambios condensado; historial de renumeración solo en pendientes. Se retiraron estados de commits y cautelas repetidas de los artefactos activos. |
| m-4 | Fase 3 identificada como asignación original, no entrega actual. Duración excedida de la rama y reprogramación siguen pendientes de Adrián. |
| m-5 | Puerto y adaptador nuevos siguen como propuesta externa; modelo/DF-29 con PD-166 esperan diseño aceptado y guardián. |

## Fuentes y trazabilidad de la corrección

- 019 plan §5 difiere **duración y cola** a 022; no la lista/reintento de trabajos (022b, PD-165).
- 021 plan §5 difiere métricas sin catálogo: se toman solicitudes/estimaciones/resultados y bytes disponibles
  de sus eventos, sin inventar soporte PDF/GIF/WebP. ADR-0038 y `worker-optimizer.main.ts` prueban el proceso separado.
- CA-1/4 → RNF-18 → RN-3: transporte, colas y grupos; incluye `indexing`, `index-status`, `index-reconcile`, `optimization`.
- Se conservan **CA-1 a CA-23**: RNF-18 → CA-1–18; RNF-21 → CA-19–22; RNF-20 → CA-23.
- Propuesta de destino: 022/RNF-18, posible 022c/RNF-21 y CA-23 al cierre de 000 con CA-31.
  No se ejecutó traslado, no se creó 022c y no se alteraron requisitos funcionales ni ownership.
- La descripción remota del PR aún habla de cinco archivos y tres artefactos; al publicar debe reflejar
  las retiradas, este seguimiento y PD-60/62/67 además de PD-165/166/167. No se actualiza remotamente en este pase.

## Trabajo conservado fuera del repositorio

Originales íntegros `originales/plan.md` y `originales/tasks.md`, con SHA-256 contrastados contra las fuentes.
Las propuestas corregidas `plan-propuesto.md` y `tareas-propuestas.md` contienen diseño, fuentes, 12 cortes
candidatos y pruebas; ninguna tarea completada. La ubicación y manifiesto se entregan en el informe local.
No se incorporan como anexos para eludir Modo 2. El plan oficial debe dimensionarse después de las decisiones.

## Decisiones que siguen abiertas

| Pregunta / compuerta | Debe decidir Adrián |
| --- | --- |
| P-2 | Ambiente de demostración; destino de CA-23/RNF-20 y dependencia de imágenes/staging de 000. |
| P-3 | Canal del equipo y entrega de alertas. |
| P-5 | Destino, retención, cifrado y versiones no vigentes; los valores de las auditorías son alternativas, no acuerdos. |
| P-6 | Acceso/roles/publicación de Grafana. |
| P-7 | Relación del tablero de negocio con 011. |
| P-8 | Alcance/datos/responsable del agente; no aprobar recorte por faltar consumo o primer fragmento. |
| P-11 | Cuenta/documento frente a agregados y alineación con propuesta y producto. |
| Tamaño, ownership y diseño | Partición/cortes o excepción expresa, autorizaciones de módulos, ADR/revisión técnica, diagramas PD-05/166 y aprobación de plan/PR. |

## Verificación de este pase

Solo documentación: formato Markdown estructural (docs/specs están excluidos de Prettier), enlaces locales,
spec de 136/150 líneas, 23 CA únicos con HU/RF/RNF y Dado/Cuando/Entonces, siete preguntas intactas,
referencias PD, copias verificadas y comparación de registros ajenos contra main. `git diff --check`
correcto en el árbol y respecto de main; el índice de los documentos de 022 también pasa.
El `--cached --check` global detecta espacios finales de mockups heredados de main, comprobados contra
su delta de entrada. Propuesta: que su dueño limpie los generadores en un cambio separado; no se editan aquí.
No acredita CA implementados, pruebas de runtime, CI verde ni cierre de la spec.
