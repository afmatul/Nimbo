# Plan NNN — <Título>

> Spec: `./spec.md` · Estado del plan: Propuesto | Aprobado
> Obligatorio y ≤ 250 líneas. Dice **qué** archivos se tocan y **qué** se espera de cada uno; no es el código en
> prosa (sin cuerpos de funciones ni pseudocódigo). Lo aprueba Adrián antes de escribir código.

## 1. Resumen técnico
<Cómo se resuelve, en 5–10 líneas.>

## 2. Módulos, archivos y diseño
| Módulo / capa | Archivo (nuevo o cambiado) | Responsabilidad |
|---|---|---|

- Clases, puertos y tablas con los nombres de `design-model.md`. Puertos nuevos: <ninguno | cuál y por qué (Art. V)>.
- Dependencias nuevas entre módulos: <ninguna | A → B vía puerto o evento, por qué>.
- Frontend: rutas (`app/…`), `features/<modulo>/`, componentes de `components/nimbo/` que se reutilizan o crean.

## 3. Datos
```sql
-- Tablas/columnas nuevas o modificadas (borrador de la migración), con índices y RLS
```
- `down` de la migración: …

## 4. Contratos
| Método | Ruta | Rol | Request → Respuesta | Errores (`code`) |
|---|---|---|---|---|

Eventos / Socket.IO (si aplica): <evento, productor, consumidores, payload>

## 5. Seguridad y operación
- `actor` en los servicios y `accessibleNodes` / RLS en las consultas: <dónde>.
- Bitácoras y auditoría: <eventos, sin datos sensibles>. Métricas: <si aplica>.

## 6. Estrategia de pruebas (por riesgo)
| CA | Nivel (unit / int / iso / web / e2e) | Archivo |
|---|---|---|

## 7. Riesgos y coherencia con el diseño
- Riesgos reales y mitigación: …
- Desviaciones de los diagramas: <ninguna | DF-xx nuevo o actualizado en `design-findings.md`>.
- Pendientes que deja fuera: <ninguno | fila nueva en `pendientes.md`>.
- ADR requeridos: <ninguno | ADR-00xx>.

## 8. Aprobación
- `architect` (solo si hay puerto nuevo entre módulos, tecnología nueva o cambio de arquitectura): <no aplica | veredicto>
- Adrián: Aprobado | Aprobado con cambios (lista) | Rechazado — AAAA-MM-DD
