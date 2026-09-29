# Plan NNN — <Título>

> Spec: `./spec.md` · Estado del plan: Propuesto | Aprobado
> Solo existe si la spec es transversal, agrega un puerto nuevo entre módulos, tecnología nueva o cambia la
> arquitectura. Lo aprueba `architect`; sin esos casos, el «Enfoque técnico» de la spec basta.

## 1. Resumen técnico
<Cómo se resuelve, en 5–10 líneas.>

## 2. Verificación contra la constitución
| Artículo | Cumple | Nota |
|---|---|---|
| I Spec manda | ☐ | |
| IV SOLID | ☐ | |
| V YAGNI — ¿alguna abstracción nueva? justificar con regla de interfaces | ☐ | |
| VI DRY — ¿se reutiliza la fuente única existente? | ☐ | |
| VIII Fronteras — ¿dependencias nuevas entre módulos? | ☐ | |
| IX Seguridad — ¿`actor` en los servicios y `accessibleNodes` en las consultas? | ☐ | |
| X Operabilidad — métricas y bitácoras | ☐ | |
| XI Integridad — idempotencia/transacciones | ☐ | |
| XII Degradación | ☐ | |

## 3. Coherencia con los diagramas
| Diagrama | Clases / tablas usadas | ¿Se aparta del diagrama? | Acción |
|---|---|---|---|
| Clases M? | `…Service`, `I…` | no / sí: … | ninguna / actualizar diagrama / DF-xx |
| E-R | `tabla`, `tabla` | no / sí: … | ninguna / actualizar E-R / DF-xx |
| Arquitectura | … | … | … |

Hallazgos `DF-xx` que esta spec resuelve o de los que depende: …

## 3b. Módulos afectados
| Módulo | Cambio | Capa(s) |
|---|---|---|

Dependencias nuevas entre módulos: <ninguna | A → B vía fachada/evento, justificación>

## 4. Modelo de datos
```sql
-- Tablas/columnas nuevas o modificadas (borrador de la migración)
```
- Índices: …
- RLS: …
- Migración reversible: <cómo es el down>

## 5. Contratos
### HTTP
| Método | Ruta | Rol | Request | Respuesta | Errores |
|---|---|---|---|---|---|

### Eventos
| Evento | Productor | Consumidores | Payload |
|---|---|---|---|

### Tiempo real
| Canal/evento Socket.IO | Sala | Payload |
|---|---|---|

## 6. Diseño de componentes
- Casos de uso: `…UseCase`
- Políticas de dominio: `…Policy`
- Puertos nuevos (justificar): …
- Frontend: rutas (`app/…`), carpeta `features/<modulo>/`, componentes de `components/nimbo/` que se reutilizan o crean, componentes shadcn a agregar, tokens nuevos (requieren DF y aprobación)

## 7. Observabilidad
- Bitácoras (eventos): …
- Métricas: `nimbo_…`
- Alertas nuevas: …

## 8. Estrategia de pruebas
| Criterio | Nivel (unit/int/iso/e2e/carga) | Archivo propuesto |
|---|---|---|

## 9. Riesgos y mitigaciones
| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|

## 10. Decisiones
- ADR requeridos: <ninguno | ADR-00xx título>

## 11. Aprobación de arquitectura
> Sección escrita por el subagente `architect`.
- Veredicto: Aprobado | Aprobado con cambios | Rechazado
- Observaciones:
