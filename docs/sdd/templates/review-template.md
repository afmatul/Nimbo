# Revisión NNN — <Título>

> Una página. La escribe `reviewer` (con `security-auditor` solo si aplica, `workflow.md` §4) y la aprueba Adrián.

| Campo | Valor |
|---|---|
| Fecha | AAAA-MM-DD |
| Rango revisado | `<base>..<head>` |
| CI | ✅ / ❌ (enlace) |
| Veredicto | ✅ Aprobar · 🔁 Cambios requeridos |

## Verificación
| CA | Prueba | Estado |
|---|---|---|
| CA-1 | `apps/api/test/int/…› CA-1: …` | ✅ |

## Seguridad
- Datos de cliente: <sí/no>. Aislamiento: <pruebas ISO y resultado>. `actor` + `accessibleNodes`/RLS: ✅ / ❌.
- Bitácoras sin contenido, nombres de archivo, tokens ni contraseñas: ✅ / ❌.
- Hallazgos: **[SEC-n]** severidad · `archivo:línea` · corrección.

## UI (si aplica)
- Coincide con el mockup y sus estados; sin colores escritos a mano; axe sin `serious`/`critical`: ✅ / ❌.

## Bloqueantes
- **[B-1]** `archivo:línea` — problema — viola: <CA/artículo> — corrección.

## Importantes y sugerencias
- **[I-1]** … · **[S-1]** …

## DF y pendientes
- DF-xx nuevos o actualizados: … · Filas nuevas en `pendientes.md`: …
