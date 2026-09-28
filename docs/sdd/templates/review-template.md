# Revisión NNN — <Título>

| Campo | Valor |
|---|---|
| Fecha | AAAA-MM-DD |
| Commit / rango revisado | `<sha>` · `<base>..<head>` |
| Veredicto | ✅ Aprobar | 🔁 Cambios requeridos |

## Verificación
> Lo escribe `tester`. Un CA sin prueba verde bloquea el veredicto.

| CA | Prueba(s) | Nivel | Estado |
|---|---|---|---|
| CA-1 | `apps/api/test/int/storage/upload.int-spec.ts › CA-1: …` | int | ✅ |

| RNF | Evidencia | Estado |
|---|---|---|

| Suite | Resultado | Cobertura |
|---|---|---|
| lint / typecheck | | — |
| unit | | |
| int | | — |
| isolation | | — |
| e2e (si aplica) | | — |

Hallazgos de verificación: **[F-1]** <descripción, pasos para reproducir, CA afectado>.
Criterios sin prueba automatizable: <justificación y verificación manual>.

## Seguridad
> Lo escribe `security-auditor`, solo si la spec toca auth, datos de cliente, enlaces o bitácoras. Si no aplica, márcalo.

- Aplica: <sí/no — motivo si no>
- Pruebas ISO agregadas: …
- Hallazgos: **[SEC-n]** severidad (crítica/alta/media/baja) · `archivo:línea` · riesgo · corrección sugerida
- Checklist del Art. IX: …

## UI
> Lo escribe `ui-designer`, solo si la spec tiene interfaz (sección 9 de la spec). Si no aplica, márcalo.

- Aplica: <sí/no>
- Pantallas revisadas (mockup / captura comparada): …

| Pantalla | Estado | 360 px | 1440 px | axe | Captura |
|---|---|---|---|---|---|
| | | ✅ | ✅ | ✅ | `e2e/__screenshots__/…` |

Hallazgos: **[UI-n]** severidad · `archivo:línea` o captura · problema · corrección sugerida.

## Bloqueantes
- **[B-1]** `ruta/archivo.ts:NN` — <problema> — Viola: <artículo/CA/RNF> — Sugerencia: <cómo arreglarlo>

## Importantes (no bloquean, deben atenderse antes de cerrar la fase)
- **[I-1]** …

## Sugerencias
- **[S-1]** …

## Checklist
| Aspecto | Estado |
|---|---|
| Cumple spec y criterios | |
| SOLID | |
| YAGNI (sin abstracciones ni código especulativo) | |
| DRY (fuentes únicas respetadas) | |
| Código limpio | |
| Fronteras de módulos y capas | |
| Seguridad y aislamiento | |
| Bitácoras sin datos sensibles | |
| Migraciones reversibles | |
| Pruebas suficientes y significativas | |
| UI: tokens de `ui-guidelines.md`, sin hex, componentes reutilizados, estados completos | |
| Documentación actualizada | |

## Lo que está bien hecho
<Reconocer decisiones buenas para repetirlas.>
