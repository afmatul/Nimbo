# ADR-0013 — El original optimizado se conserva durante la retención de papelera sin contar en la cuota

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-10-25 |
| Decisores | Adrián (storage), Abel (021) |
| Specs relacionadas | 014b, 021, 014, 007 |

## Contexto
RF-35 existe para recuperar espacio cuando se agota («Espacio agotado» en la propuesta) y RF-36 exige conservar el
original restaurable. DF-21 ya fijó la forma (la optimización es una `version_archivo` nueva con `origen = optimizacion`,
ADR-0012) pero dejó abierta la política del original. Con las reglas vigentes de la 014 esa política no funciona:

- 014 RN-3 y CA-5: todas las versiones cuentan en `espacio_usado` y el registro de una versión `optimizacion` valida la
  cuota al iniciar, sin descontar podas futuras. Con la cuenta llena, optimizar falla con `STORAGE_QUOTA_EXCEEDED`
  justo en el caso para el que existe el optimizador; con espacio libre, el uso **sube** mientras el original siga.
- 014 RN-10: solo la poda por cantidad o la purga del archivo borran versiones. En planes con 60 o 100 versiones
  retenidas el original podría no podarse nunca, y la optimización no liberaría nada.

## Opciones consideradas
1. **Original como versión normal (reglas de 014 sin cambios)** — pros: cero cambios en `storage`. Contras: no se puede
   optimizar con la cuota llena y el espacio no baja hasta una poda que puede no llegar; RF-35 queda vacío.
2. **Original retenido el plazo de papelera y contado en la cuota hasta purgarlo** (propuesta original de DF-21) —
   pros: nadie guarda bytes gratis. Contras: igual exige cuota libre para optimizar, el uso sube durante 7–90 días y
   además requiere la purga por plazo, así que también cambia `storage`.
3. **Original retenido el plazo de papelera del plan, sin contar en la cuota, y purgado al vencer** — pros: el espacio
   se recupera al instante, optimizar no exige espacio libre (el cambio neto siempre es negativo), RF-36 se cumple y el
   plazo sale de `PlanLimits`. Contras: Nimbo guarda hasta 90 días bytes que el cliente no paga; excepción acotada a
   014 RN-3 y RN-10; la conciliación de 007 debe excluir esos originales.
4. **Plazo fijo igual para todos los planes** — pros: simple. Contras: un número más en código o configuración, sin
   relación con el catálogo; los planes ya definen una retención comparable (papelera).

## Decisión
Opción 3. Al registrar una versión con origen `optimizacion`, la versión anterior queda como **original conservado**:
deja de contar en `espacio_usado` en la misma transacción (se suma la optimizada y se resta el original), se puede
restaurar durante la retención en papelera del plan contada desde la optimización y luego se purga automáticamente.
Restaurarlo sigue 014 CA-9 y **sí** valida la cuota (014 CA-12), así que no abre una vía para guardar bytes gratis:
cada optimización deja como mucho un original sin contar, y por tiempo limitado. Los detalles (marca en
`version_archivo`, interacción con la poda por cantidad y con la papelera, conciliación de 007) los fija el plan de la
014b; la 021 solo usa el registro de versiones con origen `optimizacion`.

## Consecuencias
- Positivas: el optimizador libera espacio en el momento y funciona con la cuenta llena; la 021 no cambia reglas de
  `storage` (su §7); el plazo es el del catálogo, sin números nuevos.
- Negativas / deuda aceptada: almacenamiento no cobrado por hasta 90 días por optimización; excepciones explícitas a
  014 RN-3 y RN-10 que el contador, la poda, la purga y la conciliación de 007 deben respetar (riesgo de divergencia
  del contador si alguna ruta no las conoce).
- Cómo sabremos si fue un error: la conciliación de 007 encuentra diferencias con el contador después de optimizar o
  purgar, o el volumen de originales conservados en MinIO crece de forma desproporcionada frente al espacio usado.
